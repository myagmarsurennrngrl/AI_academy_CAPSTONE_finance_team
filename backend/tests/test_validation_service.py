import pandas as pd

from app.services.validation_service import validate_and_clean


def _base_df():
    return pd.DataFrame(
        {
            "date": ["2026-01-01", "2026-01-02", "2026-01-03"],
            "brand": ["A", "A", "B"],
            "product": ["P1", "P1", "P2"],
            "qty": [10, "20", 5],
            "sale_price": [100, 100, 200],
            "sale_cost": [60, 60, 120],
            "return_qty": [1, 0, 0],
            "net_qty": [9, 20, 5],
            "discount_pct": [0.1, 0.0, 0.05],
        }
    )


def test_converts_numeric_looking_strings():
    df = _base_df()
    clean, report = validate_and_clean(df, raw_row_count=len(df))
    assert clean["qty"].tolist() == [10.0, 20.0, 5.0]
    assert any("Converted numeric-looking text" in c.action for c in report.auto_corrections)


def test_flags_malformed_numeric_field():
    df = _base_df()
    df.loc[0, "qty"] = "not_a_number"
    clean, report = validate_and_clean(df, raw_row_count=len(df))
    assert clean["qty"].isna().sum() == 1
    assert any(i.field == "qty" and i.severity == "warning" for i in report.issues)


def test_detects_duplicate_rows():
    df = _base_df()
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)
    clean, report = validate_and_clean(df, raw_row_count=len(df))
    assert report.duplicate_rows == 1


def test_flags_return_qty_exceeding_qty():
    df = _base_df()
    df.loc[0, "return_qty"] = 999
    _, report = validate_and_clean(df, raw_row_count=len(df))
    assert any(i.field == "return_qty" for i in report.issues)


def test_normalizes_percentage_point_scale():
    df = _base_df()
    df["discount_pct"] = [10.0, 0.0, 5.0]  # stored as percentage points, not ratio
    clean, _ = validate_and_clean(df, raw_row_count=len(df))
    assert clean["discount_pct"].max() <= 1.0


def test_parses_dates_and_reports_range():
    df = _base_df()
    clean, report = validate_and_clean(df, raw_row_count=len(df))
    assert report.date_min == "2026-01-01"
    assert report.date_max == "2026-01-03"
