import os
import json
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.gcode_parser import parse_gcode
from app.models.models import GCodeFile, ActivityLog, User, SlicerProfile
from app.schemas.schemas import GCodeFileOut, StorageInfo, FavoriteToggle
from app.routers.user import get_current_user

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_ROOT = "/home/jf/3d-drucker-portal/uploads"
ALLOWED_EXTENSIONS = {".gcode", ".gco"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB


def _user_upload_dir(user_id: int) -> str:
    path = os.path.join(UPLOAD_ROOT, str(user_id))
    os.makedirs(path, exist_ok=True)
    return path


@router.get("", response_model=List[GCodeFileOut])
def list_files(
    favorites_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(GCodeFile).filter(GCodeFile.user_id == current_user.id)
    if favorites_only:
        q = q.filter(GCodeFile.is_favorite == True)
    files = q.order_by(GCodeFile.uploaded_at.desc()).all()
    result = []
    for f in files:
        profile_name = None
        if f.slicer_profile_id:
            sp = db.query(SlicerProfile).filter(SlicerProfile.id == f.slicer_profile_id).first()
            profile_name = sp.name if sp else None
        out = GCodeFileOut(
            id=f.id,
            filename=f.filename,
            size_bytes=f.size_bytes,
            duration_seconds=f.duration_seconds,
            filament_usage=json.loads(f.filament_usage) if f.filament_usage else None,
            thumbnail_b64=f.thumbnail_b64,
            profile_signature=f.profile_signature,
            is_favorite=bool(f.is_favorite),
            slicer_profile_id=f.slicer_profile_id,
            slicer_profile_name=profile_name,
            uploaded_at=f.uploaded_at,
        )
        result.append(out)
    return result


@router.patch("/{file_id}/favorite")
def toggle_favorite(
    file_id: int,
    body: FavoriteToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_admin = current_user.role.value in ("admin", "power_user")
    q = db.query(GCodeFile).filter(GCodeFile.id == file_id)
    if not is_admin:
        q = q.filter(GCodeFile.user_id == current_user.id)
    gfile = q.first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")
    gfile.is_favorite = body.is_favorite
    db.commit()
    return {"ok": True, "is_favorite": body.is_favorite}


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

    # Fingerprint-Erkennung: erste 100 Zeilen nach "; PORTAL-PROFIL: <fp>" scannen
    profile_name = None
    try:
        with open(filepath, 'r', errors='ignore') as _f:
            for i, line in enumerate(_f):
                if i >= 100:
                    break
                line = line.strip()
                if line.startswith('; PORTAL-PROFIL:'):
                    fp = line.split(':', 1)[1].strip()
                    matched = db.query(SlicerProfile).filter(SlicerProfile.fingerprint == fp).first()
                    if matched:
                        gfile.slicer_profile_id = matched.id
                        profile_name = matched.name
                        db.commit()
                    break
    except Exception:
        pass

    return GCodeFileOut(
        id=gfile.id,
        filename=gfile.filename,
        size_bytes=gfile.size_bytes,
        duration_seconds=gfile.duration_seconds,
        filament_usage=json.loads(gfile.filament_usage) if gfile.filament_usage else None,
        thumbnail_b64=gfile.thumbnail_b64,
        profile_signature=gfile.profile_signature,
        is_favorite=False,
        slicer_profile_id=gfile.slicer_profile_id,
        slicer_profile_name=profile_name,
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


@router.get("/{file_id}/layers")
def get_gcode_layers(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Parst G-Code und gibt Layer-Pfade für die Vorschau zurück.
    Nur Datei-Besitzer oder Admin darf zugreifen.
    Max. 200 Layer, max. 500 Punkte pro Layer.
    """
    is_admin = current_user.role.value in ("admin", "power_user")
    query = db.query(GCodeFile).filter(GCodeFile.id == file_id)
    if not is_admin:
        query = query.filter(GCodeFile.user_id == current_user.id)
    gfile = query.first()
    if not gfile:
        raise HTTPException(404, "Datei nicht gefunden")

    safe_path = os.path.abspath(gfile.filepath)
    if not safe_path.startswith(os.path.abspath(UPLOAD_ROOT) + os.sep):
        raise HTTPException(403, "Zugriff verweigert")
    if not os.path.exists(safe_path):
        raise HTTPException(404, "Datei nicht auf Disk vorhanden")

    MAX_LAYERS = 200
    MAX_POINTS = 500
    MAX_LINES = 2_000_000  # Limit für sehr große Dateien

    layers = []          # Liste von Layer-Punktlisten
    current_layer = []   # Aktuelle Layer-Punkte
    x, y, z = 0.0, 0.0, 0.0
    last_z = None
    relative = False     # G90=absolut (Standard), G91=relativ
    line_count = 0

    min_x, max_x = float("inf"), float("-inf")
    min_y, max_y = float("inf"), float("-inf")

    try:
        with open(safe_path, "r", encoding="utf-8", errors="ignore") as f:
            for raw_line in f:
                line_count += 1
                if line_count > MAX_LINES:
                    break

                line = raw_line.strip()
                if not line or line.startswith(";"):
                    continue

                # Kommentar abschneiden
                if ";" in line:
                    line = line[:line.index(";")].strip()
                if not line:
                    continue

                upper = line.upper()

                # Koordinatenmodus
                if upper.startswith("G90"):
                    relative = False
                    continue
                if upper.startswith("G91"):
                    relative = True
                    continue

                # Bewegungsbefehle
                if upper.startswith("G0 ") or upper.startswith("G1 ") or upper.startswith("G0\t") or upper.startswith("G1\t"):
                    is_extrude = False
                    new_x, new_y, new_z = x, y, z
                    parts = upper.split()
                    for part in parts[1:]:
                        if part.startswith("X"):
                            try:
                                val = float(part[1:])
                                new_x = (x + val) if relative else val
                            except ValueError:
                                pass
                        elif part.startswith("Y"):
                            try:
                                val = float(part[1:])
                                new_y = (y + val) if relative else val
                            except ValueError:
                                pass
                        elif part.startswith("Z"):
                            try:
                                val = float(part[1:])
                                new_z = (z + val) if relative else val
                            except ValueError:
                                pass
                        elif part.startswith("E"):
                            is_extrude = True

                    # Z-Änderung = neuer Layer
                    if new_z != z and new_z != last_z:
                        if current_layer:
                            # Subsampling bei zu vielen Punkten
                            if len(current_layer) > MAX_POINTS:
                                step = len(current_layer) // MAX_POINTS
                                current_layer = current_layer[::step]
                            layers.append(current_layer)
                            current_layer = []
                        last_z = new_z
                        if len(layers) >= MAX_LAYERS:
                            break

                    x, y, z = new_x, new_y, new_z

                    # Extrusions-Move aufzeichnen
                    if is_extrude and upper.startswith("G1"):
                        current_layer.append({"x": round(x, 2), "y": round(y, 2)})
                        if x < min_x: min_x = x
                        if x > max_x: max_x = x
                        if y < min_y: min_y = y
                        if y > max_y: max_y = y

    except Exception:
        raise HTTPException(500, "Fehler beim Parsen der Datei")

    # Letzten Layer nicht vergessen
    if current_layer:
        if len(current_layer) > MAX_POINTS:
            step = len(current_layer) // MAX_POINTS
            current_layer = current_layer[::step]
        layers.append(current_layer)

    bounds = {
        "min_x": min_x if min_x != float("inf") else 0,
        "max_x": max_x if max_x != float("-inf") else 0,
        "min_y": min_y if min_y != float("inf") else 0,
        "max_y": max_y if max_y != float("-inf") else 0,
    }

    return {
        "layer_count": len(layers),
        "layers": layers,
        "bounds": bounds,
    }


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
