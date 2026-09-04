"""AI data assistant: deterministic query tools, the OpenAI tool loop (with a
fake client) and the /api/chat endpoint in mock mode."""
import json
import os
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.models.schemas import ChatMessage, ChatRequest, FilterSpec
from app.services import analysis_pipeline, chat_service, chat_tools, session_store
from app.services.chat_tools import AggregateArgs, CompareArgs, SearchArgs, ToolError, ToolFilters

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "app", "static", "sample_data.xlsx")


@pytest.fixture(scope="module")
def frame() -> pd.DataFrame:
    with open(SAMPLE, "rb") as fh:
        content = fh.read()
    prepared, *_ = analysis_pipeline._prepare_frame(content, "sample_data.xlsx")
    return prepared


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

def test_aggregate_totals_match_frame(frame):
    result = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales", "volume_units", "gross_margin_pct", "row_count"]))
    total = result["total"]
    assert total["net_sales"] == pytest.approx(round(frame["net_sales"].sum()))
    assert total["volume_units"] == pytest.approx(round(frame["volume_units"].sum()))
    assert total["gross_margin_pct"] == pytest.approx(round(frame["gross_profit"].sum() / frame["net_sales"].sum() * 100, 1))
    assert total["row_count"] == len(frame)
    assert result["scope"]["matched_rows"] == len(frame)
    assert result["rows"] == []


def test_aggregate_by_brand_has_shares_and_sorted_desc(frame):
    result = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], group_by="brand"))
    rows = result["rows"]
    assert len(rows) == frame["brand"].nunique()
    assert [r["net_sales"] for r in rows] == sorted((r["net_sales"] for r in rows), reverse=True)
    assert sum(r["share_pct"] for r in rows) == pytest.approx(100.0, abs=0.5)
    expected_top = frame.groupby("brand")["net_sales"].sum().idxmax()
    assert rows[0]["brand"] == expected_top


def test_aggregate_monthly_series_is_chronological(frame):
    result = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], time_grain="month"))
    months = [r["period"] for r in result["rows"]]
    assert months == sorted(months)
    assert months == sorted(frame["date"].dt.strftime("%Y-%m").unique())
    # "group_by": "month" is accepted as a time grain too
    lenient = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], group_by="month"))
    assert [r["period"] for r in lenient["rows"]] == months


def test_filters_are_case_insensitive_and_unknown_values_reported(frame):
    brand = frame["brand"].iloc[0]
    exact = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], filters=ToolFilters(brands=[brand])))
    loose = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], filters=ToolFilters(brands=[brand.lower()])))
    assert loose["total"]["net_sales"] == exact["total"]["net_sales"]
    assert loose["scope"]["filters"]["brands"] == [brand]

    missing = chat_tools.aggregate(frame, AggregateArgs(measures=["net_sales"], filters=ToolFilters(products=["No Such Product"])))
    assert missing["scope"]["matched_rows"] == 0
    assert any("No product named" in n for n in missing["scope"]["notes"])


def test_compare_months_for_one_product_matches_pandas(frame):
    product = frame["product"].iloc[0]
    months = sorted(frame["date"].dt.strftime("%Y-%m").unique())
    a, b = months[-2], months[-3]  # two complete months in the sample
    result = chat_tools.compare_periods(
        frame, CompareArgs(measure="net_sales", period_a=a, period_b=b, filters=ToolFilters(products=[product]))
    )
    sub = frame[frame["product"] == product]
    va = sub[sub["date"].dt.strftime("%Y-%m") == a]["net_sales"].sum()
    vb = sub[sub["date"].dt.strftime("%Y-%m") == b]["net_sales"].sum()
    assert result["total"]["value_a"] == pytest.approx(round(va))
    assert result["total"]["value_b"] == pytest.approx(round(vb))
    assert result["total"]["pct_change"] == pytest.approx(round((va - vb) / abs(vb) * 100, 1))
    assert result["period_a"]["months_with_data"] == 1
    assert result["period_b"]["months_requested"] == 1


def test_compare_periods_by_group_and_missing_period(frame):
    result = chat_tools.compare_periods(frame, CompareArgs(measure="volume_units", period_a="2026", period_b="2025", group_by="channel"))
    assert result["period_b"]["rows"] == 0
    assert result["total"]["value_b"] is None
    assert result["total"]["pct_change"] is None
    assert any("no rows for period 2025" in n for n in result["scope"]["notes"])
    # 2026 is only partly covered (4 of 12 months) and that is reported
    assert result["period_a"]["months_with_data"] < result["period_a"]["months_requested"]
    assert any("only partly covered" in n for n in result["scope"]["notes"])
    assert result["by_group"] and "sales_channel" in result["by_group"][0]


def test_resolve_period_formats():
    assert chat_tools.resolve_period("2025") == ("2025-01-01", "2025-12-31", "2025")
    assert chat_tools.resolve_period("2026-02") == ("2026-02-01", "2026-02-28", "2026-02")
    assert chat_tools.resolve_period("2026-Q2") == ("2026-04-01", "2026-06-30", "2026-Q2")
    assert chat_tools.resolve_period("2026H2") == ("2026-07-01", "2026-12-31", "2026-H2")
    assert chat_tools.resolve_period({"date_from": "2026-04-01", "date_to": "2026-04-15"})[:2] == ("2026-04-01", "2026-04-15")
    assert chat_tools.resolve_period("2026-05-01..2026-05-31")[:2] == ("2026-05-01", "2026-05-31")
    with pytest.raises(ToolError):
        chat_tools.resolve_period("last year")


def test_search_values_is_case_insensitive(frame):
    brand = frame["brand"].iloc[0]
    result = chat_tools.search_values(frame, SearchArgs(dimension="brand", query=brand[:3].lower()))
    assert any(m["value"] == brand for m in result["matches"])
    alias = chat_tools.search_values(frame, SearchArgs(dimension="channel", query=""))
    assert alias["dimension"] == "sales_channel"
    assert alias["total_distinct"] == frame["sales_channel"].nunique()
    with pytest.raises(ToolError):
        chat_tools.resolve_dimension("colour")


def test_unknown_measure_is_a_tool_error(frame):
    with pytest.raises(ToolError):
        chat_tools.aggregate(frame, AggregateArgs(measures=["ebitda"]))


def test_dataset_overview_lists_dimensions(frame):
    overview = chat_tools.dataset_overview(frame, "sample_data.xlsx")
    assert overview["rows"] == len(frame)
    assert overview["years"] == ["2026"]
    assert overview["brands"]["count"] == frame["brand"].nunique()
    assert "net_sales" in overview["measures"] and "gross_margin_pct" in overview["measures"]


# ---------------------------------------------------------------------------
# Tool loop with a fake OpenAI client
# ---------------------------------------------------------------------------

class _FakeResponses:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            call = SimpleNamespace(
                type="function_call",
                name="aggregate",
                call_id="call_1",
                arguments=json.dumps({"measures": ["net_sales"], "group_by": "brand", "top_n": 2}),
            )
            return SimpleNamespace(id="resp_1", output=[call], output_text="")
        return SimpleNamespace(id="resp_2", output=[SimpleNamespace(type="message")], output_text="Aurora leads with ₮1,234.")


class _FakeOpenAI:
    last = None

    def __init__(self, api_key=None, **kwargs):
        self.responses = _FakeResponses()
        _FakeOpenAI.last = self


def test_tool_loop_executes_function_calls_and_returns_answer(frame, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", False)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(chat_service, "OpenAI", _FakeOpenAI)

    record = session_store.StoredUpload(upload_id="u1", filename="sample_data.xlsx", content=b"", dataset_hash="h", created_at=0.0)
    record.analytics_frame = frame
    req = ChatRequest(messages=[ChatMessage(role="user", content="Which brand sells the most?")], locale="en", filters=FilterSpec())

    response = chat_service.answer_question(record, req)

    assert response.answer == "Aurora leads with ₮1,234."
    assert [c.name for c in response.tool_calls] == ["aggregate"]
    assert response.tool_calls[0].arguments["group_by"] == "brand"
    assert response.meta.tool_rounds == 1 and response.meta.mock_ai is False

    calls = _FakeOpenAI.last.responses.calls
    assert len(calls) == 2
    assert calls[0]["input"][0] == {"role": "user", "content": "Which brand sells the most?"}
    assert "Densmaa" in calls[0]["instructions"] and "Brands (" in calls[0]["instructions"]
    assert {t["name"] for t in calls[0]["tools"]} == {"aggregate", "compare_periods", "search_values", "forecast"}
    # optional arguments need non-strict schemas (strict is the API default)
    assert all(t["strict"] is False for t in calls[0]["tools"])
    # second round continues the response and feeds the tool result back
    assert calls[1]["previous_response_id"] == "resp_1"
    output_item = calls[1]["input"][0]
    assert output_item["type"] == "function_call_output" and output_item["call_id"] == "call_1"
    payload = json.loads(output_item["output"])
    assert payload["total"]["net_sales"] == pytest.approx(round(frame["net_sales"].sum()))
    assert len(payload["rows"]) == 2


def test_execute_tool_reports_bad_arguments_as_data(frame):
    result = chat_service.execute_tool("compare_periods", {"period_a": "2026-06"}, frame, "u1")
    assert "error" in result and "period_b" in result["error"]
    result = chat_service.execute_tool("aggregate", {"group_by": "colour"}, frame, "u1")
    assert "Unknown dimension" in result["error"]
    result = chat_service.execute_tool("nope", {}, frame, "u1")
    assert "Unknown tool" in result["error"]


def test_missing_openai_key_is_a_clean_error(frame, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", False)
    monkeypatch.setattr(settings, "openai_api_key", "")
    record = session_store.StoredUpload(upload_id="u2", filename="f.xlsx", content=b"", dataset_hash="h", created_at=0.0)
    record.analytics_frame = frame
    with pytest.raises(chat_service.ChatServiceError):
        chat_service.answer_question(record, ChatRequest(messages=[ChatMessage(role="user", content="hi")]))


# ---------------------------------------------------------------------------
# Endpoint (mock AI)
# ---------------------------------------------------------------------------

@pytest.fixture()
def client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", True)
    monkeypatch.setattr(settings, "auth_disabled", True)
    return TestClient(app)


def _upload(client):
    with open(SAMPLE, "rb") as fh:
        response = client.post("/api/upload", files={"file": ("sample_data.xlsx", fh.read())})
    assert response.status_code == 200
    return response.json()["upload_id"]


def test_chat_endpoint_mock_mode_answers_from_real_numbers(client):
    upload_id = _upload(client)
    ds = client.get(f"/api/dataset/{upload_id}").json()
    df = pd.DataFrame(ds["columns"])
    brand = ds["dimensions"]["brands"][0]

    body = {
        "messages": [{"role": "user", "content": "Aurora хэдэн төгрөгийн борлуулалт хийсэн бэ?"}],
        "locale": "mn",
        "filters": {"brands": [brand]},
        "module": "drivers",
    }
    response = client.post(f"/api/chat/{upload_id}", json=body)
    assert response.status_code == 200
    data = response.json()
    assert data["answer"].startswith("[MOCK AI]")
    assert f"Brand: {brand}" in data["answer"]
    expected = f"{round(df.loc[df['brand'] == brand, 'net_sales'].sum()):,.0f}"
    assert expected in data["answer"]
    assert data["meta"]["mock_ai"] is True
    assert data["tool_calls"][0]["name"] == "aggregate"


def test_chat_endpoint_validation(client):
    upload_id = _upload(client)
    assert client.post("/api/chat/doesnotexist", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 404
    assert client.post(f"/api/chat/{upload_id}", json={"messages": [{"role": "assistant", "content": "hi"}]}).status_code == 400
    assert client.post(f"/api/chat/{upload_id}", json={"messages": []}).status_code == 422
    assert client.post(f"/api/chat/{upload_id}", json={"messages": [{"role": "user", "content": ""}]}).status_code == 422


def test_chat_endpoint_requires_login(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_disabled", False)
    response = TestClient(app).post("/api/chat/anything", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 401
