from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.printer_client import PRINTERS, get_printer_status
from app.core.queue_logic import (
    get_active_occupation, get_queue_position, advance_queue,
)
from app.models.models import (
    PrinterOccupation, OccupationStatus,
    QueueEntry, QueueStatus,
    User,
)
from app.routers.user import get_current_user

router = APIRouter(tags=["reservations"])


# ── Drucker beanspruchen / freigeben ──────────────────────────────────────────

@router.post("/api/printers/{printer_id}/claim", status_code=201)
def claim_printer(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Drucker beanspruchen. Phase-5-Platzhalter – in Phase 6 durch Druckstart ersetzt."""
    if printer_id not in PRINTERS:
        raise HTTPException(400, "Unbekannter Drucker")

    # Bereits aktiv belegt?
    existing = get_active_occupation(db, printer_id)
    if existing:
        raise HTTPException(409, "Drucker ist bereits belegt")

    # Nutzer hat bereits eine aktive Belegung auf diesem Drucker?
    mine = db.query(PrinterOccupation).filter(
        PrinterOccupation.printer_id == printer_id,
        PrinterOccupation.user_id == current_user.id,
        PrinterOccupation.status.in_([OccupationStatus.occupied, OccupationStatus.awaiting_pickup]),
    ).first()
    if mine:
        raise HTTPException(409, "Du hast bereits eine aktive Belegung für diesen Drucker")

    occ = PrinterOccupation(
        printer_id=printer_id,
        user_id=current_user.id,
    )
    db.add(occ)

    # Nutzer aus Warteschlange austragen (falls vorhanden)
    db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status.in_([QueueStatus.waiting, QueueStatus.notified]),
    ).update({"status": QueueStatus.cancelled})

    db.commit()
    db.refresh(occ)
    return _occupation_out(occ)


@router.post("/api/printers/{printer_id}/release")
def release_printer(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Drucker freigeben (nach Abholen des Drucks). Löst Queue-Advance aus."""
    occ = db.query(PrinterOccupation).filter(
        PrinterOccupation.printer_id == printer_id,
        PrinterOccupation.user_id == current_user.id,
        PrinterOccupation.status.in_([OccupationStatus.occupied, OccupationStatus.awaiting_pickup]),
    ).first()
    if not occ:
        raise HTTPException(404, "Keine aktive Belegung für diesen Drucker")

    occ.status = OccupationStatus.released
    occ.released_at = datetime.utcnow()
    db.commit()

    # Sofort Queue vorrücken
    advance_queue(db, printer_id)
    return {"ok": True}


# ── Meine Belegungen ───────────────────────────────────────────────────────────

@router.get("/api/occupations/my")
def my_occupations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = []
    for pid in PRINTERS:
        occ = db.query(PrinterOccupation).filter(
            PrinterOccupation.printer_id == pid,
            PrinterOccupation.user_id == current_user.id,
            PrinterOccupation.status.in_([OccupationStatus.occupied, OccupationStatus.awaiting_pickup]),
        ).first()
        queue_entry, position = get_queue_position(db, pid, current_user.id)
        result.append({
            "printer_id": pid,
            "occupation": _occupation_out(occ) if occ else None,
            "queue": _queue_out(queue_entry, position) if queue_entry else None,
        })
    return result


# ── Warteschlange ──────────────────────────────────────────────────────────────

@router.post("/api/queue/{printer_id}", status_code=201)
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

    # Eigene aktive Belegung?
    if db.query(PrinterOccupation).filter(
        PrinterOccupation.printer_id == printer_id,
        PrinterOccupation.user_id == current_user.id,
        PrinterOccupation.status.in_([OccupationStatus.occupied, OccupationStatus.awaiting_pickup]),
    ).first():
        raise HTTPException(409, "Du hast bereits eine aktive Belegung – freigeben zuerst")

    entry = QueueEntry(printer_id=printer_id, user_id=current_user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)

    _, position = get_queue_position(db, printer_id, current_user.id)
    return _queue_out(entry, position)


@router.delete("/api/queue/{printer_id}")
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

    # Falls notified → nächsten benachrichtigen
    advance_queue(db, printer_id)
    return {"ok": True}


@router.post("/api/queue/{printer_id}/acknowledge")
def acknowledge_queue(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nutzer bestätigt 'Ich bin dran' → Queue-Entry cancelled. Drucker dann manuell beanspruchen."""
    entry = db.query(QueueEntry).filter(
        QueueEntry.printer_id == printer_id,
        QueueEntry.user_id == current_user.id,
        QueueEntry.status == QueueStatus.notified,
    ).first()
    if not entry:
        raise HTTPException(404, "Kein offenes Benachrichtigungs-Fenster")

    entry.status = QueueStatus.cancelled
    db.commit()
    return {"ok": True, "message": "Bestätigt – du kannst den Drucker jetzt beanspruchen"}


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _occupation_out(occ: PrinterOccupation) -> dict:
    now = datetime.utcnow()
    pickup_secs = 0
    if occ.pickup_deadline:
        pickup_secs = max(0, int((occ.pickup_deadline - now).total_seconds()))
    return {
        "id": occ.id,
        "printer_id": occ.printer_id,
        "status": occ.status.value,
        "claimed_at": occ.claimed_at.isoformat(),
        "completed_at": occ.completed_at.isoformat() if occ.completed_at else None,
        "pickup_deadline": occ.pickup_deadline.isoformat() if occ.pickup_deadline else None,
        "pickup_seconds_remaining": pickup_secs,
    }


def _queue_out(entry: QueueEntry, position: int) -> dict:
    return {
        "id": entry.id,
        "position": position,
        "status": entry.status.value,
        "notified_at": entry.notified_at.isoformat() if entry.notified_at else None,
    }
