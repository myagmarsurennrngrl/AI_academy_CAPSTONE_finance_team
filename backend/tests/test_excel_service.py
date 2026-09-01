import io

import pandas as pd
import pytest

from app.services.excel_service import ExcelParseError, build_dataset_profile, parse_excel


def _to_xlsx_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


def test_parse_excel_normalizes_headers():
    df = pd.DataFrame(
        {
            "date": ["2026-01-01"],
            "brand": ["A"],
            "product": ["P1"],
            "Total Sales": [1000],
            "Discount ": [10],
            "Refund %": [5],
            "Net sales": [985],
        }
    )
    parsed = parse_excel(_to_xlsx_bytes(df), "test.xlsx")
    assert "total_sales" in parsed.mapped_df.columns
    assert "discount" in parsed.mapped_df.columns
    assert "refund_amount" in parsed.mapped_df.columns
    assert "net_sales" in parsed.mapped_df.columns


def test_missing_required_columns_detected_in_profile():
    df = pd.DataFrame({"date": ["2026-01-01"], "brand": ["A"]})
    parsed = parse_excel(_to_xlsx_bytes(df), "test.xlsx")
    profile = build_dataset_profile(parsed)
    assert "qty" in profile.missing_required_fields
    assert "sale_price" in profile.missing_required_fields


def test_rejects_unsupported_file_extension():
    with pytest.raises(ExcelParseError):
        parse_excel(b"not an excel file", "test.csv")


def test_rejects_empty_file():
    with pytest.raises(ExcelParseError):
        parse_excel(b"", "test.xlsx")


def test_dataset_profile_computes_date_range_and_counts():
    df = pd.DataFrame(
        {
            "date": ["2026-01-01", "2026-01-05"],
            "brand": ["A", "B"],
            "product": ["P1", "P2"],
            "sales_channel": ["Online", "Retail"],
        }
    )
    parsed = parse_excel(_to_xlsx_bytes(df), "test.xlsx")
    profile = build_dataset_profile(parsed)
    assert profile.date_min == "2026-01-01"
    assert profile.date_max == "2026-01-05"
    assert profile.brands == 2
    assert profile.products == 2
    assert profile.channels == 2
