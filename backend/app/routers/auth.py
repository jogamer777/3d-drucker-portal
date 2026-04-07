from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, status
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.portal_config import get_registration_open
from app.core.config import MAX_FAILED_LOGINS, REFRESH_TOKEN_EXPIRE_DAYS
from app.models.models import User, UserRole, ActivityLog
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, response: Response, db: Session = Depends(get_db)):
    if not get_registration_open():
        raise HTTPException(status_code=403, detail="Registrierung ist derzeit geschlossen")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 8 Zeichen haben")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole.normal,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(ActivityLog(user_id=user.id, actor_email=user.email, action="register",
                       details="Neuer Account registriert"))
    db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )

    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")

    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Account gesperrt. Bitte Admin kontaktieren.")

    if not verify_password(data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_LOGINS:
            user.is_blocked = True
            db.add(ActivityLog(user_id=user.id, actor_email=user.email, action="login_failed",
                               details=f"Account gesperrt nach {user.failed_login_attempts} Fehlversuchen"))
            db.commit()
            raise HTTPException(status_code=403, detail="Account gesperrt nach zu vielen Fehlversuchen.")
        db.add(ActivityLog(user_id=user.id, actor_email=user.email, action="login_failed",
                           details=f"Falsches Passwort (Versuch {user.failed_login_attempts})"))
        db.commit()
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")

    # Login erfolgreich
    user.failed_login_attempts = 0
    user.last_login_at = datetime.utcnow()
    db.add(ActivityLog(user_id=user.id, actor_email=user.email, action="login",
                       details="Erfolgreich eingeloggt"))
    db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(response: Response, refresh_token: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Kein Refresh-Token")

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Ungültiger Refresh-Token")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or user.is_blocked:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden oder gesperrt")

    new_access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )

    return TokenResponse(access_token=new_access_token)
