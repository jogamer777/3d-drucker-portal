"""
G-Code Parser für 3D-Drucker-Portal.
Unterstützt: Orca Slicer, PrusaSlicer, Cura.
Kein pip-Paket nötig – reines Python stdlib.
"""
import re
import json
import base64
from typing import Optional


def _parse_duration(text: str) -> Optional[int]:
    """Parst Zeitangaben wie '1h 23m 45s' oder '1h23m45s' in Sekunden."""
    total = 0
    for val, unit in re.findall(r'(\d+)\s*([hHmMsS])', text):
        v = int(val)
        u = unit.lower()
        if u == 'h':
            total += v * 3600
        elif u == 'm':
            total += v * 60
        elif u == 's':
            total += v
    return total if total > 0 else None


def parse_gcode(filepath: str) -> dict:
    """
    Liest G-Code-Datei und extrahiert:
    - duration_seconds
    - filament_usage: {"T0": g, "T1": g, ..., "flush": g}
    - thumbnail_b64: "data:image/png;base64,..." oder None
    - profile_signature: str oder None
    """
    duration_seconds: Optional[int] = None
    filament_usage: dict = {}
    thumbnail_b64: Optional[str] = None
    profile_signature: Optional[str] = None

    # Thumbnail-Zustand
    in_thumbnail = False
    thumb_lines: list[str] = []
    best_thumb_size = 0

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.rstrip('\n')

                # Nur Kommentarzeilen auswerten
                if not line.startswith(';'):
                    # Thumbnail-Inhalt (jede Zeile beginnt mit '; ')
                    if in_thumbnail and line.startswith('; '):
                        thumb_lines.append(line[2:])
                    continue

                stripped = line[1:].strip()

                # ── Profil-Signatur ──────────────────────────────────────
                if stripped.startswith('SCHULPORTAL_PROFILE='):
                    profile_signature = stripped.split('=', 1)[1].strip()

                # ── Druckdauer ───────────────────────────────────────────
                # Cura: ; TIME:12345
                m = re.match(r'TIME:(\d+)', stripped)
                if m and duration_seconds is None:
                    duration_seconds = int(m.group(1))

                # Orca / PrusaSlicer: ; estimated printing time = 1h 23m 45s
                m = re.match(r'estimated printing time(?:\s*\(.*?\))?\s*=\s*(.+)', stripped, re.I)
                if m and duration_seconds is None:
                    duration_seconds = _parse_duration(m.group(1))

                # Orca: ; total estimated time: 1h 23m 45s
                m = re.match(r'total estimated time[:\s]+(.+)', stripped, re.I)
                if m and duration_seconds is None:
                    duration_seconds = _parse_duration(m.group(1))

                # ── Filamentverbrauch ────────────────────────────────────
                # Orca/Prusa: ; filament used [g] = 45.23, 12.10, 0.00, 8.30
                m = re.match(r'filament used \[g\]\s*=\s*(.+)', stripped, re.I)
                if m:
                    vals = [v.strip() for v in m.group(1).split(',')]
                    for i, v in enumerate(vals):
                        try:
                            g = float(v)
                            if g > 0:
                                filament_usage[f'T{i}'] = round(g, 2)
                        except ValueError:
                            pass

                # Cura: ; Filament used: 1.234m → schätze Gramm (PLA ~1.24 g/cm³, 1.75mm)
                m = re.match(r'Filament used:\s*([\d.]+)m', stripped, re.I)
                if m and not filament_usage:
                    meters = float(m.group(1))
                    # V = π*(0.875mm)²*length_mm, ρ=1.24 g/cm³
                    import math
                    volume_cm3 = math.pi * (0.0875 ** 2) * (meters * 100)
                    filament_usage['T0'] = round(volume_cm3 * 1.24, 2)

                # Flush/Purge: ; total filament used for flushing [g] = 8.10
                m = re.match(r'total filament used for flushing \[g\]\s*=\s*([\d.]+)', stripped, re.I)
                if m:
                    try:
                        filament_usage['flush'] = round(float(m.group(1)), 2)
                    except ValueError:
                        pass

                # ── Thumbnail ────────────────────────────────────────────
                # Orca/Prusa: ; thumbnail begin WxH SIZE
                m = re.match(r'thumbnail begin (\d+)x(\d+)\s+(\d+)', stripped, re.I)
                if m:
                    w, h, size = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    if w * h > best_thumb_size:
                        best_thumb_size = w * h
                        in_thumbnail = True
                        thumb_lines = []

                m = re.match(r'thumbnail end', stripped, re.I)
                if m and in_thumbnail:
                    in_thumbnail = False
                    try:
                        raw = ''.join(thumb_lines)
                        # Validieren
                        base64.b64decode(raw)
                        thumbnail_b64 = f'data:image/png;base64,{raw}'
                    except Exception:
                        pass
                    thumb_lines = []

                # Thumbnail-Inhalt (Zeilen wie '; iVBORw0KGgo...')
                if in_thumbnail:
                    thumb_lines.append(stripped)

    except Exception:
        pass

    return {
        'duration_seconds': duration_seconds,
        'filament_usage': filament_usage if filament_usage else None,
        'thumbnail_b64': thumbnail_b64,
        'profile_signature': profile_signature,
    }
