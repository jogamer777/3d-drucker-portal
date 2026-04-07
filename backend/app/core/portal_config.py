"""
Portal-Konfiguration (Registrierung, etc.).
Liest und schreibt portal_config.json.
"""
import json
import os

_CONFIG_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "portal_config.json")
)


def _load() -> dict:
    try:
        with open(_CONFIG_PATH, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save(data: dict) -> None:
    with open(_CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2)


def get_registration_open() -> bool:
    cfg = _load()
    return cfg.get("registration", {}).get("open", True)


def set_registration_open(value: bool) -> None:
    cfg = _load()
    cfg.setdefault("registration", {})["open"] = value
    _save(cfg)
