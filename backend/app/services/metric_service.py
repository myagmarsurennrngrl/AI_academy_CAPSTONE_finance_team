"""Deterministic financial KPI and time-series calculations (spec section 9, 11).

All numbers here are computed with full precision; rounding only happens at
the presentation layer (frontend / formatting.py helpers).
"""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from app.models.schemas import KpiSummary, TimeAnalysis, TimeSeriesPoint
from app.utils.derive import derive_core_fields
from app.utils.formatting import safe_div

LOW_STOCK_QUANTILE = 0.2


def compute_kpis(df: pd.DataFrame) -> KpiSummary:
    d = derive_core_fields(df)

    gross_sales = float(d["gross_sales"].sum())
    net_sales = float(d["net_sales_derived"].sum())
    units_sold = float(d["qty"].sum()) if "qty" in d.columns else 0.0
    net_units = float(d["net_qty"].sum())
    cogs = float(d["cogs"].sum())
    gross_profit = float(d["gross_profit"].sum())

    avg_selling_price = safe_div(gross_sales, units_sold)
    avg_net_selling_price = safe_div(net_sales, net_units)
    gross_margin_pct = safe_div(gross_profit, net_sales)

    total_discount = float(d["discount_amt"].sum())
    total_promotion = float(d["promotion_amt"].sum())
    refund_amount = float(d["refund_amt"].sum())

    avg_discount_pct = (
        float(pd.to_numeric(d["discount_pct"], errors="coerce").mean())
        if "discount_pct" in d.columns
        else safe_div(total_discount, gross_sales)
    )
    avg_promotion_pct = (
        float(pd.to_numeric(d["promotion_pct"], errors="coerce").mean())
        if "promotion_pct" in d.columns
        else safe_div(total_promotion, gross_sales)
    )
    if pd.isna(avg_discount_pct):
        avg_discount_pct = 0.0
    if pd.isna(avg_promotion_pct):
        avg_promotion_pct = 0.0

    discount_to_gross_pct = safe_div(total_discount, gross_sales)
    promotion_to_gross_pct = safe_div(total_promotion, gross_sales)

    returned_units = float(d["return_qty"].sum()) if "return_qty" in d.columns else 0.0
    return_rate_pct = safe_div(returned_units, units_sold)

    avg_stock = (
        float(pd.to_numeric(d["stock_available"], errors="coerce").mean())
        if "stock_available" in d.columns
        else 0.0
    )
    if pd.isna(avg_stock):
        avg_stock = 0.0

    low_stock_count = 0
    stockout_count = 0
    if "stock_available" in d.columns:
        stock = pd.to_numeric(d["stock_available"], errors="coerce")
        stockout_count = int((stock <= 0).sum())
        threshold = stock[stock > 0].quantile(LOW_STOCK_QUANTILE) if (stock > 0).any() else 0
        low_stock_count = int(((stock > 0) & (stock <= threshold)).sum())

    volume_units = float(d["volume_units"].sum()) if "volume_units" in d.columns else net_units
    sell_out_units = float(d["sell_out_units"].sum()) if "sell_out_units" in d.columns else net_units
    sell_in_units = float(d["sell_in_units"].sum()) if "sell_in_units" in d.columns else 0.0
    shipment_rows = int(d["is_shipment"].sum()) if "is_shipment" in d.columns else 0
    pos_rows = int(len(d) - shipment_rows)

    return KpiSummary(
        gross_sales=gross_sales,
        net_sales=net_sales,
        units_sold=units_sold,
        net_units=net_units,
        avg_selling_price=avg_selling_price,
        avg_net_selling_price=avg_net_selling_price,
        cogs=cogs,
        gross_profit=gross_profit,
        gross_margin_pct=gross_margin_pct,
        total_discount=total_discount,
        avg_discount_pct=float(avg_discount_pct),
        discount_to_gross_sales_pct=discount_to_gross_pct,
        total_promotion=total_promotion,
        avg_promotion_pct=float(avg_promotion_pct),
        promotion_to_gross_sales_pct=promotion_to_gross_pct,
        returned_units=returned_units,
        return_rate_pct=return_rate_pct,
        refund_amount=refund_amount,
        avg_stock_available=avg_stock,
        low_stock_sku_count=low_stock_count,
        stockout_observations=stockout_count,
        volume_units=volume_units,
        sell_out_units=sell_out_units,
        sell_in_units=sell_in_units,
        pos_row_count=pos_rows,
        shipment_row_count=shipment_rows,
    )


def _aggregate_by_period(d: pd.DataFrame, freq: str) -> List[TimeSeriesPoint]:
    if "date" not in d.columns:
        return []
    dated = d.dropna(subset=["date"]).copy()
    if dated.empty:
        return []
    dated["period"] = dated["date"].dt.to_period(freq)
    grouped = dated.groupby("period").agg(
        net_sales=("net_sales_derived", "sum"),
        gross_sales=("gross_sales", "sum"),
        net_qty=("net_qty", "sum"),
        gross_profit=("gross_profit", "sum"),
    )
    points = []
    for period, row in grouped.iterrows():
        points.append(
            TimeSeriesPoint(
                period=str(period.start_time.date()) if freq != "D" else str(period),
                net_sales=float(row["net_sales"]),
                gross_sales=float(row["gross_sales"]),
                net_qty=float(row["net_qty"]),
                gross_profit=float(row["gross_profit"]),
            )
        )
    return points


def compute_time_analysis(df: pd.DataFrame) -> TimeAnalysis:
    d = derive_core_fields(df)
    if "date" in d.columns:
        d["date"] = pd.to_datetime(d["date"], errors="coerce")

    date_min = date_max = None
    span_days = 0
    if "date" in d.columns:
        valid = d["date"].dropna()
        if not valid.empty:
            date_min = valid.min().date().isoformat()
            date_max = valid.max().date().isoformat()
            span_days = (valid.max() - valid.min()).days

    daily = _aggregate_by_period(d, "D")
    weekly = _aggregate_by_period(d, "W")
    monthly = _aggregate_by_period(d, "M")

    short_history_warning = None
    strong_trend_reliable = span_days >= 90
    if span_days < 30:
        short_history_warning = (
            "Хугацааны түүх богино тул trend болон driver analysis-ийг болгоомжтой тайлбарлана уу."
        )

    return TimeAnalysis(
        date_min=date_min,
        date_max=date_max,
        date_span_days=int(span_days),
        daily=daily,
        weekly=weekly,
        monthly=monthly,
        short_history_warning=short_history_warning,
        strong_trend_reliable=strong_trend_reliable,
    )
