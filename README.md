# Sales Driver Intelligence
### Борлуулалтын хүчин зүйлийн шинжилгээ · Sales Driver Intelligence Platform

Upload an Excel sales dataset and get a management-ready, filterable analysis: deterministic
Python KPIs and driver statistics, a Claude-generated English narrative, and an OpenAI
Mongolian translation - presented as a five-level data story (What → When → Where → Why → So what).

> AI_academy_CAPSTONE_finance_team - a group capstone project applying AI to real finance
> workflows and data.

## How it works

```
Excel upload ──► parse + validate + clean (pandas)
                 │
                 ├─► GET  /api/dataset/{id}            cleaned row-level dataset (columnar JSON)
                 │        └─► browser: ONE filtered slice ─► every KPI, chart, table
                 │
                 ├─► POST /api/analysis/{id}/drivers   same filter ─► correlations, model importance
                 │
                 └─► POST /api/analysis/{id}/insight   same filter ─► compact JSON ─► Claude (EN) ─► OpenAI (MN)
```

**One source of truth for filtering.** The dashboard receives the cleaned, derived dataset once
and filters it in the browser (`frontend/lib/filters.ts`). KPIs, trend, breakdowns, scatter,
stock, discount and promotion panels are all derived from that single filtered array
(`frontend/lib/analytics.ts`, memoised in `hooks/useAnalytics.ts`). The two server-side
analyses (driver model, AI narrative) receive the identical `FilterSpec` and apply it with the
same semantics (`backend/app/services/dataset_service.apply_filters`). The AI narrative is
tagged with the scope it was generated for and flagged as stale when filters change.

**Python computes every number; AI only interprets.** Claude receives aggregated, Top-N-limited
JSON (never raw rows) plus an `analysis_scope` block describing the active filters. OpenAI
only translates Claude's finished analysis.

**Sell-out and sell-in are different concepts.** `sales_type` values are normalised to
`POS` (sell-out) or `SHIPMENT` (sell-in). Sales quantity (`volume_units`) is `qty − return_qty`
for POS rows and **net shipment = `shipment_qty − return_qty`** for shipment rows. The two are
shown side by side and never summed into one undifferentiated figure.

## Stack

- **Frontend**: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Recharts · lucide-react
- **Backend**: FastAPI · pandas · numpy · scikit-learn · scipy · pydantic · openpyxl
- **AI**: Anthropic API (`claude-fable-5`) for analysis, OpenAI Responses API (`gpt-5.6-terra`)
  for Mongolian translation - both configurable via `.env`, both mockable (`USE_MOCK_AI=true`)

## Project layout

```
backend/
  app/
    main.py                        FastAPI wiring (CORS, routers)
    config.py                      Settings from .env
    api/routes/                    upload.py · dataset.py · analysis.py
    services/
      excel_service.py             read workbook, map columns, profile
      validation_service.py        clean + data-quality report (never silently drops rows)
      dataset_service.py           analytics frame, columnar payload, apply_filters (shared filter semantics)
      metric_service.py            KPIs incl. sell-out / sell-in split
      driver_service.py            correlations, eta², Ridge/RandomForest, permutation importance, ranking
      analysis_pipeline.py         orchestration: prepare · dataset · drivers · insight
      compact_payload.py           Top-N JSON sent to Claude (with analysis_scope)
      anthropic_service.py · openai_service.py · mock_ai.py · session_store.py
    utils/                         column_mapping.py · sales_type.py · derive.py · formatting.py
    models/schemas.py              Pydantic schemas (mirrored in frontend/types/index.ts)
  tests/                           42 pytest tests (external APIs mocked)

frontend/
  app/                             page.tsx (upload → dashboard), layout.tsx, globals.css, icon.svg
  components/
    upload/UploadScreen.tsx        drop zone, file summary, validation, column guide
    filters/                       FilterBar · MultiSelect (searchable) · DateRangeFilter (presets)
    dashboard/                     Dashboard (story orchestration) · Kpis · SectionHeader
    charts/                        ChartFrame (insight title + table twin) · TrendChart · VarianceBars ·
                                   RankedBars · SalesTypeSplit · PriceQuantityScatter ·
                                   DriverImportanceChart · StockSalesChart · PricingPanels
    insight/ExecutiveInsight.tsx   deterministic findings + AI narrative (scope-aware, MN/EN)
    appendix/Appendix.tsx          returns & inventory · data quality · model details
    ui/primitives.tsx              Button, Surface, Badge, Segmented, InfoTip, Table, Tabs, states
    providers/LocaleProvider.tsx   MN / EN
  hooks/                           useDataset · useFilters · useAnalytics · useDriverAnalysis · useInsight
  lib/                             filters · analytics · narrative (data-driven headlines) · format · i18n · api · chartTheme
  types/index.ts
```

## Installation

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env            # fill in keys, or set USE_MOCK_AI=true
```

### Frontend

```bash
cd frontend
npm install
```

## Environment variables (`backend/.env`)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key. Required unless `USE_MOCK_AI=true`. |
| `ANTHROPIC_MODEL` | Defaults to `claude-fable-5`. |
| `OPENAI_API_KEY` | OpenAI API key (Mongolian translation). Required unless `USE_MOCK_AI=true`. |
| `OPENAI_MODEL` | Defaults to `gpt-5.6-terra`. |
| `USE_MOCK_AI` | `true` → both AI stages return realistic mock output built from the real numbers. Free, offline. |
| `USE_OPENAI_FOR_ANALYSIS` | Stopgap only: OpenAI performs both stages, bypassing Anthropic. |
| `ANTHROPIC_WORKSPACE_ID` | Only for identity-linked keys that require an `anthropic-workspace-id` header. |
| `MAX_UPLOAD_MB` | Upload size limit (default 15). |
| `CORS_ORIGINS` | Allowed frontend origins (default `http://localhost:3000`). |

Keys are read only on the backend and never sent to the browser. Optionally set
`NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` if the backend is not on `localhost:8000`.

## Running locally

```bash
# Terminal 1 - backend
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 - frontend
cd frontend && npm run dev          # http://localhost:3000
```

1. Drop an `.xlsx` (or download the sample). The file is parsed, validated and profiled in about
   a second - rows, period, months, brands, products, channels, recognised / missing columns.
2. **Open dashboard.** KPIs and charts appear immediately from the row-level dataset; the driver
   model loads in the background; the AI narrative is generated once for the full dataset.
3. Filter by **Period · Brand · Product · Channel · Channel type · Sales type**. Every KPI, chart
   and table updates from the same slice; active filters are shown as chips with a
   **Reset filters** action. Product options narrow to the selected brands without dropping
   existing selections.
4. Comparison basis: **Last year** (same period, requires a period ≤ 12 months with LY data) or
   **Prior period** (equal-length window before the period). Month-over-month always shows the
   latest month in the period (month-to-date when incomplete).
5. When filters change, the AI narrative is marked stale; **Regenerate for current selection**
   sends the exact same filter to the backend.

## The story (dashboard sections)

| # | Question | Content |
|---|---|---|
| 01 | What happened? | Sales quantity (sell-out / net shipment split), net revenue, gross profit, gross margin, avg net price, MoM - each with a directional comparison |
| 02 | When? | Monthly trend (current emphasised, last year quiet) with peak / price / stock annotations; diverging variance bars |
| 03 | Where? | Ranked horizontal bars by channel, brand, product, channel type - size (share) or change (contribution to total change); sell-out vs sell-in panel |
| 04 | Why might it have happened? | Driver importance (model permutation importance or univariate association), price vs quantity scatter, stock vs sales (indexed), discount bands, promoted vs non-promoted |
| 05 | So what? | Deterministic key findings + Claude executive insight, top drivers, recommendations, limitations |
| A | Appendix | Returns & inventory risk, data quality report and column mapping, model details |

Chart titles are generated from the data ("MUB explains 64% of the decline") and every chart has
a table twin. Vocabulary is strictly associative ("associated with", "model importance") - never
causal.

## Expected Excel structure

Column names are matched flexibly ("Unit Price" → `sale_price`, "Sales Channel" → `sales_channel`).

Required: `date, brand, product, qty, sale_price, sale_cost, sales_channel, channel_type,
sales_type, return_qty, net_qty, stock_available`

Optional: `shipment_qty, discount_pct, promotion_pct, total_sales, discount, promotion,
refund_amount, net_sales, sale_price_net, return_qty_units`

## Tests and verification

```bash
cd backend && pytest -q            # 42 tests: mapping, validation, KPIs, drivers, filters, API flow (AI mocked)
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

The frontend was additionally verified end to end in a headless browser (Playwright):
KPI values reconciled exactly against an independent recomputation from the dataset payload for
unfiltered, combined (brand + product + channel + period), sales-type and reset states; stale /
regenerated AI scope; empty state; MN/EN toggle; no horizontal overflow at 1280 / 1024 / 820 px;
invalid-file and missing-column states; zero console errors on the production build.

## Known limitations

- Uploads and per-filter caches are held **in memory per backend process** (1-hour TTL). Use a
  shared store for a multi-worker deployment.
- The driver model is fitted at transaction-row level; when its holdout R² is below 0.10 the
  ranking falls back to univariate association (Spearman ρ² / η²) and says so.
- Year-over-year comparison needs a selected period of at most 12 months with last-year data;
  otherwise the prior-period basis (or MoM only) is offered.
- `npm audit` reports Next.js 14 advisories with no 14.x fix; acceptable for local/academic use.
