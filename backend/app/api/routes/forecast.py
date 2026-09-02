"""Forecast endpoint.

* POST /api/forecast/{upload_id}  - monthly forecast for the chosen target and
  filter scope; candidate methods are backtested and the most accurate one is
  used. Deterministic, no AI calls. Results are cached per (upload, request).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.models.schemas import ForecastRequest, ForecastResponse
from app.services import analysis_pipeline, forecast_service, session_store
from app.services.excel_service import ExcelParseError
from app.services.forecast_service import ForecastError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["forecast"], dependencies=[Depends(get_current_user)])


@router.post("/forecast/{upload_id}", response_model=ForecastResponse)
async def run_forecast(upload_id: str, req: ForecastRequest) -> ForecastResponse:
    record = session_store.get_upload(upload_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Upload not found or has expired. Please upload the Excel file again.")
    key = forecast_service.request_hash(req)
    cached = session_store.get_cached_forecast(upload_id, key)
    if cached is not None:
        return ForecastResponse(**cached)
    try:
        await run_in_threadpool(analysis_pipeline.prepare_upload, record)
        response = await run_in_threadpool(forecast_service.run_forecast, record.analytics_frame, req)
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ForecastError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Forecast failed")
        raise HTTPException(status_code=500, detail="The forecast could not be computed for this selection.") from exc
    session_store.cache_forecast(upload_id, key, response.model_dump())
    return response
