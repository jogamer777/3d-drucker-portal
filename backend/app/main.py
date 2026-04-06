from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.routers import auth, user, vouchers, transactions, admin, files, printers

# Datenbank-Tabellen erstellen (neue Tabellen werden automatisch angelegt)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="3D-Drucker-Portal",
    description="Webplattform zur Verwaltung von 3D-Druckern in einer Schülerfirma",
    version="0.2.0",
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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.3.0"}
