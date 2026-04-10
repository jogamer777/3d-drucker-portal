"""
Filament-Management Router.
Verwaltung von Filament-Typen, Drucker-Slots und Spulen-Tracking.
"""
import math
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import FilamentType, FilamentMaterial, PrinterSlot
from app.core.printer_client import PRINTERS
from app.routers.user import get_current_user, require_admin
from app.models.models import User

router = APIRouter(tags=["filament"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class FilamentTypeCreate(BaseModel):
    name: str
    material: FilamentMaterial = FilamentMaterial.PLA
    color_hex: Optional[str] = None
    color_name: Optional[str] = None
    weight_per_spool_g: int = 1000
    purchase_price_cents: int
    markup_percent: int = 20
    stock_count: int = 0
    low_stock_threshold: int = 2
    # Feature B: Druckparameter
    print_temp_min: Optional[int] = None
    print_temp_max: Optional[int] = None
    bed_temp: Optional[int] = None
    cooling_percent: Optional[int] = None
    print_speed_mms: Optional[int] = None
    notes: Optional[str] = None


class FilamentTypeUpdate(BaseModel):
    name: Optional[str] = None
    material: Optional[FilamentMaterial] = None
    color_hex: Optional[str] = None
    color_name: Optional[str] = None
    weight_per_spool_g: Optional[int] = None
    purchase_price_cents: Optional[int] = None
    markup_percent: Optional[int] = None
    stock_count: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    # Feature B: Druckparameter
    print_temp_min: Optional[int] = None
    print_temp_max: Optional[int] = None
    bed_temp: Optional[int] = None
    cooling_percent: Optional[int] = None
    print_speed_mms: Optional[int] = None
    notes: Optional[str] = None


class SlotAssign(BaseModel):
    filament_type_id: Optional[int] = None  # None = Slot leeren
    initial_weight_g: Optional[int] = None   # Standard = weight_per_spool_g


def _price_per_gram(ft: FilamentType) -> int:
    """Berechnet Preis pro Gramm in Cent (gerundet nach oben)."""
    return math.ceil(
        (ft.purchase_price_cents / ft.weight_per_spool_g) * (1 + ft.markup_percent / 100)
    )


def _filament_out(ft: FilamentType) -> dict:
    low_stock = ft.stock_count <= ft.low_stock_threshold
    return {
        "id": ft.id,
        "name": ft.name,
        "material": ft.material.value,
        "color_hex": ft.color_hex,
        "color_name": ft.color_name,
        "weight_per_spool_g": ft.weight_per_spool_g,
        "purchase_price_cents": ft.purchase_price_cents,
        "markup_percent": ft.markup_percent,
        "price_per_gram_cents": _price_per_gram(ft),
        "stock_count": ft.stock_count,
        "low_stock_threshold": ft.low_stock_threshold,
        "low_stock": low_stock,
        "created_at": ft.created_at.isoformat(),
        # Feature B: Druckparameter
        "print_temp_min": ft.print_temp_min,
        "print_temp_max": ft.print_temp_max,
        "bed_temp": ft.bed_temp,
        "cooling_percent": ft.cooling_percent,
        "print_speed_mms": ft.print_speed_mms,
        "notes": ft.notes,
    }


def _slot_out(slot: PrinterSlot) -> dict:
    ft = slot.filament_type
    low_spool = False
    if slot.remaining_weight_g is not None and slot.initial_weight_g and slot.initial_weight_g > 0:
        low_spool = slot.remaining_weight_g <= (slot.initial_weight_g * 0.10)
    return {
        "id": slot.id,
        "printer_id": slot.printer_id,
        "slot_index": slot.slot_index,
        "filament_type_id": slot.filament_type_id,
        "filament_type": _filament_out(ft) if ft else None,
        "initial_weight_g": slot.initial_weight_g,
        "remaining_weight_g": slot.remaining_weight_g,
        "low_spool": low_spool,
        "loaded_at": slot.loaded_at.isoformat() if slot.loaded_at else None,
    }


# ── Admin-Endpoints: Filament-Typen ──────────────────────────────────────────

@router.get("/api/admin/filament/types")
def list_filament_types(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    types = db.query(FilamentType).order_by(FilamentType.name).all()
    return [_filament_out(ft) for ft in types]


@router.post("/api/admin/filament/types", status_code=201)
def create_filament_type(
    data: FilamentTypeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not data.name.strip():
        raise HTTPException(400, "Name darf nicht leer sein")
    if data.weight_per_spool_g <= 0:
        raise HTTPException(400, "Gewicht muss positiv sein")
    if data.purchase_price_cents < 0:
        raise HTTPException(400, "Preis darf nicht negativ sein")

    ft = FilamentType(
        name=data.name.strip(),
        material=data.material,
        color_hex=data.color_hex,
        color_name=data.color_name,
        weight_per_spool_g=data.weight_per_spool_g,
        purchase_price_cents=data.purchase_price_cents,
        markup_percent=data.markup_percent,
        stock_count=data.stock_count,
        low_stock_threshold=data.low_stock_threshold,
        print_temp_min=data.print_temp_min,
        print_temp_max=data.print_temp_max,
        bed_temp=data.bed_temp,
        cooling_percent=data.cooling_percent,
        print_speed_mms=data.print_speed_mms,
        notes=data.notes,
    )
    db.add(ft)
    db.commit()
    db.refresh(ft)
    return _filament_out(ft)


@router.patch("/api/admin/filament/types/{filament_id}")
def update_filament_type(
    filament_id: int,
    data: FilamentTypeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ft = db.query(FilamentType).filter(FilamentType.id == filament_id).first()
    if not ft:
        raise HTTPException(404, "Filament-Typ nicht gefunden")

    if data.name is not None:
        ft.name = data.name.strip()
    if data.material is not None:
        ft.material = data.material
    if data.color_hex is not None:
        ft.color_hex = data.color_hex
    if data.color_name is not None:
        ft.color_name = data.color_name
    if data.weight_per_spool_g is not None:
        ft.weight_per_spool_g = data.weight_per_spool_g
    if data.purchase_price_cents is not None:
        ft.purchase_price_cents = data.purchase_price_cents
    if data.markup_percent is not None:
        ft.markup_percent = data.markup_percent
    if data.stock_count is not None:
        ft.stock_count = data.stock_count
    if data.low_stock_threshold is not None:
        ft.low_stock_threshold = data.low_stock_threshold
    # Feature B: Druckparameter
    for field in ("print_temp_min", "print_temp_max", "bed_temp", "cooling_percent", "print_speed_mms", "notes"):
        if field in data.model_fields_set:
            setattr(ft, field, getattr(data, field))

    db.commit()
    db.refresh(ft)
    return _filament_out(ft)


@router.delete("/api/admin/filament/types/{filament_id}")
def delete_filament_type(
    filament_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ft = db.query(FilamentType).filter(FilamentType.id == filament_id).first()
    if not ft:
        raise HTTPException(404, "Filament-Typ nicht gefunden")

    # Prüfen ob noch Slots diesen Typ verwenden
    slots_using = db.query(PrinterSlot).filter(PrinterSlot.filament_type_id == filament_id).count()
    if slots_using > 0:
        raise HTTPException(409, f"Filament-Typ wird noch in {slots_using} Slot(s) verwendet")

    db.delete(ft)
    db.commit()
    return {"ok": True}


# ── Admin-Endpoints: Drucker-Slots ────────────────────────────────────────────

@router.get("/api/admin/filament/slots")
def list_slots(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Alle Slots aller Drucker – erstellt fehlende Slots automatisch."""
    result = []
    for pid, cfg in PRINTERS.items():
        slot_count = 4 if pid == "k2" else 1
        for idx in range(slot_count):
            slot = db.query(PrinterSlot).filter(
                PrinterSlot.printer_id == pid,
                PrinterSlot.slot_index == idx,
            ).first()
            if not slot:
                slot = PrinterSlot(printer_id=pid, slot_index=idx)
                db.add(slot)
                db.commit()
                db.refresh(slot)
            result.append({**_slot_out(slot), "printer_name": cfg["name"]})
    return result


@router.put("/api/admin/filament/slots/{printer_id}/{slot_index}")
def assign_filament(
    printer_id: str,
    slot_index: int,
    data: SlotAssign,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Filament-Typ einem Slot zuweisen (oder Slot leeren mit filament_type_id=null)."""
    if printer_id not in PRINTERS:
        raise HTTPException(404, "Drucker nicht gefunden")

    slot = db.query(PrinterSlot).filter(
        PrinterSlot.printer_id == printer_id,
        PrinterSlot.slot_index == slot_index,
    ).first()
    if not slot:
        slot = PrinterSlot(printer_id=printer_id, slot_index=slot_index)
        db.add(slot)

    if data.filament_type_id is not None:
        ft = db.query(FilamentType).filter(FilamentType.id == data.filament_type_id).first()
        if not ft:
            raise HTTPException(404, "Filament-Typ nicht gefunden")
        slot.filament_type_id = data.filament_type_id
        initial = data.initial_weight_g if data.initial_weight_g else ft.weight_per_spool_g
        slot.initial_weight_g = initial
        slot.remaining_weight_g = initial
        slot.loaded_at = datetime.utcnow()
    else:
        slot.filament_type_id = None
        slot.initial_weight_g = None
        slot.remaining_weight_g = None
        slot.loaded_at = None

    db.commit()
    db.refresh(slot)
    return _slot_out(slot)


@router.post("/api/admin/filament/slots/{printer_id}/{slot_index}/new-spool")
def new_spool(
    printer_id: str,
    slot_index: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Neue Spule eingelegt: Restbestand zurücksetzen, Lagerbestand um 1 verringern."""
    slot = db.query(PrinterSlot).filter(
        PrinterSlot.printer_id == printer_id,
        PrinterSlot.slot_index == slot_index,
    ).first()
    if not slot:
        raise HTTPException(404, "Slot nicht gefunden")
    if not slot.filament_type_id:
        raise HTTPException(400, "Kein Filament-Typ diesem Slot zugewiesen")

    ft = slot.filament_type
    slot.initial_weight_g = ft.weight_per_spool_g
    slot.remaining_weight_g = ft.weight_per_spool_g
    slot.loaded_at = datetime.utcnow()

    if ft.stock_count > 0:
        ft.stock_count -= 1

    db.commit()
    db.refresh(slot)
    return _slot_out(slot)


# ── Public-Endpoint: Slot-Info für Kostenvorschau ─────────────────────────────

@router.get("/api/filament/slots")
def public_slots(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gibt Slot-Infos zurück die für die Kostenberechnung relevant sind."""
    result = {}
    for pid in PRINTERS:
        slot_count = 4 if pid == "k2" else 1
        slots = []
        for idx in range(slot_count):
            slot = db.query(PrinterSlot).filter(
                PrinterSlot.printer_id == pid,
                PrinterSlot.slot_index == idx,
            ).first()
            if slot and slot.filament_type:
                ft = slot.filament_type
                low_spool = (
                    slot.remaining_weight_g is not None
                    and slot.initial_weight_g
                    and slot.remaining_weight_g <= (slot.initial_weight_g * 0.10)
                )
                slots.append({
                    "slot_index": idx,
                    "filament_name": ft.name,
                    "material": ft.material.value,
                    "color_hex": ft.color_hex,
                    "color_name": ft.color_name,
                    "price_per_gram_cents": math.ceil(
                        (ft.purchase_price_cents / ft.weight_per_spool_g) * (1 + ft.markup_percent / 100)
                    ),
                    "remaining_weight_g": slot.remaining_weight_g,
                    "initial_weight_g": slot.initial_weight_g,
                    "low_spool": low_spool,
                    # Feature B: Druckparameter
                    "print_temp_min": ft.print_temp_min,
                    "print_temp_max": ft.print_temp_max,
                    "bed_temp": ft.bed_temp,
                    "cooling_percent": ft.cooling_percent,
                    "print_speed_mms": ft.print_speed_mms,
                    "notes": ft.notes,
                })
            else:
                slots.append({
                    "slot_index": idx,
                    "filament_name": None,
                    "material": None,
                    "color_hex": None,
                    "color_name": None,
                    "price_per_gram_cents": None,
                    "remaining_weight_g": None,
                    "initial_weight_g": None,
                    "low_spool": False,
                    "print_temp_min": None,
                    "print_temp_max": None,
                    "bed_temp": None,
                    "cooling_percent": None,
                    "print_speed_mms": None,
                    "notes": None,
                })
        result[pid] = slots
    return result
