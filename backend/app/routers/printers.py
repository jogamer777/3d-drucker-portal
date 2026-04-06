from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import User, PrinterOccupation, OccupationStatus, QueueEntry, QueueStatus
from app.routers.user import get_current_user
from app.core.printer_client import get_all_printers, get_printer_status
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
        status["occupation"] = {
            "id": occ.id,
            "is_mine": occ.user_id == user_id,
            "status": occ.status.value,
            "pickup_deadline": occ.pickup_deadline.isoformat() if occ.pickup_deadline else None,
            "pickup_seconds_remaining": pickup_secs,
        }
    else:
        status["occupation"] = None

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
