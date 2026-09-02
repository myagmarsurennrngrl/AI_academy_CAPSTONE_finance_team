"""In-memory store bridging the upload step and the analysis steps.

The user's file is uploaded once; the cleaned analytics frame is prepared
once (on first dataset request) and reused by every subsequent filtered
driver-model / AI-insight call, each of which is cached per filter hash.

A single-process in-memory dict is sufficient for this local/capstone
deployment; swap for Redis/a DB if this needs to run across multiple
backend workers.
"""
from __future__ import annotations

import hashlib
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import pandas as pd

_LOCK = threading.Lock()
_TTL_SECONDS = 60 * 60  # 1 hour
_MAX_UPLOADS = 20


@dataclass
class StoredUpload:
    upload_id: str
    filename: str
    content: bytes
    dataset_hash: str
    created_at: float
    # Prepared analytics (set lazily by analysis_pipeline.prepare_upload)
    analytics_frame: Optional[pd.DataFrame] = None
    profile: Any = None
    quality_report: Any = None
    excluded_rows: int = 0
    dataset_payload: Optional[dict] = None
    # Per-filter caches keyed by dataset_service.filter_hash(spec)
    driver_cache: Dict[str, dict] = field(default_factory=dict)
    insight_cache: Dict[str, dict] = field(default_factory=dict)
    forecast_cache: Dict[str, dict] = field(default_factory=dict)
    # Legacy single-shot analysis cache (POST /api/analysis/{id})
    cached_analysis: Optional[dict] = None
    prepare_lock: threading.Lock = field(default_factory=threading.Lock)


_STORE: Dict[str, StoredUpload] = {}


def _purge_expired() -> None:
    now = time.time()
    expired = [k for k, v in _STORE.items() if now - v.created_at > _TTL_SECONDS]
    for k in expired:
        _STORE.pop(k, None)
    if len(_STORE) > _MAX_UPLOADS:
        oldest = sorted(_STORE.values(), key=lambda r: r.created_at)[: len(_STORE) - _MAX_UPLOADS]
        for record in oldest:
            _STORE.pop(record.upload_id, None)


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


def cache_drivers(upload_id: str, key: str, payload: dict) -> None:
    with _LOCK:
        record = _STORE.get(upload_id)
        if record:
            record.driver_cache[key] = payload


def get_cached_drivers(upload_id: str, key: str) -> Optional[dict]:
    with _LOCK:
        record = _STORE.get(upload_id)
        return record.driver_cache.get(key) if record else None


def cache_insight(upload_id: str, key: str, payload: dict) -> None:
    with _LOCK:
        record = _STORE.get(upload_id)
        if record:
            record.insight_cache[key] = payload


def get_cached_insight(upload_id: str, key: str) -> Optional[dict]:
    with _LOCK:
        record = _STORE.get(upload_id)
        return record.insight_cache.get(key) if record else None


def cache_forecast(upload_id: str, key: str, payload: dict) -> None:
    with _LOCK:
        record = _STORE.get(upload_id)
        if record:
            record.forecast_cache[key] = payload


def get_cached_forecast(upload_id: str, key: str) -> Optional[dict]:
    with _LOCK:
        record = _STORE.get(upload_id)
        return record.forecast_cache.get(key) if record else None
