import os
import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import SlicerProfile, UserRole
from app.schemas.schemas import SlicerProfileOut
from app.routers.user import get_current_user

router = APIRouter(tags=["slicer-profiles"])

PROFILES_DIR = "/home/fj/3d-drucker-portal/uploads/slicer-profiles"
ALLOWED_EXTENSIONS = {".ini", ".json", ".toml", ".3mf", ".zip", ".cfg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _ensure_dir():
    os.makedirs(PROFILES_DIR, exist_ok=True)


@router.get("/api/slicer-profiles", response_model=List[SlicerProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return db.query(SlicerProfile).order_by(SlicerProfile.created_at.desc()).all()


@router.get("/api/slicer-profiles/{profile_id}/download")
def download_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = db.query(SlicerProfile).filter(SlicerProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Profil nicht gefunden")
    safe_path = os.path.abspath(profile.filepath)
    if not safe_path.startswith(os.path.abspath(PROFILES_DIR) + os.sep):
        raise HTTPException(403, "Zugriff verweigert")
    if not os.path.exists(safe_path):
        raise HTTPException(404, "Datei nicht auf Disk vorhanden")
    return FileResponse(
        path=safe_path,
        filename=profile.filename_orig,
        media_type="application/octet-stream",
    )


@router.post("/api/admin/slicer-profiles", response_model=SlicerProfileOut, status_code=201)
async def upload_profile(
    file: UploadFile = FastAPIFile(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    printer_id: Optional[str] = Form(None),
    slicer_type: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Nur Admins erlaubt")

    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Nur {', '.join(ALLOWED_EXTENSIONS)} erlaubt")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "Datei zu groß (max. 10 MB)")

    _ensure_dir()
    safe_name = f"{uuid.uuid4().hex}{ext.lower()}"
    filepath = os.path.join(PROFILES_DIR, safe_name)
    with open(filepath, "wb") as f_out:
        f_out.write(content)

    profile = SlicerProfile(
        name=name,
        description=description or None,
        printer_id=printer_id if printer_id and printer_id != "all" else None,
        slicer_type=slicer_type,
        filename_orig=file.filename or safe_name,
        filepath=filepath,
        size_bytes=len(content),
        uploaded_by_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/api/admin/slicer-profiles/{profile_id}")
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Nur Admins erlaubt")

    profile = db.query(SlicerProfile).filter(SlicerProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Profil nicht gefunden")

    if os.path.exists(profile.filepath):
        os.remove(profile.filepath)

    db.delete(profile)
    db.commit()
    return {"ok": True}
