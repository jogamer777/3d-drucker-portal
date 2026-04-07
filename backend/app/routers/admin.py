import csv
import io
import os
import json
import secrets
import string
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.models.models import User, UserRole, Transaction, TransactionType, VoucherCode, AdminMessage, ActivityLog, GCodeFile, PrinterOccupation, OccupationStatus, QueueEntry, QueueStatus, MaintenanceLog, MAINTENANCE_ACTIONS
from app.core.printer_client import PRINTERS, reload_printer_config, save_printer_config
from app.core.email import get_email_config, save_email_config, send_email, reload_email_config
from app.core.portal_config import get_registration_open, set_registration_open
from app.schemas.schemas import MaintenanceLogCreate, MaintenanceLogOut
from app.schemas.schemas import (
    AdminUserOut, AdminUserUpdate, PasswordResetResponse,
    AdminMessageCreate, AdminMessageOut, AdminTransactionOut, ActivityLogOut,
    AdminGCodeFileOut,
)
from app.routers.user import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Benutzer nicht gefunden")
    if user.id == admin.id:
        raise HTTPException(400, "Eigenen Account nicht veränderbar")

    old_balance = user.balance_cents

    if data.role is not None:
        user.role = data.role
    if data.is_blocked is not None:
        user.is_blocked = data.is_blocked
        if not data.is_blocked:
            user.failed_login_attempts = 0  # beim Entsperren zurücksetzen
    if data.balance_cents is not None:
        diff = data.balance_cents - old_balance
        user.balance_cents = data.balance_cents
        if diff != 0:
            note = data.balance_note.strip() if data.balance_note else f"Admin-Korrektur von {admin.email}"
            tx = Transaction(
                user_id=user.id,
                type=TransactionType.topup if diff > 0 else TransactionType.charge,
                amount_cents=diff,
                description=note,
            )
            db.add(tx)

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResponse)
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Benutzer nicht gefunden")

    # Temporäres Passwort: 12 Zeichen, lesbar
    alphabet = string.ascii_letters + string.digits
    temp_pw = "".join(secrets.choice(alphabet) for _ in range(12))
    user.password_hash = hash_password(temp_pw)
    user.failed_login_attempts = 0
    user.is_blocked = False
    db.commit()

    return PasswordResetResponse(temp_password=temp_pw)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(403, "Eigenen Account nicht löschbar")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Benutzer nicht gefunden")

    # redeemed_by_id ist nullable → nullen bevor User gelöscht wird
    db.query(VoucherCode).filter(VoucherCode.redeemed_by_id == user_id).update({"redeemed_by_id": None})
    db.commit()

    db.delete(user)  # Transactions + Messages cascadieren via SQLAlchemy
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/message", status_code=201)
def send_message(
    user_id: int,
    data: AdminMessageCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Benutzer nicht gefunden")
    if not data.body.strip():
        raise HTTPException(400, "Nachricht darf nicht leer sein")

    msg = AdminMessage(
        from_admin_id=admin.id,
        to_user_id=user_id,
        body=data.body.strip(),
    )
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.get("/activity", response_model=List[ActivityLogOut])
def list_activity(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    logs = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(1000).all()
    return [ActivityLogOut(
        id=log.id,
        actor_email=log.actor_email,
        action=log.action,
        details=log.details,
        created_at=log.created_at,
    ) for log in logs]


@router.get("/transactions", response_model=List[AdminTransactionOut])
def list_all_transactions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    txs = db.query(Transaction).order_by(Transaction.created_at.desc()).limit(500).all()
    result = []
    for tx in txs:
        voucher_code = None
        if tx.related_voucher_id and tx.voucher:
            voucher_code = tx.voucher.code
        result.append(AdminTransactionOut(
            id=tx.id,
            user_email=tx.user.email,
            type=tx.type,
            amount_cents=tx.amount_cents,
            description=tx.description,
            created_at=tx.created_at,
            related_voucher_code=voucher_code,
        ))
    return result


@router.get("/files", response_model=List[AdminGCodeFileOut])
def list_all_files(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    files = (
        db.query(GCodeFile)
        .order_by(GCodeFile.uploaded_at.desc())
        .limit(500)
        .all()
    )
    result = []
    for f in files:
        result.append(AdminGCodeFileOut(
            id=f.id,
            user_id=f.user_id,
            user_email=f.user.email,
            filename=f.filename,
            size_bytes=f.size_bytes,
            duration_seconds=f.duration_seconds,
            filament_usage=json.loads(f.filament_usage) if f.filament_usage else None,
            thumbnail_b64=f.thumbnail_b64,
            profile_signature=f.profile_signature,
            uploaded_at=f.uploaded_at,
        ))
    return result


@router.get("/files/{file_id}/download")
def admin_download_file(
    file_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    gfile = db.query(GCodeFile).filter(GCodeFile.id == file_id).first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")
    if not os.path.exists(gfile.filepath):
        raise HTTPException(404, "Datei nicht auf Disk vorhanden")
    return FileResponse(
        path=gfile.filepath,
        filename=gfile.filename,
        media_type="application/octet-stream",
    )


@router.delete("/files/{file_id}")
def admin_delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    gfile = db.query(GCodeFile).filter(GCodeFile.id == file_id).first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")

    owner = db.query(User).filter(User.id == gfile.user_id).first()

    if os.path.exists(gfile.filepath):
        os.remove(gfile.filepath)

    if owner:
        owner.storage_used_bytes = max(0, owner.storage_used_bytes - gfile.size_bytes)

    db.add(ActivityLog(
        user_id=gfile.user_id,
        actor_email=admin.email,
        action="admin_file_delete",
        details=f"Admin {admin.email} löschte Datei: {gfile.filename} (Nutzer: {owner.email if owner else '?'})",
    ))

    db.delete(gfile)
    db.commit()
    return {"ok": True}


@router.get("/printers/config")
def get_printer_config(admin: User = Depends(require_admin)):
    """Gibt konfigurierbare Drucker-Einstellungen zurück (API-Keys etc.)."""
    result = {}
    for pid, cfg in PRINTERS.items():
        if cfg["api"] == "octoprint":
            result[pid] = {
                "name": cfg["name"],
                "api_key": cfg.get("api_key", ""),
                "webcam_path": cfg.get("webcam_path", ""),
                "url": cfg.get("url", ""),
            }
    return result


class OctoPrintConfig(BaseModel):
    api_key: str
    webcam_path: str = "/printers/crx/webcam"


@router.put("/printers/config/{printer_id}")
def update_printer_config(
    printer_id: str,
    body: OctoPrintConfig,
    admin: User = Depends(require_admin),
):
    """Speichert OctoPrint API-Key und Webcam-Pfad persistent."""
    if printer_id not in PRINTERS or PRINTERS[printer_id].get("api") != "octoprint":
        raise HTTPException(404, "Drucker nicht gefunden oder kein OctoPrint-Drucker")
    try:
        save_printer_config({
            printer_id: {
                "api_key": body.api_key,
                "webcam_path": body.webcam_path,
            }
        })
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return {"ok": True}


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from datetime import date
    from sqlalchemy import func
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    users_total = db.query(func.count(User.id)).scalar() or 0

    # Umsatz = alle positiven Transaktionen (topup/refund), negativ = charges
    # Für "Umsatz" nehmen wir Druckkosten (charge-Transaktionen, Beträge sind negativ)
    revenue_all = db.query(func.sum(Transaction.amount_cents)).filter(
        Transaction.type == TransactionType.charge,
    ).scalar() or 0
    revenue_month = db.query(func.sum(Transaction.amount_cents)).filter(
        Transaction.type == TransactionType.charge,
        Transaction.created_at >= month_start,
    ).scalar() or 0

    prints_completed = db.query(func.count(PrinterOccupation.id)).filter(
        PrinterOccupation.status.in_([OccupationStatus.awaiting_pickup, OccupationStatus.released]),
        PrinterOccupation.file_id != None,
    ).scalar() or 0

    active_occupations = db.query(func.count(PrinterOccupation.id)).filter(
        PrinterOccupation.status == OccupationStatus.occupied,
    ).scalar() or 0

    pending_queue = db.query(func.count(QueueEntry.id)).filter(
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).scalar() or 0

    storage_total = db.query(func.sum(User.storage_used_bytes)).scalar() or 0

    return {
        "users_total": users_total,
        "revenue_all_time_cents": abs(revenue_all),
        "revenue_this_month_cents": abs(revenue_month),
        "prints_completed": prints_completed,
        "active_occupations": active_occupations,
        "pending_queue_entries": pending_queue,
        "storage_used_total_bytes": storage_total,
    }


@router.get("/email-config")
def get_email_config_endpoint(admin: User = Depends(require_admin)):
    cfg = get_email_config()
    # Passwort nicht zurückgeben
    cfg.pop("smtp_password", None)
    return cfg


class EmailConfig(BaseModel):
    enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_address: str = ""
    use_tls: bool = True
    use_ssl: bool = False


@router.put("/email-config")
def update_email_config(
    body: EmailConfig,
    admin: User = Depends(require_admin),
):
    cfg = body.dict()
    # Leeres Passwort = unverändertes Passwort beibehalten
    if not cfg["smtp_password"]:
        existing = get_email_config()
        cfg["smtp_password"] = existing.get("smtp_password", "")
    save_email_config(cfg)
    return {"ok": True}


@router.post("/email-config/test")
def test_email_config(admin: User = Depends(require_admin)):
    ok = send_email(
        to=admin.email,
        subject="Test-Mail – 3D-Drucker-Portal",
        body="Diese E-Mail bestätigt, dass deine SMTP-Konfiguration funktioniert.",
    )
    if not ok:
        raise HTTPException(500, "E-Mail konnte nicht gesendet werden. Konfiguration prüfen.")
    return {"ok": True}


@router.get("/portal-config")
def get_portal_config_endpoint(admin: User = Depends(require_admin)):
    return {"registration_open": get_registration_open()}


class PortalConfigUpdate(BaseModel):
    registration_open: bool


@router.put("/portal-config")
def update_portal_config(body: PortalConfigUpdate, admin: User = Depends(require_admin)):
    set_registration_open(body.registration_open)
    return {"ok": True, "registration_open": body.registration_open}


# ── Wartungsprotokoll ─────────────────────────────────────────────────────────

@router.get("/printers/{printer_id}/maintenance", response_model=List[MaintenanceLogOut])
def list_maintenance(
    printer_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if printer_id not in PRINTERS:
        raise HTTPException(404, "Drucker nicht gefunden")
    logs = (
        db.query(MaintenanceLog)
        .filter(MaintenanceLog.printer_id == printer_id)
        .order_by(MaintenanceLog.created_at.desc())
        .limit(50)
        .all()
    )
    return [MaintenanceLogOut(
        id=log.id,
        printer_id=log.printer_id,
        admin_email=log.admin.email if log.admin else None,
        action=log.action,
        notes=log.notes,
        created_at=log.created_at,
    ) for log in logs]


@router.post("/printers/{printer_id}/maintenance", response_model=MaintenanceLogOut, status_code=201)
def create_maintenance(
    printer_id: str,
    data: MaintenanceLogCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if printer_id not in PRINTERS:
        raise HTTPException(404, "Drucker nicht gefunden")
    if not data.action.strip():
        raise HTTPException(400, "Aktion darf nicht leer sein")

    log = MaintenanceLog(
        printer_id=printer_id,
        admin_id=admin.id,
        action=data.action.strip(),
        notes=data.notes.strip() if data.notes else None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return MaintenanceLogOut(
        id=log.id,
        printer_id=log.printer_id,
        admin_email=admin.email,
        action=log.action,
        notes=log.notes,
        created_at=log.created_at,
    )


@router.get("/maintenance-actions")
def get_maintenance_actions(admin: User = Depends(require_admin)):
    return MAINTENANCE_ACTIONS


# ── CSV-Export ────────────────────────────────────────────────────────────────

@router.get("/transactions/export")
def export_transactions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    txs = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["ID", "Nutzer", "Typ", "Betrag (Cent)", "Betrag (EUR)", "Beschreibung", "Datum"])
    for tx in txs:
        writer.writerow([
            tx.id,
            tx.user.email if tx.user else "",
            tx.type.value,
            tx.amount_cents,
            f"{tx.amount_cents / 100:.2f}".replace(".", ","),
            tx.description,
            tx.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        ])
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return Response(
        content="\ufeff" + output.getvalue(),  # BOM für Excel
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="transaktionen_{today}.csv"'},
    )


@router.get("/users/export")
def export_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["ID", "E-Mail", "Rolle", "Guthaben (Cent)", "Guthaben (EUR)", "Gesperrt", "Registriert", "Letzter Login"])
    for u in users:
        writer.writerow([
            u.id,
            u.email,
            u.role.value,
            u.balance_cents,
            f"{u.balance_cents / 100:.2f}".replace(".", ","),
            "Ja" if u.is_blocked else "Nein",
            u.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            u.last_login_at.strftime("%Y-%m-%d %H:%M:%S") if u.last_login_at else "",
        ])
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="nutzer_{today}.csv"'},
    )


@router.get("/messages", response_model=List[AdminMessageOut])
def list_messages(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    messages = db.query(AdminMessage).order_by(AdminMessage.created_at.desc()).all()
    result = []
    for m in messages:
        result.append(AdminMessageOut(
            id=m.id,
            from_admin_email=m.from_admin.email if m.from_admin else None,
            to_user_email=m.to_user.email,
            body=m.body,
            created_at=m.created_at,
            read_at=m.read_at,
            reply=m.reply,
            replied_at=m.replied_at,
        ))
    return result
