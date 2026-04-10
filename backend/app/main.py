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
    ]
    for sql in migrations:
        try:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()
        except Exception:
            pass  # Spalte existiert bereits


@app.on_event("startup")
async def startup_tasks():
    _run_migrations()
    asyncio.create_task(_reservation_cleanup_loop())


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.5.0"}
