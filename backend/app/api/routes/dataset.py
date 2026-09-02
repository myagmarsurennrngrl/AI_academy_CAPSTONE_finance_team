"""Dataset endpoint: returns the cleaned, derived row-level dataset for an
upload so the dashboard can filter and aggregate it in the browser. Cheap,
deterministic, no AI calls."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.models.schemas import DatasetResponse
from app.services import analysis_pipeline, session_store
from app.services.excel_service import ExcelParseError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["dataset"], dependencies=[Depends(get_current_user)])


@router.get("/dataset/{upload_id}", response_model=DatasetResponse)
async def get_dataset(upload_id: str) -> DatasetResponse:
    record = session_store.get_upload(upload_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Upload not found or has expired. Please upload the Excel file again.",
        )
    try:
        return await run_in_threadpool(analysis_pipeline.build_dataset_response, record)
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Dataset preparation failed")
        raise HTTPException(
            status_code=500,
            detail="The file was uploaded but could not be prepared for analysis. Please check the column structure.",
        ) from exc
