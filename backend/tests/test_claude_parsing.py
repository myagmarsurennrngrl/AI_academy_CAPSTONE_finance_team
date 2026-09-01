import json
from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.services import anthropic_service


VALID_ANALYSIS = {
    "executive_summary": "Sales grew steadily.",
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


def _fake_response(text: str):
    block = SimpleNamespace(type="text", text=text)
    return SimpleNamespace(content=[block])


@pytest.fixture(autouse=True)
def _mock_settings(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("USE_MOCK_AI", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_extract_json_handles_markdown_fences():
    text = "```json\n" + json.dumps(VALID_ANALYSIS) + "\n```"
    parsed = anthropic_service._extract_json(text)
    assert parsed["executive_summary"] == "Sales grew steadily."


def test_extract_json_finds_object_within_prose():
    text = "Here is the result:\n" + json.dumps(VALID_ANALYSIS) + "\nThanks."
    parsed = anthropic_service._extract_json(text)
    assert parsed["performance_overview"] == "Overview text."


def test_generate_english_analysis_parses_valid_json(monkeypatch):
    class FakeMessages:
        def create(self, **kwargs):
            return _fake_response(json.dumps(VALID_ANALYSIS))

    class FakeClient:
        def __init__(self, api_key=None, default_headers=None):
            self.messages = FakeMessages()

    monkeypatch.setattr(anthropic_service, "Anthropic", FakeClient)

    # bundle is only used on the USE_MOCK_AI path, so None is fine here.
    result = anthropic_service.generate_english_analysis(bundle=None, compact_payload={"kpis": {}})
    assert result.executive_summary == "Sales grew steadily."


def test_generate_english_analysis_retries_once_then_succeeds(monkeypatch):
    calls = {"count": 0}

    class FakeMessages:
        def create(self, **kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                return _fake_response("not json at all")
            return _fake_response(json.dumps(VALID_ANALYSIS))

    class FakeClient:
        def __init__(self, api_key=None, default_headers=None):
            self.messages = FakeMessages()

    monkeypatch.setattr(anthropic_service, "Anthropic", FakeClient)

    result = anthropic_service.generate_english_analysis(bundle=None, compact_payload={"kpis": {}})
    assert calls["count"] == 2
    assert result.executive_summary == "Sales grew steadily."


def test_generate_english_analysis_raises_after_two_failures(monkeypatch):
    class FakeMessages:
        def create(self, **kwargs):
            return _fake_response("still not json")

    class FakeClient:
        def __init__(self, api_key=None, default_headers=None):
            self.messages = FakeMessages()

    monkeypatch.setattr(anthropic_service, "Anthropic", FakeClient)

    with pytest.raises(anthropic_service.AnthropicServiceError):
        anthropic_service.generate_english_analysis(bundle=None, compact_payload={"kpis": {}})
