"""
Warteschlangen- und Reservierungs-Logik.
Wird vom Background-Cleanup-Task und von den Endpunkten genutzt.
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.models import (
    Reservation, ReservationStatus,
    QueueEntry, QueueStatus,
)

QUEUE_NOTIFY_TIMEOUT_MINUTES = 5
AUTO_RESERVE_MINUTES = 15


def get_active_reservation(db: Session, printer_id: str):
    """Gibt die aktive Reservierung für einen Drucker zurück oder None."""
    return db.query(Reservation).filter(
        Reservation.printer_id == printer_id,
        Reservation.status == ReservationStatus.active,
    ).first()


def get_queue_entries(db: Session, printer_id: str) -> list:
    """Alle aktiven (waiting/notified) Queue-Einträge für einen Drucker, nach Zeit sortiert."""
    return (
        db.query(QueueEntry)
        .filter(
            QueueEntry.printer_id == printer_id,
            QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
        )
        .order_by(QueueEntry.created_at)
        .all()
    )


def get_queue_position(db: Session, printer_id: str, user_id: int) -> tuple:
    """Gibt (entry, position) für einen Nutzer in der Warteschlange zurück."""
    entries = get_queue_entries(db, printer_id)
    for i, e in enumerate(entries):
        if e.user_id == user_id:
            return e, i + 1
    return None, None


def advance_queue(db: Session, printer_id: str):
    """
    Rückt die Warteschlange vor:
    1. Überfällige 'notified'-Einträge → 'skipped'
    2. Nächsten 'waiting'-Eintrag → 'notified' + automatische 15-Min-Reservierung
    """
    now = datetime.utcnow()
    timeout_threshold = now - timedelta(minutes=QUEUE_NOTIFY_TIMEOUT_MINUTES)

    # Überfällige notified-Einträge überspringen
    db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.status == QueueStatus.notified,
        QueueEntry.notified_at < timeout_threshold,
    ).update({"status": QueueStatus.skipped})

    # Prüfen ob schon jemand aktiv notified ist (innerhalb Frist)
    still_notified = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.status == QueueStatus.notified,
    ).first()
    if still_notified:
        return  # Warten bis Frist abläuft oder acknowledge

    # Nächsten waiting-Eintrag holen
    next_entry = (
        db.query(QueueEntry)
        .filter(
            QueueEntry.printer_id == printer_id,
            QueueEntry.status == QueueStatus.waiting,
        )
        .order_by(QueueEntry.created_at)
        .first()
    )
    if not next_entry:
        return  # Warteschlange leer

    # Automatische Reservierung erstellen
    expires_at = now + timedelta(minutes=AUTO_RESERVE_MINUTES)
    reservation = Reservation(
        printer_id=printer_id,
        user_id=next_entry.user_id,
        status=ReservationStatus.active,
        duration_minutes=AUTO_RESERVE_MINUTES,
        expires_at=expires_at,
    )
    db.add(reservation)

    next_entry.status = QueueStatus.notified
    next_entry.notified_at = now
    db.commit()


def expire_and_advance(db: Session):
    """
    Haupt-Cleanup-Funktion, wird alle 30s vom Background-Task aufgerufen.
    - Abgelaufene Reservierungen → expired
    - Queue für jeden betroffenen Drucker vorrücken
    """
    now = datetime.utcnow()
    expired = db.query(Reservation).filter(
        Reservation.status == ReservationStatus.active,
        Reservation.expires_at < now,
    ).all()

    affected_printers = set()
    for res in expired:
        res.status = ReservationStatus.expired
        affected_printers.add(res.printer_id)

    if affected_printers:
        db.commit()

    for printer_id in affected_printers:
        # Nur wenn kein neuer aktiver Eintrag (z.B. durch acknowledge)
        if not get_active_reservation(db, printer_id):
            advance_queue(db, printer_id)
