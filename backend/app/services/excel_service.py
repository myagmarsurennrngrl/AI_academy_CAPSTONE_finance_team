"""Reads uploaded Excel files and produces a normalized DataFrame + profile.

Only reads cell values (openpyxl data_only-style access via pandas) - never
evaluates macros or formulas as code.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import List, Tuple

import pandas as pd

from app.models.schemas import DatasetProfile
from app.utils.column_mapping import (
    build_column_mapping,
    missing_required_fields,
    RECOMMENDED_DRIVER_FIELDS,
)

ALLOWED_EXTENSIONS = (".xlsx", ".xls")


class ExcelParseError(Exception):
    pass


@dataclass
class ParsedExcel:
    raw_df: pd.DataFrame
    mapped_df: pd.DataFrame
    column_mapping: dict
    unmapped_columns: List[str]


def validate_filename(filename: str) -> None:
    if not filename:
        raise ExcelParseError("No file was provided.")
    lower = filename.lower()
    if not lower.endswith(ALLOWED_EXTENSIONS):
        raise ExcelParseError(
            f"Unsupported file type. Please upload one of: {', '.join(ALLOWED_EXTENSIONS)}"
        )


def read_excel_bytes(content: bytes, filename: str) -> pd.DataFrame:
    validate_filename(filename)
    if not content:
        raise ExcelParseError("The uploaded file is empty.")
    try:
        engine = "openpyxl" if filename.lower().endswith(".xlsx") else None
        df = pd.read_excel(io.BytesIO(content), engine=engine)
    except Exception as exc:  # noqa: BLE001 - surface as a clean validation error
        raise ExcelParseError(f"Could not parse Excel file: {exc}") from exc

    if df.empty:
        raise ExcelParseError("The uploaded Excel file contains no rows.")

    # Drop fully-blank rows/columns early (openpyxl artifacts).
    df = df.dropna(how="all")
    df = df.dropna(axis=1, how="all")
    if df.empty:
        raise ExcelParseError("The uploaded Excel file contains no usable rows.")

    return df


def normalize_columns(df: pd.DataFrame) -> Tuple[pd.DataFrame, dict, List[str]]:
    mapping, unmapped = build_column_mapping(list(df.columns))
    mapped_df = df.rename(columns=mapping)
    return mapped_df, mapping, unmapped


def parse_excel(content: bytes, filename: str) -> ParsedExcel:
    raw_df = read_excel_bytes(content, filename)
    mapped_df, mapping, unmapped = normalize_columns(raw_df)
    return ParsedExcel(
        raw_df=raw_df,
        mapped_df=mapped_df,
        column_mapping=mapping,
        unmapped_columns=unmapped,
    )


def build_dataset_profile(parsed: ParsedExcel) -> DatasetProfile:
    df = parsed.mapped_df
    rows, cols = df.shape

    date_min = date_max = None
    date_span_days = None
    if "date" in df.columns:
        dates = pd.to_datetime(df["date"], errors="coerce")
        valid_dates = dates.dropna()
        if not valid_dates.empty:
            date_min = valid_dates.min().date().isoformat()
            date_max = valid_dates.max().date().isoformat()
            date_span_days = (valid_dates.max() - valid_dates.min()).days

    brands = df["brand"].nunique(dropna=True) if "brand" in df.columns else 0
    products = df["product"].nunique(dropna=True) if "product" in df.columns else 0
    channels = df["sales_channel"].nunique(dropna=True) if "sales_channel" in df.columns else 0

    available_canonical = [c for c in df.columns]
    missing_required = missing_required_fields(available_canonical)
    missing_recommended = [f for f in RECOMMENDED_DRIVER_FIELDS if f not in available_canonical]

    return DatasetProfile(
        rows=rows,
        columns=cols,
        date_min=date_min,
        date_max=date_max,
        date_span_days=date_span_days,
        brands=int(brands),
        products=int(products),
        channels=int(channels),
        column_mapping=parsed.column_mapping,
        unmapped_columns=parsed.unmapped_columns,
        missing_required_fields=missing_required,
        missing_recommended_fields=missing_recommended,
    )
