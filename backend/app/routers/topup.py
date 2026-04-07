"""
Auflade-Anträge: Nutzer stellen Anträge, Admin genehmigt/lehnt ab.
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.email import send_email
from app.models.models import TopupRequest, TopupRequestStatus, Transaction, TransactionType, User
from app.schemas.schemas import TopupRequestCreate, TopupRequestOut, AdminTopupRequestOut, TopupRejectRequest
from app.routers.user import get_current_user, require_admin

router = APIRouter(tags=["topup"])

_MIN_CENTS = 100    # 1,00 €
_MAX_CENTS = 20000  # 200,00 €


def _to_out(req: TopupRequest) -> TopupRequestOut:
    return TopupRequestOut(
        id=req.id,
        user_id=req.user_id,
        amount_cents=req.amount_cents,
        note=req.note,
        status=req.status,
        created_at=req.created_at,
        processed_at=req.processed_at,
        admin_note=req.admin_note,
    )


def _to_admin_out(req: TopupRequest) -> AdminTopupRequestOut:
    return AdminTopupRequestOut(
        id=req.id,
        user_id=req.user_id,
        user_email=req.user.email,
        amount_cents=req.amount_cents,
        note=req.note,
        status=req.status,
        created_at=req.created_at,
        processed_at=req.processed_at,
        admin_note=req.admin_note,
    )


# ── Nutzer-Endpoints ───────────────────────────────────────────────────────────

@router.post("/api/user/topup-request", response_model=TopupRequestOut, status_code=201)
def create_topup_request(
    data: TopupRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.amount_cents < _MIN_CENTS:
        raise HTTPException(400, f"Mindestbetrag: {_MIN_CENTS / 100:.2f} €")
    if data.amount_cents > _MAX_CENTS:
        raise HTTPException(400, f"Höchstbetrag: {_MAX_CENTS / 100:.2f} €")

    # Nur 1 offener Antrag pro Nutzer
    existing = db.query(TopupRequest).filter(
        TopupRequest.user_id == current_user.id,
        TopupRequest.status == TopupRequestStatus.pending,
    ).first()
    if existing:
        raise HTTPException(409, "Du hast bereits einen offenen Aufladeantrag")

    req = TopupRequest(
        user_id=current_user.id,
        amount_cents=data.amount_cents,
        note=data.note.strip() if data.note else None,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _to_out(req)


@router.get("/api/user/topup-requests", response_model=List[TopupRequestOut])
def list_my_topup_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requests = (
        db.query(TopupRequest)
        .filter(TopupRequest.user_id == current_user.id)
        .order_by(TopupRequest.created_at.desc())
        .limit(20)
        .all()
    )
    return [_to_out(r) for r in requests]


# ── Admin-Endpoints ────────────────────────────────────────────────────────────

@router.get("/api/admin/topup-requests", response_model=List[AdminTopupRequestOut])
def list_topup_requests(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(TopupRequest)
    if status:
        try:
            q = q.filter(TopupRequest.status == TopupRequestStatus(status))
        except ValueError:
            pass
    requests = q.order_by(TopupRequest.created_at.desc()).limit(200).all()
    return [_to_admin_out(r) for r in requests]


@router.post("/api/admin/topup-requests/{request_id}/approve", response_model=AdminTopupRequestOut)
def approve_topup_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    req = db.query(TopupRequest).filter(TopupRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Antrag nicht gefunden")
    if req.status != TopupRequestStatus.pending:
        raise HTTPException(400, "Antrag ist nicht mehr offen")

    now = datetime.utcnow()
    req.status = TopupRequestStatus.approved
    req.processed_at = now
    req.processed_by_id = admin.id

    # Guthaben gutschreiben
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(404, "Nutzer nicht gefunden")
    user.balance_cents += req.amount_cents

    # Transaction erstellen
    amount_euros = req.amount_cents / 100
    tx = Transaction(
        user_id=user.id,
        type=TransactionType.topup,
        amount_cents=req.amount_cents,
        description=f"Aufladung genehmigt von {admin.email} ({amount_euros:.2f} €)",
    )
    db.add(tx)
    db.commit()
    db.refresh(req)

    # E-Mail-Benachrichtigung
    send_email(
        to=user.email,
        subject="Aufladeantrag genehmigt – 3D-Drucker-Portal",
        body=(
            f"Hallo,\n\n"
            f"dein Aufladeantrag über {amount_euros:.2f} € wurde genehmigt.\n"
            f"Dein Guthaben wurde entsprechend erhöht.\n\n"
            f"Viel Spaß beim Drucken!\n"
            f"– Das 3D-Drucker-Portal"
        ),
    )

    return _to_admin_out(req)


@router.post("/api/admin/topup-requests/{request_id}/reject", response_model=AdminTopupRequestOut)
def reject_topup_request(
    request_id: int,
    data: TopupRejectRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    req = db.query(TopupRequest).filter(TopupRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Antrag nicht gefunden")
    if req.status != TopupRequestStatus.pending:
        raise HTTPException(400, "Antrag ist nicht mehr offen")

    now = datetime.utcnow()
    req.status = TopupRequestStatus.rejected
    req.processed_at = now
    req.processed_by_id = admin.id
    req.admin_note = data.admin_note.strip() if data.admin_note else None
    db.commit()
    db.refresh(req)

    # E-Mail-Benachrichtigung
    user = db.query(User).filter(User.id == req.user_id).first()
    if user:
        note_text = f"\nGrund: {req.admin_note}" if req.admin_note else ""
        send_email(
            to=user.email,
            subject="Aufladeantrag abgelehnt – 3D-Drucker-Portal",
            body=(
                f"Hallo,\n\n"
                f"dein Aufladeantrag über {req.amount_cents / 100:.2f} € wurde leider abgelehnt.{note_text}\n\n"
                f"Bei Fragen wende dich an einen Administrator.\n"
                f"– Das 3D-Drucker-Portal"
            ),
        )

    return _to_admin_out(req)
