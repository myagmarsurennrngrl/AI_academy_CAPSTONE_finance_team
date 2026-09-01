import pandas as pd

from app.services.metric_service import compute_kpis, compute_time_analysis


def _df():
    return pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]),
            "brand": ["A", "A", "B", "B"],
            "product": ["P1", "P1", "P2", "P2"],
            "qty": [10, 20, 5, 5],
            "sale_price": [100.0, 100.0, 200.0, 200.0],
            "sale_cost": [60.0, 60.0, 120.0, 120.0],
            "return_qty": [1, 0, 0, 1],
            "net_qty": [9, 20, 5, 4],
            "stock_available": [50, 50, 5, 5],
        }
    )


def test_gross_profit_and_margin():
    kpis = compute_kpis(_df())
    # gross_sales = 10*100+20*100+5*200+5*200 = 5000
    assert kpis.gross_sales == 5000.0
    # no discount/promotion columns, but returned units are refunded at sale_price:
    # refund = 1*100 (brand A row1) + 1*200 (brand B row4) = 300 -> net_sales = 5000-300 = 4700
    assert kpis.net_sales == 4700.0
    cogs = 60 * 9 + 60 * 20 + 120 * 5 + 120 * 4
    assert kpis.cogs == cogs
    assert kpis.gross_profit == kpis.net_sales - cogs
    assert round(kpis.gross_margin_pct, 6) == round((kpis.net_sales - cogs) / kpis.net_sales, 6)


def test_return_rate_pct():
    kpis = compute_kpis(_df())
    # returned units = 1+0+0+1 = 2, units_sold = 10+20+5+5 = 40
    assert kpis.returned_units == 2.0
    assert round(kpis.return_rate_pct, 6) == round(2 / 40, 6)


def test_kpis_handle_zero_denominator_safely():
    df = _df()
    df["qty"] = 0
    df["sale_price"] = 0
    df["net_qty"] = 0
    kpis = compute_kpis(df)
    assert kpis.avg_selling_price == 0.0
    assert kpis.gross_margin_pct == 0.0


def test_time_analysis_short_history_warning():
    ta = compute_time_analysis(_df())
    assert ta.date_span_days == 3
    assert ta.short_history_warning is not None
    assert ta.strong_trend_reliable is False
