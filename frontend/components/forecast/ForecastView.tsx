"use client";

import * as React from "react";
import { CheckCircle2, Info, RotateCcw } from "lucide-react";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { KpiTile } from "@/components/dashboard/Kpis";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { MultiSelect } from "@/components/filters/MultiSelect";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Segmented, Spinner, StateBox, Surface, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useFilters } from "@/hooks/useFilters";
import { useForecast } from "@/hooks/useForecast";
import { formatCompact, formatInt, formatMonth, formatPct, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DatasetResponse, DimensionKey, ForecastRequest, ForecastTarget } from "@/types";

interface Props {
  dataset: DatasetResponse;
}

const DIMENSIONS: { key: DimensionKey; labelKey: "filters.brand" | "filters.product" | "filters.channel" | "filters.channelType" | "filters.salesType" }[] = [
  { key: "brands", labelKey: "filters.brand" },
  { key: "products", labelKey: "filters.product" },
  { key: "channels", labelKey: "filters.channel" },
  { key: "channelTypes", labelKey: "filters.channelType" },
  { key: "salesTypes", labelKey: "filters.salesType" },
];

const MAX_HORIZON = 24;
const DEFAULT_HORIZON = 6;

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const SELECT_CLASS =
  "h-9 w-full rounded-ctl border border-line bg-surface px-3 text-sm text-ink-900 transition-colors hover:border-lineStrong focus-ring disabled:opacity-50";

/** Forecast module: pick the measure, the last month to forecast and an
 *  optional scope; the backend backtests every method and returns the most
 *  accurate one with its forecast, interval and the comparison table. */
export function ForecastView({ dataset }: Props) {
  const { t, locale } = useLocale();
  const filtersApi = useFilters(dataset.dimensions);
  const { filters } = filtersApi;

  const dataMax = dataset.data_quality.date_max ?? dataset.profile.date_max ?? "2100-12-31";
  const lastMonth = dataMax.slice(0, 7);
  const untilOptions = React.useMemo(() => Array.from({ length: MAX_HORIZON }, (_, i) => addMonths(lastMonth, i + 1)), [lastMonth]);

  const [target, setTarget] = React.useState<ForecastTarget>("net_sales");
  const [until, setUntil] = React.useState<string>(() => addMonths(lastMonth, DEFAULT_HORIZON));
  const [includePartial, setIncludePartial] = React.useState(false);

  const req = React.useMemo<ForecastRequest>(
    () => ({
      target,
      forecast_until: until,
      include_partial_month: includePartial,
      filters: {
        brands: filters.brands,
        products: filters.products,
        channels: filters.channels,
        channel_types: filters.channelTypes,
        sales_types: filters.salesTypes,
        date_from: null,
        date_to: null,
      },
    }),
    [target, until, includePartial, filters.brands, filters.products, filters.channels, filters.channelTypes, filters.salesTypes]
  );

  const forecast = useForecast(dataset.upload_id, req);
  const { data, loading, error, stale } = forecast;
  const isMoney = target !== "volume_units";
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : isMoney ? `₮${formatCompact(v, locale)}` : formatCompact(v, locale));
  const metricLabel = t(`forecast.metric.${target}` as "forecast.metric.net_sales");

  const targetOptions = [
    { value: "net_sales" as ForecastTarget, label: t("forecast.metric.net_sales") },
    { value: "volume_units" as ForecastTarget, label: t("forecast.metric.volume_units") },
    { value: "gross_profit" as ForecastTarget, label: t("forecast.metric.gross_profit") },
  ];

  return (
    <div className="space-y-10 py-8">
      {/* Controls */}
      <Surface as="section" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink-900">{t("forecast.title")}</h2>
            <p className="mt-0.5 text-sm text-ink-500">{t("forecast.sub")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>
              {t("forecast.dataUntil")}: <span className="font-medium tnum text-ink-800">{formatMonth(lastMonth, locale)}</span>
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
          <span className="text-xs font-medium text-ink-600">{t("forecast.target")}</span>
          <Segmented ariaLabel={t("forecast.target")} value={target} onChange={setTarget} options={targetOptions} size="md" />

          <label htmlFor="forecast-until" className="text-xs font-medium text-ink-600">
            {t("forecast.until")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <select id="forecast-until" className={cn(SELECT_CLASS, "max-w-xs")} value={until} onChange={(e) => setUntil(e.target.value)}>
              {untilOptions.map((m, i) => (
                <option key={m} value={m}>
                  {formatMonth(m, locale)} · {t("forecast.horizon", { n: i + 1 })}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={includePartial} onChange={(e) => setIncludePartial(e.target.checked)} />
              {t("forecast.includePartial")}
            </label>
          </div>

          <span className="text-xs font-medium text-ink-600">{t("forecast.filters")}</span>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {DIMENSIONS.map((d) => (
              <MultiSelect
                key={d.key}
                label={t(d.labelKey)}
                options={filtersApi.options[d.key]}
                selected={filters[d.key]}
                onChange={(values) => filtersApi.setDimension(d.key, values)}
                note={d.key === "products" && filtersApi.productsNarrowedByBrand ? t("filters.narrowedByBrand") : undefined}
                testId={`forecast-filter-${d.key}`}
              />
            ))}
            <Button variant="secondary" size="md" onClick={filtersApi.reset} disabled={filtersApi.isEmpty} className="h-9">
              <RotateCcw className="h-3.5 w-3.5" />
              {t("filters.reset")}
            </Button>
          </div>
        </div>
      </Surface>

      {/* States */}
      {error && !loading && (
        <StateBox tone="negative" title={t("forecast.error")} body={error === "network" ? t("upload.errorNetwork") : error} action={<Button variant="secondary" size="sm" onClick={forecast.retry}>{t("common.retry")}</Button>} />
      )}
      {!data && loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500" role="status">
          <Spinner className="h-4 w-4 text-accent" />
          {t("forecast.running")}
        </div>
      )}

      {data && (
        <div className={cn("space-y-10 transition-opacity", (loading || stale) && "opacity-60")} aria-busy={loading || undefined}>
          {/* 01 - Result */}
          <section>
            <SectionHeader
              index="01"
              title={t("forecast.result.title", { metric: metricLabel })}
              subtitle={`${data.scope_label} · ${t("forecast.trainingMonths", { n: data.training_months })} (${formatMonth(data.history_month_min, locale)} – ${formatMonth(data.history_month_max, locale)})`}
              right={
                <Badge tone="accent">
                  <CheckCircle2 className="h-3 w-3" /> {data.selected_label}
                </Badge>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile label={t("forecast.kpi.total", { n: data.horizon_months })} value={fmt(data.summary.forecast_total)} context={`${formatMonth(data.forecast[0].month, locale)} – ${formatMonth(data.forecast_until, locale)}`} rawValue={data.summary.forecast_total} testId="forecast-total" />
              <KpiTile label={t("forecast.kpi.avg")} value={fmt(data.summary.forecast_monthly_avg)} context={t("forecast.kpi.last12", { v: fmt(data.summary.last_12_months_total) })} rawValue={data.summary.forecast_monthly_avg} />
              <KpiTile
                label={t("forecast.kpi.yoy")}
                value={data.summary.yoy_change_pct === null ? "—" : formatSignedPct(data.summary.yoy_change_pct)}
                signedValue={data.summary.yoy_change_pct}
                context={
                  data.summary.same_period_last_year_total === null
                    ? t("forecast.kpi.noLy")
                    : t("forecast.kpi.lyTotal", { v: fmt(data.summary.same_period_last_year_total), n: data.summary.same_period_last_year_months })
                }
                rawValue={data.summary.yoy_change_pct}
              />
              <KpiTile
                label={t("forecast.kpi.accuracy")}
                value={data.summary.accuracy_wape === null ? "—" : formatPct(data.summary.accuracy_wape)}
                tip={t("forecast.kpi.accuracyTip")}
                context={t("forecast.kpi.backtestWindow", { n: data.backtest_window_months })}
                rawValue={data.summary.accuracy_wape}
              />
            </div>
            <div className="mt-4">
              <ForecastChart
                title={t("forecast.chart.title", { metric: metricLabel, from: formatMonth(data.forecast[0].month, locale), to: formatMonth(data.forecast_until, locale) })}
                subtitle={t("forecast.chart.sub", { model: data.selected_label })}
                result={data}
                isMoney={isMoney}
                dimmed={loading || stale}
                footnote={data.partial_last_month_excluded ? t("forecast.partialExcluded", { m: formatMonth(addMonths(data.history_month_max, 1), locale) }) : undefined}
              />
            </div>
          </section>

          {/* 02 - Why this model */}
          <section>
            <SectionHeader index="02" title={t("forecast.models.title")} subtitle={t("forecast.models.sub")} />
            <Surface padded={false}>
              <p className="px-5 pt-4 text-sm text-ink-700">
                <span className="font-semibold text-ink-900">{data.selected_label}</span> — {data.selection_reason}
                {data.implementation && <span className="ml-1 text-xs text-ink-400">({data.implementation})</span>}
              </p>
              <div className="mt-3">
                <Table dense>
                  <THead>
                    <TR>
                      <TH>{t("forecast.models.model")}</TH>
                      <TH>{t("forecast.models.status")}</TH>
                      <TH numeric>{t("forecast.models.wape")}</TH>
                      <TH numeric>{t("forecast.models.mape")}</TH>
                      <TH numeric>{t("forecast.models.mae")}</TH>
                      <TH numeric>{t("forecast.models.folds")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.backtest.map((r) => (
                      <TR key={r.model} className={cn(r.selected && "bg-accentSoft/50 hover:bg-accentSoft/50")}>
                        <TD>
                          <p className={cn("font-medium", r.selected ? "text-ink-900" : "text-ink-800")}>{r.label}</p>
                          <p className="text-xs text-ink-400">{r.description}</p>
                        </TD>
                        <TD>
                          {r.selected ? (
                            <Badge tone="accent">{t("forecast.models.selected")}</Badge>
                          ) : r.available ? (
                            <Badge tone="neutral">{t("forecast.models.tested")}</Badge>
                          ) : (
                            <span className="text-xs text-ink-400" title={r.reason ?? undefined}>
                              {t("forecast.models.unavailable")}
                            </span>
                          )}
                        </TD>
                        <TD numeric className={cn(r.selected && "font-semibold text-ink-900")}>{r.wape === null ? "—" : formatPct(r.wape)}</TD>
                        <TD numeric>{r.mape === null ? "—" : formatPct(r.mape)}</TD>
                        <TD numeric>{r.mae === null ? "—" : fmt(r.mae)}</TD>
                        <TD numeric>{r.available ? formatInt(r.folds) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              <p className="flex items-start gap-2 px-5 pb-4 pt-3 text-xs leading-relaxed text-ink-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("forecast.how.body")}
              </p>
            </Surface>
          </section>

          {/* 03 - Monthly table */}
          <section>
            <SectionHeader index="03" title={t("forecast.table.title")} subtitle={t("forecast.table.sub")} />
            <Surface padded={false}>
              <Table dense>
                <THead>
                  <TR>
                    <TH>{t("forecast.table.month")}</TH>
                    <TH numeric>{t("forecast.table.point")}</TH>
                    <TH numeric>{t("forecast.table.low")}</TH>
                    <TH numeric>{t("forecast.table.high")}</TH>
                    <TH numeric>{t("forecast.table.ly")}</TH>
                    <TH numeric>{t("where.change")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.forecast.map((f) => {
                    const ly = data.history.find((h) => h.month === addMonths(f.month, -12));
                    const change = ly && Math.abs(ly.actual) > 1e-9 ? (f.point - ly.actual) / Math.abs(ly.actual) : null;
                    return (
                      <TR key={f.month}>
                        <TD className="font-medium text-ink-800">{formatMonth(f.month, locale)}</TD>
                        <TD numeric className="font-semibold text-ink-900">{fmt(f.point)}</TD>
                        <TD numeric>{fmt(f.lower)}</TD>
                        <TD numeric>{fmt(f.upper)}</TD>
                        <TD numeric>{ly ? fmt(ly.actual) : "—"}</TD>
                        <TD numeric className={cn(change === null ? "" : change >= 0 ? "text-positive" : "text-negative")}>{change === null ? "—" : formatSignedPct(change)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Surface>
          </section>

          {data.notes.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("forecast.notes")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-500">
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="border-t border-line pt-4 text-[11px] leading-relaxed text-ink-400">{t("forecast.disclaimer")}</p>
        </div>
      )}
    </div>
  );
}
