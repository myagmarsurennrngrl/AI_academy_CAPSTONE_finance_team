"""Analysis endpoint: runs the full deterministic pipeline + AI stage for a
previously uploaded file. This is the only endpoint that calls Anthropic/
OpenAI, and it is only invoked when the user clicks "Шинжилгээ эхлүүлэх".
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.models.schemas import AnalysisResponse
from app.services import analysis_pipeline, session_store
from app.services.anthropic_service import AnthropicServiceError
from app.services.excel_service import ExcelParseError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/analysis/{upload_id}", response_model=AnalysisResponse)
async def run_analysis(upload_id: str, force_refresh: bool = False) -> AnalysisResponse:
    record = session_store.get_upload(upload_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Upload not found or has expired. Please upload the Excel file again.",
        )

    if record.cached_analysis is not None and not force_refresh:
        return AnalysisResponse(**record.cached_analysis)

    # The deterministic pipeline (pandas/sklearn) and the AI calls are both
    # blocking/synchronous. Running them directly in this async route would
    # freeze the whole event loop - including unrelated requests like
    # /api/health - for the entire duration, so offload them to a thread pool.
    try:
        bundle = await run_in_threadpool(
            analysis_pipeline.build_full_bundle, record.content, record.filename
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
