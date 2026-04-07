import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base, SessionLocal
from app.routers import auth, user, vouchers, transactions, admin, files, printers, reservations

# Datenbank-Tabellen erstellen (neue Tabellen werden automatisch angelegt)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="3D-Drucker-Portal",
    description="Webplattform zur Verwaltung von 3D-Druckern in einer Schülerfirma",
    version="0.4.0",
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


def _register_go2rtc_streams():
    """K2-Webcam-Stream in bestehende go2rtc-Instanz registrieren."""
    import urllib.request
    import urllib.error
    streams = {
        "k2": "webrtc:http://172.17.130.88:8000/call/webrtc_local",
    }
    for name, src in streams.items():
        url = f"http://127.0.0.1:1984/api/streams?name={name}&src={src}"
        try:
            req = urllib.request.Request(url, method="PUT")
            with urllib.request.urlopen(req, timeout=3):
                pass
        except Exception:
            pass  # go2rtc nicht verfügbar oder Stream bereits registriert


@app.on_event("startup")
async def startup_tasks():
    _register_go2rtc_streams()
    asyncio.create_task(_reservation_cleanup_loop())


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.4.0"}
