"""Builds the compact structured JSON sent to Claude (spec section 21).

Never sends raw row-level data - only aggregated, Top-N-limited metrics that
were already computed deterministically by the other services. When the user
has filtered the dashboard, ``analysis_scope`` tells the model exactly which
slice the numbers describe so its narrative names that scope.

Numbers are *presented* for a management reader before they leave Python:
ratios stored as 0..1 fractions (every ``*_pct`` field) are converted to
percentage points with one decimal, currency / unit figures are rounded to
whole numbers, and statistical coefficients keep a few decimals. Claude is
instructed to quote figures exactly as given, so this is the single place
that decides how numbers look in the narrative.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Optional

from app.models.schemas import FilterSpec, FullAnalysisBundle

# Keys whose values are 0..1 fractions -> shown as percentage points (0..100).
_PCT_SUFFIX = "_pct"
# Statistical coefficients that need a few decimals to stay meaningful.
_COEFFICIENT_KEYS = {"pearson", "spearman", "r2", "standardized_coefficient", "importance_mean", "importance_std"}
# Scores that are already on a 0..100 scale.
_SCORE_KEYS = {"importance_score"}

NUMBER_FORMAT_NOTE = (
    "Every field ending in _pct is a percentage in percentage points (0-100 scale, one decimal), "
    "e.g. gross_margin_pct 31.9 means 31.9%. Currency (MNT) and unit quantities are whole numbers. "
    "Quote figures exactly as given: write percentages with one decimal and a % sign, and write "
    "currency / unit figures with thousands separators (e.g. 122,606,717). Never output raw "
    "fractions such as 0.3188 or trailing '.0' decimals."
)


def present_number(key: str, value: Any) -> Any:
    """Formats one numeric leaf value for the AI payload according to its key."""
    if isinstance(value, bool) or value is None or not isinstance(value, (int, float)):
        return value
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if key.endswith(_PCT_SUFFIX):
        return round(float(value) * 100.0, 1)
    if key in _COEFFICIENT_KEYS:
        return round(float(value), 3)
    if key in _SCORE_KEYS:
        return round(float(value), 1)
    if isinstance(value, int):
        return value
    if abs(value) >= 100:
        return int(round(value))
    return round(float(value), 2)


def present_numbers(obj: Any, key: str = "") -> Any:
    """Recursively applies :func:`present_number` to every numeric leaf. List
    items inherit the key of the list they sit in."""
    if isinstance(obj, dict):
        return {k: present_numbers(v, k) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [present_numbers(v, key) for v in obj]
    return present_number(key, obj)


def build_compact_analysis_payload(
    bundle: FullAnalysisBundle,
    scope: Optional[FilterSpec] = None,
    scope_label: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "analysis_scope": {
            "filters_applied": bool(scope and not scope.is_empty()),
            "filters": scope.model_dump() if scope else FilterSpec().model_dump(),
            "description": scope_label or "Full dataset (no filters)",
            "row_count": bundle.dataset_profile.rows,
            "volume_definition": (
                "sell_out_units = POS units sold net of returns; sell_in_units = net shipment "
                "(shipment_qty - return_qty) for SHIPMENT rows. These are different business "
                "concepts and must be discussed separately, never summed into one figure."
            ),
            "number_format": NUMBER_FORMAT_NOTE,
        },
        "dataset_profile": {
            "rows": bundle.dataset_profile.rows,
            "date_min": bundle.dataset_profile.date_min,
            "date_max": bundle.dataset_profile.date_max,
            "date_span_days": bundle.dataset_profile.date_span_days,
            "brands": bundle.dataset_profile.brands,
            "products": bundle.dataset_profile.products,
            "channels": bundle.dataset_profile.channels,
        },
        "data_quality": {
            "total_rows": bundle.data_quality.total_rows,
            "valid_rows": bundle.data_quality.valid_rows,
            "duplicate_rows": bundle.data_quality.duplicate_rows,
            "missing_value_count": bundle.data_quality.missing_value_count,
            "warnings": bundle.data_quality.warnings[:10],
        },
        "kpis": present_numbers(bundle.kpis.model_dump()),
        "time_analysis": {
            "date_span_days": bundle.time_analysis.date_span_days,
            "strong_trend_reliable": bundle.time_analysis.strong_trend_reliable,
            "short_history_warning": bundle.time_analysis.short_history_warning,
            "monthly": present_numbers([m.model_dump() for m in bundle.time_analysis.monthly[-24:]]),
        },
        "driver_ranking": present_numbers([d.model_dump() for d in bundle.driver_ranking[:15]]),
        "brand_analysis": present_numbers([g.model_dump() for g in bundle.brand_analysis[:10]]),
        "product_analysis": present_numbers([g.model_dump() for g in bundle.product_analysis[:10]]),
        "channel_analysis": present_numbers([g.model_dump() for g in bundle.channel_analysis[:10]]),
        "channel_type_analysis": present_numbers([g.model_dump() for g in bundle.channel_type_analysis[:10]]),
        "sales_type_analysis": present_numbers([g.model_dump() for g in bundle.sales_type_analysis[:10]]),
        "discount_analysis": present_numbers([b.model_dump() for b in bundle.discount_analysis]),
        "promotion_analysis": present_numbers([p.model_dump() for p in bundle.promotion_analysis]),
        "return_analysis": present_numbers([r.model_dump() for r in bundle.return_analysis[:15]]),
        "inventory_analysis": present_numbers([i.model_dump() for i in bundle.inventory_analysis[:15]]),
        "statistical_model": present_numbers(
            {
                **bundle.statistical_model.model_dump(),
                "coefficients": bundle.statistical_model.coefficients[:15],
                "permutation_importance": bundle.statistical_model.permutation_importance[:15],
            }
        ),
        "limitations": bundle.limitations,
    }
    return payload
