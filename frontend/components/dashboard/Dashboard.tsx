"use client";

import * as React from "react";
import { Appendix } from "@/components/appendix/Appendix";
import { DriverImportanceChart } from "@/components/charts/DriverImportanceChart";
import { DiscountBandChart, PromotionComparePanel } from "@/components/charts/PricingPanels";
import { PriceQuantityScatter } from "@/components/charts/PriceQuantityScatter";
import { RankedBars, type RankedMode } from "@/components/charts/RankedBars";
import { SalesTypeSplit } from "@/components/charts/SalesTypeSplit";
import { StockSalesChart } from "@/components/charts/StockSalesChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { VarianceBars } from "@/components/charts/VarianceBars";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { BridgePanel } from "@/components/dashboard/BridgePanel";
import { KpiRow } from "@/components/dashboard/Kpis";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { ExecutiveInsight } from "@/components/insight/ExecutiveInsight";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button, Segmented, StateBox } from "@/components/ui/primitives";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useDriverAnalysis } from "@/hooks/useDriverAnalysis";
import { useFilters } from "@/hooks/useFilters";
import { useInsight } from "@/hooks/useInsight";
import { rankGroups, trendAnnotations, type MetricKey } from "@/lib/analytics";
import { bridgeNarrative, computeSalesBridge, periodShortLabel } from "@/lib/bridge";
import { formatDateRange } from "@/lib/format";
import {
  discountHeadline,
  driversHeadline,
  executiveBullets,
  priceQuantityHeadline,
  salesTypeHeadline,
  stockHeadline,
  trendHeadline,
  varianceHeadline,
  whereHeadline,
} from "@/lib/narrative";
import type { ComparisonBasis, DatasetResponse, SalesRow } from "@/types";

interface DashboardProps {
  dataset: DatasetResponse;
  rows: SalesRow[];
}

export function Dashboard({ dataset, rows }: DashboardProps) {
  const { t, locale } = useLocale();
  const filtersApi = useFilters(dataset.dimensions);
  const { filters, key, spec } = filtersApi;

  const dataMin = dataset.data_quality.date_min ?? dataset.profile.date_min ?? "1900-01-01";
  const dataMax = dataset.data_quality.date_max ?? dataset.profile.date_max ?? "2100-12-31";

  const [basis, setBasis] = React.useState<ComparisonBasis | "auto">("auto");
  const [trendMetric, setTrendMetric] = React.useState<MetricKey>("netSales");
  const [whereMetric, setWhereMetric] = React.useState<MetricKey>("netSales");
  const [whereMode, setWhereMode] = React.useState<RankedMode>("size");

  const analytics = useAnalytics(rows, filters, key, basis, dataMin, dataMax);
  const drivers = useDriverAnalysis(dataset.upload_id, spec, key, analytics.currentRows.length);
  const insight = useInsight(dataset.upload_id);

  // Generate the narrative once for the initial (unfiltered) scope; later
  // scopes are generated on request so the user controls the cost/latency.
  const autoRef = React.useRef(false);
  React.useEffect(() => {
    if (autoRef.current || analytics.isEmpty) return;
    autoRef.current = true;
    insight.generate(spec, key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveBasis = analytics.comparison?.basis ?? null;
  const hasComparison = effectiveBasis !== null;
  React.useEffect(() => {
    // If the user picked a basis that is no longer available, fall back to auto.
    if (basis === "ly" && !analytics.lyAvailable) setBasis("auto");
    if (basis === "prior" && !analytics.priorAvailable) setBasis("auto");
  }, [basis, analytics.lyAvailable, analytics.priorAvailable]);

  const metricOptions = [
    { value: "netSales" as MetricKey, label: t("when.metric.revenue") },
    { value: "volume" as MetricKey, label: t("when.metric.volume") },
    { value: "grossProfit" as MetricKey, label: t("when.metric.profit") },
  ];

  const ranked = React.useMemo(
    () => ({
      channel: rankGroups(analytics.byChannel, whereMetric, 8, t("where.other")),
      brand: rankGroups(analytics.byBrand, whereMetric, 8, t("where.other")),
      product: rankGroups(analytics.byProduct, whereMetric, 10, t("where.other")),
      channelType: rankGroups(analytics.byChannelType, whereMetric, 6, t("where.other")),
    }),
    [analytics, whereMetric, t]
  );

  const kpiDeltaFor = (m: MetricKey) => (m === "netSales" ? analytics.kpis.netSales : m === "volume" ? analytics.kpis.volume : analytics.kpis.grossProfit);

  // Variance bridge: why net sales moved vs the comparison window (effects + origins).
  const bridge = React.useMemo(
    () => (analytics.comparison && !analytics.isEmpty ? computeSalesBridge(analytics.currentRows, analytics.comparison.rows) : null),
    [analytics.comparison, analytics.currentRows, analytics.isEmpty]
  );
  const currentLabel = analytics.period ? periodShortLabel(analytics.period.from, analytics.period.to, locale) : "";
  const baseLabel = analytics.comparison ? periodShortLabel(analytics.comparison.from, analytics.comparison.to, locale) : "";
  const annotations = React.useMemo(() => trendAnnotations(analytics.monthly, trendMetric), [analytics.monthly, trendMetric]);

  const bullets = React.useMemo(() => {
    if (analytics.isEmpty) return [];
    const list = executiveBullets(
      locale,
      analytics.kpis,
      effectiveBasis,
      rankGroups(analytics.byChannel, "netSales", 8, t("where.other")),
      rankGroups(analytics.byBrand, "netSales", 8, t("where.other")),
      drivers.data && !drivers.stale ? drivers.data.driver_ranking : null,
      analytics.priceQty,
      analytics.stock,
      analytics.salesType
    );
    if (bridge) {
      const n = bridgeNarrative(locale, bridge, currentLabel, baseLabel);
      list.splice(1, 0, { title: t("section.bridge"), text: `${n.headline} ${n.effects.slice(0, 3).join("; ")}.` });
    }
    return list;
  }, [analytics, effectiveBasis, drivers.data, drivers.stale, locale, t, bridge, currentLabel, baseLabel]);

  const periodText = analytics.period ? formatDateRange(analytics.period.from, analytics.period.to, locale) : "—";
  const comparisonText = analytics.comparison
    ? `${formatDateRange(analytics.comparison.from, analytics.comparison.to, locale)}${
        analytics.period && analytics.comparison.months < analytics.period.months.length
          ? ` (${t("kpi.partialCoverage", { a: analytics.comparison.months, b: analytics.period.months.length })})`
          : ""
      }`
    : null;

  return (
    <>
      <FilterBar api={filtersApi} dataMin={dataMin} dataMax={dataMax} shownRows={analytics.currentRows.length} totalRows={analytics.totalRows} />

      {analytics.isEmpty ? (
        <div className="py-16" data-testid="empty-state">
          <StateBox
            title={t("empty.title")}
            body={t("empty.body")}
            action={
              <Button variant="primary" onClick={filtersApi.reset}>
                {t("filters.reset")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-14 py-8">
          {/* 01 — What happened */}
          <section id="what" aria-labelledby="what-title">
            <SectionHeader
              index="01"
              title={t("section.what")}
              subtitle={`${t("kpi.periodLabel")}: ${periodText}${comparisonText ? ` · ${t("kpi.comparedTo")}: ${comparisonText}` : ""}`}
              right={
                <>
                  <span className="text-xs text-ink-500">{t("kpi.basis")}</span>
                  <Segmented
                    ariaLabel={t("kpi.basis")}
                    value={effectiveBasis ?? (basis === "auto" ? "ly" : basis)}
                    onChange={(v) => setBasis(v)}
                    options={[
                      { value: "ly" as ComparisonBasis, label: t("kpi.basis.ly"), disabled: !analytics.lyAvailable },
                      { value: "prior" as ComparisonBasis, label: t("kpi.basis.prior"), disabled: !analytics.priorAvailable },
                    ]}
                  />
                  {!hasComparison && <span className="text-xs text-ink-400">{analytics.period && analytics.period.days > 366 ? t("kpi.selectPeriodHint") : t("kpi.noComparison")}</span>}
                </>
              }
            />
            <KpiRow analytics={analytics} />
          </section>

          {/* 02 — Why did sales change (variance bridge) */}
          <section id="bridge" aria-labelledby="bridge-title">
            <SectionHeader index="02" title={t("section.bridge")} subtitle={t("section.bridge.sub")} />
            <BridgePanel bridge={bridge} basis={effectiveBasis} currentLabel={currentLabel} baseLabel={baseLabel} periodTooLong={!!analytics.period && analytics.period.days > 366} />
          </section>

          {/* 03 — When */}
          <section id="when" aria-labelledby="when-title">
            <SectionHeader index="03" title={t("section.when")} subtitle={t("section.when.sub")} right={<Segmented ariaLabel={t("common.value")} value={trendMetric} onChange={setTrendMetric} options={metricOptions} />} />
            {analytics.monthly.length < 2 ? (
              <StateBox title={t("when.oneMonth")} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <TrendChart
                    title={trendHeadline(locale, trendMetric, kpiDeltaFor(trendMetric), effectiveBasis, analytics.kpis.mom, analytics.monthly)}
                    subtitle={analytics.hasLY ? t("when.subtitle.ly") : t("when.subtitle.noLy")}
                    points={analytics.monthly}
                    metric={trendMetric}
                    hasLY={analytics.hasLY}
                    annotations={annotations}
                    footnote={analytics.hasLY ? undefined : t("when.noLy")}
                  />
                </div>
                <VarianceBars title={varianceHeadline(locale, trendMetric, analytics.monthly, analytics.hasLY)} subtitle={`${analytics.hasLY ? t("when.variance.ly") : t("when.variance.mom")} · ${t("when.variance.sub")}`} points={analytics.monthly} metric={trendMetric} hasLY={analytics.hasLY} />
              </div>
            )}
          </section>

          {/* 04 — Where */}
          <section id="where" aria-labelledby="where-title">
            <SectionHeader
              index="04"
              title={t("section.where")}
              subtitle={t("section.where.sub")}
              right={
                <>
                  <Segmented ariaLabel={t("common.value")} value={whereMetric} onChange={setWhereMetric} options={metricOptions} />
                  <Segmented
                    ariaLabel={t("where.view.change")}
                    value={hasComparison ? whereMode : "size"}
                    onChange={setWhereMode}
                    options={[
                      { value: "size" as RankedMode, label: t("where.view.share") },
                      { value: "delta" as RankedMode, label: t("where.view.change"), disabled: !hasComparison },
                    ]}
                  />
                </>
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <RankedBars title={whereHeadline(locale, ranked.channel, whereMetric, t("where.byChannel"))} subtitle={`${t("where.byChannel")} · ${hasComparison && whereMode === "delta" ? t("where.contribution.sub") : t("where.share")}`} rows={ranked.channel} metric={whereMetric} mode={whereMode} dimensionLabel={t("filters.channel")} />
              <RankedBars title={whereHeadline(locale, ranked.brand, whereMetric, t("where.byBrand"))} subtitle={`${t("where.byBrand")} · ${hasComparison && whereMode === "delta" ? t("where.contribution.sub") : t("where.share")}`} rows={ranked.brand} metric={whereMetric} mode={whereMode} dimensionLabel={t("filters.brand")} />
              <RankedBars title={whereHeadline(locale, ranked.product, whereMetric, t("where.byProduct"))} subtitle={`${t("where.byProduct")} · ${hasComparison && whereMode === "delta" ? t("where.contribution.sub") : t("where.share")}`} rows={ranked.product} metric={whereMetric} mode={whereMode} dimensionLabel={t("filters.product")} />
              <RankedBars title={whereHeadline(locale, ranked.channelType, whereMetric, t("where.byChannelType"))} subtitle={`${t("where.byChannelType")} · ${hasComparison && whereMode === "delta" ? t("where.contribution.sub") : t("where.share")}`} rows={ranked.channelType} metric={whereMetric} mode={whereMode} dimensionLabel={t("filters.channelType")} />
              <div className="lg:col-span-2">
                <SalesTypeSplit title={salesTypeHeadline(locale, analytics.salesType)} split={analytics.salesType} />
              </div>
            </div>
          </section>

          {/* 05 — Why */}
          <section id="why" aria-labelledby="why-title">
            <SectionHeader index="05" title={t("section.why")} subtitle={t("section.why.sub")} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <DriverImportanceChart title={drivers.data && !drivers.stale ? driversHeadline(locale, drivers.data.driver_ranking) : t("why.drivers.title")} state={drivers} rowCount={analytics.currentRows.length} />
              </div>
              <PriceQuantityScatter title={priceQuantityHeadline(locale, analytics.priceQty)} pq={analytics.priceQty} />
              <StockSalesChart title={stockHeadline(locale, analytics.stock)} stock={analytics.stock} />
              <DiscountBandChart title={discountHeadline(locale, analytics.discount)} bands={analytics.discount} />
              <PromotionComparePanel promo={analytics.promo} />
            </div>
          </section>

          {/* 06 — So what */}
          <section id="so" aria-labelledby="so-title">
            <SectionHeader index="06" title={t("section.so")} subtitle={t("section.so.sub")} />
            <ExecutiveInsight bullets={bullets} insight={insight} currentKey={key} spec={spec} rowCount={analytics.currentRows.length} />
          </section>

          {/* Appendix */}
          <section id="appendix" aria-labelledby="appendix-title">
            <SectionHeader index="A" title={t("section.appendix")} />
            <Appendix analytics={analytics} dataset={dataset} drivers={drivers} />
          </section>

          <p className="border-t border-line pt-4 text-[11px] leading-relaxed text-ink-400">{t("common.disclaimer")}</p>
        </div>
      )}

      {/* AI data assistant - answers only from this dataset, scoped to the active filter */}
      <ChatWidget uploadId={dataset.upload_id} dataset={dataset} spec={spec} module="drivers" />
    </>
  );
}
