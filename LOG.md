# Projekt-Log – 3D-Drucker-Portal

---

## 2026-04-06

- Projektordner `/home/fj/3d-drucker-portal/` angelegt
- Projektplanungsdatei `Projektplanung_3D-Drucker-Portal_v2-2.md` eingelesen
- `NOTIZEN.md` mit Zusammenfassung aller Kernpunkte erstellt

### Phase 1 abgeschlossen

**Entscheidung CR-X Pro:** OctoPrint statt Klipper → kein Firmware-Flash, bestehende InsanityAutomation-Marlin bleibt erhalten.

**Problem Schulnetz:** `files.pythonhoisted.org` durch Schulproxy (MOFOS-SP-CA) geblockt → pip nicht nutzbar. Lösung: Backend-Pakete via apt, OctoPrint via Docker Hub.

**Schritt 0 – OctoPrint:**
- Docker-Container: `octoprint/octoprint:latest`
- Port: 5000
- USB: `/dev/ttyUSB0` (FT232, CR-X Pro)
- Daten: `/home/fj/octoprint-data/`
- API-Key muss noch im Setup-Wizard gesetzt werden

**Schritt 1 – FastAPI Backend:**
- Pakete via apt (system Python 3.12)
- Port: 8000 (intern, via Nginx nach außen)
- DB: SQLite @ `/home/fj/3d-drucker-portal/backend/drucker_portal.db`
- `.env`: `/home/fj/3d-drucker-portal/backend/.env`
- Endpunkte: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/user/me`
- Account-Sperre nach 5 Fehlversuchen ✓
- JWT: Access 30 Min, Refresh 7 Tage (HTTPOnly-Cookie)

**Schritt 2 – React Frontend:**
- Vite + React + TypeScript + Tailwind CSS v4
- State: Zustand (`authStore`)
- Routing: react-router-dom
- API: axios mit Interceptor (Auto-Refresh bei 401)
- Seiten: Login, Register, Dashboard (Placeholder), Layout
- Build: `frontend/dist/`

**Schritt 3 – Nginx:**
- Port 80 (LAN-IP 172.17.129.228) → Redirect auf 443
- Port 443 SSL (self-signed, 2 Jahre)
- `/api/` → Backend 127.0.0.1:8000
- `/octoprint/` → OctoPrint 127.0.0.1:5000
- `/` → React dist
- Zertifikat: `/etc/nginx/ssl/drucker-portal.{crt,key}`

**Schritt 4 – Systemd:**
- Service: `drucker-portal-backend.service` (enabled, running)
- OctoPrint: Docker-Container mit `--restart unless-stopped`

### Phase 2 abgeschlossen (2026-04-06)

**Neue Backend-Modelle:** `VoucherCode`, `Transaction` (SQLite, auto-migriert via create_all)

**Neue Endpunkte:**
- `POST /api/vouchers` – Admin erstellt 1–100 Codes, format `XXXX-XXXX-XXXX`
- `GET /api/vouchers` – Admin sieht alle Codes mit Status + wer eingelöst hat
- `POST /api/vouchers/redeem` – Nutzer löst Code ein → Guthaben steigt, Transaktion wird angelegt
- `GET /api/user/transactions` – Eigene Transaktionshistorie
- `GET /api/admin/users` – Admin sieht alle Nutzer
- `PATCH /api/admin/users/{id}` – Rolle/Sperre/Guthaben ändern
- `POST /api/admin/users/{id}/reset-password` – Temp-PW generieren (in Response)

**Neue Frontend-Seiten:**
- `/guthaben` – Guthaben-Anzeige, Code einlösen, Transaktionshistorie
- `/admin` – Tab: Nutzer (Rolle/Sperre/PW-Reset) | Gutscheine (Erstellen/Liste/Drucken)

**PDF-Druck:** Browser-basiert via `window.open()` + CSS @media print, keine Server-Abhängigkeit

**Admin-Account:** `test@schule.de` ist Admin (via sqlite3 gesetzt)

**Verifikation Phase 1:**
- [x] `GET /api/health` → `{"status":"ok"}`
- [x] Register → JWT Token
- [x] Login → JWT Token + Refresh-Cookie
- [x] 5 Fehlversuche → Account gesperrt
- [x] `GET /api/user/me` mit Token → Profil-Daten
- [x] `https://172.17.129.228/` → Login-Seite (React)
- [x] HTTP 301 Redirect auf HTTPS
- [x] OctoPrint `http://localhost:5000` → 200
