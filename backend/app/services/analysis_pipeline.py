"""Orchestrates the modular pipeline (spec section 25):

Excel parsing -> validation/cleaning -> KPI calculation -> driver statistics
-> compact JSON -> Claude English analysis -> OpenAI Mongolian translation.

This module only sequences calls into the dedicated service modules; it does
not itself implement parsing, validation, KPI, or AI-calling logic.
"""
from __future__ import annotations

import logging
from typing import Tuple

import pandas as pd

from app.models.schemas import AIAnalysisResult, AnalysisMeta, FullAnalysisBundle
from app.services import (
    compact_payload,
    driver_service,
    excel_service,
    metric_service,
    validation_service,
)
from app.services.anthropic_service import AnthropicServiceError, generate_english_analysis
from app.services.openai_service import (
    OpenAIServiceError,
    generate_english_analysis_openai,
    translate_to_mongolian,
)
from app.config import get_settings

logger = logging.getLogger(__name__)

MIN_ROWS_FOR_ANALYSIS = 5


def build_full_bundle(content: bytes, filename: str) -> FullAnalysisBundle:
    parsed = excel_service.parse_excel(content, filename)
    raw_row_count = len(parsed.raw_df)

    profile = excel_service.build_dataset_profile(parsed)

    clean_df, quality_report = validation_service.validate_and_clean(parsed.mapped_df, raw_row_count)

    kpis = metric_service.compute_kpis(clean_df)
    time_analysis = metric_service.compute_time_analysis(clean_df)

    d = driver_service.prepare_derived_frame(clean_df)  # shared derived-fields frame reused across driver calcs
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

    driver_ranking = driver_service.build_driver_ranking(
        correlations_raw,
        statistical_model,
        {k: v for k, v in group_analyses.items() if k in ("brand", "product", "sales_channel")},
    )

    from app.models.schemas import CorrelationResult

    correlations = [CorrelationResult(**c) for c in correlations_raw]

    limitations = list(quality_report.warnings)
    if time_analysis.short_history_warning:
        limitations.append(time_analysis.short_history_warning)
    if statistical_model.model_status == "insufficient_data":
        limitations.append(
            "Sample size is too small for a reliable multivariate driver model; rely on correlation "
            "and group-contribution evidence instead."
        )
    limitations.append(
        "All driver relationships describe statistical association, not proven causation."
    )

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


def run_ai_stage(bundle: FullAnalysisBundle) -> Tuple[AIAnalysisResult, AIAnalysisResult | None, AnalysisMeta]:
    settings = get_settings()
    payload = compact_payload.build_compact_analysis_payload(bundle)

    if settings.use_openai_for_analysis:
        # Temporary stopgap (see config.py) - OpenAI performs both stages
        # until Anthropic access is restored.
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
