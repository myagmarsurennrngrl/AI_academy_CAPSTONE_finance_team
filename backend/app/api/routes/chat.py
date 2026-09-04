"""AI data assistant endpoint.

* POST /api/chat/{upload_id} - answer a question about the uploaded dataset.
  The model can only call deterministic pandas tools (see chat_tools), so
  every number in the answer is reproducible from the file.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.models.schemas import ChatRequest, ChatResponse
from app.services import analysis_pipeline, chat_service, session_store
from app.services.chat_service import ChatServiceError
from app.services.excel_service import ExcelParseError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"], dependencies=[Depends(get_current_user)])

UPLOAD_MISSING = "Upload not found or has expired. Please upload the Excel file again."


@router.post("/chat/{upload_id}", response_model=ChatResponse)
async def chat(upload_id: str, req: ChatRequest) -> ChatResponse:
    record = session_store.get_upload(upload_id)
    if record is None:
        raise HTTPException(status_code=404, detail=UPLOAD_MISSING)
    if req.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="The last message must come from the user.")
    try:
        await run_in_threadpool(analysis_pipeline.prepare_upload, record)
        return await run_in_threadpool(chat_service.answer_question, record, req)
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ChatServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Chat answer failed")
        raise HTTPException(status_code=502, detail="The assistant could not answer. Please try again.") from exc
