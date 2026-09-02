"use client";

import * as React from "react";
import { ChartFrame, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Skeleton, StateBox } from "@/components/ui/primitives";
import type { DriverAnalysisState } from "@/hooks/useDriverAnalysis";
import { CHART } from "@/lib/chartTheme";
import { formatInt, formatNumber } from "@/lib/format";
import { driverLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  state: DriverAnalysisState;
  rowCount: number;
}

/** Ranked horizontal bars of relative importance (top = 100). Direction and
 *  confidence are written next to each bar - never encoded by color alone. */
export function DriverImportanceChart({ title, state, rowCount }: Props) {
  const { t, locale } = useLocale();
  const { data, loading, error, stale, retry } = state;

  const directionLabel = (d: string) =>
    d === "positive" ? t("why.direction.positive") : d === "negative" ? t("why.direction.negative") : t("why.direction.mix");
  const confidenceLabel = (c: string) => t(`why.confidence.${c}` as "why.confidence.high" | "why.confidence.medium" | "why.confidence.low");

  const basisText = data
    ? data.importance_basis === "model_permutation_importance"
      ? t("why.drivers.basis.model")
      : t("why.drivers.basis.univariate")
    : "";
  const model = data?.statistical_model;
  const modelNote =
    model && model.model_status === "ok"
      ? `${t("why.drivers.r2")}: ${model.r2 === null ? "—" : formatNumber(model.r2, 2)} · ${t("why.drivers.n")}: ${formatInt(model.sample_size)}${
          data?.importance_basis !== "model_permutation_importance" ? ` · ${t("why.drivers.weakModel")}` : ""
        }`
      : model
      ? t("why.drivers.unavailable")
      : "";

  const ranking = (data?.driver_ranking ?? []).slice(0, 10);
  const scoreText = (v: number) => (v > 0 && v < 0.5 ? "<1" : formatNumber(v, 0));

  const table: ChartTable | undefined = data
    ? {
        columns: [t("model.feature"), t("why.drivers.sub"), t("why.direction.mix"), t("why.confidence")],
        rows: data.driver_ranking.map((d) => [driverLabel(locale, d.driver), formatNumber(d.importance_score, 0), directionLabel(d.direction), confidenceLabel(d.confidence)]),
        numericFrom: 1,
      }
    : undefined;

  let body: React.ReactNode;
  if (error) {
    body = (
      <StateBox
        tone="negative"
        title={t("why.drivers.error")}
        action={
          <Button variant="secondary" size="sm" onClick={retry}>
            {t("why.drivers.retry")}
          </Button>
        }
      />
    );
  } else if (!data && loading) {
    body = (
      <div className="space-y-3 py-1" aria-label={t("why.drivers.loading")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_4rem] items-center gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-4" style={{ width: `${90 - i * 12}%` } as React.CSSProperties} />
            <Skeleton className="h-3.5 w-10" />
          </div>
        ))}
      </div>
    );
  } else if (!data || rowCount === 0 || (data.statistical_model.model_status !== "ok" && !ranking.length)) {
    body = <StateBox title={t("why.drivers.unavailable")} />;
  } else {
    body = (
      <ol className="space-y-2" aria-label={title} data-testid="driver-ranking">
        {ranking.map((d, i) => (
          <li key={d.driver} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-right tnum text-[11px] text-ink-400">{i + 1}</span>
              <span className="truncate text-ink-700" title={driverLabel(locale, d.driver)}>
                {driverLabel(locale, d.driver)}
              </span>
            </span>
            <span className="relative h-5">
              <span
                className={cn("absolute top-0.5 h-4 rounded-[3px] transition-[width] duration-300")}
                style={{ width: `${Math.max(0.8, d.importance_score)}%`, backgroundColor: i === 0 ? CHART.highlight : CHART.primary }}
                aria-hidden="true"
              />
            </span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="w-8 text-right tnum font-medium text-ink-800">{scoreText(d.importance_score)}</span>
              <span className="hidden text-[11px] text-ink-500 sm:inline">{directionLabel(d.direction)}</span>
              <Badge tone={d.confidence === "high" ? "positive" : d.confidence === "medium" ? "accent" : "neutral"} className="hidden md:inline-flex">
                {confidenceLabel(d.confidence)}
              </Badge>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ChartFrame
      title={title}
      subtitle={`${t("why.drivers.sub")}${basisText ? ` · ${basisText}` : ""}`}
      table={table}
      dimmed={loading && !!data}
      footnote={[modelNote, t("why.disclaimer")].filter(Boolean).join(" · ")}
    >
      {stale && loading && <p className="mb-2 text-[11px] text-ink-400">{t("why.drivers.loading")}</p>}
      {body}
    </ChartFrame>
  );
}
