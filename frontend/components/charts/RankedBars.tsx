"use client";

import * as React from "react";
import { ChartFrame, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { MetricKey, RankedGroup } from "@/lib/analytics";
import { CHART, deltaColor } from "@/lib/chartTheme";
import { formatCompact, formatPct, formatSignedCompact, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RankedMode = "size" | "delta";

interface RankedBarsProps {
  title: string;
  subtitle?: string;
  rows: RankedGroup[];
  metric: MetricKey;
  mode: RankedMode;
  actions?: React.ReactNode;
  footnote?: string;
  dimensionLabel: string;
  highlightKeys?: string[];
}

/** Horizontal ranked bars drawn in HTML (crisp labels, accessible list).
 *  size: magnitude with share; delta: signed change vs comparison with
 *  contribution to the total change. One hue for one series; "Other" gray. */
export function RankedBars({ title, subtitle, rows, metric, mode, actions, footnote, dimensionLabel, highlightKeys }: RankedBarsProps) {
  const { t, locale } = useLocale();
  const isMoney = metric !== "volume";
  const fmt = (v: number) => (isMoney ? `₮${formatCompact(v, locale)}` : formatCompact(v, locale));
  const fmtSigned = (v: number) => (isMoney ? `${v < 0 ? "−" : "+"}₮${formatCompact(Math.abs(v), locale)}` : formatSignedCompact(v, locale));

  const hasDelta = rows.some((r) => r.delta !== null);
  const effectiveMode: RankedMode = mode === "delta" && hasDelta ? "delta" : "size";

  const ordered = React.useMemo(() => {
    if (effectiveMode === "size") return rows;
    const total = rows.reduce((s, r) => s + (r.delta ?? 0), 0);
    return [...rows].sort((a, b) => (total < 0 ? (a.delta ?? 0) - (b.delta ?? 0) : (b.delta ?? 0) - (a.delta ?? 0)));
  }, [rows, effectiveMode]);

  const maxAbs = Math.max(1e-9, ...ordered.map((r) => Math.abs(effectiveMode === "size" ? r.value : r.delta ?? 0)));

  const table: ChartTable = {
    columns: [dimensionLabel, t("common.value"), t("where.share"), ...(hasDelta ? [t("where.change"), t("where.contribution")] : [])],
    rows: rows.map((r) => [
      r.key,
      fmt(r.value),
      formatPct(r.share, 0),
      ...(hasDelta ? [r.delta === null ? "—" : `${fmtSigned(r.delta)} (${formatSignedPct(r.change)})`, r.contribution === null ? "—" : formatSignedPct(r.contribution, 0)] : []),
    ]),
    numericFrom: 1,
  };

  return (
    <ChartFrame title={title} subtitle={subtitle} actions={actions} footnote={footnote} table={table}>
      <ol className="space-y-1.5" aria-label={title}>
        {ordered.map((r) => {
          const value = effectiveMode === "size" ? r.value : r.delta ?? 0;
          const width = Math.max(0.5, (Math.abs(value) / maxAbs) * 100);
          const color = r.isOther ? CHART.neutral : effectiveMode === "size" ? CHART.primary : deltaColor(value);
          const highlighted = highlightKeys?.includes(r.key);
          return (
            <li key={r.key} className={cn("grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]", highlighted && "font-semibold")}>
              <span className={cn("truncate", r.isOther ? "text-ink-400" : "text-ink-700")} title={r.key}>
                {r.key}
                {r.isOther && r.members ? <span className="ml-1 text-[11px] text-ink-400">({r.members})</span> : null}
              </span>
              <span className="relative h-5">
                {effectiveMode === "delta" ? (
                  <span className="absolute inset-y-0 left-1/2 w-px bg-lineStrong" aria-hidden="true" />
                ) : null}
                <span
                  className="absolute top-0.5 h-4 rounded-[3px] transition-[width] duration-300"
                  style={{
                    backgroundColor: color,
                    width: effectiveMode === "delta" ? `${width / 2}%` : `${width}%`,
                    left: effectiveMode === "delta" ? (value < 0 ? `${50 - width / 2}%` : "50%") : 0,
                  }}
                  aria-hidden="true"
                />
              </span>
              <span className="tnum whitespace-nowrap text-right text-ink-800">
                {effectiveMode === "size" ? (
                  <>
                    {fmt(r.value)} <span className="text-ink-400">· {formatPct(r.share, 0)}</span>
                  </>
                ) : (
                  <>
                    {fmtSigned(value)}{" "}
                    <span className="text-ink-400">
                      · {formatSignedPct(r.change)}
                      {r.contribution !== null ? ` · ${formatSignedPct(r.contribution, 0)}` : ""}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
