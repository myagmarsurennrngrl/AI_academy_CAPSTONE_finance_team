"""Calls the OpenAI Responses API to translate Claude's finished English
analysis into professional Mongolian (spec section 24, 25).

OpenAI's role is translation/localization only - it never re-analyzes the
dataset or changes Claude's numeric conclusions.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict

from openai import (
    APIError,
    APIStatusError,
    AuthenticationError,
    OpenAI,
    RateLimitError,
)
from pydantic import ValidationError

from app.config import get_settings
from app.models.schemas import AIAnalysisResult, FullAnalysisBundle
from app.prompts import mongolian_translation_prompt
from app.prompts import sales_analysis_prompt
from app.services.mock_ai import mock_claude_analysis, mock_mongolian_analysis

logger = logging.getLogger(__name__)


class OpenAIServiceError(Exception):
    """Raised for any OpenAI call failure - callers should degrade gracefully
    (keep showing the English Claude result) rather than fail the whole request."""


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in OpenAI's response.")
    return json.loads(text[start : end + 1])


def _call_openai(client: OpenAI, model: str, system_prompt: str, user_prompt: str) -> str:
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.output_text


def _run_openai_json_call(
    client: OpenAI, model: str, system_prompt: str, initial_user_prompt: str
) -> AIAnalysisResult:
    """Shared call+parse+one-retry loop used by both the translation call and
    the (temporary) OpenAI-as-analyst fallback below."""
    user_prompt = initial_user_prompt
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            raw_text = _call_openai(client, model, system_prompt, user_prompt)
            parsed = _extract_json(raw_text)
            return AIAnalysisResult(**parsed)
        except AuthenticationError as exc:
            raise OpenAIServiceError("OpenAI API key was rejected (authentication error).") from exc
        except RateLimitError as exc:
            raise OpenAIServiceError("OpenAI API rate limit reached. Please try again shortly.") from exc
        except APIStatusError as exc:
            raise OpenAIServiceError(f"OpenAI API returned an error: {exc}") from exc
        except APIError as exc:
            raise OpenAIServiceError(f"OpenAI API is currently unavailable: {exc}") from exc
        except (ValueError, json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            logger.warning("OpenAI returned malformed JSON on attempt %s: %s", attempt + 1, exc)
            user_prompt = (
                initial_user_prompt
                + "\n\nIMPORTANT: Your previous response was not valid JSON matching the required "
                "schema. Respond with ONLY the raw JSON object this time - no markdown, no prose."
            )
            continue

    raise OpenAIServiceError(f"OpenAI did not return valid structured JSON after a retry: {last_error}")


def translate_to_mongolian(english: AIAnalysisResult) -> AIAnalysisResult:
    settings = get_settings()

    if settings.use_mock_ai:
        return mock_mongolian_analysis(english)

    if not settings.openai_api_key:
        raise OpenAIServiceError(
            "OPENAI_API_KEY is not configured on the backend. Set it in backend/.env, or enable "
            "USE_MOCK_AI=true for local UI testing."
        )

    client = OpenAI(api_key=settings.openai_api_key)
    english_json = json.dumps(english.model_dump(), ensure_ascii=False)
    user_prompt = mongolian_translation_prompt.build_user_prompt(english_json)
    return _run_openai_json_call(
        client, settings.openai_model, mongolian_translation_prompt.SYSTEM_PROMPT, user_prompt
    )


def generate_english_analysis_openai(
    bundle: FullAnalysisBundle, compact_payload: Dict[str, Any]
) -> AIAnalysisResult:
    """TEMPORARY fallback: has OpenAI perform the English business analysis
    (normally Claude's job - see anthropic_service.generate_english_analysis)
    using the exact same analysis prompt/schema. Used only while
    USE_OPENAI_FOR_ANALYSIS=true, as a stopgap when Anthropic access is
    unavailable. Switch the flag back to false to restore the Claude+OpenAI
    split described in the spec."""
    settings = get_settings()

    if settings.use_mock_ai:
        return mock_claude_analysis(bundle)

    if not settings.openai_api_key:
        raise OpenAIServiceError(
            "OPENAI_API_KEY is not configured on the backend. Set it in backend/.env, or enable "
            "USE_MOCK_AI=true for local UI testing."
        )

    client = OpenAI(api_key=settings.openai_api_key)
    user_prompt = sales_analysis_prompt.build_user_prompt(json.dumps(compact_payload, ensure_ascii=False))
    return _run_openai_json_call(client, settings.openai_model, sales_analysis_prompt.SYSTEM_PROMPT, user_prompt)
