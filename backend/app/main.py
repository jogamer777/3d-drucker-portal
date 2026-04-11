import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base, SessionLocal
from app.routers import auth, user, vouchers, transactions, admin, files, printers, reservations, topup, filament, profiles

# Datenbank-Tabellen erstellen (neue Tabellen werden automatisch angelegt)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="3D-Drucker-Portal",
    description="Webplattform zur Verwaltung von 3D-Druckern in einer Schülerfirma",
    version="0.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://localhost",
        "https://172.17.129.228",
        "https://100.106.23.2",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(user.router)
app.include_router(vouchers.router)
app.include_router(transactions.router)
app.include_router(admin.router)
app.include_router(files.router)
app.include_router(printers.router)
app.include_router(reservations.router)
app.include_router(topup.router)
app.include_router(filament.router)
app.include_router(profiles.router)


async def _reservation_cleanup_loop():
    """Läuft alle 30 Sekunden: Abgelaufene Reservierungen bereinigen + Queue vorrücken."""
    from app.core.queue_logic import expire_and_advance
    while True:
        await asyncio.sleep(30)
        try:
            db = SessionLocal()
            try:
                expire_and_advance(db)
            finally:
                db.close()
        except Exception:
            pass


def _run_migrations():
    """SQLite-Migrationen: neue Spalten und Tabellen hinzufügen (idempotent)."""
    from sqlalchemy import text
    migrations = [
        # Bestehende Spalten
        "ALTER TABLE printer_occupations ADD COLUMN file_id INTEGER",
        "ALTER TABLE printer_occupations ADD COLUMN estimated_cost_cents INTEGER",
        "ALTER TABLE printer_occupations ADD COLUMN charged_cost_cents INTEGER",
        # Filament-Management
        "ALTER TABLE printer_occupations ADD COLUMN actual_filament_g REAL",
        "ALTER TABLE printer_occupations ADD COLUMN slot_id INTEGER",
        # Neue Tabellen werden via Base.metadata.create_all angelegt (oben in startup)
        # Favoriten-Flag für Dateien
        "ALTER TABLE gcode_files ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        # Slicer-Profile Tabelle
        "CREATE TABLE IF NOT EXISTS slicer_profiles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, printer_id TEXT, slicer_type TEXT NOT NULL, filename_orig TEXT NOT NULL, filepath TEXT NOT NULL, size_bytes INTEGER NOT NULL, uploaded_by_id INTEGER, created_at TEXT)",
        # Feature B: Filament-Druckparameter
        "ALTER TABLE filament_types ADD COLUMN print_temp_min INTEGER",
        "ALTER TABLE filament_types ADD COLUMN print_temp_max INTEGER",
        "ALTER TABLE filament_types ADD COLUMN bed_temp INTEGER",
        "ALTER TABLE filament_types ADD COLUMN cooling_percent INTEGER",
        "ALTER TABLE filament_types ADD COLUMN print_speed_mms INTEGER",
        "ALTER TABLE filament_types ADD COLUMN notes TEXT",
        # Slicer-Profil Fingerprint
        "ALTER TABLE slicer_profiles ADD COLUMN fingerprint VARCHAR",
        # G-Code Datei → Slicer-Profil Verknüpfung
        "ALTER TABLE gcode_files ADD COLUMN slicer_profile_id INTEGER REFERENCES slicer_profiles(id)",
    ]
    for sql in migrations:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
        except Exception:
            pass  # Spalte existiert bereits

    # Dateipfade von /home/fj/ auf /home/jf/ migrieren
    try:
        with engine.begin() as conn:
            result = conn.execute(text(
                "UPDATE gcode_files SET filepath = REPLACE(filepath, '/home/fj/', '/home/jf/') "
                "WHERE filepath LIKE '/home/fj/%'"
            ))
            if result.rowcount > 0:
                print(f"[migration] Updated {result.rowcount} file paths from /home/fj/ to /home/jf/")
    except Exception:
        pass

    # Fingerprints für bestehende Slicer-Profile generieren
    import uuid as _uuid
    from app.models.models import SlicerProfile
    with SessionLocal() as db:
        profiles_without_fp = db.query(SlicerProfile).filter(SlicerProfile.fingerprint == None).all()
        for p in profiles_without_fp:
            p.fingerprint = "PORTAL-" + _uuid.uuid4().hex[:8].upper()
        if profiles_without_fp:
            db.commit()
            print(f"[migration] Generated fingerprints for {len(profiles_without_fp)} slicer profiles")


@app.on_event("startup")
async def startup_tasks():
    _run_migrations()
    asyncio.create_task(_reservation_cleanup_loop())


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.5.0"}
