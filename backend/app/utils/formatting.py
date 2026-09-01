"""Presentation-layer number formatting helpers (₮ currency, %, units).

These are used only when preparing human-readable summaries; all internal
calculations keep full float precision and are never pre-rounded.
"""
from __future__ import annotations

import math


def safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Division that never raises and never returns inf/NaN."""
    try:
        if denominator is None or denominator == 0 or math.isnan(denominator):
            return default
        result = numerator / denominator
        if math.isnan(result) or math.isinf(result):
            return default
        return result
    except (TypeError, ZeroDivisionError):
        return default


def format_currency_mnt(value: float) -> str:
    """Formats a value in MNT with M/B suffixes, e.g. ₮36.7M, ₮1.25B."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "₮0"
    sign = "-" if value < 0 else ""
    v = abs(value)
    if v >= 1_000_000_000:
        return f"{sign}₮{v / 1_000_000_000:.2f}B"
    if v >= 1_000_000:
        return f"{sign}₮{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{sign}₮{v / 1_000:.1f}K"
    return f"{sign}₮{v:,.0f}"


def format_percent(value: float, decimals: int = 1) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "0%"
    return f"{value * 100:.{decimals}f}%"


def format_units(value: float) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "0 units"
    return f"{value:,.0f} units"


def round_metrics(d: dict, decimals: int = 4) -> dict:
    """Rounds numeric leaf values in a flat dict for transport, without
    mutating the original."""
    out = {}
    for k, v in d.items():
        if isinstance(v, float):
            out[k] = round(v, decimals) if not math.isnan(v) else 0.0
        else:
            out[k] = v
    return out
