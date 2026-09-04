"""Deterministic query tools behind the AI data assistant (chat).

The assistant never sees raw rows and never writes code. It can only call the
functions in this module, each of which runs a fixed pandas aggregation over
the uploaded analytics frame and returns rounded, JSON-safe numbers. This
keeps the project rule intact - *Python computes every number; AI only
interprets* - and makes every figure the chat quotes reproducible.

Filters use the same FilterSpec + apply_filters implementation as the
dashboard, the driver model and the AI narrative, so "sales of Aurora in
E-commerce" means exactly the same rows everywhere.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional, Tuple

import pandas as pd
from pydantic import BaseModel, Field, field_validator

from app.models.schemas import FilterSpec, ForecastRequest
from app.services import dataset_service
from app.utils.formatting import sanitize_numbers

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

DIMENSION_COLUMNS: Dict[str, str] = {
    "brand": "brand",
    "product": "product",
    "sales_channel": "sales_channel",
    "channel_type": "channel_type",
    "sales_type": "sales_type",
}

DIMENSION_ALIASES: Dict[str, str] = {
    "brands": "brand",
    "products": "product",
    "channel": "sales_channel",
    "channels": "sales_channel",
    "sales_channels": "sales_channel",
    "channel_types": "channel_type",
    "sales_types": "sales_type",
}

TimeGrain = Literal["month", "quarter", "year"]
TIME_GRAINS: Tuple[str, ...] = ("month", "quarter", "year")

# measure -> how it is computed and how it is presented
MEASURES: Dict[str, Dict[str, str]] = {
    "net_sales": {"kind": "sum", "column": "net_sales", "unit": "MNT", "description": "Net sales revenue = gross sales - discount - promotion - refunds"},
    "gross_sales": {"kind": "sum", "column": "gross_sales", "unit": "MNT", "description": "Gross sales revenue before discounts"},
    "gross_profit": {"kind": "sum", "column": "gross_profit", "unit": "MNT", "description": "Gross profit = net sales - cost of goods sold"},
    "cogs": {"kind": "sum", "column": "cogs", "unit": "MNT", "description": "Cost of goods sold"},
    "discount_amt": {"kind": "sum", "column": "discount_amt", "unit": "MNT", "description": "Discount amount"},
    "promotion_amt": {"kind": "sum", "column": "promotion_amt", "unit": "MNT", "description": "Promotion spend"},
    "refund_amt": {"kind": "sum", "column": "refund_amt", "unit": "MNT", "description": "Refund amount on returned units"},
    "volume_units": {"kind": "sum", "column": "volume_units", "unit": "units", "description": "Sales quantity: net sell-out units for POS rows, net shipment units for SHIPMENT rows"},
    "sell_out_units": {"kind": "sum", "column": "sell_out_units", "unit": "units", "description": "Sell-out (POS) net units = qty - returns"},
    "sell_in_units": {"kind": "sum", "column": "sell_in_units", "unit": "units", "description": "Sell-in (SHIPMENT) net units = shipment qty - returns"},
    "qty": {"kind": "sum", "column": "qty", "unit": "units", "description": "Units sold before returns"},
    "return_qty": {"kind": "sum", "column": "return_qty", "unit": "units", "description": "Returned units"},
    "gross_margin_pct": {"kind": "ratio", "num": "gross_profit", "den": "net_sales", "unit": "%", "description": "Gross margin = gross profit / net sales"},
    "return_rate_pct": {"kind": "ratio", "num": "return_qty", "den": "qty", "unit": "%", "description": "Return rate = returned units / units sold"},
    "discount_rate_pct": {"kind": "ratio", "num": "discount_amt", "den": "gross_sales", "unit": "%", "description": "Discount as share of gross sales"},
    "promotion_rate_pct": {"kind": "ratio", "num": "promotion_amt", "den": "gross_sales", "unit": "%", "description": "Promotion spend as share of gross sales"},
    "avg_net_price": {"kind": "ratio", "num": "net_sales", "den": "net_qty", "unit": "MNT per unit", "description": "Average net selling price = net sales / net units"},
    "avg_price": {"kind": "ratio", "num": "gross_sales", "den": "qty", "unit": "MNT per unit", "description": "Average gross selling price = gross sales / units sold"},
    "avg_stock": {"kind": "mean", "column": "stock_available", "unit": "units", "description": "Average stock available per row"},
    "row_count": {"kind": "count", "unit": "rows", "description": "Number of transaction rows"},
}

DEFAULT_MEASURES = ["net_sales", "volume_units"]
MAX_ROWS = 50
MAX_LIST_VALUES = 60


class ToolError(ValueError):
    """A tool was called with arguments it cannot honour. The message is
    returned to the model so it can correct the call."""


# ---------------------------------------------------------------------------
# Argument models
# ---------------------------------------------------------------------------

class ToolFilters(BaseModel):
    brands: List[str] = Field(default_factory=list)
    products: List[str] = Field(default_factory=list)
    channels: List[str] = Field(default_factory=list)
    channel_types: List[str] = Field(default_factory=list)
    sales_types: List[str] = Field(default_factory=list)
    date_from: Optional[str] = None
    date_to: Optional[str] = None

    @field_validator("brands", "products", "channels", "channel_types", "sales_types", mode="before")
    @classmethod
    def _listify(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        return list(v)

    def to_spec(self) -> FilterSpec:
        return FilterSpec(**self.model_dump())


class AggregateArgs(BaseModel):
    measures: List[str] = Field(default_factory=lambda: list(DEFAULT_MEASURES))
    group_by: Optional[str] = None
    time_grain: Optional[str] = None
    filters: ToolFilters = Field(default_factory=ToolFilters)
    top_n: int = Field(default=20, ge=1, le=MAX_ROWS)
    sort: Literal["desc", "asc"] = "desc"

    @field_validator("measures", mode="before")
    @classmethod
    def _measures_list(cls, v):
        if v is None:
            return list(DEFAULT_MEASURES)
        if isinstance(v, str):
            return [v]
        return list(v)


class CompareArgs(BaseModel):
    measure: str = "net_sales"
    period_a: Any
    period_b: Any
    filters: ToolFilters = Field(default_factory=ToolFilters)
    group_by: Optional[str] = None
    top_n: int = Field(default=15, ge=1, le=MAX_ROWS)


class SearchArgs(BaseModel):
    dimension: str
    query: str = ""
    limit: int = Field(default=20, ge=1, le=MAX_ROWS)


class ForecastArgs(BaseModel):
    target: Literal["net_sales", "volume_units", "gross_profit"] = "net_sales"
    forecast_until: str = Field(min_length=7, max_length=10)
    filters: ToolFilters = Field(default_factory=ToolFilters)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def resolve_dimension(name: Optional[str]) -> Optional[str]:
    if name is None or str(name).strip() == "":
        return None
    key = str(name).strip().lower()
    key = DIMENSION_ALIASES.get(key, key)
    if key in DIMENSION_COLUMNS:
        return key
    raise ToolError(f"Unknown dimension '{name}'. Use one of: {', '.join(DIMENSION_COLUMNS)}.")


def _resolve_time_grain(name: Optional[str]) -> Optional[str]:
    if name is None or str(name).strip() == "":
        return None
    key = str(name).strip().lower()
    aliases = {"monthly": "month", "months": "month", "quarterly": "quarter", "quarters": "quarter", "yearly": "year", "years": "year", "annual": "year"}
    key = aliases.get(key, key)
    if key in TIME_GRAINS:
        return key
    raise ToolError(f"Unknown time grain '{name}'. Use month, quarter or year.")


def _month_end(year: int, month: int) -> str:
    return pd.Timestamp(year=year, month=month, day=1).to_period("M").end_time.date().isoformat()


def resolve_period(spec: Any) -> Tuple[str, str, str]:
    """Turns a period description into inclusive ISO day bounds.

    Accepted: "YYYY", "YYYY-MM", "YYYY-Qn" / "YYYYQn", "YYYY-H1" / "YYYY-H2",
    "YYYY-MM-DD..YYYY-MM-DD", or {"date_from": ..., "date_to": ...}.
    Returns (date_from, date_to, label)."""
    if isinstance(spec, dict):
        start = spec.get("date_from") or spec.get("from") or spec.get("start")
        end = spec.get("date_to") or spec.get("to") or spec.get("end")
        if not start or not end:
            raise ToolError("A period object needs both date_from and date_to (YYYY-MM-DD).")
        return _iso_day(start), _iso_day(end), f"{_iso_day(start)}..{_iso_day(end)}"
    text = str(spec).strip()
    if m := re.fullmatch(r"(\d{4})", text):
        y = int(m.group(1))
        return f"{y}-01-01", f"{y}-12-31", f"{y}"
    if m := re.fullmatch(r"(\d{4})-(\d{1,2})", text):
        y, mo = int(m.group(1)), int(m.group(2))
        if not 1 <= mo <= 12:
            raise ToolError(f"Invalid month in period '{text}'.")
        return f"{y}-{mo:02d}-01", _month_end(y, mo), f"{y}-{mo:02d}"
    if m := re.fullmatch(r"(\d{4})-?Q([1-4])", text, flags=re.IGNORECASE):
        y, q = int(m.group(1)), int(m.group(2))
        first = (q - 1) * 3 + 1
        return f"{y}-{first:02d}-01", _month_end(y, first + 2), f"{y}-Q{q}"
    if m := re.fullmatch(r"(\d{4})-?H([12])", text, flags=re.IGNORECASE):
        y, h = int(m.group(1)), int(m.group(2))
        first = 1 if h == 1 else 7
        return f"{y}-{first:02d}-01", _month_end(y, first + 5), f"{y}-H{h}"
    if m := re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to|-|/)\s*(\d{4}-\d{2}-\d{2})", text):
        return _iso_day(m.group(1)), _iso_day(m.group(2)), f"{m.group(1)}..{m.group(2)}"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text, text, text
    raise ToolError(
        f"Could not understand period '{text}'. Use YYYY, YYYY-MM, YYYY-Qn, YYYY-Hn, "
        "YYYY-MM-DD..YYYY-MM-DD or {{date_from, date_to}}."
    )


def _iso_day(value: str) -> str:
    try:
        return pd.Timestamp(str(value)).date().isoformat()
    except (ValueError, TypeError) as exc:
        raise ToolError(f"Invalid date '{value}' (expected YYYY-MM-DD).") from exc


def normalise_filters(frame: pd.DataFrame, filters: ToolFilters) -> Tuple[FilterSpec, List[str]]:
    """Maps requested dimension values onto the exact values present in the
    data (case-insensitive / whitespace-insensitive), so a user typing
    "aurora" still matches "Aurora". Unknown values are reported back."""
    spec = filters.to_spec()
    notes: List[str] = []
    for attr, col in dataset_service.FILTER_DIMENSION_COLUMNS:
        requested = getattr(spec, attr)
        if not requested or col not in frame.columns:
            continue
        present = frame[col].astype(str).unique().tolist()
        lookup = {p.strip().lower(): p for p in present}
        resolved: List[str] = []
        for value in requested:
            v = str(value)
            if v in present:
                resolved.append(v)
                continue
            hit = lookup.get(v.strip().lower())
            if hit is not None:
                resolved.append(hit)
            else:
                resolved.append(v)
                notes.append(f"No {col} named '{v}' exists in the data; use search_values to find the exact name.")
        setattr(spec, attr, resolved)
    if spec.date_from:
        spec.date_from = _iso_day(spec.date_from)
    if spec.date_to:
        spec.date_to = _iso_day(spec.date_to)
    return spec, notes


def _measure_specs(names: List[str]) -> List[Tuple[str, Dict[str, str]]]:
    if not names:
        names = list(DEFAULT_MEASURES)
    specs = []
    for name in names[:8]:
        key = str(name).strip().lower()
        aliases = {
            "sales": "net_sales",
            "revenue": "net_sales",
            "quantity": "volume_units",
            "units": "volume_units",
            "volume": "volume_units",
            "profit": "gross_profit",
            "margin": "gross_margin_pct",
            "gross_margin": "gross_margin_pct",
            "returns": "return_qty",
            "return_rate": "return_rate_pct",
            "discount": "discount_amt",
            "promotion": "promotion_amt",
            "price": "avg_net_price",
            "stock": "avg_stock",
            "rows": "row_count",
            "count": "row_count",
        }
        key = aliases.get(key, key)
        if key not in MEASURES:
            raise ToolError(f"Unknown measure '{name}'. Use one of: {', '.join(MEASURES)}.")
        specs.append((key, MEASURES[key]))
    return specs


def _present(value: Optional[float], unit: str) -> Optional[float]:
    if value is None or pd.isna(value):
        return None
    if unit == "%":
        return round(float(value) * 100, 1)
    return float(round(float(value)))


def _compute_measures(d: pd.DataFrame, specs: List[Tuple[str, Dict[str, str]]]) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    for name, spec in specs:
        kind = spec["kind"]
        if kind == "count":
            out[name] = float(len(d))
        elif kind == "sum":
            col = spec["column"]
            if d.empty:
                out[name] = None
            elif col not in d.columns:
                out[name] = 0.0
            else:
                out[name] = _present(pd.to_numeric(d[col], errors="coerce").sum(), spec["unit"])
        elif kind == "mean":
            col = spec["column"]
            series = pd.to_numeric(d[col], errors="coerce") if col in d.columns else pd.Series(dtype="float64")
            out[name] = _present(series.mean() if len(series) else None, spec["unit"])
        elif kind == "ratio":
            num_col, den_col = spec["num"], spec["den"]
            if num_col not in d.columns or den_col not in d.columns or d.empty:
                out[name] = None
                continue
            num = float(pd.to_numeric(d[num_col], errors="coerce").sum())
            den = float(pd.to_numeric(d[den_col], errors="coerce").sum())
            out[name] = _present(num / den if den else None, spec["unit"])
    return out


def _time_key(d: pd.DataFrame, grain: str) -> pd.Series:
    if grain == "month":
        return d["date"].dt.strftime("%Y-%m")
    if grain == "quarter":
        return d["date"].dt.year.astype(str) + "-Q" + d["date"].dt.quarter.astype(str)
    return d["date"].dt.year.astype(str)


def _scope_block(frame: pd.DataFrame, spec: FilterSpec, filtered: pd.DataFrame, notes: List[str]) -> Dict[str, Any]:
    return {
        "filters": {k: v for k, v in spec.model_dump().items() if v},
        "matched_rows": int(len(filtered)),
        "total_rows": int(len(frame)),
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

def dataset_overview(frame: pd.DataFrame, filename: str) -> Dict[str, Any]:
    """Compact description of the dataset for the assistant's system prompt."""
    months = sorted(frame["date"].dt.strftime("%Y-%m").unique().tolist()) if "date" in frame.columns and not frame.empty else []
    years = sorted({m[:4] for m in months})

    def values(col: str, limit: int) -> Dict[str, Any]:
        if col not in frame.columns:
            return {"count": 0, "values": []}
        counts = frame[col].astype(str).value_counts()
        vals = counts.index.tolist()
        return {"count": int(len(vals)), "values": vals[:limit], "truncated": len(vals) > limit}

    measures = {
        name: spec["description"] + f" [{spec['unit']}]"
        for name, spec in MEASURES.items()
        if spec["kind"] in ("count",)
        or (spec["kind"] in ("sum", "mean") and spec["column"] in frame.columns)
        or (spec["kind"] == "ratio" and spec["num"] in frame.columns and spec["den"] in frame.columns)
    }
    return {
        "filename": filename,
        "rows": int(len(frame)),
        "date_min": frame["date"].min().date().isoformat() if months else None,
        "date_max": frame["date"].max().date().isoformat() if months else None,
        "months": months,
        "years": years,
        "brands": values("brand", MAX_LIST_VALUES),
        "products": values("product", MAX_LIST_VALUES),
        "sales_channels": values("sales_channel", MAX_LIST_VALUES),
        "channel_types": values("channel_type", MAX_LIST_VALUES),
        "sales_types": values("sales_type", 10),
        "measures": measures,
        "currency": "MNT (₮)",
    }


def search_values(frame: pd.DataFrame, args: SearchArgs) -> Dict[str, Any]:
    dim = resolve_dimension(args.dimension)
    col = DIMENSION_COLUMNS[dim]  # type: ignore[index]
    if col not in frame.columns:
        return {"dimension": dim, "matches": [], "note": f"The data has no {dim} column."}
    counts = frame[col].astype(str).value_counts()
    q = args.query.strip().lower()
    if q:
        tokens = [tok for tok in re.split(r"\s+", q) if tok]
        matches = [(v, int(n)) for v, n in counts.items() if all(tok in v.lower() for tok in tokens)]
        if not matches:  # fall back to any-token match
            matches = [(v, int(n)) for v, n in counts.items() if any(tok in v.lower() for tok in tokens)]
    else:
        matches = [(v, int(n)) for v, n in counts.items()]
    return {
        "dimension": dim,
        "query": args.query,
        "matches": [{"value": v, "rows": n} for v, n in matches[: args.limit]],
        "total_distinct": int(len(counts)),
    }


def aggregate(frame: pd.DataFrame, args: AggregateArgs) -> Dict[str, Any]:
    specs = _measure_specs(args.measures)
    group_dim = None
    grain = None
    # Be lenient: "group_by": "month" means a time grain.
    if args.group_by and str(args.group_by).strip().lower() in TIME_GRAINS + ("monthly", "quarterly", "yearly"):
        grain = _resolve_time_grain(args.group_by)
    else:
        group_dim = resolve_dimension(args.group_by)
    if args.time_grain:
        grain = _resolve_time_grain(args.time_grain)

    spec, notes = normalise_filters(frame, args.filters)
    filtered = dataset_service.apply_filters(frame, spec)
    result: Dict[str, Any] = {
        "scope": _scope_block(frame, spec, filtered, notes),
        "measures": {name: MEASURES[name]["unit"] for name, _ in specs},
        "total": _compute_measures(filtered, specs),
    }
    if filtered.empty:
        result["rows"] = []
        result["scope"]["notes"].append("No rows match these filters.")
        return sanitize_numbers(result)

    keys: List[str] = []
    d = filtered
    if grain and "date" in d.columns:
        d = d.assign(_period=_time_key(d, grain))
        keys.append("_period")
    if group_dim:
        keys.append(DIMENSION_COLUMNS[group_dim])

    if not keys:
        result["rows"] = []
        return sanitize_numbers(result)

    rows: List[Dict[str, Any]] = []
    first_sum = next((name for name, s in specs if s["kind"] == "sum"), None)
    grand_total = float(pd.to_numeric(d[MEASURES[first_sum]["column"]], errors="coerce").sum()) if first_sum and MEASURES[first_sum]["column"] in d.columns else None
    for key_values, group in d.groupby(keys, sort=False, dropna=False):
        if not isinstance(key_values, tuple):
            key_values = (key_values,)
        row: Dict[str, Any] = {}
        for k, v in zip(keys, key_values):
            row["period" if k == "_period" else group_dim] = str(v)
        row.update(_compute_measures(group, specs))
        if first_sum and grand_total and group_dim and not grain:
            raw = float(pd.to_numeric(group[MEASURES[first_sum]["column"]], errors="coerce").sum())
            row["share_pct"] = round(raw / grand_total * 100, 1)
        rows.append(row)

    if grain:
        # time series read chronologically (within a period, biggest group first)
        sort_key = specs[0][0]
        rows.sort(key=lambda r: (r["period"], -(r.get(sort_key) or 0)))
    else:
        sort_key = specs[0][0]
        with_value = [r for r in rows if r.get(sort_key) is not None]
        without = [r for r in rows if r.get(sort_key) is None]
        with_value.sort(key=lambda r: r[sort_key], reverse=(args.sort == "desc"))
        rows = with_value + without
    result["group_count"] = len(rows)
    result["truncated"] = len(rows) > args.top_n
    result["rows"] = rows[: args.top_n]
    return sanitize_numbers(result)


def _period_slice(d: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    if "date" not in d.columns:
        return d.iloc[0:0]
    mask = (d["date"] >= pd.Timestamp(start)) & (d["date"] <= pd.Timestamp(end))
    return d[mask]


def _pct_change(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return round((a - b) / abs(b) * 100, 1)


def compare_periods(frame: pd.DataFrame, args: CompareArgs) -> Dict[str, Any]:
    specs = _measure_specs([args.measure])
    name, mspec = specs[0]
    a_from, a_to, a_label = resolve_period(args.period_a)
    b_from, b_to, b_label = resolve_period(args.period_b)
    group_dim = resolve_dimension(args.group_by)

    spec, notes = normalise_filters(frame, args.filters)
    base = dataset_service.apply_filters(frame, spec)
    if spec.date_from or spec.date_to:
        notes.append("Date bounds inside 'filters' are ignored by compare_periods; period_a / period_b define the windows.")
        spec.date_from = None
        spec.date_to = None
        base = dataset_service.apply_filters(frame, spec)

    slice_a = _period_slice(base, a_from, a_to)
    slice_b = _period_slice(base, b_from, b_to)

    def coverage(sl: pd.DataFrame, start: str, end: str) -> Dict[str, Any]:
        months = sorted(sl["date"].dt.strftime("%Y-%m").unique().tolist()) if not sl.empty else []
        requested_months = pd.period_range(pd.Timestamp(start), pd.Timestamp(end), freq="M")
        return {
            "date_from": start,
            "date_to": end,
            "rows": int(len(sl)),
            "months_with_data": len(months),
            "months_requested": int(len(requested_months)),
            "first_month": months[0] if months else None,
            "last_month": months[-1] if months else None,
        }

    cov_a, cov_b = coverage(slice_a, a_from, a_to), coverage(slice_b, b_from, b_to)
    for label, cov in ((a_label, cov_a), (b_label, cov_b)):
        if cov["rows"] == 0:
            notes.append(f"The data contains no rows for period {label}.")
        elif cov["months_with_data"] < cov["months_requested"]:
            notes.append(
                f"Period {label} is only partly covered: data exists for {cov['months_with_data']} of "
                f"{cov['months_requested']} months ({cov['first_month']}..{cov['last_month']})."
            )

    def value(sl: pd.DataFrame) -> Optional[float]:
        if sl.empty:
            return None
        return _compute_measures(sl, specs)[name]

    val_a, val_b = value(slice_a), value(slice_b)
    total = {
        "value_a": val_a,
        "value_b": val_b,
        "abs_change": (round(val_a - val_b, 1) if mspec["unit"] == "%" else float(round(val_a - val_b))) if val_a is not None and val_b is not None else None,
        "pct_change": _pct_change(val_a, val_b) if mspec["unit"] != "%" else None,
        "points_change": round(val_a - val_b, 1) if mspec["unit"] == "%" and val_a is not None and val_b is not None else None,
    }

    result: Dict[str, Any] = {
        "measure": name,
        "unit": mspec["unit"],
        "scope": _scope_block(frame, spec, base, notes),
        "period_a": {"label": a_label, **cov_a},
        "period_b": {"label": b_label, **cov_b},
        "total": total,
        "definition": "pct_change = (value_a - value_b) / |value_b| * 100; for % measures see points_change (percentage points).",
    }

    if group_dim:
        col = DIMENSION_COLUMNS[group_dim]
        groups = sorted(set(slice_a[col].astype(str)) | set(slice_b[col].astype(str)), key=str.lower)
        by_group = []
        for g in groups:
            ga, gb = slice_a[slice_a[col].astype(str) == g], slice_b[slice_b[col].astype(str) == g]
            va, vb = value(ga), value(gb)
            by_group.append(
                {
                    group_dim: g,
                    "value_a": va,
                    "value_b": vb,
                    "abs_change": (float(round(va - vb)) if mspec["unit"] != "%" else round(va - vb, 1)) if va is not None and vb is not None else None,
                    "pct_change": _pct_change(va, vb) if mspec["unit"] != "%" else None,
                }
            )
        by_group.sort(key=lambda r: abs(r["abs_change"]) if r["abs_change"] is not None else -1, reverse=True)
        result["group_count"] = len(by_group)
        result["truncated"] = len(by_group) > args.top_n
        result["by_group"] = by_group[: args.top_n]
    return sanitize_numbers(result)


def forecast(frame: pd.DataFrame, args: ForecastArgs, cache_get=None, cache_put=None) -> Dict[str, Any]:
    """Runs the same backtested forecast the Forecast module uses and returns a
    compact summary. Optional cache callbacks let the caller reuse the
    per-upload forecast cache."""
    from app.services import forecast_service  # local import keeps module import light
    from app.services.forecast_service import ForecastError

    spec, notes = normalise_filters(frame, args.filters)
    req = ForecastRequest(target=args.target, forecast_until=args.forecast_until, filters=spec)
    key = forecast_service.request_hash(req)
    payload = cache_get(key) if cache_get else None
    if payload is None:
        try:
            payload = forecast_service.run_forecast(frame, req).model_dump()
        except ForecastError as exc:
            return {"error": str(exc), "scope": {"filters": {k: v for k, v in spec.model_dump().items() if v}, "notes": notes}}
        if cache_put:
            cache_put(key, payload)

    unit = "units" if args.target == "volume_units" else "MNT"
    rnd = lambda v: None if v is None else float(round(v))  # noqa: E731
    summary = payload["summary"]
    return sanitize_numbers(
        {
            "target": args.target,
            "unit": unit,
            "scope": {"label": payload["scope_label"], "filters": {k: v for k, v in spec.model_dump().items() if v}, "notes": notes},
            "history_months": f"{payload['history_month_min']}..{payload['history_month_max']}",
            "selected_method": payload["selected_label"],
            "selection_reason": payload["selection_reason"],
            "backtest_wape_pct": None if summary.get("accuracy_wape") is None else round(summary["accuracy_wape"] * 100, 1),
            "forecast": [
                {"month": p["month"], "point": rnd(p["point"]), "lower_80": rnd(p["lower"]), "upper_80": rnd(p["upper"])}
                for p in payload["forecast"]
            ],
            "forecast_total": rnd(summary["forecast_total"]),
            "forecast_monthly_avg": rnd(summary["forecast_monthly_avg"]),
            "last_12_months_total": rnd(summary["last_12_months_total"]),
            "same_period_last_year_total": rnd(summary.get("same_period_last_year_total")),
            "yoy_change_pct": None if summary.get("yoy_change_pct") is None else round(summary["yoy_change_pct"] * 100, 1),
            "recent_actuals": [{"month": h["month"], "actual": rnd(h["actual"])} for h in payload["history"][-12:]],
            "notes": payload.get("notes", []),
        }
    )
