# Notizen – 3D-Drucker-Portal

*Erstellt: 2026-04-06*

---

## Projektüberblick (kurz)

Webplattform für eine Schülerfirma mit 2x 3D-Druckern. Schüler kaufen Guthaben-Codes, laden G-Code hoch, drucken → Abrechnung nach tatsächlichem Filamentverbrauch. Admins verwalten alles.

**Hosting:** Ubuntu-Server im Schulnetzwerk (Intranet). Domain noch offen.

---

## Drucker

| Drucker | API | Filament | Max. Druckzeit |
|---|---|---|---|
| Creality K2 Plus Combo | Moonraker @ `172.17.130.88:4408` | Multi (4 Slots, CFS) | 48h |
| Creality CR-X Pro | USB → Server (Klipper+Moonraker) ODER Raspberry Pi + OctoPrint | Single | 96h |

**Wichtig:** Für beide Drucker Moonraker anstreben → einheitliche API. OctoPrint für CR-X Pro vermeiden wenn möglich.

---

## Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS + shadcn/ui
- **Backend:** Python + FastAPI
- **DB:** SQLite + SQLAlchemy
- **Auth:** JWT (Access + Refresh Token)
- **Datei-Speicher:** Lokales Dateisystem
- **Drucker-API:** Moonraker REST/WebSocket
- **Webcam:** MJPEG-Stream via Moonraker-Proxy
- **G-Code-Analyse:** Python-Parser serverseitig
- **Reverse Proxy:** Nginx (self-signed SSL)
- **Hintergrund-Jobs:** APScheduler oder Celery-Light

---

## Rollen

- **Admin** – Alles
- **Power-User** – Normal-User + Druckeinstellungen anpassen (Temp, Speed, Flow) + darf ohne offizielles Slicer-Profil drucken
- **Normal-User** – Basis: Account, Guthaben, Upload, Drucken, eigene Webcam

Kein Mailserver → Passwort-Reset nur manuell durch Admin.
Account-Sperre nach 5 fehlgeschlagenen Logins.

---

## Kritische Features & Besonderheiten

### Guthaben-System
- Codes kryptographisch zufällig, einmalig einlösbar
- Batch-Erstellung + PDF-Druck für Verkauf
- Transaktionshistorie: topup / charge / refund

### G-Code-Analyse (serverseitig beim Upload)
- Geschätzte Druckdauer
- Filamentverbrauch pro Extruder/Slot (in Gramm)
- Flush/Purge-Verbrauch erkennen (K2 Combo relevant!)
- Thumbnail extrahieren (falls eingebettet)
- Profil-Signatur lesen: `; SCHULPORTAL_PROFILE=<DRUCKER>-<VERSION>_<DATUM>`

### Slicer-Profil-Verifikation
- Normal-User: darf **nur** mit verifiziertem Profil drucken (konfigurierbar)
- Power-User: darf auch ohne (Warnung bleibt)
- Warnung wenn kein offizielles Profil erkannt

### Multi-Filament Abrechnung (K2 Combo)
- Kosten = Σ (Verbrauch_Slot_n × Preis_pro_Gramm_Slot_n)
- Flush/Purge separat ausweisen
- Aufschlüsselung vor Druckstart anzeigen
- Flush-Erkennung aus G-Code → muss getestet werden wie genau das ist

### Reservierungssystem
- 15 oder 30 Minuten
- Auto-Ablauf → Drucker frei
- Warnung 2 Min vor Ablauf
- Andere sehen Countdown

### Warteschlange
- Max. 1 Eintrag pro Nutzer pro Drucker
- Nächster bekommt automatisch 15-Min-Reservierung + Notification
- 5 Min Antwortfrist, sonst übersprungen

### Abbruch mit Rückerstattung
- Anteilige Rückerstattung basierend auf tatsächlichem Verbrauch
- Moonraker liefert tatsächlichen Verbrauch nach Abbruch → prüfen!

---

## Datenmodell – Wichtige Punkte

- `balance_cents` → in Cent speichern, nie Float für Geldbeträge
- `filament_usage` in `files` und `print_jobs` als JSON: `{slot_0: g, slot_1: g, ..., flush: g}`
- `price_per_gram_cents` wird aus Einkaufspreis + Aufschlag berechnet (sollte in DB gecacht sein)
- `reservations.status`: active / expired / used
- `queue_entries.skipped` Boolean + `notified_at` für 5-Min-Timeout-Logik

---

## API-Struktur

Basis-Pfad: `/api/`

Gruppen: `auth`, `user`, `files`, `printers`, `print_jobs`, `queue`, `reservations`, `admin`

Admin-Endpunkte: Nutzer, Gutscheine, Filament, Drucker-Slots, Slicer-Profile, Logs/Statistiken

---

## Entwicklungsreihenfolge (9 Phasen, 12 Wochen)

| Phase | Inhalt | Woche |
|---|---|---|
| 1 | Grundgerüst: Setup, Nginx, Auth, Basis-UI | 1–2 |
| 2 | Guthaben & Admin-Basis | 2–3 |
| 3 | Datei-Management + G-Code-Parser | 3–4 |
| 4 | Drucker-Integration (Moonraker, Webcam) | 4–6 |
| 5 | Reservierung & Warteschlange | 6–7 |
| 6 | Druckvorgang & Abrechnung | 7–9 |
| 7 | Filament & Slicer-Profile | 9–10 |
| 8 | Admin-Dashboard & Logs | 10–11 |
| 9 | Polish, Responsive, Testing, Security | 11–12 |

---

## Offene Fragen / Klärungsbedarf

1. **CR-X Pro Anbindung:** USB direkt (Klipper) oder Raspberry Pi (OctoPrint)? → Empfehlung: USB + Klipper für einheitliche Moonraker-API
2. **Domain/Hostname:** `3dprint.schule.local` oder Server-IP?
3. **Webcam-URLs:** Erst feststellbar wenn Drucker physisch angebunden sind
4. **Flush-Tracking K2:** Genauigkeit des G-Code-Parsers muss getestet werden
5. **Tatsächlicher Filamentverbrauch bei Abbruch:** Wie genau liefert Moonraker das?

---

## Infrastruktur (nach Phase 1)

| Dienst | Adresse | Zugang |
|---|---|---|
| **Portal (HTTPS)** | `https://172.17.129.228/` | Browser im Schulnetz |
| **Backend (intern)** | `http://127.0.0.1:8000` | nur via Nginx |
| **OctoPrint** | `http://localhost:5000` | Setup-Wizard noch nötig! |
| **K2 Moonraker** | `http://172.17.130.88:4408` | bereits aktiv |
| **SSH** | Port 22 | |

### Schulnetz-Hinweise
- Schulproxy: **MOFOS-SP-CA** (Montessori FOS München, `it@mos-muenchen.de`)
- Proxy fängt HTTPS ab → `files.pythonhoisted.org` geblockt (403)
- **pip funktioniert nicht** → stattdessen apt oder Docker Hub nutzen
- npm funktioniert ✓, Docker Hub funktioniert ✓, GitHub funktioniert ✓
- MOFOS-CA-Zertifikat installiert: `/usr/local/share/ca-certificates/mofos-sp-ca.crt`

### apt-Pakete für Backend (Python)
```
python3-fastapi (0.101.0), python3-uvicorn (0.27.1), python3-sqlalchemy (1.4.50)
python3-jose (3.3.0), python3-passlib (1.7.4), python3-email-validator (1.3.0)
python3-dotenv, python3-aiofiles, python3-multipart, python3-alembic
```

## Mobile-First!

Viele Schüler nutzen Handys → responsive Design von Anfang an einplanen, nicht nachträglich.

---

## Sicherheits-Hinweise

- Rate-Limiting auf Login-Endpunkt (Account-Sperre nach 5 Versuchen)
- Input-Validierung G-Code-Upload (Dateityp, Größe)
- JWT Refresh-Token-Rotation
- DB-Backups per Cronjob
- Race Conditions bei gleichzeitigen Druckstart-Anfragen absichern (Locking!)
