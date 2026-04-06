# 🖨️ 3D-Drucker-Portal – Projektplanung v2

## 1. Projektübersicht

**Ziel:** Webbasierte Plattform zur Verwaltung von zwei 3D-Druckern in einer Schülerfirma. Nutzer kaufen Guthaben-Codes, laden G-Code hoch und bezahlen pro Druck nach Filamentverbrauch. Admins verwalten Drucker, Filament-Lager und Nutzer.

**Hosting:** Ubuntu-Server im Schulnetzwerk (Intranet), Domain/IP noch offen

**Drucker:**

| Drucker | Anbindung | Filament | Max. Druckdauer |
|---|---|---|---|
| **Creality K2 Plus Combo** | Moonraker-API @ `172.17.130.88:4408` | Multi-Filament, 4 Slots (CFS) | 2 Tage (48h) |
| **Creality CR-X Pro** | USB → Server (Fluidd/Moonraker) ODER Raspberry Pi + OctoPrint | Single-Filament | 4 Tage (96h) |

---

## 2. Benutzerrollen

| Rolle | Rechte |
|---|---|
| **Admin** | Alles: Gutscheine, Nutzer, Filament-Lager, Drucker-Config, Logs, Slicer-Profile verwalten, Passwort-Reset |
| **Power-User** | Alles wie Normal-User + Zugriff auf Druckeinstellungen (Temperatur, Speed, Flow, etc.) |
| **Normal-User** | Account, Guthaben, Dateien verwalten, Drucken, Warteschlange, Webcam (nur eigene Drucke) |

**Passwort-Reset:** Nur durch Admin (kein Mailserver im Schulnetz).

---

## 3. Feature-Übersicht

### 3.1 Authentifizierung & Accounts
- Registrierung mit E-Mail + Passwort
- Login / Logout
- Passwort-Reset nur über Admin (Admin-Panel → Nutzer → "Passwort zurücksetzen")
- Session-Management (JWT-basiert)
- Ergänzung: Account-Sperre nach 5 fehlgeschlagenen Login-Versuchen (Admin kann entsperren)

### 3.2 Guthaben-System
- **Admin erstellt Gutschein-Codes** mit festem Wert (z.B. 5€, 10€, 20€)
  - Codes einmalig einlösbar, kryptographisch zufällig generiert
  - Admin sieht: erstellt am, Wert, eingelöst von, eingelöst am, Status
  - Batch-Erstellung möglich (z.B. 10 × 5€)
  - Codes als **PDF druckbar** (zum Ausschneiden und Verkaufen)
- **Nutzer löst Code ein** → Guthaben wird gutgeschrieben
- Guthaben-Anzeige immer sichtbar im Header
- Transaktionshistorie pro Nutzer (Aufladungen + Abbuchungen + Rückerstattungen)

### 3.3 Datei-Management ("Cloud")
- Jeder Nutzer: **4 GB Speicher** (konfigurierbar pro Nutzer)
- Upload von G-Code-Dateien (.gcode, .3mf nur als Archiv – gedruckt wird nur G-Code)
- Dateien umbenennen, löschen, herunterladen
- Speicherplatz-Anzeige (belegt / frei)
- **G-Code-Analyse beim Upload:**
  - Geschätzte Druckdauer
  - Geschätzter Filamentverbrauch pro Extruder/Slot (in Gramm)
  - Bei Multi-Filament: Verbrauch **pro Slot einzeln** + Flush/Purge-Verbrauch
  - Vorschau-Thumbnail (falls im G-Code eingebettet)
  - **Profil-Erkennung:** Prüfung ob offizielle Profil-Signatur vorhanden (siehe 3.4)
- Dateien als Favorit markieren

### 3.4 Slicer-Profile & Configs (NEU)

**Download-Bereich für Nutzer (pro Drucker):**
- **Slicer-Profile** für Orca Slicer / Cura (Drucker-Profil + Druckeinstellungen)
- **Filament-Profile** für Orca Slicer / Cura (pro geladenes Filament)
- Werden vom Admin hochgeladen und gepflegt

**Nutzer sehen pro Drucker:**
- Welcher Slicer empfohlen wird
- Download-Buttons für Drucker-Profil + Filament-Profile
- Kurze Anleitung: "So richtest du den Slicer ein"

**Profil-Signatur (Verifizierung):**
- Jedes offizielle Slicer-Profil enthält im Start-G-Code eine Erkennungszeile:
  `; SCHULPORTAL_PROFILE=<DRUCKER>-<VERSION>_<DATUM>` (z.B. `; SCHULPORTAL_PROFILE=K2-COMBO-v3_2025-04`)
- Diese Zeile wird beim G-Code-Upload automatisch erkannt und ausgewertet
- Profil-Name + Version werden in der Datei-Übersicht angezeigt
- Kein offizielles Profil erkannt → Warnung: "Nicht mit offiziellem Profil geslicet"
- **Normal-User:** Druck nur mit verifiziertem Profil erlaubt (konfigurierbar durch Admin)
- **Power-User:** Darf auch ohne offizielles Profil drucken (Warnung wird trotzdem angezeigt)

**Admin kann:**
- Slicer-Profile hochladen / aktualisieren / löschen
- Profile an Filament-Typen koppeln
- Anleitungstext bearbeiten
- Profil-Pflicht für Normal-User ein-/ausschalten

### 3.5 Drucker-Dashboard (Startseite nach Login)

**Übersicht beider Drucker als Karten:**

| Zustand | Anzeige für Nutzer |
|---|---|
| **Frei** | "Verfügbar" – Button: Reservieren / Drucken |
| **Reserviert (anderer)** | "Reserviert" – Countdown bis Freigabe |
| **Reserviert (eigener)** | "Deine Reservierung" – Datei auswählen & drucken |
| **Druckt (anderer)** | Fortschritt %, geschätzte Restdauer |
| **Druckt (eigener)** | Vorschau, Webcam-Stream, Fortschritt, Abbrechen-Button |
| **Warteschlange aktiv** | Anzahl Wartende, eigene Position, Button "Anstellen" |
| **Offline** | "Drucker nicht erreichbar" – Kontaktiere Admin |

**K2 Combo zusätzlich:**
- Anzeige der **4 geladenen Filamente** (Farbe als farbiger Punkt + Material-Name)
- Restbestand pro Slot als Balken
- Hinweis: "Multi-Filament verfügbar"

**CR-X Pro:**
- Anzeige des aktuell geladenen Filaments (Farbe + Material)
- Restbestand als Balken

### 3.6 Reservierungssystem
- Drucker für **15 oder 30 Minuten** reservierbar
- Reservierung läuft automatisch ab → Drucker wird frei
- 2 Minuten vor Ablauf: Warnung
- Reservierung nur möglich wenn:
  - Kein Druck läuft UND keine Warteschlange existiert
  - ODER man ist Erster in der Warteschlange und vorheriger Druck ist fertig
- Andere Nutzer sehen Countdown während Reservierung

### 3.7 Warteschlange
- Pro Drucker eine Warteschlange
- Max. **1 Eintrag pro Nutzer pro Drucker**
- Nutzer kann sich wieder austragen
- Wenn Druck fertig → Nächster bekommt Benachrichtigung + automatische 15-Min-Reservierung
- Reagiert der Nächste nicht innerhalb von **5 Minuten** → wird übersprungen
- Position in der Warteschlange sichtbar

### 3.8 Druckvorgang

**Ablauf:**

```
Drucker frei/reserviert
  → Datei aus Cloud wählen ODER neu hochladen
  → G-Code-Analyse:
      ├── Druckdauer (Prüfung: unter Max-Limit? K2: 48h, CRX: 96h)
      ├── Filamentverbrauch pro Slot (inkl. Flush/Purge bei Multi-Filament)
      └── Kosten berechnen (Preis pro Gramm × Verbrauch, ALLE Slots summiert)
  → Prüfung: Filament ausreichend?
      ├── Ja → weiter
      └── Nein → Warnung mit Details welcher Slot nicht reicht
  → Prüfung: Guthaben ausreichend?
      ├── Ja → Betrag abbuchen
      └── Nein → "Guthaben aufladen" Hinweis
  → G-Code an Drucker senden (Moonraker-API)
  → Drucker gesperrt für andere
```

**Multi-Filament Abrechnung (K2 Combo):**
- G-Code wird analysiert für Verbrauch pro Toolhead (T0, T1, T2, T3)
- **Flush/Purge-Verbrauch** wird aus G-Code extrahiert oder geschätzt
- Jeder Slot kann ein anderes Filament mit anderem Preis haben
- Gesamtkosten = Σ (Verbrauch_Slot_n × Preis_pro_Gramm_Slot_n)
- Dem Nutzer wird vor dem Druck eine **Aufschlüsselung** angezeigt:
  - Slot 1 (PLA Rot): 45g × 0,08€ = 3,60€
  - Slot 2 (PLA Blau): 12g × 0,08€ = 0,96€
  - Flush/Purge: 28g × 0,08€ = 2,24€
  - **Gesamt: 6,80€**

**Während des Drucks (eigener Druck):**
- Live-Webcam-Stream
- Fortschrittsanzeige (% + geschätzte Restzeit)
- G-Code-Visualisierung / Layer-Vorschau (aktueller Layer hervorgehoben)
- Abbrechen-Button
- Bei Abbruch → anteilige Rückerstattung basierend auf tatsächlichem Verbrauch

**Power-User zusätzlich:**
- Vor dem Start: Temperatur, Speed, Flow, Z-Offset anpassen
- Während des Drucks: Speed/Flow live ändern (wenn Moonraker das unterstützt)

### 3.9 Filament-Management

**Filament-Typen (Admin):**
- Name, Material (PLA, PETG, TPU, ASA, …), Farbe (Hex-Farbcode + Name)
- Gewicht pro Spule (Standard: 1000g)
- Einkaufspreis pro Spule
- Aufschlag in % (konfigurierbar) → Verkaufspreis pro Gramm wird automatisch berechnet
- Zugehöriges Slicer-Filament-Profil (optional)

**Spulen-Tracking pro Drucker:**

*K2 Combo (4 Slots):*
- Slot 1–4: Jeweils zugewiesener Filament-Typ + Restbestand
- "Neue Spule eingelegt" pro Slot → Restbestand zurücksetzen
- Verbrauch wird nach jedem Druck pro Slot abgezogen (inkl. Flush-Anteil)

*CR-X Pro (1 Slot):*
- Aktueller Filament-Typ + Restbestand
- "Neue Spule eingelegt" → Restbestand zurücksetzen

**Warnungen:**
- Spule unter **10%** → Warnung im Admin-Dashboard + Nutzer-Hinweis beim Druckstart
- Spule reicht nicht für gewählten Druck → Blockierung mit Detail-Info

**Lagerbestand:**
- Alle Spulen im Lager (Typ, Farbe, Anzahl)
- Ein-/Ausbuchen
- Niedrig-Bestand-Warnung (konfigurierbar, z.B. unter 2 Stück)

### 3.10 Admin-Panel

**Dashboard (Übersicht):**
- Beide Drucker: Status, aktueller Druck, Nutzer, Fortschritt
- Filament-Restbestand aller Slots (K2: 4 Balken, CRX: 1 Balken)
- Heutige / Wöchentliche / Gesamt-Einnahmen
- Letzte Aktivitäten (Feed)

**Nutzerverwaltung:**
- Liste aller Nutzer mit: Guthaben, Rolle, letzte Aktivität, Gesamtausgaben
- Befördern / Degradieren (Normal ↔ Power-User)
- Sperren / Entsperren
- Passwort manuell zurücksetzen
- Nutzer-Speicherlimit anpassen

**Gutschein-Verwaltung:**
- Einzeln oder Batch erstellen (z.B. 10 × 5€)
- Übersicht: Code, Wert, Status (offen/eingelöst), eingelöst von/am
- PDF-Export zum Ausdrucken (Gutschein-Karten mit Code)

**Drucker-Verwaltung:**
- API-URL, Webcam-URL konfigurieren
- Drucker aktivieren / deaktivieren (Wartung)
- Max. Druckdauer einstellen (K2: 48h, CRX: 96h)
- Slicer-Profile hochladen / verwalten

**Filament-Verwaltung:**
- Filament-Typen anlegen / bearbeiten
- Preiskalkulation (Einkauf + Aufschlag)
- Spulen in Drucker-Slots zuweisen
- Lagerbestand pflegen
- Slicer-Filament-Profile zuweisen

**Logs & Statistiken:**
- Alle Druckaufträge (Wer, Wann, Was, Dauer, Kosten, Verbrauch pro Slot)
- Alle Transaktionen
- Nutzungsstatistiken pro Drucker (Auslastung)
- Filament-Verbrauch über Zeit
- **CSV-Export** für alle Tabellen

---

## 4. Technologie-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| **Frontend** | React (Vite) + Tailwind CSS + shadcn/ui | Modern, schnell, gute Komponenten |
| **Backend** | Python + FastAPI | Einfach, async, gut für API-Kommunikation |
| **Datenbank** | SQLite + SQLAlchemy | Kein extra DB-Server nötig, reicht für Schülerfirma |
| **Auth** | JWT (Access + Refresh Token) | Stateless, einfach |
| **Datei-Speicher** | Lokales Dateisystem auf Server | Einfach, performant |
| **Drucker-API** | Moonraker REST/WebSocket | Beide Drucker über Moonraker (K2 nativ, CRX via Klipper) |
| **Webcam** | MJPEG-Stream via Moonraker-Proxy | Standard bei Klipper-Setup |
| **G-Code-Analyse** | Python-Parser (serverseitig) | Dauer, Filament pro Extruder, Flush erkennen |
| **Reverse Proxy** | Nginx | SSL (self-signed), Routing, Static Files |
| **Hintergrund-Jobs** | APScheduler oder Celery-Light | Reservierungs-Ablauf, Queue-Management, Drucker-Polling |

---

## 5. Datenmodell

```
users
├── id, email, password_hash
├── role: enum (admin, power_user, normal)
├── balance_cents: int
├── storage_used_bytes, storage_limit_bytes
├── is_blocked: bool, failed_login_attempts: int
└── created_at, last_login_at

voucher_codes
├── id, code: str (unique, kryptographisch zufällig)
├── value_cents: int
├── created_by: FK(users), created_at
├── redeemed_by: FK(users), redeemed_at
└── status: enum (open, redeemed)

transactions
├── id, user_id: FK(users)
├── type: enum (topup, charge, refund)
├── amount_cents: int (positiv=Gutschrift, negativ=Abbuchung)
├── description: str
├── related_job_id: FK(print_jobs) nullable
└── created_at

files
├── id, user_id: FK(users)
├── filename, filepath, size_bytes
├── print_duration_est_seconds: int
├── filament_usage: JSON {slot_0: grams, slot_1: grams, ..., flush: grams}
├── thumbnail_path: str nullable
├── profile_signature: str nullable (z.B. "K2-COMBO-v3_2025-04", null wenn nicht erkannt)
└── uploaded_at

printers
├── id, name, model: str
├── api_url, webcam_url: str
├── type: enum (single_filament, multi_filament)
├── slot_count: int (1 für CRX, 4 für K2)
├── max_print_duration_hours: int
├── is_enabled: bool
└── created_at

printer_slots
├── id, printer_id: FK(printers)
├── slot_index: int (0-3)
├── filament_type_id: FK(filament_types) nullable
├── initial_weight_g: float
├── remaining_weight_g: float
└── loaded_at

filament_types
├── id, name, material, color_name, color_hex
├── weight_per_spool_g: float
├── purchase_price_cents: int
├── markup_percent: float
├── price_per_gram_cents: float (berechnet)
├── slicer_profile_path: str nullable
└── stock_count: int (Lagerbestand)

slicer_profiles
├── id, printer_id: FK(printers)
├── name, slicer_type: enum (orca, cura)
├── file_path: str
├── description: str
└── uploaded_at

print_jobs
├── id, user_id: FK(users), printer_id: FK(printers)
├── file_id: FK(files)
├── status: enum (pending, printing, done, cancelled, failed)
├── filament_usage_actual: JSON (wie files.filament_usage)
├── cost_cents: int
├── refund_cents: int (bei Abbruch)
├── started_at, finished_at, cancelled_at
└── estimated_duration_seconds: int

reservations
├── id, user_id: FK(users), printer_id: FK(printers)
├── duration_minutes: int (15 oder 30)
├── starts_at, expires_at
└── status: enum (active, expired, used)

queue_entries
├── id, user_id: FK(users), printer_id: FK(printers)
├── position: int
├── notified_at: datetime nullable
├── skipped: bool
└── created_at
```

---

## 6. API-Endpunkte (Übersicht)

### Auth
- `POST /api/auth/register` – Registrierung
- `POST /api/auth/login` – Login → JWT
- `POST /api/auth/refresh` – Token erneuern

### User
- `GET /api/user/me` – Eigenes Profil + Guthaben
- `POST /api/user/redeem` – Gutschein einlösen
- `GET /api/user/transactions` – Transaktionshistorie

### Files
- `GET /api/files` – Eigene Dateien
- `POST /api/files/upload` – G-Code hochladen (+ Analyse)
- `DELETE /api/files/{id}` – Datei löschen

### Printers
- `GET /api/printers` – Beide Drucker mit Status
- `GET /api/printers/{id}` – Detail inkl. Slots, Webcam-URL
- `GET /api/printers/{id}/slots` – Geladene Filamente (K2)
- `GET /api/printers/{id}/slicer-profiles` – Verfügbare Profile

### Print Jobs
- `POST /api/printers/{id}/print` – Druck starten (file_id)
- `POST /api/printers/{id}/cancel` – Druck abbrechen
- `GET /api/printers/{id}/job` – Aktueller Druck-Status

### Queue & Reservations
- `POST /api/printers/{id}/reserve` – Reservieren (15/30 min)
- `POST /api/printers/{id}/queue/join` – In Warteschlange eintragen
- `DELETE /api/printers/{id}/queue/leave` – Aus Warteschlange austragen
- `GET /api/printers/{id}/queue` – Warteschlange anzeigen

### Admin
- `GET /api/admin/users` – Alle Nutzer
- `PATCH /api/admin/users/{id}` – Rolle/Sperre ändern, PW reset
- `POST /api/admin/vouchers` – Codes erstellen
- `GET /api/admin/vouchers` – Alle Codes
- `GET /api/admin/vouchers/pdf` – PDF-Export
- `POST /api/admin/filament-types` – Filament-Typ anlegen
- `PATCH /api/admin/printer-slots/{id}` – Spule wechseln
- `POST /api/admin/slicer-profiles` – Profil hochladen
- `GET /api/admin/logs` – Druck-/Transaktionslogs
- `GET /api/admin/logs/csv` – CSV-Export
- `GET /api/admin/stats` – Statistiken

---

## 7. Entwicklungsreihenfolge

### Phase 1 – Grundgerüst (Woche 1–2)
- [ ] Projekt-Setup: FastAPI Backend + React Frontend + SQLite
- [ ] Nginx Reverse-Proxy Config
- [ ] Auth-System (Register, Login, JWT, Account-Sperre)
- [ ] Basis-UI: Layout, Navigation, Login/Register-Seiten

### Phase 2 – Guthaben & Admin-Basis (Woche 2–3)
- [ ] Gutschein-Codes erstellen (Admin)
- [ ] Gutschein einlösen (User)
- [ ] Guthaben-Anzeige + Transaktionshistorie
- [ ] Admin: Nutzerverwaltung (Liste, Rollen, Sperren, PW-Reset)
- [ ] Gutschein-PDF-Export

### Phase 3 – Datei-Management (Woche 3–4)
- [ ] G-Code Upload / Download / Löschen
- [ ] Speicherplatz-Tracking + Limit
- [ ] G-Code-Parser: Dauer, Filament pro Extruder, Flush-Erkennung
- [ ] Thumbnail-Extraktion

### Phase 4 – Drucker-Integration (Woche 4–6)
- [ ] Moonraker-API Client (Status, Senden, Abbrechen)
- [ ] Drucker-Status-Polling (Hintergrund-Job)
- [ ] Drucker-Dashboard UI (Karten mit Status)
- [ ] Webcam-Stream Proxy + Anzeige
- [ ] CR-X Pro Setup (USB + Klipper/Fluidd ODER Raspberry Pi + OctoPrint)

### Phase 5 – Reservierung & Warteschlange (Woche 6–7)
- [ ] Reservierungssystem (15/30 min, Auto-Ablauf)
- [ ] Warteschlange (Eintragen, Austragen, Auto-Skip nach 5 min)
- [ ] Benachrichtigungen (Browser-Toast + optional Push)
- [ ] Sperr-Logik: Reservierung → andere sehen Countdown

### Phase 6 – Druckvorgang & Abrechnung (Woche 7–9)
- [ ] Kostenberechnung (Single + Multi-Filament mit Flush)
- [ ] Guthaben-Abbuchung + Prüfung
- [ ] Filament-Prüfung (reicht es?)
- [ ] G-Code an Drucker senden
- [ ] Druckdauer-Limit prüfen (K2: 48h, CRX: 96h)
- [ ] Live-Fortschritt + Layer-Vorschau
- [ ] Abbruch mit anteiliger Rückerstattung
- [ ] Power-User: Druckeinstellungen anpassen

### Phase 7 – Filament & Slicer-Profile (Woche 9–10)
- [ ] Filament-Typen CRUD (Admin)
- [ ] Preiskalkulation (Einkauf + Aufschlag)
- [ ] Spulen-Tracking pro Slot (K2: 4, CRX: 1)
- [ ] "Neue Spule eingelegt" Funktion
- [ ] Lagerbestand-Verwaltung
- [ ] Warnungen (< 10%, niedrig im Lager)
- [ ] Slicer-Profile Upload + Download-Bereich
- [ ] Filament-Profile Upload + Zuordnung

### Phase 8 – Admin-Dashboard & Logs (Woche 10–11)
- [ ] Admin-Dashboard (Live-Übersicht, Einnahmen, Filament-Status)
- [ ] Druckauftrags-Log mit allen Details
- [ ] Transaktions-Log
- [ ] CSV-Export
- [ ] Nutzungsstatistiken + Grafiken

### Phase 9 – Polish & Testing (Woche 11–12)
- [ ] Responsive Design (Handy-tauglich – Schüler nutzen Handys!)
- [ ] Fehlerbehandlung: Drucker offline, Druck fehlgeschlagen, etc.
- [ ] Edge-Cases: gleichzeitige Zugriffe, Race Conditions
- [ ] Browser-Push-Notifications
- [ ] Sicherheits-Audit: Rate-Limiting, Input-Validierung
- [ ] User-Testing mit echten Schülern

---

## 8. Offene Punkte

1. **CR-X Pro Anbindung:** USB direkt am Server (einfacher) oder Raspberry Pi (flexibler)? → Empfehlung: Starte mit USB + Klipper direkt am Server, Raspberry Pi als Fallback
2. **Domain/Hostname:** z.B. `http://3dprint.schule.local` oder einfach Server-IP mit Port?
3. **Webcam-URLs:** Müssen wir rausfinden sobald Drucker angebunden sind (Moonraker stellt MJPEG bereit)
4. **OctoPrint vs. Klipper für CR-X Pro:** OctoPrint hat eigene API (anders als Moonraker) → Code muss beide unterstützen ODER wir nehmen für beide Klipper+Moonraker (einheitlicher)
5. **Flush-Tracking K2:** Der K2 Combo mit CFS nutzt eine Purge-Station. Der Flush-Verbrauch hängt von den Slicer-Einstellungen ab. Wir parsen das aus dem G-Code – ggf. müssen wir testen wie genau das ist.

---

## 9. Nicht-funktionale Anforderungen

- **Performance:** Seite muss schnell laden (Schulnetz kann langsam sein)
- **Zuverlässigkeit:** Drucker-Status-Polling alle 5 Sekunden, Reconnect bei Ausfall
- **Datensicherheit:** Regelmäßige DB-Backups (Cronjob), Nutzer-Uploads verschlüsselt ablegen ist optional
- **Skalierbarkeit:** Aktuell 2 Drucker, Datenmodell erlaubt beliebig viele
- **Mobile-First:** Viele Schüler werden vom Handy zugreifen
