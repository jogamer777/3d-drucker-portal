"""
Drucker-Client für 3D-Drucker-Portal.
Unterstützt: Moonraker (K2 Plus Combo), OctoPrint (CR-X Pro).
Reines Python stdlib – kein pip nötig.
"""
import json
import time
import urllib.request
import urllib.error
from typing import Optional

# ── Drucker-Konfiguration ──────────────────────────────────────────────────────

PRINTERS: dict[str, dict] = {
    "k2": {
        "name": "K2 Plus Combo",
        "api": "moonraker",
        "url": "http://172.17.130.88:4408",
        "webcam_path": "/printers/k2/webcam",   # nginx-proxy Pfad
    },
    "crx": {
        "name": "CR-X Pro",
        "api": "octoprint",
        "url": "http://127.0.0.1:5000",
        "api_key": "",          # nach OctoPrint-Setup hier eintragen
        "webcam_path": None,
    },
}

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

    progress_raw = s.get("display_status", {}).get("progress") or \
                   s.get("virtual_sdcard", {}).get("progress", 0.0)
    progress = float(progress_raw)

    print_duration = float(ps.get("print_duration", 0))
    remaining: Optional[int] = None
    if state in ("printing", "paused") and progress > 0.01:
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
        # Printer state + temps
        req = urllib.request.Request(f"{base}/api/printer", headers=headers)
        with urllib.request.urlopen(req, timeout=3) as resp:
            printer_data = json.loads(resp.read())

        # Job info
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
    }


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
    }
