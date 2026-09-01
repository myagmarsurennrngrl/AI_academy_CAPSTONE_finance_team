from app.utils.column_mapping import build_column_mapping, missing_required_fields, normalize_column_name


def test_normalizes_common_aliases():
    assert normalize_column_name("Discount ") == "discount"
    assert normalize_column_name("Total Sales") == "total_sales"
    assert normalize_column_name("Net sales") == "net_sales"
    assert normalize_column_name("Refund %") == "refund_amount"


def test_lowercases_trims_and_collapses_separators():
    assert normalize_column_name("  Sale   Price  ") == "sale_price"
    assert normalize_column_name("sales__channel") == "sales_channel"


def test_build_column_mapping_maps_all_headers():
    headers = ["date", "brand", "product", "Total Sales", "Discount ", "Refund %", "Net sales"]
    mapping, unmapped = build_column_mapping(headers)
    assert mapping["Total Sales"] == "total_sales"
    assert mapping["Discount "] == "discount"
    assert mapping["Refund %"] == "refund_amount"
    assert mapping["Net sales"] == "net_sales"
    assert unmapped == []


def test_unknown_columns_are_kept_but_flagged():
    headers = ["date", "Some Weird Column"]
    mapping, unmapped = build_column_mapping(headers)
    assert mapping["Some Weird Column"] == "some_weird_column"
    assert "some_weird_column" in unmapped


def test_missing_required_fields_detects_gaps():
    available = ["date", "brand", "product"]
    missing = missing_required_fields(available)
    assert "qty" in missing
    assert "sale_price" in missing
    assert "date" not in missing
