"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { ChartFrame, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { DiscountBand, PromotionCompare } from "@/lib/analytics";
import { CHART } from "@/lib/chartTheme";
import { formatCompact, formatInt, formatMoneyFull, formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Margin by discount band, drawn as HTML bars with direct labels. */
export function DiscountBandChart({ title, bands }: { title: string; bands: DiscountBand[] | null }) {
  const { t, locale } = useLocale();
  if (!bands || !bands.length) {
    return (
      <ChartFrame title={t("why.discount.unavailable")} subtitle={t("why.discount.sub")}>
        <p className="py-8 text-center text-sm text-ink-400">{t("why.discount.unavailable")}</p>
      </ChartFrame>
    );
  }
  const maxMargin = Math.max(0.01, ...bands.map((b) => b.margin ?? 0));
  const table: ChartTable = {
    columns: [t("why.discount.band"), t("why.promo.margin"), t("why.promo.avgUnits"), t("kpi.volume"), t("where.rows")],
    rows: bands.map((b) => [b.band, formatPct(b.margin), formatNumber(b.avgUnits, 1), formatInt(b.volume), `${formatInt(b.rows)} (${formatPct(b.shareOfRows, 0)})`]),
    numericFrom: 1,
  };
  return (
    <ChartFrame title={title} subtitle={t("why.discount.sub")} table={table}>
      <ol className="space-y-2">
        {bands.map((b) => (
          <li key={b.band} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-[13px]">
            <span className="tnum text-ink-700">{b.band}</span>
            <span className="relative h-5">
              <span className="absolute top-0.5 h-4 rounded-[3px]" style={{ width: `${Math.max(1, ((b.margin ?? 0) / maxMargin) * 100)}%`, backgroundColor: CHART.primary }} aria-hidden="true" />
            </span>
            <span className="tnum whitespace-nowrap text-right text-ink-800">
              {formatPct(b.margin)} <span className="text-ink-400">· {formatNumber(b.avgUnits, 1)} {t("kpi.units")}/{t("where.rows")} · {formatPct(b.shareOfRows, 0)}</span>
            </span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}

/** Promoted vs non-promoted comparison list with direction cues. */
export function PromotionComparePanel({ promo }: { promo: PromotionCompare | null }) {
  const { t, locale } = useLocale();
  if (!promo) {
    return (
      <ChartFrame title={t("why.promo.title")} subtitle={t("why.promo.sub")}>
        <p className="py-8 text-center text-sm text-ink-400">{t("why.promo.unavailable")}</p>
      </ChartFrame>
    );
  }
  const rows: { label: string; a: number | null; b: number | null; fmt: (v: number | null) => string; higherIsBetter: boolean }[] = [
    { label: t("why.promo.avgUnits"), a: promo.avgUnits[0], b: promo.avgUnits[1], fmt: (v) => formatNumber(v, 1), higherIsBetter: true },
    { label: t("why.promo.avgPrice"), a: promo.avgPrice[0], b: promo.avgPrice[1], fmt: (v) => formatMoneyFull(v), higherIsBetter: true },
    { label: t("why.promo.margin"), a: promo.margin[0], b: promo.margin[1], fmt: (v) => formatPct(v), higherIsBetter: true },
    { label: t("why.promo.returnRate"), a: promo.returnRate[0], b: promo.returnRate[1], fmt: (v) => formatPct(v), higherIsBetter: false },
  ];
  const unitsDiff = promo.avgUnits[0] !== null && promo.avgUnits[1] ? (promo.avgUnits[0] - promo.avgUnits[1]) / promo.avgUnits[1] : null;
  const marginDiff = promo.margin[0] !== null && promo.margin[1] !== null ? (promo.margin[0] - promo.margin[1]) * 100 : null;
  const headline =
    unitsDiff === null || marginDiff === null
      ? t("why.promo.title")
      : locale === "mn"
      ? `Урамшуулалтай мөрөнд нэг гүйлгээний тоо ${unitsDiff >= 0 ? "+" : "−"}${formatPct(Math.abs(unitsDiff), 0)}, ашгийн хувь ${marginDiff >= 0 ? "+" : "−"}${Math.abs(marginDiff).toFixed(1)} нэгж`
      : `Promoted rows sell ${unitsDiff >= 0 ? "+" : "−"}${formatPct(Math.abs(unitsDiff), 0)} units per row at ${marginDiff >= 0 ? "+" : "−"}${Math.abs(marginDiff).toFixed(1)} pp margin`;

  return (
    <ChartFrame title={headline} subtitle={`${t("why.promo.sub")} · ${formatInt(promo.promoted.rows)} / ${formatInt(promo.nonPromoted.rows)} ${t("where.rows")}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 text-xs text-ink-400">
        <span className="font-semibold uppercase tracking-wide text-ink-500">{t("why.promo.promoted")}</span>
        <span />
        <span className="text-right font-semibold uppercase tracking-wide text-ink-500">{t("why.promo.nonPromoted")}</span>
      </div>
      <div className="mt-2 divide-y divide-line">
        {rows.map((r) => {
          const diff = r.a !== null && r.b ? (r.a - r.b) / Math.abs(r.b) : null;
          const better = diff === null ? null : r.higherIsBetter ? diff > 0 : diff < 0;
          const flat = diff !== null && Math.abs(diff) < 0.01;
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 py-2.5 text-sm">
              <span className="tnum font-semibold text-ink-900">{r.fmt(r.a)}</span>
              <span className="flex flex-col items-center text-center">
                <span className="text-[11px] text-ink-400">{r.label}</span>
                {diff !== null && (
                  <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", flat ? "text-ink-400" : better ? "text-positive" : "text-negative")}>
                    {flat ? <Minus className="h-3 w-3" /> : diff > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {formatPct(Math.abs(diff), 0)}
                  </span>
                )}
              </span>
              <span className="tnum text-right font-semibold text-ink-700">{r.fmt(r.b)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-ink-400">
        {t("kpi.revenue")}: ₮{formatCompact(promo.promoted.netSales, locale)} / ₮{formatCompact(promo.nonPromoted.netSales, locale)}
      </p>
    </ChartFrame>
  );
}
