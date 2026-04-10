import enum
import secrets
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Enum, BigInteger, DateTime, ForeignKey, Text, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.config import DEFAULT_STORAGE_LIMIT_BYTES

VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_voucher_code() -> str:
    return "-".join(
        "".join(secrets.choice(VOUCHER_ALPHABET) for _ in range(4))
        for _ in range(3)
    )


class UserRole(str, enum.Enum):
    admin = "admin"
    power_user = "power_user"
    normal = "normal"


class VoucherStatus(str, enum.Enum):
    open = "open"
    redeemed = "redeemed"
    cancelled = "cancelled"


class TransactionType(str, enum.Enum):
    topup = "topup"    # Gutschein eingelöst
    charge = "charge"  # Druck abgerechnet
    refund = "refund"  # Rückerstattung


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.normal, nullable=False)
    balance_cents = Column(Integer, default=0, nullable=False)
    storage_used_bytes = Column(BigInteger, default=0, nullable=False)
    storage_limit_bytes = Column(BigInteger, default=DEFAULT_STORAGE_LIMIT_BYTES, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    transactions = relationship("Transaction", back_populates="user", foreign_keys="Transaction.user_id", cascade="all, delete-orphan")
    created_vouchers = relationship("VoucherCode", back_populates="created_by", foreign_keys="VoucherCode.created_by_id", passive_deletes=True)
    redeemed_vouchers = relationship("VoucherCode", back_populates="redeemed_by", foreign_keys="VoucherCode.redeemed_by_id")
    messages_received = relationship("AdminMessage", foreign_keys="[AdminMessage.to_user_id]", back_populates="to_user", cascade="all, delete-orphan")
    files = relationship("GCodeFile", back_populates="user", cascade="all, delete-orphan")
    occupations   = relationship("PrinterOccupation", back_populates="user", cascade="all, delete-orphan")
    queue_entries = relationship("QueueEntry", back_populates="user", cascade="all, delete-orphan")


class VoucherCode(Base):
    __tablename__ = "voucher_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    value_cents = Column(Integer, nullable=False)
    status = Column(Enum(VoucherStatus), default=VoucherStatus.open, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    redeemed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    redeemed_at = Column(DateTime, nullable=True)

    created_by = relationship("User", back_populates="created_vouchers", foreign_keys=[created_by_id])
    redeemed_by = relationship("User", back_populates="redeemed_vouchers", foreign_keys=[redeemed_by_id])
    transaction = relationship("Transaction", back_populates="voucher", uselist=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(Enum(TransactionType), nullable=False)
    amount_cents = Column(Integer, nullable=False)  # positiv=Gutschrift, negativ=Abbuchung
    description = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    related_voucher_id = Column(Integer, ForeignKey("voucher_codes.id"), nullable=True)

    user = relationship("User", back_populates="transactions", foreign_keys=[user_id])
    voucher = relationship("VoucherCode", back_populates="transaction")


class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id = Column(Integer, primary_key=True, index=True)
    from_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable falls Admin gelöscht wird
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    read_at = Column(DateTime, nullable=True)
    reply = Column(Text, nullable=True)
    replied_at = Column(DateTime, nullable=True)

    from_admin = relationship("User", foreign_keys=[from_admin_id])
    to_user = relationship("User", foreign_keys=[to_user_id], back_populates="messages_received")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String, nullable=True)   # gespeichert falls User später gelöscht wird
    action = Column(String, nullable=False)        # register, login, login_failed, voucher_redeem
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class GCodeFile(Base):
    __tablename__ = "gcode_files"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    filament_usage = Column(String, nullable=True)   # JSON-String
    thumbnail_b64 = Column(Text, nullable=True)      # data:image/png;base64,...
    profile_signature = Column(String, nullable=True)
    is_favorite = Column(Boolean, default=False, nullable=False, server_default='0')
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="files")


# ── Drucker-Belegung ───────────────────────────────────────────────────────────

class OccupationStatus(str, enum.Enum):
    occupied        = "occupied"         # Drucker wird benutzt / Druck läuft
    awaiting_pickup = "awaiting_pickup"  # Druck fertig, Nutzer hat 24h zum Abholen
    released        = "released"         # Freigegeben → Queue kann vorrücken


class PrinterOccupation(Base):
    __tablename__ = "printer_occupations"

    id              = Column(Integer, primary_key=True, index=True)
    printer_id      = Column(String, nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    status          = Column(Enum(OccupationStatus), default=OccupationStatus.occupied, nullable=False)
    claimed_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at    = Column(DateTime, nullable=True)   # Drucker meldet "complete"
    pickup_deadline = Column(DateTime, nullable=True)   # completed_at + 24h
    released_at     = Column(DateTime, nullable=True)
    file_id              = Column(Integer, ForeignKey("gcode_files.id"), nullable=True)
    estimated_cost_cents = Column(Integer, nullable=True)
    charged_cost_cents   = Column(Integer, nullable=True)
    actual_filament_g    = Column(Float, nullable=True)  # tatsächlich verbrauchtes Filament
    slot_id              = Column(Integer, ForeignKey("printer_slots.id"), nullable=True)

    user = relationship("User", back_populates="occupations")


# ── Warteschlange ──────────────────────────────────────────────────────────────

class QueueStatus(str, enum.Enum):
    waiting   = "waiting"
    notified  = "notified"    # an der Reihe, 5-Min-Fenster
    skipped   = "skipped"     # nicht reagiert → übersprungen
    cancelled = "cancelled"   # selbst ausgetreten


class QueueEntry(Base):
    __tablename__ = "queue_entries"

    id          = Column(Integer, primary_key=True, index=True)
    printer_id  = Column(String, nullable=False, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    status      = Column(Enum(QueueStatus), default=QueueStatus.waiting, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    notified_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="queue_entries")


# ── Auflade-Anträge ────────────────────────────────────────────────────────────

class TopupRequestStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"


class TopupRequest(Base):
    __tablename__ = "topup_requests"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_cents    = Column(Integer, nullable=False)
    note            = Column(String, nullable=True)
    status          = Column(Enum(TopupRequestStatus), default=TopupRequestStatus.pending, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at    = Column(DateTime, nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_note      = Column(String, nullable=True)

    user      = relationship("User", foreign_keys=[user_id])
    processor = relationship("User", foreign_keys=[processed_by_id])


# ── Wartungsprotokoll ──────────────────────────────────────────────────────────

MAINTENANCE_ACTIONS = [
    "Düse getauscht",
    "Bett eingestellt",
    "Filament gewechselt",
    "Druckbett gereinigt",
    "Software-Update",
    "Sonstiges",
]


class MaintenanceLog(Base):
    __tablename__ = "maintenance_logs"

    id         = Column(Integer, primary_key=True, index=True)
    printer_id = Column(String, nullable=False, index=True)
    admin_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    action     = Column(String, nullable=False)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    admin = relationship("User", foreign_keys=[admin_id])


# ── Filament-Management ────────────────────────────────────────────────────────

class FilamentMaterial(str, enum.Enum):
    PLA    = "PLA"
    PETG   = "PETG"
    ABS    = "ABS"
    TPU    = "TPU"
    ASA    = "ASA"
    OTHER  = "OTHER"


class FilamentType(Base):
    __tablename__ = "filament_types"

    id                   = Column(Integer, primary_key=True, index=True)
    name                 = Column(String, nullable=False)          # z.B. "Prusament PLA Galaxy Black"
    material             = Column(Enum(FilamentMaterial), default=FilamentMaterial.PLA, nullable=False)
    color_hex            = Column(String(7), nullable=True)        # "#1A1A1A"
    color_name           = Column(String, nullable=True)           # "Galaxy Black"
    weight_per_spool_g   = Column(Integer, nullable=False)         # 1000
    purchase_price_cents = Column(Integer, nullable=False)         # Gesamtpreis der Spule
    markup_percent       = Column(Integer, default=20, nullable=False)  # 20 = 20% Aufschlag
    stock_count          = Column(Integer, default=0, nullable=False)   # Lagerbestand (Spulen)
    low_stock_threshold  = Column(Integer, default=2, nullable=False)   # Warnung wenn <= Threshold
    created_at           = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Druckparameter (Feature B)
    print_temp_min       = Column(Integer, nullable=True)   # °C
    print_temp_max       = Column(Integer, nullable=True)   # °C
    bed_temp             = Column(Integer, nullable=True)   # °C
    cooling_percent      = Column(Integer, nullable=True)   # 0–100
    print_speed_mms      = Column(Integer, nullable=True)   # mm/s
    notes                = Column(String, nullable=True)    # Freitext

    slots = relationship("PrinterSlot", back_populates="filament_type")


class PrinterSlot(Base):
    __tablename__ = "printer_slots"

    id                 = Column(Integer, primary_key=True, index=True)
    printer_id         = Column(String, nullable=False, index=True)
    slot_index         = Column(Integer, nullable=False)      # 0–3 für K2, 0 für CRX
    filament_type_id   = Column(Integer, ForeignKey("filament_types.id"), nullable=True)
    initial_weight_g   = Column(Integer, nullable=True)       # Gewicht beim Einlegen
    remaining_weight_g = Column(Integer, nullable=True)       # aktueller Restbestand
    loaded_at          = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("printer_id", "slot_index", name="uq_printer_slot"),)

    filament_type = relationship("FilamentType", back_populates="slots")


# ── Slicer-Profile ─────────────────────────────────────────────────────────────

class SlicerProfile(Base):
    __tablename__ = "slicer_profiles"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String, nullable=False)        # z.B. "PLA Standard K2"
    description     = Column(String, nullable=True)
    printer_id      = Column(String, nullable=True)         # "k2", "crx" oder None = alle
    slicer_type     = Column(String, nullable=False)        # "orca", "prusa", "cura", "other"
    filename_orig   = Column(String, nullable=False)        # Original-Dateiname
    filepath        = Column(String, nullable=False)        # Absoluter Pfad auf Disk
    size_bytes      = Column(Integer, nullable=False)
    uploaded_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
