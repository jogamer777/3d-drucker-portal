import time
from collections import defaultdict
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

_redeem_attempts: dict[int, list[float]] = defaultdict(list)
REDEEM_WINDOW_SECONDS = 3600  # 1 Stunde
REDEEM_MAX_FAILS = 10

from app.core.database import get_db
from app.models.models import VoucherCode, VoucherStatus, Transaction, TransactionType, User, generate_voucher_code, ActivityLog
from app.schemas.schemas import VoucherCreate, VoucherOut, VoucherRedeemRequest, VoucherRedeemResponse, VoucherUpdate
from app.routers.user import get_current_user, require_admin

router = APIRouter(prefix="/api/vouchers", tags=["vouchers"])


@router.post("", response_model=List[VoucherOut], status_code=201)
def create_vouchers(
    data: VoucherCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if data.value_cents <= 0:
        raise HTTPException(400, "Wert muss größer als 0 sein")
    if not (1 <= data.count <= 100):
        raise HTTPException(400, "Anzahl muss zwischen 1 und 100 liegen")

    created = []
    for _ in range(data.count):
        # Eindeutigkeit sicherstellen
        for attempt in range(10):
            code = generate_voucher_code()
            if not db.query(VoucherCode).filter(VoucherCode.code == code).first():
                break
        voucher = VoucherCode(
            code=code,
            value_cents=data.value_cents,
            created_by_id=admin.id,
        )
        db.add(voucher)
        created.append(voucher)

    db.commit()
    for v in created:
        db.refresh(v)

    result = []
    for v in created:
        out = VoucherOut.from_orm(v)
        result.append(out)
    return result


@router.get("", response_model=List[VoucherOut])
def list_vouchers(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vouchers = db.query(VoucherCode).order_by(VoucherCode.created_at.desc()).all()
    result = []
    for v in vouchers:
        out = VoucherOut.from_orm(v)
        if v.redeemed_by:
            out.redeemed_by_email = v.redeemed_by.email
        result.append(out)
    return result


@router.post("/redeem", response_model=VoucherRedeemResponse)
def redeem_voucher(
    data: VoucherRedeemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Rate-Limiting: max 10 Fehlversuche pro Stunde
    now = time.time()
    uid = current_user.id
    _redeem_attempts[uid] = [t for t in _redeem_attempts[uid] if now - t < REDEEM_WINDOW_SECONDS]
    if len(_redeem_attempts[uid]) >= REDEEM_MAX_FAILS:
        raise HTTPException(429, "Zu viele Fehlversuche. Bitte in einer Stunde erneut versuchen.")

    code = data.code.strip().upper()
    voucher = db.query(VoucherCode).filter(VoucherCode.code == code).first()

    if not voucher:
        _redeem_attempts[uid].append(now)
        raise HTTPException(404, "Gutschein-Code nicht gefunden")
    if voucher.status == VoucherStatus.cancelled:
        _redeem_attempts[uid].append(now)
        raise HTTPException(400, "Dieser Code ist ungültig")
    if voucher.status == VoucherStatus.redeemed:
        _redeem_attempts[uid].append(now)
        raise HTTPException(400, "Dieser Code wurde bereits eingelöst")

    # Gutschein einlösen
    voucher.status = VoucherStatus.redeemed
    voucher.redeemed_by_id = current_user.id
    voucher.redeemed_at = datetime.utcnow()

    # Guthaben gutschreiben
    current_user.balance_cents += voucher.value_cents

    # Transaktion anlegen
    tx = Transaction(
        user_id=current_user.id,
        type=TransactionType.topup,
        amount_cents=voucher.value_cents,
        description=f"Gutschein eingelöst: {voucher.code}",
        related_voucher_id=voucher.id,
    )
    db.add(tx)
    db.add(ActivityLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="voucher_redeem",
        details=f"Gutschein {voucher.code} eingelöst ({voucher.value_cents / 100:.2f} €)",
    ))
    db.commit()

    return VoucherRedeemResponse(
        message="Gutschein erfolgreich eingelöst",
        value_cents=voucher.value_cents,
        new_balance_cents=current_user.balance_cents,
    )


@router.patch("/{voucher_id}", response_model=VoucherOut)
def update_voucher(
    voucher_id: int,
    data: VoucherUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    voucher = db.query(VoucherCode).filter(VoucherCode.id == voucher_id).first()
    if not voucher:
        raise HTTPException(404, "Gutschein nicht gefunden")

    if data.value_cents is not None:
        if voucher.status != VoucherStatus.open:
            raise HTTPException(400, "Wert nur bei offenen Codes änderbar")
        if data.value_cents <= 0:
            raise HTTPException(400, "Wert muss größer als 0 sein")
        voucher.value_cents = data.value_cents

    if data.status is not None:
        if data.status == VoucherStatus.redeemed:
            raise HTTPException(400, "Status 'redeemed' kann nicht manuell gesetzt werden")
        if data.status == VoucherStatus.open and voucher.status == VoucherStatus.redeemed:
            # Zurücksetzen: Einlösungs-Daten löschen
            voucher.redeemed_by_id = None
            voucher.redeemed_at = None
        voucher.status = data.status

    db.commit()
    db.refresh(voucher)
    out = VoucherOut.from_orm(voucher)
    if voucher.redeemed_by:
        out.redeemed_by_email = voucher.redeemed_by.email
    return out


@router.delete("/{voucher_id}")
def delete_voucher(
    voucher_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    voucher = db.query(VoucherCode).filter(VoucherCode.id == voucher_id).first()
    if not voucher:
        raise HTTPException(404, "Gutschein nicht gefunden")
    if voucher.status == VoucherStatus.redeemed:
        raise HTTPException(400, "Eingelöste Codes können nicht gelöscht werden")
    db.delete(voucher)
    db.commit()
    return {"ok": True}
