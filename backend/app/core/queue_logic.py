"""
Warteschlangen- und Belegungs-Logik für 3D-Drucker-Portal.
Wird vom Background-Cleanup-Task und von den Endpunkten genutzt.
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.models import (
    PrinterOccupation, OccupationStatus,
    QueueEntry, QueueStatus,
)
from app.core.printer_client import _cache as printer_cache, CACHE_TTL, PRINTERS, get_printer_status
from app.core.email import send_email

QUEUE_NOTIFY_TIMEOUT_MINUTES = 5
PICKUP_WINDOW_HOURS = 24


def get_active_occupation(db: Session, printer_id: str):
    """Aktive Belegung für einen Drucker (occupied oder awaiting_pickup)."""
    return db.query(PrinterOccupation).filter(
        PrinterOccupation.printer_id == printer_id,
        PrinterOccupation.status.in_([OccupationStatus.occupied, OccupationStatus.awaiting_pickup]),
    ).first()


def get_queue_entries(db: Session, printer_id: str) -> list:
    """Alle aktiven Queue-Einträge (waiting/notified) ältester zuerst."""
    return (
        db.query(QueueEntry)
        .filter(
            QueueEntry.printer_id == printer_id,
            QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
        )
        .order_by(QueueEntry.created_at)
        .all()
    )


def get_queue_position(db: Session, printer_id: str, user_id: int):
    """(entry, position) für Nutzer in Warteschlange, oder (None, None)."""
    entries = get_queue_entries(db, printer_id)
    for i, e in enumerate(entries):
        if e.user_id == user_id:
            return e, i + 1
    return None, None


def advance_queue(db: Session, printer_id: str):
    """
    Rückt Warteschlange vor:
    1. Überfällige 'notified'-Einträge → 'skipped'
    2. Nächsten 'waiting'-Eintrag → 'notified'
    """
    now = datetime.utcnow()
    timeout_threshold = now - timedelta(minutes=QUEUE_NOTIFY_TIMEOUT_MINUTES)

    # Überfällige notified-Einträge überspringen
    db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.status == QueueStatus.notified,
        QueueEntry.notified_at < timeout_threshold,
    ).update({"status": QueueStatus.skipped})

    # Prüfen ob bereits jemand im 5-Min-Fenster ist
    still_notified = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.status == QueueStatus.notified,
    ).first()
    if still_notified:
        return

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
        return

    next_entry.status = QueueStatus.notified
    next_entry.notified_at = now
    db.commit()

    # E-Mail an den nächsten Nutzer in der Warteschlange
    try:
        from app.models.models import User as _User
        notify_user = db.query(_User).filter(_User.id == next_entry.user_id).first()
        if notify_user:
            send_email(
                to=notify_user.email,
                subject=f"Du bist dran! Drucker {printer_id} ist frei – 3D-Drucker-Portal",
                body=(
                    f"Hallo,\n\n"
                    f"du bist jetzt an der Reihe! Drucker {printer_id} ist frei.\n"
                    f"Du hast {QUEUE_NOTIFY_TIMEOUT_MINUTES} Minuten, um den Drucker zu beanspruchen.\n\n"
                    f"→ Jetzt zum Portal: https://172.17.129.228/drucker/{printer_id}\n\n"
                    f"– Das 3D-Drucker-Portal"
                ),
            )
    except Exception:
        pass


def expire_and_advance(db: Session):
    """
    Haupt-Cleanup-Funktion (alle 30s vom Background-Task aufgerufen):
    1. Pickup-Deadlines prüfen → auto-release nach 24h
    2. Moonraker-Cache prüfen: occupied + complete → awaiting_pickup
    3. Released-Occupations → queue advance
    """
    now = datetime.utcnow()

    # 1. Pickup-Deadline abgelaufen → auto-release
    expired_pickups = db.query(PrinterOccupation).filter(
        PrinterOccupation.status == OccupationStatus.awaiting_pickup,
        PrinterOccupation.pickup_deadline < now,
    ).all()
    for occ in expired_pickups:
        occ.status = OccupationStatus.released
        occ.released_at = now

    if expired_pickups:
        db.commit()

    # 2. Print-Abschluss erkennen für occupied printers (Moonraker + OctoPrint)
    import time
    occupied = db.query(PrinterOccupation).filter(
        PrinterOccupation.status == OccupationStatus.occupied,
    ).all()
    for occ in occupied:
        cfg = PRINTERS.get(occ.printer_id, {})
        if cfg.get("api") == "moonraker":
            cached, ts = printer_cache.get(occ.printer_id, ({}, 0.0))
            if time.time() - ts < CACHE_TTL * 4:   # max 20s alt
                if cached.get("state") == "complete":
                    occ.status = OccupationStatus.awaiting_pickup
                    occ.completed_at = now
                    occ.pickup_deadline = now + timedelta(hours=PICKUP_WINDOW_HOURS)
        elif cfg.get("api") == "octoprint" and occ.file_id is not None:
            status = get_printer_status(occ.printer_id)
            if status and status.get("state") == "idle":
                occ.status = OccupationStatus.awaiting_pickup
                occ.completed_at = now
                occ.pickup_deadline = now + timedelta(hours=PICKUP_WINDOW_HOURS)

    if occupied:
        db.commit()
        # E-Mail bei Druckabschluss (nach commit, für frisch geänderte Einträge)
        for occ in occupied:
            if occ.status == OccupationStatus.awaiting_pickup and occ.completed_at and \
               abs((occ.completed_at - now).total_seconds()) < 35:  # frisch geändert
                try:
                    from app.models.models import User as _User
                    print_user = db.query(_User).filter(_User.id == occ.user_id).first()
                    if print_user:
                        printer_name = PRINTERS.get(occ.printer_id, {}).get("name", occ.printer_id)
                        send_email(
                            to=print_user.email,
                            subject=f"Druck fertig – {printer_name} – 3D-Drucker-Portal",
                            body=(
                                f"Hallo,\n\n"
                                f"dein Druck auf {printer_name} ist fertig!\n"
                                f"Bitte hole ihn innerhalb von {PICKUP_WINDOW_HOURS} Stunden ab.\n\n"
                                f"→ Zum Portal: https://172.17.129.228/drucker/{occ.printer_id}\n\n"
                                f"– Das 3D-Drucker-Portal"
                            ),
                        )
                except Exception:
                    pass

    # 3. Queue-Advance für frisch released Occupations
    released = db.query(PrinterOccupation).filter(
        PrinterOccupation.status == OccupationStatus.released,
        PrinterOccupation.released_at >= now - timedelta(minutes=1),  # frisch (letzte Minute)
    ).all()
    for occ in released:
        # Nur wenn keine neue aktive Occupation für diesen Drucker
        if not get_active_occupation(db, occ.printer_id):
            advance_queue(db, occ.printer_id)

    # 4. Externer Druck: Drucker auf idle/complete aber keine aktive Occupation
    #    → Queue vorrücken (Druck außerhalb Portal abgeschlossen)
    import time as _time
    from app.core.printer_client import PRINTERS as _PRINTERS
    for pid in _PRINTERS:
        if get_active_occupation(db, pid):
            continue
        cached_data, ts = printer_cache.get(pid, ({}, 0.0))
        if _time.time() - ts < CACHE_TTL * 4:
            if cached_data.get("state") in ("idle", "complete"):
                advance_queue(db, pid)
