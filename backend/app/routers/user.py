from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User, UserRole, AdminMessage
from app.schemas.schemas import UserOut, UserMessageOut, MessageReplyRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/user", tags=["user"])
bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db)
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Ungültiger Token")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Account gesperrt")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Nur für Admins")
    return current_user


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/messages", response_model=List[UserMessageOut])
def get_messages(
    unread: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AdminMessage).filter(AdminMessage.to_user_id == current_user.id)
    if unread:
        q = q.filter(AdminMessage.read_at == None)
    messages = q.order_by(AdminMessage.created_at.asc()).all()
    result = []
    for m in messages:
        result.append(UserMessageOut(
            id=m.id,
            from_admin_email=m.from_admin.email if m.from_admin else None,
            body=m.body,
            created_at=m.created_at,
            read_at=m.read_at,
            reply=m.reply,
            replied_at=m.replied_at,
        ))
    return result


@router.post("/messages/{message_id}/reply", response_model=UserMessageOut)
def reply_to_message(
    message_id: int,
    data: MessageReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(AdminMessage).filter(
        AdminMessage.id == message_id,
        AdminMessage.to_user_id == current_user.id,
    ).first()
    if not msg:
        raise HTTPException(404, "Nachricht nicht gefunden")
    if msg.reply is not None:
        raise HTTPException(400, "Bereits beantwortet")
    if not data.reply.strip():
        raise HTTPException(400, "Antwort darf nicht leer sein")

    now = datetime.utcnow()
    msg.reply = data.reply.strip()
    msg.replied_at = now
    msg.read_at = msg.read_at or now
    db.commit()
    db.refresh(msg)
    return UserMessageOut(
        id=msg.id,
        from_admin_email=msg.from_admin.email if msg.from_admin else None,
        body=msg.body,
        created_at=msg.created_at,
        read_at=msg.read_at,
        reply=msg.reply,
        replied_at=msg.replied_at,
    )


@router.patch("/messages/{message_id}/read", response_model=UserMessageOut)
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(AdminMessage).filter(
        AdminMessage.id == message_id,
        AdminMessage.to_user_id == current_user.id,
    ).first()
    if not msg:
        raise HTTPException(404, "Nachricht nicht gefunden")

    if not msg.read_at:
        msg.read_at = datetime.utcnow()
        db.commit()
        db.refresh(msg)
    return UserMessageOut(
        id=msg.id,
        from_admin_email=msg.from_admin.email if msg.from_admin else None,
        body=msg.body,
        created_at=msg.created_at,
        read_at=msg.read_at,
        reply=msg.reply,
        replied_at=msg.replied_at,
    )
