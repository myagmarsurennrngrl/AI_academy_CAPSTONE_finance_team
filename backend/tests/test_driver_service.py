import numpy as np
import pandas as pd

from app.services.driver_service import (
    compute_correlations,
    compute_discount_bands,
    compute_group_analysis,
    compute_promotion_comparison,
    prepare_derived_frame,
)


def _df(n=60):
    rng = np.random.default_rng(0)
    qty = rng.integers(5, 50, size=n)
    price = rng.uniform(90, 110, size=n)
    return pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=n),
            "brand": rng.choice(["A", "B"], size=n),
            "product": rng.choice(["P1", "P2", "P3"], size=n),
            "sales_channel": rng.choice(["Online", "Retail"], size=n),
            "channel_type": rng.choice(["Online", "Retail"], size=n),
            "sales_type": rng.choice(["POS", "Shipment"], size=n),
            "qty": qty,
            "sale_price": price,
            "sale_cost": price * 0.6,
            "return_qty": (qty * 0.05).astype(int),
            "net_qty": qty - (qty * 0.05).astype(int),
            "stock_available": rng.integers(10, 200, size=n),
            "discount_pct": rng.uniform(0, 0.2, size=n),
            "promotion_pct": rng.choice([0.0, 0.1], size=n),
        }
    )


def test_group_analysis_shares_sum_close_to_one():
    d = prepare_derived_frame(_df())
    rows = compute_group_analysis(d, "brand", top_n=10)
    total_share = sum(r.share_of_sales_pct for r in rows)
    assert 0.99 <= total_share <= 1.01


def test_correlations_return_expected_fields():
    d = prepare_derived_frame(_df())
    correlations = compute_correlations(d)
    fields = {c["field"] for c in correlations}
    assert "qty" in fields
    assert "sale_price" in fields
    for c in correlations:
        assert c["n"] > 0


def test_discount_bands_partition_all_rows():
    d = prepare_derived_frame(_df())
    bands = compute_discount_bands(d)
    total_rows = sum(b.row_count for b in bands)
    assert total_rows == len(d)


def test_promotion_comparison_has_two_groups():
    d = prepare_derived_frame(_df())
    rows = compute_promotion_comparison(d)
    groups = {r.group for r in rows}
    assert groups == {"promoted", "non_promoted"}
