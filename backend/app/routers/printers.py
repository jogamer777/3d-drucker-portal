from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import User, Reservation, ReservationStatus, QueueEntry, QueueStatus
from app.routers.user import get_current_user
from app.core.printer_client import get_all_printers, get_printer_status
from app.core.queue_logic import get_active_reservation, get_queue_position

router = APIRouter(prefix="/api/printers", tags=["printers"])


def _enrich(status: dict, db: Session, user_id: int) -> dict:
    """Fügt Reservierungs- und Queue-Info zum Drucker-Status hinzu."""
    pid = status["id"]
    now = datetime.utcnow()

    res = get_active_reservation(db, pid)
    if res:
        secs = max(0, int((res.expires_at - now).total_seconds()))
        status["reservation"] = {
            "id": res.id,
            "is_mine": res.user_id == user_id,
            "expires_at": res.expires_at.isoformat(),
            "seconds_remaining": secs,
            "minutes_remaining": secs // 60,
        }
    else:
        status["reservation"] = None

    # Warteschlange zählen (waiting + notified)
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
    """Alle konfigurierten Drucker mit Status + Reservierungsinfo."""
    statuses = get_all_printers()
    return [_enrich(s, db, current_user.id) for s in statuses]


@router.get("/{printer_id}")
def printer_detail(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Einzelner Drucker-Status + Reservierungsinfo."""
    status = get_printer_status(printer_id)
    if status is None:
        raise HTTPException(404, "Drucker nicht gefunden")
    return _enrich(status, db, current_user.id)
