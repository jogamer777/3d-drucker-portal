from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Transaction, User
from app.schemas.schemas import TransactionOut
from app.routers.user import get_current_user

router = APIRouter(prefix="/api/user", tags=["transactions"])


@router.get("/transactions", response_model=List[TransactionOut])
def get_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
        .limit(100)
        .all()
    )
    return txs
