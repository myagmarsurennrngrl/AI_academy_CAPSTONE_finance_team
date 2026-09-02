"""Driver statistics must always be JSON-serialisable (no NaN / inf), even for
degenerate datasets, and the payload sent to Claude must present numbers in a
management-friendly form (percentages in points, whole currency units)."""
import json

import numpy as np
import pandas as pd
import pytest

from app.models.schemas import DatasetProfile, DataQualityReport, FilterSpec
from app.services import analysis_pipeline, compact_payload, dataset_service, driver_service
from app.utils.formatting import finite, finite_or_none, sanitize_numbers


def _frame(n=120, seed=0, **overrides) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=n, freq="D"),
            "brand": rng.choice(["A", "B"], n),
            "product": rng.choice(["P1", "P2", "P3"], n),
            "sales_channel": rng.choice(["Retail", "Online"], n),
            "channel_type": rng.choice(["Direct", "Partner"], n),
            "sales_type": rng.choice(["POS", "SHIPMENT"], n),
            "qty": rng.integers(1, 20, n).astype(float),
            "sale_price": rng.uniform(1000, 5000, n),
            "sale_cost": rng.uniform(500, 900, n),
            "return_qty": rng.integers(0, 2, n).astype(float),
            "discount_pct": rng.uniform(0, 0.2, n),
            "promotion_pct": rng.uniform(0, 0.1, n),
            "stock_available": rng.uniform(10, 500, n),
            "shipment_qty": rng.integers(5, 30, n).astype(float),
        }
    )
    for k, v in overrides.items():
        df[k] = v
    frame, _ = dataset_service.prepare_analytics_frame(df)
    return frame


def _assert_json_safe(response):
    payload = response.model_dump()
    json.dumps(payload, allow_nan=False)  # raises ValueError on NaN / inf
    assert all(0 <= d.importance_score <= 100 for d in response.driver_ranking)


def test_formatting_helpers():
    assert finite(float("nan")) == 0.0
    assert finite(float("inf"), default=-1.0) == -1.0
    assert finite("abc") == 0.0
    assert finite(np.float64(2.5)) == 2.5
    assert finite_or_none(float("nan")) is None
    assert finite_or_none(None) is None
    assert finite_or_none(3) == 3.0
    cleaned = sanitize_numbers({"a": float("nan"), "b": [1.0, float("inf"), {"c": np.float64("nan")}], "d": "x", "e": 2})
    assert cleaned == {"a": None, "b": [1.0, None, {"c": None}], "d": "x", "e": 2}


@pytest.mark.parametrize(
    "overrides",
    [
        {},  # healthy baseline
        {"stock_available": np.nan},  # a numeric driver entirely missing
        {"discount_pct": 0.0, "promotion_pct": 0.0},  # constant drivers (zero variance)
        {"qty": 3.0, "return_qty": 0.0, "shipment_qty": 3.0},  # constant target
        {"sale_price": np.inf},  # infinite values in a feature
        {"sale_cost": 0.0, "sale_price": 0.0},  # zero revenue everywhere -> division hazards
    ],
    ids=["baseline", "all-nan-feature", "constant-drivers", "constant-target", "inf-feature", "zero-revenue"],
)
def test_driver_analysis_is_json_safe_for_degenerate_data(overrides):
    frame = _frame(**overrides)
    response = analysis_pipeline.run_driver_analysis(frame, FilterSpec())
    _assert_json_safe(response)


def test_driver_analysis_json_safe_on_tiny_slice():
    frame = _frame(n=12)
    response = analysis_pipeline.run_driver_analysis(frame, FilterSpec())
    _assert_json_safe(response)
    assert response.statistical_model.model_status == "insufficient_data"


def test_return_rate_with_zero_qty_groups_is_finite():
    frame = _frame(qty=0.0, return_qty=1.0)
    d = driver_service.prepare_derived_frame(frame)
    rows = driver_service.compute_return_risk(d)
    json.dumps([r.model_dump() for r in rows], allow_nan=False)


def test_compact_payload_presents_percentages_and_whole_units():
    frame = _frame()
    profile = DatasetProfile(rows=len(frame), columns=14, brands=2, products=3, channels=2, column_mapping={})
    quality = DataQualityReport(total_rows=len(frame), valid_rows=len(frame), invalid_rows=0, duplicate_rows=0, missing_value_count=0)
    bundle = analysis_pipeline.build_bundle_from_frame(frame, profile, quality)
    payload = compact_payload.build_compact_analysis_payload(bundle, FilterSpec(), "Full dataset")

    json.dumps(payload, allow_nan=False)
    kpis = payload["kpis"]
    # ratios become percentage points with one decimal
    assert kpis["gross_margin_pct"] == round(bundle.kpis.gross_margin_pct * 100, 1)
    assert 0 <= kpis["gross_margin_pct"] <= 100
    # currency / unit figures are whole numbers
    assert isinstance(kpis["net_sales"], int)
    assert isinstance(kpis["units_sold"], int)
    assert kpis["net_sales"] == int(round(bundle.kpis.net_sales))
    # group rows follow the same rules
    row = payload["brand_analysis"][0]
    assert isinstance(row["net_sales"], int)
    assert row["share_of_sales_pct"] == round(bundle.brand_analysis[0].share_of_sales_pct * 100, 1)
    # coefficients keep a few decimals, correlations too
    corr = next(c for c in payload["statistical_model"]["coefficients"])
    assert corr["standardized_coefficient"] == round(corr["standardized_coefficient"], 3)
    assert "number_format" in payload["analysis_scope"]


def test_present_number_rules():
    assert compact_payload.present_number("gross_margin_pct", 0.31877) == 31.9
    assert compact_payload.present_number("net_sales", 122606717.0) == 122606717
    assert compact_payload.present_number("avg_selling_price", 3246.0563) == 3246
    assert compact_payload.present_number("small_value", 12.3456) == 12.35
    assert compact_payload.present_number("pearson", -0.12345) == -0.123
    assert compact_payload.present_number("importance_score", 87.456) == 87.5
    assert compact_payload.present_number("rows", 2768) == 2768
    assert compact_payload.present_number("label", "text") == "text"
    assert compact_payload.present_number("x", float("nan")) is None
    assert compact_payload.present_number("flag", True) is True
