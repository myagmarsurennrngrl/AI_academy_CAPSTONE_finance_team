"""Upload endpoints: parse + profile an Excel file (cheap, no AI calls) and
store it for the subsequent dataset / analysis / forecast / chat calls.

* POST /api/upload          - the user's own workbook
* POST /api/upload/sample   - the bundled sample workbook, so the platform can
                              be tried on a phone or laptop without any data
* GET  /api/sample/download - the same sample as a file
"""
from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.config import get_settings
from app.models.schemas import UploadResponse
from app.services import excel_service, session_store
from app.services.excel_service import ExcelParseError

router = APIRouter(prefix="/api", tags=["upload"])

SAMPLE_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "static", "sample_data.xlsx")
SAMPLE_FILE_NAME = "sample_data.xlsx"


def _sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload.xlsx")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name[:200] or "upload.xlsx"


def _register_upload(filename: str, content: bytes) -> UploadResponse:
    """Shared by the real upload and the sample shortcut: size check, parse,
    profile, store - identical behaviour whichever way the bytes arrived."""
    settings = get_settings()
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


@router.post("/upload", response_model=UploadResponse, dependencies=[Depends(get_current_user)])
async def upload_excel(file: UploadFile = File(...)) -> UploadResponse:
    filename = _sanitize_filename(file.filename or "")
    content = await file.read()
    return await run_in_threadpool(_register_upload, filename, content)


@router.post("/upload/sample", response_model=UploadResponse, dependencies=[Depends(get_current_user)])
async def upload_sample() -> UploadResponse:
    """Registers the bundled sample workbook exactly as if the user had
    uploaded it - lets anyone try both modules without their own data."""
    path = os.path.abspath(SAMPLE_FILE_PATH)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Sample file is not available.")
    with open(path, "rb") as fh:
        content = fh.read()
    return await run_in_threadpool(_register_upload, SAMPLE_FILE_NAME, content)


@router.get("/sample/download")
async def download_sample() -> FileResponse:
    path = os.path.abspath(SAMPLE_FILE_PATH)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Sample file is not available.")
    return FileResponse(
        path,
        filename=SAMPLE_FILE_NAME,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
