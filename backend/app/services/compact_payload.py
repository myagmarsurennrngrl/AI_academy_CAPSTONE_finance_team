"""Builds the compact structured JSON sent to Claude (spec section 21).

Never sends raw row-level data - only aggregated, Top-N-limited metrics that
were already computed deterministically by the other services. When the user
has filtered the dashboard, ``analysis_scope`` tells the model exactly which
slice the numbers describe so its narrative names that scope.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.models.schemas import FilterSpec, FullAnalysisBundle


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
        "kpis": bundle.kpis.model_dump(),
        "time_analysis": {
            "date_span_days": bundle.time_analysis.date_span_days,
            "strong_trend_reliable": bundle.time_analysis.strong_trend_reliable,
            "short_history_warning": bundle.time_analysis.short_history_warning,
            "monthly": [m.model_dump() for m in bundle.time_analysis.monthly[-24:]],
        },
        "driver_ranking": [d.model_dump() for d in bundle.driver_ranking[:15]],
        "brand_analysis": [g.model_dump() for g in bundle.brand_analysis[:10]],
        "product_analysis": [g.model_dump() for g in bundle.product_analysis[:10]],
        "channel_analysis": [g.model_dump() for g in bundle.channel_analysis[:10]],
        "channel_type_analysis": [g.model_dump() for g in bundle.channel_type_analysis[:10]],
        "sales_type_analysis": [g.model_dump() for g in bundle.sales_type_analysis[:10]],
        "discount_analysis": [b.model_dump() for b in bundle.discount_analysis],
        "promotion_analysis": [p.model_dump() for p in bundle.promotion_analysis],
        "return_analysis": [r.model_dump() for r in bundle.return_analysis[:15]],
        "inventory_analysis": [i.model_dump() for i in bundle.inventory_analysis[:15]],
        "statistical_model": {
            **bundle.statistical_model.model_dump(),
            "coefficients": bundle.statistical_model.coefficients[:15],
            "permutation_importance": bundle.statistical_model.permutation_importance[:15],
        },
        "limitations": bundle.limitations,
    }
    return payload
