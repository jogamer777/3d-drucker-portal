"""
Kostenmodell für 3D-Drucke.
Kosten werden beim Druckstart basierend auf G-Code-Metadaten berechnet.
"""

# Tarife (anpassbar)
RATE_PER_HOUR_CENTS = 20    # 0,20 € pro Stunde
RATE_PER_GRAM_CENTS = 5     # 0,05 € pro Gramm Filament
MINIMUM_CENTS = 0           # Mindestgebühr


def calculate_cost(duration_seconds: int | None, filament_grams: float) -> int:
    """Berechnet Druckkosten in Cent.
    Gibt 0 zurück falls keine Metadaten vorhanden.
    """
    cost = 0
    if duration_seconds and duration_seconds > 0:
        cost += int((duration_seconds / 3600) * RATE_PER_HOUR_CENTS)
    if filament_grams > 0:
        cost += int(filament_grams * RATE_PER_GRAM_CENTS)
    return max(cost, MINIMUM_CENTS)
