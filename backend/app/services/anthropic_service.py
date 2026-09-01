"""Calls the Anthropic API to turn the compact deterministic analytics JSON
into a structured English management analysis (spec sections 22-23, 25).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict

from anthropic import Anthropic, APIError, APIStatusError, AuthenticationError, RateLimitError
from pydantic import ValidationError

from app.config import get_settings
from app.models.schemas import AIAnalysisResult
from app.prompts.sales_analysis_prompt import SYSTEM_PROMPT, build_user_prompt
from app.services.mock_ai import mock_claude_analysis
from app.models.schemas import FullAnalysisBundle

logger = logging.getLogger(__name__)


class AnthropicServiceError(Exception):
    """Raised for any Anthropic call failure that the API layer should surface cleanly."""


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    # Strip markdown code fences if the model added them despite instructions.
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in Claude's response.")
    return json.loads(text[start : end + 1])


def _call_claude(client: Anthropic, model: str, user_prompt: str) -> str:
    response = client.messages.create(
        model=model,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def generate_english_analysis(bundle: FullAnalysisBundle, compact_payload: Dict[str, Any]) -> AIAnalysisResult:
    settings = get_settings()

    if settings.use_mock_ai:
        return mock_claude_analysis(bundle)

    if not settings.anthropic_api_key:
        raise AnthropicServiceError(
            "ANTHROPIC_API_KEY is not configured on the backend. Set it in backend/.env, or enable "
            "USE_MOCK_AI=true for local UI testing."
        )

    default_headers = (
        {"anthropic-workspace-id": settings.anthropic_workspace_id}
        if settings.anthropic_workspace_id
        else None
    )
    client = Anthropic(api_key=settings.anthropic_api_key, default_headers=default_headers)
    user_prompt = build_user_prompt(json.dumps(compact_payload, ensure_ascii=False))

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            raw_text = _call_claude(client, settings.anthropic_model, user_prompt)
            parsed = _extract_json(raw_text)
            return AIAnalysisResult(**parsed)
        except AuthenticationError as exc:
            raise AnthropicServiceError("Anthropic API key was rejected (authentication error).") from exc
        except RateLimitError as exc:
            raise AnthropicServiceError("Anthropic API rate limit reached. Please try again shortly.") from exc
        except APIStatusError as exc:
            raise AnthropicServiceError(f"Anthropic API returned an error: {exc}") from exc
        except APIError as exc:
            raise AnthropicServiceError(f"Anthropic API is currently unavailable: {exc}") from exc
        except (ValueError, json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            logger.warning("Claude returned malformed JSON on attempt %s: %s", attempt + 1, exc)
            user_prompt = (
                build_user_prompt(json.dumps(compact_payload, ensure_ascii=False))
                + "\n\nIMPORTANT: Your previous response was not valid JSON matching the required "
                "schema. Respond with ONLY the raw JSON object this time - no markdown, no prose."
            )
            continue

    raise AnthropicServiceError(
        f"Claude did not return valid structured JSON after a retry: {last_error}"
    )
