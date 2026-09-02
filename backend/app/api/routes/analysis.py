"""Analysis endpoints.

* POST /api/analysis/{upload_id}/drivers  - filtered driver statistics (fast, deterministic)
* POST /api/analysis/{upload_id}/insight  - filtered deterministic bundle + Claude/OpenAI narrative
* POST /api/analysis/{upload_id}          - legacy single-shot full analysis (whole dataset)

Both filtered endpoints accept the same FilterSpec the dashboard uses for its
own aggregation, so server-side statistics always describe exactly the rows
the user is looking at. Results are cached per (upload, filter) pair.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.models.schemas import AnalysisResponse, DriverAnalysisResponse, FilterSpec, InsightResponse
from app.services import analysis_pipeline, dataset_service, session_store
from app.services.analysis_pipeline import InsufficientDataError
from app.services.anthropic_service import AnthropicServiceError
from app.services.excel_service import ExcelParseError
from app.services.openai_service import OpenAIServiceError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analysis"], dependencies=[Depends(get_current_user)])

UPLOAD_MISSING = "Upload not found or has expired. Please upload the Excel file again."


def _get_prepared_record(upload_id: str):
    record = session_store.get_upload(upload_id)
    if record is None:
        raise HTTPException(status_code=404, detail=UPLOAD_MISSING)
    return record


@router.post("/analysis/{upload_id}/drivers", response_model=DriverAnalysisResponse)
async def run_driver_analysis(upload_id: str, spec: FilterSpec) -> DriverAnalysisResponse:
    record = _get_prepared_record(upload_id)
    key = dataset_service.filter_hash(spec)
    cached = session_store.get_cached_drivers(upload_id, key)
    if cached is not None:
        return DriverAnalysisResponse(**cached)
    try:
        await run_in_threadpool(analysis_pipeline.prepare_upload, record)
        response = await run_in_threadpool(analysis_pipeline.run_driver_analysis, record.analytics_frame, spec)
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Driver analysis failed")
        raise HTTPException(status_code=500, detail="Driver analysis could not be computed for this selection.") from exc
    session_store.cache_drivers(upload_id, key, response.model_dump())
    return response


@router.post("/analysis/{upload_id}/insight", response_model=InsightResponse)
async def run_insight(upload_id: str, spec: FilterSpec, force_refresh: bool = False) -> InsightResponse:
    record = _get_prepared_record(upload_id)
    key = dataset_service.filter_hash(spec)
    cached = session_store.get_cached_insight(upload_id, key)
    if cached is not None and not force_refresh:
        return InsightResponse(**cached)
    try:
        await run_in_threadpool(analysis_pipeline.prepare_upload, record)
        response = await run_in_threadpool(
            analysis_pipeline.run_insight, record.analytics_frame, record.profile, record.quality_report, spec
        )
    except InsufficientDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (AnthropicServiceError, OpenAIServiceError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Insight generation failed")
        raise HTTPException(status_code=502, detail="The AI insight could not be generated. Please try again.") from exc
    session_store.cache_insight(upload_id, key, response.model_dump())
    return response


@router.post("/analysis/{upload_id}", response_model=AnalysisResponse)
async def run_analysis(upload_id: str, force_refresh: bool = False) -> AnalysisResponse:
    """Legacy whole-dataset analysis kept for API compatibility."""
    record = _get_prepared_record(upload_id)
    if record.cached_analysis is not None and not force_refresh:
        return AnalysisResponse(**record.cached_analysis)

    try:
        await run_in_threadpool(analysis_pipeline.prepare_upload, record)
        bundle = await run_in_threadpool(
            analysis_pipeline.build_bundle_from_frame,
            record.analytics_frame,
            record.profile,
            record.quality_report,
        )
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Deterministic analysis pipeline failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

    try:
        english, mongolian, meta = await run_in_threadpool(analysis_pipeline.run_ai_stage, bundle)
    except AnthropicServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("AI stage failed")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    response = AnalysisResponse(
        analysis_id=uuid.uuid4().hex,
        bundle=bundle,
        ai_english=english,
        ai_mongolian=mongolian,
        meta=meta,
    )
    session_store.cache_analysis(upload_id, response.model_dump())
    return response
