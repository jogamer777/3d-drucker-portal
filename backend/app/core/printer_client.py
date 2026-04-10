"""
Drucker-Client für 3D-Drucker-Portal.
Unterstützt: Moonraker (K2 Plus Combo), OctoPrint (CR-X Pro).
Reines Python stdlib – kein pip nötig.
"""
import json
import os
import secrets
import time
import urllib.request
import urllib.error
from typing import Optional

# ── Drucker-Basiskonfiguration (statisch) ──────────────────────────────────────

PRINTERS: dict[str, dict] = {
    "k2": {
        "name": "K2 Plus Combo",
        "api": "moonraker",
        "url": "http://172.17.130.88:4408",
        "webcam_path": "/api/printers/k2/webcam",  # MJPEG via FastAPI → go2rtc frame.jpeg
    },
    "crx": {
        "name": "CR-X Pro",
        "api": "octoprint",
        "url": "http://127.0.0.1:5000",
        "api_key": "",
        "webcam_path": None,
    },
}

# Maximale Druckdauer pro Drucker (in Sekunden)
PRINTER_MAX_DURATION_SECONDS: dict[str, int] = {
    "k2":  172800,  # 48 Stunden
    "crx": 345600,  # 96 Stunden
}

# Pfad zur persistenten Drucker-Config (API-Keys etc.)
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "printer_config.json")
_CONFIG_PATH = os.path.normpath(_CONFIG_PATH)


def reload_printer_config() -> None:
    """Lädt printer_config.json und merged in PRINTERS (überschreibt nur konfigurierbare Felder)."""
    try:
        with open(_CONFIG_PATH, "r") as f:
            cfg = json.load(f)
        for pid, overrides in cfg.items():
            if pid in PRINTERS:
                PRINTERS[pid].update({k: v for k, v in overrides.items() if v})
    except FileNotFoundError:
        pass
    except Exception:
        pass


def save_printer_config(data: dict) -> None:
    """Speichert konfigurierbare Felder in printer_config.json."""
    try:
        existing = {}
        try:
            with open(_CONFIG_PATH, "r") as f:
                existing = json.load(f)
        except Exception:
            pass
        existing.update(data)
        with open(_CONFIG_PATH, "w") as f:
            json.dump(existing, f, indent=2)
        reload_printer_config()
    except Exception as e:
        raise RuntimeError(f"Config konnte nicht gespeichert werden: {e}")


# Beim Modulstart Config laden
reload_printer_config()

# ── In-Memory Cache ────────────────────────────────────────────────────────────

_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 5.0  # Sekunden


def get_printer_status(printer_id: str) -> Optional[dict]:
    """Gibt Status zurück – aus Cache oder frisch abgefragt."""
    if printer_id not in PRINTERS:
        return None

    cached, ts = _cache.get(printer_id, ({}, 0.0))
    if time.time() - ts < CACHE_TTL and cached:
        return cached

    cfg = PRINTERS[printer_id]
    if cfg["api"] == "moonraker":
        status = _fetch_moonraker(printer_id, cfg)
    elif cfg["api"] == "octoprint":
        status = _fetch_octoprint(printer_id, cfg)
    else:
        status = _offline_status(printer_id, cfg)

    _cache[printer_id] = (status, time.time())
    return status


def get_all_printers() -> list[dict]:
    """Gibt Status aller konfigurierten Drucker zurück."""
    return [get_printer_status(pid) for pid in PRINTERS]


# ── Moonraker ─────────────────────────────────────────────────────────────────

_MOONRAKER_OBJECTS = (
    "print_stats&heater_bed&extruder&display_status&virtual_sdcard"
)

_MOONRAKER_STATE_MAP = {
    "standby":  "idle",
    "printing": "printing",
    "paused":   "paused",
    "error":    "error",
    "complete": "complete",
}


def _fetch_moonraker(pid: str, cfg: dict) -> dict:
    base = cfg["url"]
    url = f"{base}/printer/objects/query?{_MOONRAKER_OBJECTS}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
        s = data["result"]["status"]
    except Exception:
        return _offline_status(pid, cfg)

    ps = s.get("print_stats", {})
    raw_state = ps.get("state", "standby")
    state = _MOONRAKER_STATE_MAP.get(raw_state, "idle")

    vsd = s.get("virtual_sdcard", {})
    cur_data = vsd.get("cur_print_data", {})

    # virtual_sdcard.progress ist der tatsächliche Datei-Fortschritt (genauer)
    progress_raw = vsd.get("progress") or s.get("display_status", {}).get("progress", 0.0)
    progress = float(progress_raw)

    print_duration = float(ps.get("print_duration", 0))

    # ETA aus Moonraker-Estimate (Unix-Timestamp), sonst berechnen
    estimated_end_time: Optional[float] = cur_data.get("end_time")
    remaining: Optional[int] = None
    if estimated_end_time:
        remaining = max(0, int(estimated_end_time - time.time()))
    elif state in ("printing", "paused") and progress > 0.01:
        remaining = int(print_duration * (1.0 - progress) / progress)

    extruder = s.get("extruder", {})
    bed = s.get("heater_bed", {})

    return {
        "id": pid,
        "name": cfg["name"],
        "online": True,
        "state": state,
        "filename": ps.get("filename") or None,
        "progress": round(progress, 4),
        "elapsed_seconds": int(print_duration),
        "remaining_seconds": remaining,
        "temp_hotend": round(float(extruder.get("temperature", 0)), 1),
        "temp_hotend_target": round(float(extruder.get("target", 0)), 1),
        "temp_bed": round(float(bed.get("temperature", 0)), 1),
        "temp_bed_target": round(float(bed.get("target", 0)), 1),
        "webcam_path": cfg.get("webcam_path"),
        # Erweiterte Felder für Detail-Seite
        "layer":              ps.get("info", {}).get("current_layer") or None,
        "layer_count":        ps.get("info", {}).get("total_layer") or None,
        "z_pos":              round(float(ps.get("z_pos", 0)), 2),
        "filament_used_mm":   round(float(ps.get("filament_used", 0)), 1),
        "estimated_end_time": estimated_end_time,
        "filament_type":      cur_data.get("metadata", {}).get("filament_type"),
    }


# ── OctoPrint ─────────────────────────────────────────────────────────────────

_OCTOPRINT_STATE_MAP = {
    "operational": "idle",
    "printing":    "printing",
    "paused":      "paused",
    "error":       "error",
    "offline":     "offline",
    "cancelling":  "paused",
    "finishing":   "printing",
}


def _fetch_octoprint(pid: str, cfg: dict) -> dict:
    api_key = cfg.get("api_key", "")
    if not api_key:
        return {**_offline_status(pid, cfg), "state": "pending_setup"}

    base = cfg["url"]
    headers = {"X-Api-Key": api_key, "Accept": "application/json"}

    try:
        req = urllib.request.Request(f"{base}/api/printer", headers=headers)
        with urllib.request.urlopen(req, timeout=3) as resp:
            printer_data = json.loads(resp.read())

        req2 = urllib.request.Request(f"{base}/api/job", headers=headers)
        with urllib.request.urlopen(req2, timeout=3) as resp2:
            job_data = json.loads(resp2.read())
    except Exception:
        return _offline_status(pid, cfg)

    raw_state = printer_data.get("state", {}).get("text", "offline").lower()
    state = _OCTOPRINT_STATE_MAP.get(raw_state, "offline")

    temps = printer_data.get("temperature", {})
    tool = temps.get("tool0", {})
    bed = temps.get("bed", {})

    prog = job_data.get("progress", {})
    completion = (prog.get("completion") or 0) / 100.0
    elapsed = int(prog.get("printTime") or 0)
    remaining_raw = prog.get("printTimeLeft")
    remaining = int(remaining_raw) if remaining_raw is not None else None

    job_file = job_data.get("job", {}).get("file", {})
    filename = job_file.get("name") or None

    # DisplayLayerProgress-Plugin (optional) für Layer-Tracking
    layer: Optional[int] = None
    layer_count: Optional[int] = None
    try:
        req3 = urllib.request.Request(
            f"{base}/api/plugin/DisplayLayerProgress",
            headers=headers
        )
        with urllib.request.urlopen(req3, timeout=2) as resp3:
            dlp = json.loads(resp3.read())
        raw_layer = dlp.get("currentLayer") or dlp.get("current_layer")
        raw_total = dlp.get("layerCount") or dlp.get("layer_count")
        if raw_layer is not None:
            layer = int(raw_layer)
        if raw_total is not None:
            layer_count = int(raw_total)
    except Exception:
        pass  # Plugin nicht installiert — kein Problem

    return {
        "id": pid,
        "name": cfg["name"],
        "online": True,
        "state": state,
        "filename": filename,
        "progress": round(completion, 4),
        "elapsed_seconds": elapsed,
        "remaining_seconds": remaining,
        "temp_hotend": round(float(tool.get("actual", 0)), 1),
        "temp_hotend_target": round(float(tool.get("target", 0)), 1),
        "temp_bed": round(float(bed.get("actual", 0)), 1),
        "temp_bed_target": round(float(bed.get("target", 0)), 1),
        "webcam_path": cfg.get("webcam_path"),
        "layer": layer,
        "layer_count": layer_count,
        "z_pos": 0.0,
        "filament_used_mm": 0.0,
        "estimated_end_time": None,
        "filament_type": None,
    }


# ── Steuerbefehle (Moonraker + OctoPrint) ─────────────────────────────────────

_MOONRAKER_CONTROL_ENDPOINTS = {
    "pause":          "/printer/print/pause",
    "resume":         "/printer/print/resume",
    "cancel":         "/printer/print/cancel",
    "emergency_stop": "/printer/emergency_stop",
}


def send_printer_command(printer_id: str, action: str) -> bool:
    """Sendet Steuerbefehl an Drucker (Moonraker oder OctoPrint). Gibt True bei Erfolg zurück."""
    cfg = PRINTERS.get(printer_id)
    if not cfg:
        return False

    _cache.pop(printer_id, None)

    if cfg["api"] == "moonraker":
        endpoint = _MOONRAKER_CONTROL_ENDPOINTS.get(action)
        if not endpoint:
            return False
        try:
            req = urllib.request.Request(
                cfg["url"] + endpoint,
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
            return True
        except Exception:
            return False

    elif cfg["api"] == "octoprint":
        api_key = cfg.get("api_key", "")
        if not api_key:
            return False
        base = cfg["url"]
        headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
        try:
            if action == "pause":
                body = json.dumps({"command": "pause", "action": "pause"}).encode()
                url = f"{base}/api/job"
            elif action == "resume":
                body = json.dumps({"command": "pause", "action": "resume"}).encode()
                url = f"{base}/api/job"
            elif action == "cancel":
                body = json.dumps({"command": "cancel"}).encode()
                url = f"{base}/api/job"
            elif action == "emergency_stop":
                body = json.dumps({"command": "cancel"}).encode()
                url = f"{base}/api/job"
            else:
                return False
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=5):
                pass
            return True
        except Exception:
            return False

    return False


# Rückwärtskompatibilität
def send_moonraker_command(printer_id: str, action: str) -> bool:
    return send_printer_command(printer_id, action)


# ── Druck starten (Moonraker + OctoPrint) ─────────────────────────────────────

def upload_and_start_print(printer_id: str, filepath: str, filename: str) -> bool:
    """G-Code-Datei an Drucker übertragen und Druck starten."""
    cfg = PRINTERS.get(printer_id)
    if not cfg:
        return False

    if cfg["api"] == "moonraker":
        return _moonraker_upload_and_start(cfg, filepath, filename)
    elif cfg["api"] == "octoprint":
        return _octoprint_upload_and_start(cfg, filepath, filename)
    return False


def _moonraker_upload_and_start(cfg: dict, filepath: str, filename: str) -> bool:
    """Moonraker: POST /server/files/upload → POST /printer/print/start"""
    base = cfg["url"]
    boundary = "----FormBoundary" + secrets.token_hex(8)

    try:
        with open(filepath, "rb") as f:
            file_data = f.read()

        header = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="root"\r\n\r\ngcodes\r\n'
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: text/plain\r\n\r\n"
        ).encode()
        footer = f"\r\n--{boundary}--\r\n".encode()
        body = header + file_data + footer

        req = urllib.request.Request(
            f"{base}/server/files/upload",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60):
            pass

        # Druck starten
        req2 = urllib.request.Request(
            f"{base}/printer/print/start",
            data=json.dumps({"filename": filename}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req2, timeout=10):
            pass

        return True
    except Exception:
        return False


def _octoprint_upload_and_start(cfg: dict, filepath: str, filename: str) -> bool:
    """OctoPrint: POST /api/files/local → POST /api/files/local/<filename> select+print"""
    api_key = cfg.get("api_key", "")
    if not api_key:
        return False
    base = cfg["url"]
    boundary = "----FormBoundary" + secrets.token_hex(8)

    try:
        with open(filepath, "rb") as f:
            file_data = f.read()

        header = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        footer = f"\r\n--{boundary}--\r\n".encode()
        body = header + file_data + footer

        req = urllib.request.Request(
            f"{base}/api/files/local",
            data=body,
            headers={
                "X-Api-Key": api_key,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60):
            pass

        # Druck direkt starten (select + print)
        req2 = urllib.request.Request(
            f"{base}/api/files/local/{filename}",
            data=json.dumps({"command": "select", "print": True}).encode(),
            headers={
                "X-Api-Key": api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req2, timeout=10):
            pass

        return True
    except Exception:
        return False


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _offline_status(pid: str, cfg: dict) -> dict:
    return {
        "id": pid,
        "name": cfg["name"],
        "online": False,
        "state": "offline",
        "filename": None,
        "progress": 0.0,
        "elapsed_seconds": 0,
        "remaining_seconds": None,
        "temp_hotend": 0.0,
        "temp_hotend_target": 0.0,
        "temp_bed": 0.0,
        "temp_bed_target": 0.0,
        "webcam_path": cfg.get("webcam_path"),
        "layer": None,
        "layer_count": None,
        "z_pos": 0.0,
        "filament_used_mm": 0.0,
        "estimated_end_time": None,
        "filament_type": None,
    }
