import asyncio
import base64
import json
import os
import urllib.request
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import User, PrinterOccupation, OccupationStatus, QueueEntry, QueueStatus, Transaction, TransactionType, GCodeFile
from app.routers.user import get_current_user
from app.core.printer_client import get_all_printers, get_printer_status, send_moonraker_command, send_printer_command, upload_and_start_print, PRINTERS, PRINTER_MAX_DURATION_SECONDS
from app.core.queue_logic import get_active_occupation, get_queue_position
from app.core.print_rates import calculate_cost, MM_TO_GRAMS_175

router = APIRouter(prefix="/api/printers", tags=["printers"])


def _enrich(status: dict, db: Session, user_id: int) -> dict:
    """Fügt Belegungs- und Queue-Info zum Drucker-Status hinzu."""
    pid = status["id"]
    now = datetime.utcnow()

    occ = get_active_occupation(db, pid)
    if occ:
        pickup_secs = 0
        if occ.pickup_deadline:
            pickup_secs = max(0, int((occ.pickup_deadline - now).total_seconds()))
        occ_user = db.query(User).filter(User.id == occ.user_id).first()
        status["occupation"] = {
            "id": occ.id,
            "is_mine": occ.user_id == user_id,
            "status": occ.status.value,
            "pickup_deadline": occ.pickup_deadline.isoformat() if occ.pickup_deadline else None,
            "pickup_seconds_remaining": pickup_secs,
            "user_display": occ_user.email.split("@")[0] if occ_user else "Unbekannt",
            "user_email": occ_user.email if occ_user else None,
            "file_id": occ.file_id,
            "estimated_cost_cents": occ.estimated_cost_cents,
            "charged_cost_cents": occ.charged_cost_cents,
        }
    else:
        status["occupation"] = None

    # Externer Druck: Moonraker zeigt printing/paused, aber keine Occupation im Portal
    status["external_print"] = (
        status.get("state") in ("printing", "paused") and occ is None
    )

    # Warteschlange zählen
    queue_count = db.query(QueueEntry).filter(
        QueueEntry.printer_id == pid,
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).count()
    status["queue_count"] = queue_count

    # Eigene Queue-Position
    entry, position = get_queue_position(db, pid, user_id)
    if entry:
        status["my_queue"] = {
            "id": entry.id,
            "position": position,
            "status": entry.status.value,
            "notified_at": entry.notified_at.isoformat() if entry.notified_at else None,
        }
    else:
        status["my_queue"] = None

    return status


@router.get("")
def list_printers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statuses = get_all_printers()
    return [_enrich(s, db, current_user.id) for s in statuses]


_K2_SIGNALING_URL = "http://172.17.130.88:8000/call/webrtc_local"


@router.post("/{printer_id}/whip", include_in_schema=False)
async def webrtc_whip_adapter(printer_id: str, request: Request):
    """
    WHIP-Adapter: go2rtc sendet SDP-Offer als text/plain,
    wir wrappen es in Creality's Base64-JSON-Format und leiten es an den K2 weiter.
    """
    if printer_id != "k2":
        raise HTTPException(400, "WebRTC nur für K2 verfügbar")

    sdp_offer = (await request.body()).decode("utf-8")
    if not sdp_offer.strip().startswith("v="):
        raise HTTPException(400, "Ungültiges SDP")

    # K2 benötigt CRLF-Zeilenenden (go2rtc sendet LF)
    sdp_offer_crlf = sdp_offer.replace("\r\n", "\n").replace("\n", "\r\n")

    payload = base64.b64encode(
        json.dumps({"type": "offer", "sdp": sdp_offer_crlf}).encode()
    ).decode()

    try:
        req = urllib.request.Request(
            _K2_SIGNALING_URL,
            data=payload.encode(),
            headers={"Content-Type": "plain/text"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode()
        answer = json.loads(base64.b64decode(raw))
        sdp_answer = answer.get("sdp", "")
    except Exception as e:
        raise HTTPException(502, f"K2 Signaling Fehler: {e}")

    return Response(
        content=sdp_answer,
        media_type="application/sdp",
        status_code=201,
    )


_GO2RTC_FRAME_URL = "http://127.0.0.1:1985/api/frame.jpeg?src=k2_h264"


@router.get("/k2/webcam", include_in_schema=False)
async def k2_webcam_mjpeg():
    """MJPEG-Stream: pollt go2rtc frame.jpeg und streamt als multipart."""
    async def generate():
        loop = asyncio.get_event_loop()
        while True:
            try:
                def fetch():
                    with urllib.request.urlopen(_GO2RTC_FRAME_URL, timeout=3) as r:
                        return r.read()
                frame = await loop.run_in_executor(None, fetch)
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                    + frame + b"\r\n"
                )
            except Exception:
                await asyncio.sleep(0.5)
                continue
            await asyncio.sleep(0.15)  # ~7 fps

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


class ControlRequest(BaseModel):
    action: str  # "pause" | "resume" | "cancel" | "emergency_stop"


@router.post("/{printer_id}/control")
def control_printer(
    printer_id: str,
    body: ControlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Drucker steuern: pause/resume (Owner+Admin), cancel/emergency_stop (nur Admin)."""
    VALID_ACTIONS = {"pause", "resume", "cancel", "emergency_stop"}
    if body.action not in VALID_ACTIONS:
        raise HTTPException(400, f"Ungültige Aktion. Erlaubt: {', '.join(VALID_ACTIONS)}")

    ADMIN_ONLY = {"cancel", "emergency_stop"}
    is_admin = current_user.role.value in ("admin", "power_user")

    if body.action in ADMIN_ONLY and not is_admin:
        raise HTTPException(403, "Nur Admins können diesen Befehl ausführen")

    if not is_admin:
        occ = get_active_occupation(db, printer_id)
        if not occ or occ.user_id != current_user.id:
            raise HTTPException(403, "Kein Zugriff – du benutzt diesen Drucker nicht")

    if printer_id not in PRINTERS:
        raise HTTPException(404, "Drucker nicht gefunden")

    # Anteilige Rückerstattung bei Abbruch
    refund_cents = 0
    if body.action == "cancel":
        occ = get_active_occupation(db, printer_id)
        if occ and occ.charged_cost_cents and occ.charged_cost_cents > 0:
            status = get_printer_status(printer_id)
            cfg_api = PRINTERS[printer_id]["api"]

            if cfg_api == "moonraker" and status:
                # Tatsächlich verbrauchtes Filament aus Moonraker
                filament_mm = float(status.get("filament_used_mm", 0))
                actual_filament_g = filament_mm * MM_TO_GRAMS_175
                actual_elapsed = int(status.get("elapsed_seconds", 0))
                actual_cost = calculate_cost(actual_elapsed, actual_filament_g)
            else:
                # OctoPrint: kein Filament-Tracking → 50% Erstattung wenn < 50% Fortschritt
                progress = float(status.get("progress", 0)) if status else 0.0
                if progress < 0.5:
                    actual_cost = occ.charged_cost_cents // 2
                else:
                    actual_cost = occ.charged_cost_cents

            refund_cents = max(0, occ.charged_cost_cents - actual_cost)
            if refund_cents > 0:
                user = db.query(User).filter(User.id == occ.user_id).first()
                if user:
                    user.balance_cents += refund_cents
                    db.add(Transaction(
                        user_id=occ.user_id,
                        type=TransactionType.refund,
                        amount_cents=refund_cents,
                        description=f"Erstattung nach Abbruch (Drucker {printer_id})",
                    ))
                    db.commit()

    ok = send_printer_command(printer_id, body.action)
    if not ok:
        raise HTTPException(500, "Steuerbefehl fehlgeschlagen – Drucker erreichbar?")
    return {"ok": True, "refund_cents": refund_cents}


def _parse_filament_grams(json_str: str | None) -> float:
    """Summiert Filament-Gramm aus filament_usage JSON (ohne flush)."""
    if not json_str:
        return 0.0
    try:
        d = json.loads(json_str)
        return sum(v for k, v in d.items() if k != "flush" and isinstance(v, (int, float)))
    except Exception:
        return 0.0


class StartPrintRequest(BaseModel):
    file_id: int
    # Power-User Einstellungen (optional, nur für power_user/admin)
    temp_hotend: int | None = None    # °C, z.B. 215
    temp_bed: int | None = None       # °C, z.B. 60
    speed_percent: int | None = None  # 50–200
    flow_percent: int | None = None   # 50–150


@router.post("/{printer_id}/start")
def start_print(
    printer_id: str,
    body: StartPrintRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """G-Code-Datei auf Drucker laden und Druck starten. Bucht Kosten vom Guthaben ab."""
    # 1. Aktive Belegung prüfen
    occ = get_active_occupation(db, printer_id)
    if not occ or occ.user_id != current_user.id or occ.status != OccupationStatus.occupied:
        raise HTTPException(403, "Kein aktiver Zugriff auf diesen Drucker")

    # 2. Datei prüfen
    gfile = db.query(GCodeFile).filter(
        GCodeFile.id == body.file_id,
        GCodeFile.user_id == current_user.id,
    ).first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")
    _upload_root = "/home/fj/3d-drucker-portal/uploads"
    safe_filepath = os.path.abspath(gfile.filepath)
    if not safe_filepath.startswith(os.path.abspath(_upload_root) + os.sep):
        raise HTTPException(403, "Zugriff verweigert")

    # 2.5. Druckdauer-Limit prüfen
    max_dur = PRINTER_MAX_DURATION_SECONDS.get(printer_id)
    if max_dur and gfile.duration_seconds and gfile.duration_seconds > max_dur:
        max_h = max_dur // 3600
        est_h = round(gfile.duration_seconds / 3600, 1)
        raise HTTPException(
            400,
            f"Druck zu lang: {est_h}h geschätzt, maximal {max_h}h für diesen Drucker erlaubt"
        )

    # 3. Kosten berechnen
    filament_grams = _parse_filament_grams(gfile.filament_usage)
    cost = calculate_cost(gfile.duration_seconds, filament_grams)

    # 4. Balance prüfen
    if current_user.balance_cents < cost:
        raise HTTPException(
            402,
            f"Guthaben zu gering (benötigt: {cost} Cent, vorhanden: {current_user.balance_cents} Cent)",
        )

    # 5. Druck starten
    ok = upload_and_start_print(printer_id, safe_filepath, gfile.filename)
    if not ok:
        raise HTTPException(500, "Druck konnte nicht gestartet werden – Drucker erreichbar?")

    # 6. Guthaben abbuchen
    current_user.balance_cents -= cost
    db.add(Transaction(
        user_id=current_user.id,
        type=TransactionType.charge,
        amount_cents=-cost,
        description=f"Druck: {gfile.filename} auf {PRINTERS.get(printer_id, {}).get('name', printer_id)}",
    ))

    # 7. Occupation aktualisieren
    occ.file_id = body.file_id
    occ.estimated_cost_cents = cost
    occ.charged_cost_cents = cost
    db.commit()

    # 8. Power-User Einstellungen anwenden (nur Moonraker, nur power_user/admin)
    is_power = current_user.role.value in ("admin", "power_user")
    if is_power and PRINTERS.get(printer_id, {}).get("api") == "moonraker":
        import urllib.request as _ureq
        _base = PRINTERS[printer_id]["url"]

        def _send_gcode(cmd: str) -> None:
            try:
                req = _ureq.Request(
                    f"{_base}/printer/gcode/script",
                    data=f'{{"script": "{cmd}"}}'.encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with _ureq.urlopen(req, timeout=5):
                    pass
            except Exception:
                pass  # Fehler bei Einstellungen sind nicht druckkritisch

        if body.speed_percent is not None:
            _send_gcode(f"M220 S{body.speed_percent}")
        if body.flow_percent is not None:
            _send_gcode(f"M221 S{body.flow_percent}")
        if body.temp_hotend is not None:
            _send_gcode(f"M104 S{body.temp_hotend}")
        if body.temp_bed is not None:
            _send_gcode(f"M140 S{body.temp_bed}")

    return {"ok": True, "charged_cents": cost}


@router.get("/{printer_id}/maintenance/last")
def printer_last_maintenance(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.models import MaintenanceLog
    log = (
        db.query(MaintenanceLog)
        .filter(MaintenanceLog.printer_id == printer_id)
        .order_by(MaintenanceLog.created_at.desc())
        .first()
    )
    if not log:
        return None
    return {
        "action": log.action,
        "notes": log.notes,
        "created_at": log.created_at.isoformat(),
        "admin_email": log.admin.email if log.admin else None,
    }


@router.get("/{printer_id}")
def printer_detail(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    status = get_printer_status(printer_id)
    if status is None:
        raise HTTPException(404, "Drucker nicht gefunden")
    return _enrich(status, db, current_user.id)
