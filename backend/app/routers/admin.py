import os
import json
import secrets
import string
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.models.models import User, UserRole, Transaction, TransactionType, VoucherCode, AdminMessage, ActivityLog, GCodeFile
from app.core.printer_client import PRINTERS, reload_printer_config, save_printer_config
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
