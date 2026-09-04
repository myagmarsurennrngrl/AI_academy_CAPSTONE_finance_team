"""AI data assistant ("chat") for the dashboard.

The user asks a free-form question about the uploaded Excel dataset. The
model (OpenAI, function calling) may only answer through the deterministic
tools in ``chat_tools`` - it never sees raw rows and never writes code. Each
tool call is executed here in Python, the rounded result is handed back, and
the model composes the final answer from those numbers only.

Provider: OpenAI (the project currently routes both AI stages through OpenAI,
see ``Settings.use_openai_for_analysis``). ``USE_MOCK_AI=true`` returns a
deterministic offline answer built from the real numbers.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from openai import APIError, APIStatusError, AuthenticationError, OpenAI, RateLimitError
from pydantic import ValidationError

from app.config import get_settings
from app.models.schemas import ChatMeta, ChatRequest, ChatResponse, ChatToolCall, FilterSpec
from app.services import chat_tools, dataset_service, session_store
from app.services.session_store import StoredUpload

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MAX_HISTORY_MESSAGES = 20
REQUEST_TIMEOUT_SECONDS = 120


class ChatServiceError(Exception):
    """Raised for any failure the API layer should surface cleanly (502)."""


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI Responses API function tools)
# ---------------------------------------------------------------------------

_FILTERS_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "description": (
        "Restrict the rows used. Empty list = no restriction. Values must be exact names from the dataset "
        "(case-insensitive match is tolerated; use search_values when unsure). Dates are inclusive YYYY-MM-DD."
    ),
    "properties": {
        "brands": {"type": "array", "items": {"type": "string"}},
        "products": {"type": "array", "items": {"type": "string"}},
        "channels": {"type": "array", "items": {"type": "string"}, "description": "sales_channel values"},
        "channel_types": {"type": "array", "items": {"type": "string"}},
        "sales_types": {"type": "array", "items": {"type": "string"}, "description": "POS (sell-out) and/or SHIPMENT (sell-in)"},
        "date_from": {"type": ["string", "null"]},
        "date_to": {"type": ["string", "null"]},
    },
}

_PERIOD_DESCRIPTION = (
    "A period: 'YYYY' (calendar year), 'YYYY-MM' (month), 'YYYY-Qn' (quarter), 'YYYY-Hn' (half-year), "
    "'YYYY-MM-DD..YYYY-MM-DD' (custom range) or an object {date_from, date_to}."
)

TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        # strict mode (the API default) would require every property to be listed
        # as required and forbid optional arguments - our tools are intentionally lenient.
        "strict": False,
        "name": "aggregate",
        "description": (
            "Compute totals of one or more measures over the dataset, optionally broken down by one dimension "
            "(brand, product, sales_channel, channel_type, sales_type) and/or a time grain (month, quarter, year). "
            "Returns the grand total plus rows per group with share_pct. Use this for 'how much', 'which is the "
            "biggest', 'top N', 'monthly trend' questions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "measures": {
                    "type": "array",
                    "items": {"type": "string", "enum": list(chat_tools.MEASURES)},
                    "description": "Measures to compute (default net_sales and volume_units).",
                },
                "group_by": {"type": ["string", "null"], "enum": list(chat_tools.DIMENSION_COLUMNS) + [None], "description": "Dimension to break down by."},
                "time_grain": {"type": ["string", "null"], "enum": ["month", "quarter", "year", None], "description": "Break down over time."},
                "filters": _FILTERS_SCHEMA,
                "top_n": {"type": "integer", "minimum": 1, "maximum": chat_tools.MAX_ROWS, "description": "Maximum groups to return (default 20)."},
                "sort": {"type": "string", "enum": ["desc", "asc"], "description": "Sort groups by the first measure (default desc)."},
            },
        },
    },
    {
        "type": "function",
        # strict mode (the API default) would require every property to be listed
        # as required and forbid optional arguments - our tools are intentionally lenient.
        "strict": False,
        "name": "compare_periods",
        "description": (
            "Compare one measure between two periods (e.g. 2025 vs 2024, 2026-06 vs 2026-05, Q2 vs Q1) for the "
            "whole scope and optionally per group. Returns value_a, value_b, abs_change and pct_change = "
            "(a - b) / |b| * 100, plus how many months of each period actually have data. Use this for any "
            "growth / decline / year-over-year / month-over-month question."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "measure": {"type": "string", "enum": list(chat_tools.MEASURES), "description": "Measure to compare (default net_sales)."},
                "period_a": {"description": "The current / later period. " + _PERIOD_DESCRIPTION},
                "period_b": {"description": "The base / earlier period. " + _PERIOD_DESCRIPTION},
                "filters": _FILTERS_SCHEMA,
                "group_by": {"type": ["string", "null"], "enum": list(chat_tools.DIMENSION_COLUMNS) + [None]},
                "top_n": {"type": "integer", "minimum": 1, "maximum": chat_tools.MAX_ROWS},
            },
            "required": ["period_a", "period_b"],
        },
    },
    {
        "type": "function",
        # strict mode (the API default) would require every property to be listed
        # as required and forbid optional arguments - our tools are intentionally lenient.
        "strict": False,
        "name": "search_values",
        "description": (
            "Find the exact spelling of a brand / product / channel / channel type / sales type in the data. "
            "Case-insensitive substring search; returns matching values with their row counts. Call this before "
            "filtering by a name the user typed that is not in the lists you were given."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dimension": {"type": "string", "enum": list(chat_tools.DIMENSION_COLUMNS)},
                "query": {"type": "string", "description": "Text to search for (empty = list the most frequent values)."},
                "limit": {"type": "integer", "minimum": 1, "maximum": chat_tools.MAX_ROWS},
            },
            "required": ["dimension"],
        },
    },
    {
        "type": "function",
        # strict mode (the API default) would require every property to be listed
        # as required and forbid optional arguments - our tools are intentionally lenient.
        "strict": False,
        "name": "forecast",
        "description": (
            "Run the platform's backtested monthly forecast (same engine as the Forecast module) for net_sales, "
            "volume_units or gross_profit up to a given month (YYYY-MM, after the data's last month), optionally "
            "for a filtered scope. Returns the chosen method, its backtest WAPE, monthly point forecasts with an "
            "80% band and the forecast total. Use only for questions about the future."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "enum": ["net_sales", "volume_units", "gross_profit"]},
                "forecast_until": {"type": "string", "description": "Last month to forecast, inclusive (YYYY-MM)."},
                "filters": _FILTERS_SCHEMA,
            },
            "required": ["forecast_until"],
        },
    },
]


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

def _fmt_values(block: Dict[str, Any]) -> str:
    values = block.get("values") or []
    text = ", ".join(str(v) for v in values) if values else "(none)"
    if block.get("truncated"):
        text += f" … ({block['count']} in total - use search_values for the rest)"
    return text


def build_system_prompt(overview: Dict[str, Any], scope_spec: FilterSpec, scope_label: str, module: str, locale: str) -> str:
    language = "Mongolian" if locale == "mn" else "English"
    measures = "\n".join(f"  - {name}: {desc}" for name, desc in overview["measures"].items())
    scope_json = json.dumps({k: v for k, v in scope_spec.model_dump().items() if v}, ensure_ascii=False)
    return f"""You are the data assistant inside Densmaa 1.0, a sales analysis and forecasting dashboard.
You answer questions ONLY about the Excel dataset the user uploaded, and ONLY by calling the provided tools.

## Rules
1. Every number you state must come from a tool result in this conversation. Never estimate, extrapolate, or use outside knowledge. If the data cannot answer (period not covered, name not found), say so plainly and say what the data does cover.
2. Before filtering by a brand / product / channel the user typed, make sure it is an exact value from the lists below; otherwise call search_values first.
3. Questions unrelated to this dataset (general knowledge, other companies, coding, advice not grounded in the data): decline in one sentence and say you can only answer about the uploaded sales data.
4. Answer in the language of the user's latest message; when unclear, use {language}. Keep the user's product / brand / channel names exactly as spelled in the data.
5. Style: concise (2-6 sentences or a short bullet list). Always name the measure, the period and the scope (filters) you used. Currency is MNT (₮): whole numbers with thousands separators. Units: whole numbers. Percentages: one decimal. No markdown tables; use bullets.
6. Growth = (current - previous) / |previous|; use compare_periods for it. If a period is only partly covered by the data, say so.
7. Vocabulary: sell-out (POS) and sell-in (SHIPMENT) are different concepts - never add them together silently. Describe relationships as associations, never as proven causes.
8. Default scope: the user's current dashboard filter (below) when it is not empty; mention the scope you applied in a short clause. If the question names a different brand / product / channel / period, follow the question instead.
9. For questions about the future use the forecast tool and always quote the method and its backtest WAPE.

## Dataset
- File: {overview['filename']} · {overview['rows']:,} rows · dates {overview['date_min']} to {overview['date_max']}
- Months with data: {', '.join(overview['months']) or '(none)'}
- Years with data: {', '.join(overview['years']) or '(none)'} ("latest month" = {overview['months'][-1] if overview['months'] else 'n/a'})
- Brands ({overview['brands']['count']}): {_fmt_values(overview['brands'])}
- Products ({overview['products']['count']}): {_fmt_values(overview['products'])}
- Sales channels ({overview['sales_channels']['count']}): {_fmt_values(overview['sales_channels'])}
- Channel types ({overview['channel_types']['count']}): {_fmt_values(overview['channel_types'])}
- Sales types: {_fmt_values(overview['sales_types'])}
- Currency: {overview['currency']}
- Measures available:
{measures}

## Current dashboard context
- Module: {module}
- Active dashboard filter (FilterSpec): {scope_json or '{}'}
- Scope in words: {scope_label}
"""


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _parse_arguments(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"__invalid_json__": raw}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def execute_tool(name: str, arguments: Dict[str, Any], frame, upload_id: str) -> Dict[str, Any]:
    """Runs one tool call. Errors are returned as data so the model can
    correct itself instead of the whole request failing."""
    if "__invalid_json__" in arguments:
        return {"error": "The tool arguments were not valid JSON."}
    try:
        if name == "aggregate":
            return chat_tools.aggregate(frame, chat_tools.AggregateArgs(**arguments))
        if name == "compare_periods":
            return chat_tools.compare_periods(frame, chat_tools.CompareArgs(**arguments))
        if name == "search_values":
            return chat_tools.search_values(frame, chat_tools.SearchArgs(**arguments))
        if name == "forecast":
            return chat_tools.forecast(
                frame,
                chat_tools.ForecastArgs(**arguments),
                cache_get=lambda key: session_store.get_cached_forecast(upload_id, key),
                cache_put=lambda key, payload: session_store.cache_forecast(upload_id, key, payload),
            )
        return {"error": f"Unknown tool '{name}'."}
    except ValidationError as exc:
        return {"error": "Invalid arguments: " + "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())}
    except (chat_tools.ToolError, ValueError) as exc:
        return {"error": str(exc)}
    except Exception:  # noqa: BLE001
        logger.exception("Chat tool %s failed", name)
        return {"error": "The calculation failed unexpectedly. Try a simpler question or different filters."}


# ---------------------------------------------------------------------------
# Mock (USE_MOCK_AI=true)
# ---------------------------------------------------------------------------

def _mock_answer(frame, req: ChatRequest, scope_spec: FilterSpec, scope_label: str, model: str) -> ChatResponse:
    args = chat_tools.AggregateArgs(
        measures=["net_sales", "volume_units", "gross_margin_pct", "row_count"],
        filters=chat_tools.ToolFilters(**scope_spec.model_dump()),
    )
    totals = chat_tools.aggregate(frame, args)["total"]
    fmt = lambda v: "—" if v is None else f"{v:,.0f}"  # noqa: E731
    gm = "—" if totals.get("gross_margin_pct") is None else f"{totals['gross_margin_pct']:.1f}%"
    question = req.messages[-1].content
    if req.locale == "mn":
        answer = (
            f"[MOCK AI] Энэ бол туршилтын хариулт (USE_MOCK_AI=true), гэхдээ тоонууд бодит файлаас тооцоологдсон. "
            f"Хамрах хүрээ: {scope_label}. Цэвэр борлуулалт ₮{fmt(totals.get('net_sales'))}, борлуулалтын тоо "
            f"{fmt(totals.get('volume_units'))} ширхэг, нийт ашгийн маржин {gm}, мөрийн тоо {fmt(totals.get('row_count'))}.\n"
            f"Таны асуулт: «{question}». OpenAI түлхүүр тохируулсан үед асуулт бүрд тохирсон тооцоолол хийж хариулна."
        )
    else:
        answer = (
            f"[MOCK AI] This is an offline mock answer (USE_MOCK_AI=true); the figures are still computed from the real file. "
            f"Scope: {scope_label}. Net sales ₮{fmt(totals.get('net_sales'))}, sales quantity {fmt(totals.get('volume_units'))} units, "
            f"gross margin {gm}, {fmt(totals.get('row_count'))} rows.\n"
            f"Your question: “{question}”. With an OpenAI key configured, the assistant runs the matching calculation for each question."
        )
    return ChatResponse(
        answer=answer,
        tool_calls=[ChatToolCall(name="aggregate", arguments=args.model_dump())],
        meta=ChatMeta(mock_ai=True, model=model, tool_rounds=1),
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def answer_question(record: StoredUpload, req: ChatRequest) -> ChatResponse:
    settings = get_settings()
    frame = record.analytics_frame
    if frame is None:
        raise ChatServiceError("The dataset has not been prepared yet. Open the dashboard first.")

    history = list(req.messages)[-MAX_HISTORY_MESSAGES:]
    if history[-1].role != "user":
        raise ChatServiceError("The last message must come from the user.")

    scope_spec = req.filters
    scoped = dataset_service.apply_filters(frame, scope_spec)
    scope_label = dataset_service.describe_scope(scope_spec, scoped)

    if settings.use_mock_ai:
        return _mock_answer(frame, req, scope_spec, scope_label, settings.openai_model)

    if not settings.openai_api_key:
        raise ChatServiceError(
            "OPENAI_API_KEY is not configured on the backend. Set it in backend/.env, or enable USE_MOCK_AI=true for local UI testing."
        )

    overview = chat_tools.dataset_overview(frame, record.filename)
    system_prompt = build_system_prompt(overview, scope_spec, scope_label, req.module, req.locale)
    client = OpenAI(api_key=settings.openai_api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=1)

    input_items: List[Dict[str, Any]] = [{"role": m.role, "content": m.content} for m in history]
    tool_calls: List[ChatToolCall] = []
    previous_response_id: Optional[str] = None
    rounds = 0
    text = ""

    try:
        while True:
            kwargs: Dict[str, Any] = {
                "model": settings.openai_model,
                "instructions": system_prompt,
                "input": input_items,
                "tools": TOOLS,
                "tool_choice": "auto" if rounds < MAX_TOOL_ROUNDS else "none",
            }
            if previous_response_id:
                kwargs["previous_response_id"] = previous_response_id
            response = client.responses.create(**kwargs)

            calls = [item for item in (getattr(response, "output", None) or []) if getattr(item, "type", None) == "function_call"]
            if not calls or rounds >= MAX_TOOL_ROUNDS:
                text = (getattr(response, "output_text", "") or "").strip()
                break

            rounds += 1
            previous_response_id = getattr(response, "id", None)
            input_items = []
            for call in calls:
                arguments = _parse_arguments(getattr(call, "arguments", None))
                result = execute_tool(call.name, arguments, frame, record.upload_id)
                tool_calls.append(ChatToolCall(name=call.name, arguments={k: v for k, v in arguments.items() if k != "__invalid_json__"}))
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": json.dumps(result, ensure_ascii=False, default=str),
                    }
                )
    except AuthenticationError as exc:
        raise ChatServiceError("OpenAI API key was rejected (authentication error).") from exc
    except RateLimitError as exc:
        raise ChatServiceError("OpenAI API rate limit reached. Please try again shortly.") from exc
    except APIStatusError as exc:
        raise ChatServiceError(f"OpenAI API returned an error: {exc}") from exc
    except APIError as exc:
        raise ChatServiceError(f"OpenAI API is currently unavailable: {exc}") from exc

    if not text:
        raise ChatServiceError("The assistant returned an empty answer. Please try again.")

    return ChatResponse(
        answer=text,
        tool_calls=tool_calls,
        meta=ChatMeta(mock_ai=False, model=settings.openai_model, tool_rounds=rounds),
    )
