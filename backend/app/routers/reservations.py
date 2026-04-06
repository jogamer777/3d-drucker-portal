from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.printer_client import PRINTERS
from app.core.queue_logic import (
    get_active_reservation, get_queue_position, advance_queue,
    AUTO_RESERVE_MINUTES,
)
from app.models.models import (
    Reservation, ReservationStatus,
    QueueEntry, QueueStatus,
    User,
)
from app.routers.user import get_current_user

router = APIRouter(prefix="/api", tags=["reservations"])


class ReservationCreate(BaseModel):
    printer_id: str
    duration_minutes: int   # 15 oder 30


# ── Reservierungen ─────────────────────────────────────────────────────────────

@router.post("/reservations", status_code=201)
def create_reservation(
    data: ReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.printer_id not in PRINTERS:
        raise HTTPException(400, "Unbekannter Drucker")
    if data.duration_minutes not in (15, 30):
        raise HTTPException(400, "Dauer muss 15 oder 30 Minuten sein")

    # Bereits eine aktive Reservierung für diesen Drucker?
    existing = get_active_reservation(db, data.printer_id)
    if existing:
        raise HTTPException(409, "Drucker ist bereits reserviert")

    # Nutzer hat bereits eine aktive Reservierung für diesen Drucker?
    mine = db.query(Reservation).filter(
        Reservation.printer_id == data.printer_id,
        Reservation.user_id == current_user.id,
        Reservation.status == ReservationStatus.active,
    ).first()
    if mine:
        raise HTTPException(409, "Du hast bereits eine aktive Reservierung für diesen Drucker")

    now = datetime.utcnow()
    res = Reservation(
        printer_id=data.printer_id,
        user_id=current_user.id,
        duration_minutes=data.duration_minutes,
        expires_at=now + timedelta(minutes=data.duration_minutes),
    )
    db.add(res)

    # Nutzer aus Warteschlange austragen (falls vorhanden)
    db.query(QueueEntry).filter(
        QueueEntry.printer_id == data.printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).update({"status": QueueStatus.cancelled})

    db.commit()
    db.refresh(res)
    return _reservation_out(res)


@router.get("/reservations/my")
def my_reservations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eigene aktive Reservierungen + Queue-Positionen."""
    result = []
    for pid in PRINTERS:
        res = db.query(Reservation).filter(
            Reservation.printer_id == pid,
            Reservation.user_id == current_user.id,
            Reservation.status == ReservationStatus.active,
        ).first()
        queue_entry, position = get_queue_position(db, pid, current_user.id)
        result.append({
            "printer_id": pid,
            "reservation": _reservation_out(res) if res else None,
            "queue": _queue_out(queue_entry, position) if queue_entry else None,
        })
    return result


@router.delete("/reservations/{reservation_id}")
def cancel_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = db.query(Reservation).filter(
        Reservation.id == reservation_id,
        Reservation.user_id == current_user.id,
        Reservation.status == ReservationStatus.active,
    ).first()
    if not res:
        raise HTTPException(404, "Reservierung nicht gefunden")

    printer_id = res.printer_id
    res.status = ReservationStatus.cancelled
    db.commit()

    # Sofort Queue vorrücken
    advance_queue(db, printer_id)
    return {"ok": True}


# ── Warteschlange ──────────────────────────────────────────────────────────────

@router.post("/queue/{printer_id}", status_code=201)
def join_queue(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if printer_id not in PRINTERS:
        raise HTTPException(400, "Unbekannter Drucker")

    # Bereits in Warteschlange?
    existing = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).first()
    if existing:
        raise HTTPException(409, "Du bist bereits in der Warteschlange")

    # Bereits eigene Reservierung?
    if get_active_reservation(db, printer_id) and \
       db.query(Reservation).filter(
           Reservation.printer_id == printer_id,
           Reservation.user_id == current_user.id,
           Reservation.status == ReservationStatus.active,
       ).first():
        raise HTTPException(409, "Du hast bereits eine aktive Reservierung")

    entry = QueueEntry(
        printer_id=printer_id,
        user_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    _, position = get_queue_position(db, printer_id, current_user.id)
    return _queue_out(entry, position)


@router.delete("/queue/{printer_id}")
def leave_queue(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).first()
    if not entry:
        raise HTTPException(404, "Nicht in der Warteschlange")

    entry.status = QueueStatus.cancelled
    db.commit()

    # Falls notified → Queue vorrücken damit nächster dran kommt
    advance_queue(db, printer_id)
    return {"ok": True}


@router.post("/queue/{printer_id}/acknowledge")
def acknowledge_queue(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nutzer bestätigt innerhalb des 5-Min-Fensters → erhält Reservierung."""
    entry = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status == QueueStatus.notified,
    ).first()
    if not entry:
        raise HTTPException(404, "Kein offenes Benachrichtigungs-Fenster")

    # Sicherstellen dass keine aktive Reservierung mehr existiert (könnte durch Timeout entstanden sein)
    conflict = get_active_reservation(db, printer_id)
    if conflict and conflict.user_id != current_user.id:
        raise HTTPException(409, "Drucker wurde zwischenzeitlich neu reserviert")

    # Reservierung anlegen (falls vom Cleanup noch nicht angelegt)
    existing_res = db.query(Reservation).filter(
        Reservation.printer_id == printer_id,
        Reservation.user_id == current_user.id,
        Reservation.status == ReservationStatus.active,
    ).first()

    if not existing_res:
        now = datetime.utcnow()
        res = Reservation(
            printer_id=printer_id,
            user_id=current_user.id,
            duration_minutes=AUTO_RESERVE_MINUTES,
            expires_at=now + timedelta(minutes=AUTO_RESERVE_MINUTES),
        )
        db.add(res)

    entry.status = QueueStatus.cancelled
    db.commit()
    return {"ok": True, "message": f"{AUTO_RESERVE_MINUTES}-Min-Reservierung erstellt"}


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _reservation_out(res: Reservation) -> dict:
    now = datetime.utcnow()
    secs = max(0, int((res.expires_at - now).total_seconds()))
    return {
        "id": res.id,
        "printer_id": res.printer_id,
        "duration_minutes": res.duration_minutes,
        "reserved_at": res.reserved_at.isoformat(),
        "expires_at": res.expires_at.isoformat(),
        "seconds_remaining": secs,
        "minutes_remaining": secs // 60,
    }


def _queue_out(entry: QueueEntry, position: int) -> dict:
    return {
        "id": entry.id,
        "position": position,
        "status": entry.status.value,
        "notified_at": entry.notified_at.isoformat() if entry.notified_at else None,
    }
