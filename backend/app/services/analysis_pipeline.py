"""Orchestrates the modular pipeline:

Excel parsing -> validation/cleaning -> analytics frame (derived fields)
   -> [browser] filtering + KPI/chart aggregation from the row-level dataset
   -> [server]  filtered driver statistics (correlation + model importance)
   -> [server]  filtered compact JSON -> Claude English analysis -> OpenAI Mongolian

This module only sequences calls into the dedicated service modules; it does
not itself implement parsing, validation, KPI, or AI-calling logic.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, Tuple

import pandas as pd

from app.config import get_settings
from app.models.schemas import (
    AIAnalysisResult,
    AnalysisMeta,
    CorrelationResult,
    DataQualityReport,
    DatasetProfile,
    DatasetResponse,
    DriverAnalysisResponse,
    FilterSpec,
    FullAnalysisBundle,
    InsightResponse,
)
from app.services import (
    compact_payload,
    dataset_service,
    driver_service,
    excel_service,
    metric_service,
    validation_service,
)
from app.services.anthropic_service import generate_english_analysis
from app.services.openai_service import (
    OpenAIServiceError,
    generate_english_analysis_openai,
    translate_to_mongolian,
)
from app.services.session_store import StoredUpload

logger = logging.getLogger(__name__)

MIN_ROWS_FOR_ANALYSIS = 5


class InsufficientDataError(Exception):
    """Raised when the filtered slice is too small for a meaningful analysis."""


# ---------------------------------------------------------------------------
# Preparation (parse + clean + derive), done once per upload
# ---------------------------------------------------------------------------

def _prepare_frame(content: bytes, filename: str) -> Tuple[pd.DataFrame, DatasetProfile, DataQualityReport, int]:
    parsed = excel_service.parse_excel(content, filename)
    profile = excel_service.build_dataset_profile(parsed)
    clean_df, quality_report = validation_service.validate_and_clean(parsed.mapped_df, len(parsed.raw_df))
    frame, excluded = dataset_service.prepare_analytics_frame(clean_df)
    return frame, profile, quality_report, excluded


def prepare_upload(record: StoredUpload) -> None:
    """Idempotent: parses, cleans and derives the analytics frame for an upload
    the first time it is needed and stores it on the session record."""
    if record.analytics_frame is not None:
        return
    with record.prepare_lock:
        if record.analytics_frame is not None:
            return
        frame, profile, quality_report, excluded = _prepare_frame(record.content, record.filename)
        record.profile = profile
        record.quality_report = quality_report
        record.excluded_rows = excluded
        record.analytics_frame = frame


def build_dataset_response(record: StoredUpload) -> DatasetResponse:
    prepare_upload(record)
    if record.dataset_payload is None:
        frame = record.analytics_frame
        columns, fields = dataset_service.build_columns_payload(frame)
        response = DatasetResponse(
            upload_id=record.upload_id,
            filename=record.filename,
            profile=record.profile,
            data_quality=record.quality_report,
            row_count=int(len(frame)),
            excluded_rows=int(record.excluded_rows),
            available_fields=fields,
            dimensions=dataset_service.build_dimensions(frame),
            columns=columns,
        )
        record.dataset_payload = response.model_dump()
        return response
    return DatasetResponse(**record.dataset_payload)


# ---------------------------------------------------------------------------
# Deterministic bundle (for the AI stage and the legacy endpoint)
# ---------------------------------------------------------------------------

def _profile_for_frame(frame: pd.DataFrame, base: DatasetProfile) -> DatasetProfile:
    data = base.model_dump()
    data["rows"] = int(len(frame))
    if "date" in frame.columns and not frame.empty:
        data["date_min"] = frame["date"].min().date().isoformat()
        data["date_max"] = frame["date"].max().date().isoformat()
        data["date_span_days"] = int((frame["date"].max() - frame["date"].min()).days)
    for key, col in (("brands", "brand"), ("products", "product"), ("channels", "sales_channel")):
        data[key] = int(frame[col].nunique()) if col in frame.columns else 0
    return DatasetProfile(**data)


def build_bundle_from_frame(
    frame: pd.DataFrame, profile: DatasetProfile, quality_report: DataQualityReport
) -> FullAnalysisBundle:
    kpis = metric_service.compute_kpis(frame)
    time_analysis = metric_service.compute_time_analysis(frame)

    d = driver_service.prepare_derived_frame(frame)
    correlations_raw = driver_service.compute_correlations(d)

    group_analyses = {
        "brand": driver_service.compute_group_analysis(d, "brand"),
        "product": driver_service.compute_group_analysis(d, "product"),
        "sales_channel": driver_service.compute_group_analysis(d, "sales_channel"),
        "channel_type": driver_service.compute_group_analysis(d, "channel_type"),
        "sales_type": driver_service.compute_group_analysis(d, "sales_type"),
    }

    discount_analysis = driver_service.compute_discount_bands(d)
    promotion_analysis = driver_service.compute_promotion_comparison(d)
    return_analysis = driver_service.compute_return_risk(d)
    inventory_analysis = driver_service.compute_inventory_risk(d)
    statistical_model = driver_service.build_statistical_model(d)

    eta_squared = driver_service.compute_eta_squared(d, driver_service.CATEGORICAL_DRIVERS)
    driver_ranking = driver_service.build_driver_ranking(
        correlations_raw, statistical_model, group_analyses, eta_squared
    )
    correlations = [CorrelationResult(**c) for c in correlations_raw]

    limitations = list(quality_report.warnings)
    if time_analysis.short_history_warning:
        limitations.append(time_analysis.short_history_warning)
    if statistical_model.model_status == "insufficient_data":
        limitations.append(
            "Sample size is too small for a reliable multivariate driver model; rely on correlation "
            "and group-contribution evidence instead."
        )
    limitations.append("All driver relationships describe statistical association, not proven causation.")

    return FullAnalysisBundle(
        dataset_profile=profile,
        data_quality=quality_report,
        kpis=kpis,
        time_analysis=time_analysis,
        correlations=correlations,
        driver_ranking=driver_ranking,
        brand_analysis=group_analyses["brand"],
        product_analysis=group_analyses["product"],
        channel_analysis=group_analyses["sales_channel"],
        channel_type_analysis=group_analyses["channel_type"],
        sales_type_analysis=group_analyses["sales_type"],
        discount_analysis=discount_analysis,
        promotion_analysis=promotion_analysis,
        return_analysis=return_analysis,
        inventory_analysis=inventory_analysis,
        statistical_model=statistical_model,
        limitations=limitations,
    )


def build_full_bundle(content: bytes, filename: str) -> FullAnalysisBundle:
    """Legacy single-shot entrypoint (whole dataset, no filters)."""
    frame, profile, quality_report, _ = _prepare_frame(content, filename)
    return build_bundle_from_frame(frame, profile, quality_report)


# ---------------------------------------------------------------------------
# Filtered driver analysis
# ---------------------------------------------------------------------------

def run_driver_analysis(frame: pd.DataFrame, spec: FilterSpec) -> DriverAnalysisResponse:
    filtered = dataset_service.apply_filters(frame, spec)
    d = driver_service.prepare_derived_frame(filtered)
    correlations_raw = driver_service.compute_correlations(d)
    group_analyses = {
        field: driver_service.compute_group_analysis(d, field)
        for field in ("brand", "product", "sales_channel", "channel_type", "sales_type")
    }
    statistical_model = driver_service.build_statistical_model(d)
    eta_squared = driver_service.compute_eta_squared(d, driver_service.CATEGORICAL_DRIVERS)
    ranking = driver_service.build_driver_ranking(correlations_raw, statistical_model, group_analyses, eta_squared)

    notes = list(statistical_model.notes)
    notes.append("Importance scores describe statistical association with sales quantity, not causation.")
    return DriverAnalysisResponse(
        filter_row_count=int(len(filtered)),
        target=statistical_model.target,
        importance_basis=driver_service.importance_basis(statistical_model),
        correlations=[CorrelationResult(**c) for c in correlations_raw],
        driver_ranking=ranking,
        statistical_model=statistical_model,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# AI stage
# ---------------------------------------------------------------------------

def run_ai_stage(
    bundle: FullAnalysisBundle,
    scope: Optional[FilterSpec] = None,
    scope_label: Optional[str] = None,
) -> Tuple[AIAnalysisResult, AIAnalysisResult | None, AnalysisMeta]:
    settings = get_settings()
    payload = compact_payload.build_compact_analysis_payload(bundle, scope, scope_label)

    if settings.use_openai_for_analysis:
        english = generate_english_analysis_openai(bundle, payload)
    else:
        english = generate_english_analysis(bundle, payload)

    mongolian: AIAnalysisResult | None = None
    translation_error: str | None = None
    try:
        mongolian = translate_to_mongolian(english)
    except OpenAIServiceError as exc:
        logger.warning("Mongolian translation failed, keeping English result: %s", exc)
        translation_error = str(exc)

    meta = AnalysisMeta(
        mock_ai=settings.use_mock_ai,
        anthropic_model=settings.anthropic_model,
        openai_model=settings.openai_model,
        translation_available=mongolian is not None,
        translation_error=translation_error,
    )
    return english, mongolian, meta


def run_insight(
    frame: pd.DataFrame,
    profile: DatasetProfile,
    quality_report: DataQualityReport,
    spec: FilterSpec,
) -> InsightResponse:
    filtered = dataset_service.apply_filters(frame, spec)
    if len(filtered) < MIN_ROWS_FOR_ANALYSIS:
        raise InsufficientDataError(
            f"Only {len(filtered)} rows match the current filters; at least {MIN_ROWS_FOR_ANALYSIS} are needed."
        )
    bundle = build_bundle_from_frame(filtered, _profile_for_frame(filtered, profile), quality_report)
    scope_label = dataset_service.describe_scope(spec, filtered)
    english, mongolian, meta = run_ai_stage(bundle, spec, scope_label)
    return InsightResponse(
        filter_row_count=int(len(filtered)),
        scope=spec,
        scope_label=scope_label,
        kpis=bundle.kpis,
        ai_english=english,
        ai_mongolian=mongolian,
        meta=meta,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
