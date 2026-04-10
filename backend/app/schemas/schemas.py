from typing import Optional, List
from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.models import UserRole, VoucherStatus, TransactionType, TopupRequestStatus


class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    role: UserRole
    balance_cents: int
    storage_used_bytes: int
    storage_limit_bytes: int
    is_blocked: bool
    created_at: datetime
    last_login_at: Optional[datetime]

    class Config:
        orm_mode = True


# ── Voucher ──────────────────────────────────────────────────────────────────

class VoucherCreate(BaseModel):
    value_cents: int       # z.B. 500 = 5,00 €
    count: int = 1         # Batch-Erstellung, max 100


class VoucherOut(BaseModel):
    id: int
    code: str
    value_cents: int
    status: VoucherStatus
    created_at: datetime
    redeemed_at: Optional[datetime]
    redeemed_by_email: Optional[str] = None

    class Config:
        orm_mode = True


class VoucherRedeemRequest(BaseModel):
    code: str


class VoucherRedeemResponse(BaseModel):
    message: str
    value_cents: int
    new_balance_cents: int


# ── Transaction ───────────────────────────────────────────────────────────────

class TransactionOut(BaseModel):
    id: int
    type: TransactionType
    amount_cents: int
    description: str
    created_at: datetime

    class Config:
        orm_mode = True


# ── Admin ─────────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: int
    email: str
    role: UserRole
    balance_cents: int
    is_blocked: bool
    failed_login_attempts: int
    created_at: datetime
    last_login_at: Optional[datetime]

    class Config:
        orm_mode = True


class AdminUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_blocked: Optional[bool] = None
    balance_cents: Optional[int] = None
    balance_note: Optional[str] = None  # Grund für manuelle Guthaben-Änderung


class VoucherUpdate(BaseModel):
    value_cents: Optional[int] = None
    status: Optional[VoucherStatus] = None


class AdminTransactionOut(BaseModel):
    id: int
    user_email: str
    type: TransactionType
    amount_cents: int
    description: str
    created_at: datetime
    related_voucher_code: Optional[str] = None

    class Config:
        orm_mode = True


class PasswordResetResponse(BaseModel):
    temp_password: str


# ── Admin Messages ────────────────────────────────────────────────────────────

class AdminMessageCreate(BaseModel):
    body: str


class AdminMessageOut(BaseModel):
    id: int
    from_admin_email: Optional[str]
    to_user_email: str
    body: str
    created_at: datetime
    read_at: Optional[datetime]
    reply: Optional[str]
    replied_at: Optional[datetime]

    class Config:
        orm_mode = True


class UserMessageOut(BaseModel):
    id: int
    from_admin_email: Optional[str]
    body: str
    created_at: datetime
    read_at: Optional[datetime]
    reply: Optional[str]
    replied_at: Optional[datetime]

    class Config:
        orm_mode = True


class MessageReplyRequest(BaseModel):
    reply: str


# ── Print History ─────────────────────────────────────────────────────────────

class PrintHistoryOut(BaseModel):
    id: int
    printer_id: str
    filename: Optional[str]
    claimed_at: datetime
    completed_at: Optional[datetime]
    charged_cost_cents: Optional[int]
    status: str

    class Config:
        orm_mode = True


# ── Topup Requests ────────────────────────────────────────────────────────────

class TopupRequestCreate(BaseModel):
    amount_cents: int
    note: Optional[str] = None


class TopupRequestOut(BaseModel):
    id: int
    user_id: int
    amount_cents: int
    note: Optional[str]
    status: TopupRequestStatus
    created_at: datetime
    processed_at: Optional[datetime]
    admin_note: Optional[str]

    class Config:
        orm_mode = True


class AdminTopupRequestOut(TopupRequestOut):
    user_email: str


class TopupRejectRequest(BaseModel):
    admin_note: Optional[str] = None


# ── Maintenance Log ───────────────────────────────────────────────────────────

class MaintenanceLogCreate(BaseModel):
    action: str
    notes: Optional[str] = None


class MaintenanceLogOut(BaseModel):
    id: int
    printer_id: str
    admin_email: Optional[str] = None
    action: str
    notes: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True


# ── Activity Log ──────────────────────────────────────────────────────────────

# ── Files ─────────────────────────────────────────────────────────────────────

class GCodeFileOut(BaseModel):
    id: int
    filename: str
    size_bytes: int
    duration_seconds: Optional[int]
    filament_usage: Optional[dict]
    thumbnail_b64: Optional[str]
    profile_signature: Optional[str]
    uploaded_at: datetime

    class Config:
        orm_mode = True


class StorageInfo(BaseModel):
    used_bytes: int
    limit_bytes: int


class AdminGCodeFileOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    filename: str
    size_bytes: int
    duration_seconds: Optional[int]
    filament_usage: Optional[dict]
    thumbnail_b64: Optional[str]
    profile_signature: Optional[str]
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ── Activity Log ──────────────────────────────────────────────────────────────

class ActivityLogOut(BaseModel):
    id: int
    actor_email: Optional[str]
    action: str
    details: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True


# ── Finanz-Reset ──────────────────────────────────────────────────────────────

class FinancialResetRequest(BaseModel):
    confirm: bool = False
