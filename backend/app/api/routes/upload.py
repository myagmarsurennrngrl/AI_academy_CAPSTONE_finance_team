"""Upload endpoint: parses + profiles an Excel file (cheap, no AI calls) and
stores it for the subsequent /api/analysis/{upload_id} call."""
from __future__ import annotations

import os
import re

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import get_settings
from app.models.schemas import UploadResponse
from app.services import excel_service, session_store
from app.services.excel_service import ExcelParseError

router = APIRouter(prefix="/api", tags=["upload"])

SAMPLE_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "static", "sample_data.xlsx")


def _sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload.xlsx")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name[:200] or "upload.xlsx"


@router.post("/upload", response_model=UploadResponse)
async def upload_excel(file: UploadFile = File(...)) -> UploadResponse:
    settings = get_settings()
    filename = _sanitize_filename(file.filename or "")

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_upload_mb}MB upload limit.",
        )

    try:
        parsed = excel_service.parse_excel(content, filename)
    except ExcelParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    profile = excel_service.build_dataset_profile(parsed)
    record = session_store.save_upload(filename, content)

    blocking_errors = []
    if profile.missing_required_fields:
        blocking_errors.append(
            "Excel файлд шаардлагатай багана дутуу байна: " + ", ".join(profile.missing_required_fields)
        )

    return UploadResponse(
        upload_id=record.upload_id,
        filename=filename,
        file_size_bytes=len(content),
        profile=profile,
        can_analyze=len(blocking_errors) == 0,
        blocking_errors=blocking_errors,
    )


@router.get("/sample/download")
async def download_sample() -> FileResponse:
    path = os.path.abspath(SAMPLE_FILE_PATH)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Sample file is not available.")
    return FileResponse(
        path,
        filename="sample_data.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
