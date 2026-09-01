"""Validates and cleans the normalized sales DataFrame before any KPI or AI
computation happens (spec section 8).

Design principle: never silently delete problematic rows. Recoverable issues
(whitespace, numeric-looking strings, parseable dates) are auto-corrected and
reported; everything else is surfaced as a warning/issue in the
DataQualityReport so the user sees exactly what happened to their data.
"""
from __future__ import annotations

from typing import List, Tuple

import numpy as np
import pandas as pd

from app.models.schemas import AutoCorrection, DataQualityIssue, DataQualityReport
from app.utils.column_mapping import REQUIRED_CORE_FIELDS, RECOMMENDED_DRIVER_FIELDS

NUMERIC_FIELDS = [
    "qty",
    "sale_price",
    "sale_cost",
    "shipment_qty",
    "return_qty",
    "net_qty",
    "stock_available",
    "discount_pct",
    "promotion_pct",
    "return_qty_units",
    "sale_price_net",
    "total_sales",
    "discount",
    "promotion",
    "refund_amount",
    "net_sales",
]

NON_NEGATIVE_FIELDS = [
    "qty",
    "sale_price",
    "sale_cost",
    "shipment_qty",
    "return_qty",
    "stock_available",
    "total_sales",
    "discount",
    "promotion",
    "refund_amount",
    "net_sales",
]

REL_TOLERANCE = 0.05


def _normalize_pct_scale(series: pd.Series) -> pd.Series:
    """Percent-like columns may be stored as ratios (0-1) or as percentage
    points (0-100). Detect the scale from the data and return a 0-1 ratio."""
    numeric = pd.to_numeric(series, errors="coerce")
    non_null = numeric.dropna()
    if non_null.empty:
        return numeric
    if non_null.abs().quantile(0.95) > 1.5:
        return numeric / 100.0
    return numeric


def validate_and_clean(
    df: pd.DataFrame, raw_row_count: int
) -> Tuple[pd.DataFrame, DataQualityReport]:
    issues: List[DataQualityIssue] = []
    corrections: List[AutoCorrection] = []
    warnings: List[str] = []

    clean = df.copy()

    # --- trim whitespace on text columns, standardize blanks to NaN ---
    text_cols = clean.select_dtypes(include="object").columns
    trimmed_count = 0
    for col in text_cols:
        before = clean[col].copy()
        clean[col] = clean[col].apply(lambda v: v.strip() if isinstance(v, str) else v)
        clean[col] = clean[col].replace(r"^\s*$", np.nan, regex=True)
        changed = (before.astype(str) != clean[col].astype(str)).sum()
        trimmed_count += int(changed)
    if trimmed_count:
        corrections.append(
            AutoCorrection(field=None, action="Trimmed whitespace on text fields", affected_rows=trimmed_count)
        )

    # --- duplicate rows ---
    duplicate_mask = clean.duplicated(keep="first")
    duplicate_rows = int(duplicate_mask.sum())
    if duplicate_rows:
        warnings.append(f"{duplicate_rows} давхардсан мөр илэрсэн (анхны мөрийг хадгалав).")
        issues.append(
            DataQualityIssue(
                severity="warning",
                message=f"{duplicate_rows} duplicate rows detected.",
                affected_rows=duplicate_rows,
            )
        )

    # --- dates ---
    if "date" in clean.columns:
        original_non_null = clean["date"].notna().sum()
        parsed_dates = pd.to_datetime(clean["date"], errors="coerce")
        invalid_dates = int(original_non_null - parsed_dates.notna().sum())
        if invalid_dates > 0:
            issues.append(
                DataQualityIssue(
                    severity="error",
                    field="date",
                    message=f"{invalid_dates} rows have a date value that could not be parsed.",
                    affected_rows=int(invalid_dates),
                )
            )
        clean["date"] = parsed_dates
        corrections.append(
            AutoCorrection(field="date", action="Parsed date column to ISO dates", affected_rows=int(original_non_null))
        )

    # --- numeric fields: coerce numeric-looking strings, flag text ---
    for field in NUMERIC_FIELDS:
        if field not in clean.columns:
            continue
        raw = clean[field]
        non_null_before = raw.notna().sum()
        numeric = pd.to_numeric(raw, errors="coerce")
        became_nan = int(numeric.isna().sum() - raw.isna().sum())
        if became_nan > 0:
            issues.append(
                DataQualityIssue(
                    severity="warning",
                    field=field,
                    message=f"{became_nan} rows contained non-numeric text in '{field}'.",
                    affected_rows=became_nan,
                )
            )
        converted_from_string = int(
            raw.apply(lambda v: isinstance(v, str)).sum()
        )
        if converted_from_string:
            corrections.append(
                AutoCorrection(
                    field=field,
                    action="Converted numeric-looking text to numbers",
                    affected_rows=converted_from_string,
                )
            )
        clean[field] = numeric

    # --- percent scale normalization ---
    for pct_field in ("discount_pct", "promotion_pct"):
        if pct_field in clean.columns:
            clean[pct_field] = _normalize_pct_scale(clean[pct_field])

    # --- negative value checks (flag, never delete) ---
    for field in NON_NEGATIVE_FIELDS:
        if field not in clean.columns:
            continue
        negative_count = int((clean[field] < 0).sum())
        if negative_count:
            issues.append(
                DataQualityIssue(
                    severity="warning",
                    field=field,
                    message=f"{negative_count} rows have a negative value in '{field}'.",
                    affected_rows=negative_count,
                )
            )

    # --- impossible discount / promotion values ---
    for pct_field in ("discount_pct", "promotion_pct"):
        if pct_field not in clean.columns:
            continue
        impossible = int(((clean[pct_field] < 0) | (clean[pct_field] > 1.05)).sum())
        if impossible:
            issues.append(
                DataQualityIssue(
                    severity="warning",
                    field=pct_field,
                    message=f"{impossible} rows have an implausible '{pct_field}' (< 0% or > 105%).",
                    affected_rows=impossible,
                )
            )

    # --- return_qty consistency: cannot exceed qty ---
    if "return_qty" in clean.columns and "qty" in clean.columns:
        bad = int((clean["return_qty"] > clean["qty"]).sum())
        if bad:
            issues.append(
                DataQualityIssue(
                    severity="warning",
                    field="return_qty",
                    message=f"{bad} rows have return_qty greater than qty.",
                    affected_rows=bad,
                )
            )

    # --- net_qty consistency ---
    if "net_qty" in clean.columns and "qty" in clean.columns and "return_qty" in clean.columns:
        expected_net = clean["qty"] - clean["return_qty"]
        mismatch = int((clean["net_qty"] - expected_net).abs().gt(0.5).sum())
        if mismatch:
            issues.append(
                DataQualityIssue(
                    severity="info",
                    field="net_qty",
                    message=f"{mismatch} rows: net_qty does not equal qty minus return_qty.",
                    affected_rows=mismatch,
                )
            )

    # --- total_sales consistency ---
    if "total_sales" in clean.columns and "qty" in clean.columns and "sale_price" in clean.columns:
        expected_gross = clean["qty"] * clean["sale_price"]
        with np.errstate(divide="ignore", invalid="ignore"):
            rel_diff = (clean["total_sales"] - expected_gross).abs() / expected_gross.replace(0, np.nan)
        mismatch = int((rel_diff > REL_TOLERANCE).sum())
        if mismatch:
            issues.append(
                DataQualityIssue(
                    severity="info",
                    field="total_sales",
                    message=f"{mismatch} rows: total_sales differs from qty x sale_price by more than {int(REL_TOLERANCE*100)}%.",
                    affected_rows=mismatch,
                )
            )

    # --- net_sales consistency (only a light sanity check; full derivation happens in metric_service) ---
    if "net_sales" in clean.columns and "total_sales" in clean.columns:
        components = pd.Series(0.0, index=clean.index)
        for c in ("discount", "promotion", "refund_amount"):
            if c in clean.columns:
                components = components + clean[c].fillna(0.0)
        expected_net = clean["total_sales"] - components
        with np.errstate(divide="ignore", invalid="ignore"):
            rel_diff = (clean["net_sales"] - expected_net).abs() / clean["total_sales"].replace(0, np.nan)
        mismatch = int((rel_diff > REL_TOLERANCE).sum())
        if mismatch:
            issues.append(
                DataQualityIssue(
                    severity="info",
                    field="net_sales",
                    message=f"{mismatch} rows: net_sales differs from total_sales minus discount/promotion/refunds by more than {int(REL_TOLERANCE*100)}%.",
                    affected_rows=mismatch,
                )
            )

    # --- missing values across important fields ---
    important_fields = [f for f in (REQUIRED_CORE_FIELDS + RECOMMENDED_DRIVER_FIELDS) if f in clean.columns]
    missing_value_count = int(clean[important_fields].isna().sum().sum()) if important_fields else 0

    valid_rows = int((~duplicate_mask).sum())
    invalid_rows = int(raw_row_count - valid_rows) if raw_row_count >= valid_rows else 0

    error_count = sum(1 for i in issues if i.severity == "error")
    if error_count:
        warnings.append(
            f"{error_count} чанарын алдаа илэрсэн тул зарим тооцоолол найдваргүй байж болзошгүй."
        )

    date_min = date_max = None
    if "date" in clean.columns:
        valid_dates = clean["date"].dropna()
        if not valid_dates.empty:
            date_min = valid_dates.min().date().isoformat()
            date_max = valid_dates.max().date().isoformat()

    report = DataQualityReport(
        total_rows=int(raw_row_count),
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        duplicate_rows=duplicate_rows,
        missing_value_count=missing_value_count,
        date_min=date_min,
        date_max=date_max,
        warnings=warnings,
        issues=issues,
        auto_corrections=corrections,
    )

    return clean, report
