"""In-memory store bridging the upload step and the analyze step, so the
user's file is uploaded once and the (cheap) profile preview can be shown
immediately while the (expensive, AI-calling) analysis only runs when the
user explicitly clicks "Шинжилгээ эхлүүлэх".

A single-process in-memory dict is sufficient for this local/capstone
deployment; swap for Redis/a DB if this needs to run across multiple
backend workers.
"""
from __future__ import annotations

import hashlib
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Optional

_LOCK = threading.Lock()
_TTL_SECONDS = 60 * 60  # 1 hour


@dataclass
class StoredUpload:
    upload_id: str
    filename: str
    content: bytes
    dataset_hash: str
    created_at: float
    cached_analysis: Optional[dict] = None


_STORE: Dict[str, StoredUpload] = {}


def _purge_expired() -> None:
    now = time.time()
    expired = [k for k, v in _STORE.items() if now - v.created_at > _TTL_SECONDS]
    for k in expired:
        _STORE.pop(k, None)


def save_upload(filename: str, content: bytes) -> StoredUpload:
    with _LOCK:
        _purge_expired()
        upload_id = uuid.uuid4().hex
        dataset_hash = hashlib.sha256(content).hexdigest()
        record = StoredUpload(
            upload_id=upload_id,
            filename=filename,
            content=content,
            dataset_hash=dataset_hash,
            created_at=time.time(),
        )
        _STORE[upload_id] = record
        return record


def get_upload(upload_id: str) -> Optional[StoredUpload]:
    with _LOCK:
        _purge_expired()
        return _STORE.get(upload_id)


def cache_analysis(upload_id: str, analysis_payload: dict) -> None:
    with _LOCK:
        record = _STORE.get(upload_id)
        if record:
            record.cached_analysis = analysis_payload
