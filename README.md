# Sales Driver Intelligence
### Борлуулалтад нөлөөлөх хүчин зүйлийн шинжилгээ

A capstone web application that turns an uploaded Excel sales dataset into a management-ready
analysis: deterministic Python KPI/driver statistics, a Claude-generated English business
analysis, and an OpenAI-translated professional Mongolian version.

> AI_academy_CAPSTONE_finance_team — a group capstone project applying AI to real finance
> workflows and data.

## Architecture

```
Excel Upload
      |
Validation (app/services/validation_service.py)
      |
Data Cleaning (auto-corrections, reported - never silently dropped)
      |
Python KPI Calculation (app/services/metric_service.py)
      |
Sales Driver Statistical Analysis (app/services/driver_service.py)
      |
Compact structured JSON (app/services/compact_payload.py)
      |
Claude Fable 5 -> English business analysis (app/services/anthropic_service.py)
      |
OpenAI -> professional Mongolian translation (app/services/openai_service.py)
      |
Final Dashboard (Next.js)
```

Python always computes the numbers (KPIs, correlations, group contributions, the driver
model). Claude only interprets the already-computed numbers - it never recalculates them.
OpenAI only translates Claude's finished English analysis into Mongolian - it never
re-analyzes the dataset or changes a conclusion.

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts + lucide-react
- **Backend**: FastAPI + pandas + numpy + scikit-learn + scipy + pydantic + openpyxl
- **AI**: Anthropic API (`claude-fable-5`) for analysis, OpenAI Responses API
  (`gpt-5.6-terra`) for Mongolian translation - both configurable via `.env`

## Requirements

- Node.js 18+
- Python 3.11+
- An Anthropic API key (or `USE_MOCK_AI=true` for free local testing)
- An OpenAI API key (or `USE_MOCK_AI=true`)

## Project layout

```
backend/
  app/
    main.py                     FastAPI app wiring (CORS, routers)
    config.py                   Settings loaded from .env
    api/routes/                 upload.py, analysis.py
    services/                   excel/validation/metric/driver/anthropic/openai services
    models/schemas.py           Pydantic schemas (mirrors frontend/types/index.ts)
    prompts/                    sales_analysis_prompt.py, mongolian_translation_prompt.py
    utils/                      column_mapping.py, derive.py, formatting.py
    static/sample_data.xlsx     Downloadable sample dataset
  tests/                        pytest suite (external APIs mocked)
  requirements.txt

frontend/
  app/                          page.tsx (single-flow dashboard), layout.tsx, globals.css
  components/
    upload/                     FileUpload, ExcelRequirementCard
    analysis/                   AnalysisProgress
    dashboard/                  KpiCard, DataQualityPanel, AIInsightPanel, RecommendationCard, ProductTable, OverviewTab
    charts/                     DriverChart, SalesTrendChart, ChannelChart, DiscountChart, PromotionComparison
    ui/                         hand-built shadcn-style primitives (button, card, tabs, table, badge, progress, tooltip)
    common/                     ProcessSteps, Disclaimer
  lib/                          api.ts, format.ts, chartColors.ts, utils.ts
  types/index.ts                TypeScript interfaces mirroring the backend schemas
```

## Installation

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp ../.env.example .env   # then fill in your keys, or set USE_MOCK_AI=true
```

### Frontend

```bash
cd frontend
npm install
```

## Environment variables

Copy `.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key. Required unless `USE_MOCK_AI=true`. |
| `ANTHROPIC_MODEL` | Defaults to `claude-fable-5`. |
| `OPENAI_API_KEY` | Your OpenAI API key. Required unless `USE_MOCK_AI=true`. |
| `OPENAI_MODEL` | Defaults to `gpt-5.6-terra`. |
| `USE_MOCK_AI` | `true` to skip both AI calls and return realistic mock output built from your real uploaded data - free, offline UI testing. |
| `MAX_UPLOAD_MB` | Upload size limit (default 15). |
| `CORS_ORIGINS` | Comma-separated list of frontend origins allowed to call the API (default `http://localhost:3000`). |
| `USE_OPENAI_FOR_ANALYSIS` | Temporary stopgap only (default `false`): when `true`, OpenAI performs both the English analysis and the Mongolian translation, bypassing Anthropic. Use only if Anthropic access is unavailable. |
| `ANTHROPIC_WORKSPACE_ID` | Only needed if your Anthropic key is an "identity-linked" key that errors with `anthropic-workspace-id is required...`. Find it at platform.claude.com/settings/workspaces (a `wrkspc_...` id). |

API keys are read only on the backend and are never sent to the browser.

Optionally, create `frontend/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
if your backend runs somewhere other than `localhost:8000` (this is the default, so it's not
required for the standard local setup).

## Running locally

Terminal 1 - backend (http://localhost:8000):

```bash
cd backend
.venv\Scripts\activate   # or: source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Terminal 2 - frontend (http://localhost:3000):

```bash
cd frontend
npm run dev
```

The frontend calls the backend's origin directly (`http://localhost:8000` by default, via
`NEXT_PUBLIC_API_BASE_URL`), relying on the backend's CORS config rather than proxying
through Next's dev server - a full analysis run (deterministic pipeline + two sequential
LLM calls) can take well over a minute, and Next's rewrite proxy was found to give up on
long-lived proxied requests after ~30s even though the backend kept working. Open
**http://localhost:3000**.

### Trying it out

1. On the landing page, click **"Жишээ Excel татах"** to download `sample_data.xlsx`
   (a 120-day synthetic dataset across 4 brands, 10 products and 4 channels), or drag in
   your own `.xlsx` file.
2. Click **"Excel файл сонгох"** (or drop the file) - the app immediately parses and
   profiles it (rows, columns, date range, brand/product/channel counts). No AI call
   happens yet.
3. Click **"Шинжилгээ эхлүүлэх"** to run the full pipeline: validation, cleaning, KPI
   calculation, driver statistics, then Claude's English analysis and OpenAI's Mongolian
   translation.
4. Explore the 9 result tabs: Overview, Sales Drivers, Sales Trend, Channel Analysis,
   Brand & Product, Discount & Promotion, Inventory & Returns, AI Management Insight, and
   Data Quality. A filter bar (Brand / Product / Channel, each defaulting to "Бүгд" = all)
   sits above the tabs and narrows the tables/charts keyed by that dimension. The Sales
   Trend tab also has a period-over-period comparison panel (WoW / MoM / QoQ / YoY),
   computed client-side from the backend's time-series data - it reports "insufficient
   history" rather than a misleading number when the uploaded date range is too short for
   a given comparison (e.g. YoY needs 13+ months of data).

Set `USE_MOCK_AI=true` in `backend/.env` to exercise the entire UI without any API key or
API cost - a banner ("Mock AI горим") appears on the AI Insight tab so this is always
visible to the user.

## Backend tests

```bash
cd backend
.venv\Scripts\activate
pytest -q
```

29 tests cover column normalization, Excel validation/parsing, KPI and gross-profit/return-rate
calculations, driver statistics, and Claude JSON-response parsing (including the one-retry
malformed-JSON path). No test calls a real external API - Anthropic/OpenAI clients are mocked.

## Known limitations (by design, for a local/capstone deployment)

- Uploaded files are cached **in-memory per backend process** between the upload and analyze
  steps (`app/services/session_store.py`), with a 1-hour TTL. This is intentionally simple for
  a single-instance local deployment; a multi-worker production deployment would need a shared
  store (Redis, a DB) instead.
- `npm audit` flags known Next.js 14 advisories with no patched 14.x release available upstream
  (fixes land only in the 15.x/16.x line, a breaking major upgrade). Acceptable for local/
  academic use; revisit before any public deployment.
- The multivariate driver model (Ridge/RandomForest) intentionally includes `qty`/`net_qty` as
  drivers per the assignment spec, even though quantity is mechanically part of the sales
  formula - so a very high R² there reflects that identity, not a discovered causal insight.
  Read it alongside the correlation and group-contribution evidence, not in isolation.

## Data principles this project follows

1. Python calculates every financial fact; LLMs never compute core KPIs.
2. Claude interprets the facts; it never invents or alters a number.
3. OpenAI translates Claude's interpretation; it never re-analyzes or adds conclusions.
4. Data-quality problems are always surfaced, never hidden or silently dropped.
5. Statistical association is never described as causation, anywhere in the UI or prompts.
6. API credentials live only in `backend/.env` (gitignored) and are never sent to the browser.
7. Only aggregated, Top-N-limited analytics are sent to Claude/OpenAI - never raw row-level data.
