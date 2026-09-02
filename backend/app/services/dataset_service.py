"""Row-level analytics dataset + the shared filter implementation.

The dashboard receives the cleaned, derived dataset once (columnar JSON) and
performs all KPI / chart aggregation in the browser from ONE filtered slice.
The driver-model and AI-insight endpoints receive the same FilterSpec and
apply it here with identical semantics, so server-side statistics always
describe exactly the rows the user is looking at.
"""
from __future__ import annotations

import hashlib
import json
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from app.models.schemas import DatasetDimensions, FilterSpec
from app.utils.derive import derive_core_fields

UNKNOWN_LABEL = "Unknown"

CATEGORICAL_FIELDS = ["brand", "product", "sales_channel", "channel_type", "sales_type"]

# Numeric columns shipped to the browser (only those present are included).
NUMERIC_EXPORT_FIELDS = [
    "qty",
    "return_qty",
    "net_qty",
    "shipment_qty",
    "net_shipment_qty",
    "volume_units",
    "sell_out_units",
    "sell_in_units",
    "stock_available",
    "sale_price",
    "sale_cost",
    "sale_price_net",
    "discount_pct",
    "promotion_pct",
    "gross_sales",
    "discount_amt",
    "promotion_amt",
    "refund_amt",
    "net_sales",
    "cogs",
    "gross_profit",
]

# Fields that are always derived (present even if the source lacked them).
ALWAYS_PRESENT = {
    "net_qty",
    "volume_units",
    "sell_out_units",
    "sell_in_units",
    "gross_sales",
    "discount_amt",
    "promotion_amt",
    "refund_amt",
    "net_sales",
    "cogs",
    "gross_profit",
}

FILTER_DIMENSION_COLUMNS = (
    ("brands", "brand"),
    ("products", "product"),
    ("channels", "sales_channel"),
    ("channel_types", "channel_type"),
    ("sales_types", "sales_type"),
)


def prepare_analytics_frame(clean_df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Turns the validated frame into the analytics frame every calculation
    (browser and server) works from. Returns (frame, excluded_row_count)."""
    d = derive_core_fields(clean_df)
    d["net_sales"] = d["net_sales_derived"]

    excluded = 0
    if "date" in d.columns:
        d["date"] = pd.to_datetime(d["date"], errors="coerce")
        before = len(d)
        d = d[d["date"].notna()].copy()
        excluded = before - len(d)
        d["date"] = d["date"].dt.normalize()

    for col in CATEGORICAL_FIELDS:
        if col in d.columns:
            values = d[col].astype(object).where(d[col].notna(), UNKNOWN_LABEL).astype(str).str.strip()
            d[col] = values.replace({"": UNKNOWN_LABEL, "nan": UNKNOWN_LABEL, "None": UNKNOWN_LABEL})

    return d.reset_index(drop=True), int(excluded)


def apply_filters(frame: pd.DataFrame, spec: FilterSpec) -> pd.DataFrame:
    """The one filter implementation. Mirrors lib/filters.ts in the frontend:
    exact string match on dimensions, inclusive calendar-day bounds on date."""
    if spec.is_empty():
        return frame
    mask = pd.Series(True, index=frame.index)
    for attr, col in FILTER_DIMENSION_COLUMNS:
        values = getattr(spec, attr)
        if values and col in frame.columns:
            mask &= frame[col].astype(str).isin([str(v) for v in values])
    if "date" in frame.columns:
        if spec.date_from:
            mask &= frame["date"] >= pd.Timestamp(spec.date_from)
        if spec.date_to:
            mask &= frame["date"] <= pd.Timestamp(spec.date_to)
    return frame[mask]


def filter_hash(spec: FilterSpec) -> str:
    payload = json.dumps(spec.model_dump(), sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def describe_scope(spec: FilterSpec, filtered: pd.DataFrame) -> str:
    """Human-readable scope statement passed to the AI so its narrative names
    the slice it is describing (e.g. 'Brand: Aurora; Channel: MUB; ...')."""
    parts: List[str] = []
    labels = {
        "brands": "Brand",
        "products": "Product",
        "channels": "Sales channel",
        "channel_types": "Channel type",
        "sales_types": "Sales type",
    }
    for attr, _ in FILTER_DIMENSION_COLUMNS:
        values = getattr(spec, attr)
        if values:
            parts.append(f"{labels[attr]}: {', '.join(str(v) for v in values)}")
    if "date" in filtered.columns and not filtered.empty:
        dmin = filtered["date"].min().date().isoformat()
        dmax = filtered["date"].max().date().isoformat()
        parts.append(f"Period: {dmin} to {dmax}")
    elif spec.date_from or spec.date_to:
        parts.append(f"Period: {spec.date_from or '...'} to {spec.date_to or '...'}")
    parts.append(f"{len(filtered):,} rows")
    if spec.is_empty():
        return "Full dataset (no filters) - " + parts[-1]
    return "; ".join(parts)


def _series_to_json_list(series: pd.Series) -> List:
    if pd.api.types.is_datetime64_any_dtype(series):
        return [None if pd.isna(v) else v.date().isoformat() for v in series]
    if pd.api.types.is_bool_dtype(series):
        return [bool(v) for v in series]
    if pd.api.types.is_numeric_dtype(series):
        arr = series.astype("float64").to_numpy()
        rounded = np.round(arr, 6)
        return [None if np.isnan(v) else float(v) for v in rounded]
    return [None if pd.isna(v) else str(v) for v in series]


def build_dimensions(frame: pd.DataFrame) -> DatasetDimensions:
    def uniq(col: str) -> List[str]:
        if col not in frame.columns:
            return []
        return sorted(frame[col].dropna().astype(str).unique().tolist(), key=lambda s: s.lower())

    brand_products: Dict[str, List[str]] = {}
    if "brand" in frame.columns and "product" in frame.columns:
        for brand, group in frame.groupby("brand"):
            brand_products[str(brand)] = sorted(group["product"].astype(str).unique().tolist(), key=lambda s: s.lower())

    months: List[str] = []
    if "date" in frame.columns and not frame.empty:
        months = sorted(frame["date"].dt.strftime("%Y-%m").unique().tolist())

    return DatasetDimensions(
        brands=uniq("brand"),
        products=uniq("product"),
        channels=uniq("sales_channel"),
        channel_types=uniq("channel_type"),
        sales_types=uniq("sales_type"),
        brand_products=brand_products,
        months=months,
    )


def build_columns_payload(frame: pd.DataFrame) -> Tuple[Dict[str, List], List[str]]:
    columns: Dict[str, List] = {}
    if "date" in frame.columns:
        columns["date"] = _series_to_json_list(frame["date"])
    for col in CATEGORICAL_FIELDS:
        if col in frame.columns:
            columns[col] = _series_to_json_list(frame[col])
    for col in NUMERIC_EXPORT_FIELDS:
        if col in frame.columns:
            # Skip purely-derived NaN columns that carry no information
            # (e.g. net_shipment_qty when the workbook has no shipment_qty).
            if col not in ALWAYS_PRESENT and frame[col].isna().all():
                continue
            columns[col] = _series_to_json_list(frame[col])
    return columns, list(columns.keys())
