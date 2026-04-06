from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.models.models import User
from app.routers.user import get_current_user
from app.core.printer_client import get_all_printers, get_printer_status

router = APIRouter(prefix="/api/printers", tags=["printers"])


@router.get("")
def list_printers(current_user: User = Depends(get_current_user)):
    """Alle konfigurierten Drucker mit aktuellem Status."""
    return get_all_printers()


@router.get("/{printer_id}")
def printer_detail(
    printer_id: str,
    current_user: User = Depends(get_current_user),
):
    """Einzelner Drucker-Status (Cache oder frisch)."""
    status = get_printer_status(printer_id)
    if status is None:
        raise HTTPException(404, "Drucker nicht gefunden")
    return status
