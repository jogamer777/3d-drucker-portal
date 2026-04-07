from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import User, PrinterOccupation, OccupationStatus, QueueEntry, QueueStatus
from app.routers.user import get_current_user
from app.core.printer_client import get_all_printers, get_printer_status, send_moonraker_command, PRINTERS
from app.core.queue_logic import get_active_occupation, get_queue_position

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

    if printer_id not in PRINTERS or PRINTERS[printer_id].get("api") != "moonraker":
        raise HTTPException(400, "Steuerung nur für Moonraker-Drucker verfügbar")

    ok = send_moonraker_command(printer_id, body.action)
    if not ok:
        raise HTTPException(500, "Steuerbefehl fehlgeschlagen – Drucker erreichbar?")
    return {"ok": True}


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
