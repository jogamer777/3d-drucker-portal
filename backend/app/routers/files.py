import os
import json
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.gcode_parser import parse_gcode
from app.models.models import GCodeFile, ActivityLog, User
from app.schemas.schemas import GCodeFileOut, StorageInfo
from app.routers.user import get_current_user

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_ROOT = "/home/fj/3d-drucker-portal/uploads"
ALLOWED_EXTENSIONS = {".gcode", ".gco"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB


def _user_upload_dir(user_id: int) -> str:
    path = os.path.join(UPLOAD_ROOT, str(user_id))
    os.makedirs(path, exist_ok=True)
    return path


@router.get("", response_model=List[GCodeFileOut])
def list_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = (
        db.query(GCodeFile)
        .filter(GCodeFile.user_id == current_user.id)
        .order_by(GCodeFile.uploaded_at.desc())
        .all()
    )
    result = []
    for f in files:
        out = GCodeFileOut(
            id=f.id,
            filename=f.filename,
            size_bytes=f.size_bytes,
            duration_seconds=f.duration_seconds,
            filament_usage=json.loads(f.filament_usage) if f.filament_usage else None,
            thumbnail_b64=f.thumbnail_b64,
            profile_signature=f.profile_signature,
            uploaded_at=f.uploaded_at,
        )
        result.append(out)
    return result


@router.get("/storage", response_model=StorageInfo)
def get_storage(current_user: User = Depends(get_current_user)):
    return StorageInfo(
        used_bytes=current_user.storage_used_bytes,
        limit_bytes=current_user.storage_limit_bytes,
    )


@router.post("/upload", response_model=GCodeFileOut, status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Dateiendung prüfen
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Nur {', '.join(ALLOWED_EXTENSIONS)} erlaubt")

    # Datei einlesen
    content = await file.read()
    size = len(content)

    if size > MAX_FILE_SIZE:
        raise HTTPException(400, "Datei zu groß (max. 500 MB)")

    # Speicherlimit prüfen
    if current_user.storage_used_bytes + size > current_user.storage_limit_bytes:
        raise HTTPException(
            400,
            f"Speicherlimit erreicht. Verfügbar: "
            f"{(current_user.storage_limit_bytes - current_user.storage_used_bytes) / 1024 / 1024:.0f} MB"
        )

    # Speichern
    upload_dir = _user_upload_dir(current_user.id)
    safe_name = f"{uuid.uuid4().hex}{ext.lower()}"
    filepath = os.path.join(upload_dir, safe_name)

    with open(filepath, 'wb') as f_out:
        f_out.write(content)

    # G-Code parsen
    parsed = parse_gcode(filepath)

    # DB-Eintrag
    gfile = GCodeFile(
        user_id=current_user.id,
        filename=file.filename or safe_name,
        filepath=filepath,
        size_bytes=size,
        duration_seconds=parsed['duration_seconds'],
        filament_usage=json.dumps(parsed['filament_usage']) if parsed['filament_usage'] else None,
        thumbnail_b64=parsed['thumbnail_b64'],
        profile_signature=parsed['profile_signature'],
    )
    db.add(gfile)

    # Speicher aktualisieren
    current_user.storage_used_bytes += size

    # Aktivitäts-Log
    db.add(ActivityLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="file_upload",
        details=f"Datei hochgeladen: {file.filename} ({size / 1024 / 1024:.1f} MB)",
    ))

    db.commit()
    db.refresh(gfile)

    return GCodeFileOut(
        id=gfile.id,
        filename=gfile.filename,
        size_bytes=gfile.size_bytes,
        duration_seconds=gfile.duration_seconds,
        filament_usage=json.loads(gfile.filament_usage) if gfile.filament_usage else None,
        thumbnail_b64=gfile.thumbnail_b64,
        profile_signature=gfile.profile_signature,
        uploaded_at=gfile.uploaded_at,
    )


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gfile = db.query(GCodeFile).filter(
        GCodeFile.id == file_id,
        GCodeFile.user_id == current_user.id,
    ).first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")
    safe_path = os.path.abspath(gfile.filepath)
    if not safe_path.startswith(os.path.abspath(UPLOAD_ROOT) + os.sep):
        raise HTTPException(403, "Zugriff verweigert")
    if not os.path.exists(safe_path):
        raise HTTPException(404, "Datei nicht auf Disk vorhanden")

    return FileResponse(
        path=safe_path,
        filename=gfile.filename,
        media_type="application/octet-stream",
    )


@router.delete("/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gfile = db.query(GCodeFile).filter(
        GCodeFile.id == file_id,
        GCodeFile.user_id == current_user.id,
    ).first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")

    # Von Disk löschen
    if os.path.exists(gfile.filepath):
        os.remove(gfile.filepath)

    # Speicher zurückgeben
    current_user.storage_used_bytes = max(0, current_user.storage_used_bytes - gfile.size_bytes)

    db.add(ActivityLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="file_delete",
        details=f"Datei gelöscht: {gfile.filename}",
    ))

    db.delete(gfile)
    db.commit()
    return {"ok": True}
