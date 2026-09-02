import pandas as pd

from app.models.schemas import FilterSpec
from app.services import dataset_service, driver_service
from app.utils.derive import derive_core_fields
from app.utils.sales_type import POS, SHIPMENT, normalize_sales_type


def _frame():
    return pd.DataFrame(
        {
            "date": ["2026-01-05", "2026-01-20", "2026-02-03", "not a date", "2026-02-28"],
            "brand": ["A", "A", "B", "B", "B"],
            "product": ["P1", "P2", "P3", "P3", "P3"],
            "sales_channel": ["MUB", "MUB", "Online", "Online", "MUB"],
            "channel_type": ["Retail", "Retail", "Online", "Online", "Retail"],
            "sales_type": ["POS", "Sell-out", "Shipment", "SELL_IN", "shipment"],
            "qty": [10, 20, 5, 5, 8],
            "sale_price": [100.0, 100.0, 200.0, 200.0, 200.0],
            "sale_cost": [60.0, 60.0, 120.0, 120.0, 120.0],
            "shipment_qty": [None, None, 7, 6, 10],
            "return_qty": [1, 0, 1, 0, 2],
            "net_qty": [9, 20, 4, 5, 6],
            "stock_available": [50, 50, 5, 5, 40],
        }
    )


def test_sales_type_vocabulary():
    assert normalize_sales_type("POS") == POS
    assert normalize_sales_type(" Sell-out ") == POS
    assert normalize_sales_type("SELL_IN") == SHIPMENT
    assert normalize_sales_type("shipment") == SHIPMENT
    assert normalize_sales_type("Consignment") == "Consignment"
    assert normalize_sales_type(None) is None


def test_volume_split_uses_net_shipment_for_shipment_rows():
    d = derive_core_fields(_frame())
    assert d["sales_type"].tolist() == [POS, POS, SHIPMENT, SHIPMENT, SHIPMENT]
    # shipment rows: shipment_qty - return_qty; POS rows: net_qty
    assert d.loc[2, "volume_units"] == 7 - 1
    assert d.loc[4, "volume_units"] == 10 - 2
    assert d.loc[0, "volume_units"] == 9
    assert d["sell_out_units"].sum() == 9 + 20
    assert d["sell_in_units"].sum() == 6 + 6 + 8
    # sell-out and sell-in are never mixed into each other
    assert (d.loc[d["is_shipment"], "sell_out_units"] == 0).all()
    assert (d.loc[~d["is_shipment"], "sell_in_units"] == 0).all()


def test_prepare_analytics_frame_excludes_unparseable_dates():
    frame, excluded = dataset_service.prepare_analytics_frame(_frame())
    assert excluded == 1
    assert len(frame) == 4
    assert frame["date"].dt.hour.eq(0).all()


def test_apply_filters_matches_client_semantics():
    frame, _ = dataset_service.prepare_analytics_frame(_frame())
    assert len(dataset_service.apply_filters(frame, FilterSpec())) == 4
    by_brand = dataset_service.apply_filters(frame, FilterSpec(brands=["A"]))
    assert by_brand["brand"].eq("A").all() and len(by_brand) == 2
    # inclusive calendar-day bounds
    in_feb = dataset_service.apply_filters(frame, FilterSpec(date_from="2026-02-03", date_to="2026-02-28"))
    assert len(in_feb) == 2
    combined = dataset_service.apply_filters(
        frame, FilterSpec(brands=["B"], channels=["MUB"], sales_types=[SHIPMENT], date_from="2026-02-01", date_to="2026-02-28")
    )
    assert len(combined) == 1 and combined.iloc[0]["volume_units"] == 8


def test_columns_payload_is_json_safe_and_complete():
    frame, _ = dataset_service.prepare_analytics_frame(_frame())
    columns, fields = dataset_service.build_columns_payload(frame)
    assert {"date", "brand", "sales_type", "volume_units", "sell_out_units", "sell_in_units", "net_sales", "gross_profit"} <= set(fields)
    assert all(len(v) == len(frame) for v in columns.values())
    assert columns["date"][0] == "2026-01-05"
    # NaN must become null, never a float NaN
    assert columns["net_shipment_qty"][0] is None


def test_eta_squared_is_bounded():
    frame, _ = dataset_service.prepare_analytics_frame(_frame())
    d = driver_service.prepare_derived_frame(frame)
    eta = driver_service.compute_eta_squared(d, ["brand", "sales_channel", "sales_type"])
    assert set(eta) >= {"brand", "sales_channel", "sales_type"}
    assert all(0.0 <= v <= 1.0 for v in eta.values())


def test_describe_scope_names_filters():
    frame, _ = dataset_service.prepare_analytics_frame(_frame())
    spec = FilterSpec(brands=["A"], channels=["MUB"])
    text = dataset_service.describe_scope(spec, dataset_service.apply_filters(frame, spec))
    assert "Brand: A" in text and "Sales channel: MUB" in text and "2 rows" in text
