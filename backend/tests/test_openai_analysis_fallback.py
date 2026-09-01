"""Covers the temporary USE_OPENAI_FOR_ANALYSIS fallback path (spec deviation
requested to work around an Anthropic workspace-id issue - see config.py)."""
import json
from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.services import anthropic_service, openai_service

VALID_ANALYSIS = {
    "executive_summary": "OpenAI-authored summary.",
    "performance_overview": "Overview text.",
    "top_drivers": [],
    "channel_insights": [],
    "brand_product_insights": [],
    "pricing_discount_insights": [],
    "promotion_insights": [],
    "returns_inventory_risks": [],
    "opportunities": [],
    "management_recommendations": [],
    "data_limitations": [],
}


class FakeResponses:
    def __init__(self, text):
        self._text = text

    def create(self, **kwargs):
        return SimpleNamespace(output_text=self._text)


class FakeOpenAIClient:
    def __init__(self, api_key=None, text=json.dumps(VALID_ANALYSIS)):
        self.responses = FakeResponses(text)


@pytest.fixture(autouse=True)
def _mock_settings(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("USE_MOCK_AI", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_generate_english_analysis_openai_parses_valid_json(monkeypatch):
    monkeypatch.setattr(openai_service, "OpenAI", lambda api_key=None: FakeOpenAIClient())
    result = openai_service.generate_english_analysis_openai(bundle=None, compact_payload={"kpis": {}})
    assert result.executive_summary == "OpenAI-authored summary."


def test_anthropic_client_receives_workspace_id_header(monkeypatch):
    captured = {}

    class FakeMessages:
        def create(self, **kwargs):
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(VALID_ANALYSIS))])

    class FakeClient:
        def __init__(self, api_key=None, default_headers=None):
            captured["default_headers"] = default_headers
            self.messages = FakeMessages()

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_WORKSPACE_ID", "wrkspc_test123")
    get_settings.cache_clear()
    monkeypatch.setattr(anthropic_service, "Anthropic", FakeClient)

    anthropic_service.generate_english_analysis(bundle=None, compact_payload={"kpis": {}})
    assert captured["default_headers"] == {"anthropic-workspace-id": "wrkspc_test123"}
