"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { InfoTip } from "@/components/ui/primitives";
import type { Analytics } from "@/hooks/useAnalytics";
import { formatCompact, formatMonthShort, formatMoneyFull, formatPct, formatPointsDelta, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiTileProps {
  label: string;
  value: string;
  valueSuffix?: string;
  tip?: string;
  delta?: { change: number | null; text?: string; label: string; higherIsBetter?: boolean };
  context?: string;
  /** when the value itself is a change (e.g. MoM %) colour it by sign */
  signedValue?: number | null;
  testId?: string;
  rawValue?: number | null;
}

/** Label · primary value · comparison with direction · optional context. */
export function KpiTile({ label, value, valueSuffix, tip, delta, context, signedValue, testId, rawValue }: KpiTileProps) {
  const { t } = useLocale();
  const change = delta?.change ?? null;
  const flat = change !== null && Math.abs(change) < 0.0005;
  const good = change === null ? null : (delta?.higherIsBetter ?? true) ? change > 0 : change < 0;
  const valueTone = signedValue === null || signedValue === undefined ? "text-ink-900" : Math.abs(signedValue) < 0.0005 ? "text-ink-700" : signedValue > 0 ? "text-positive" : "text-negative";
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-testid={testId ? `kpi-${testId}` : undefined}>
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {tip && <InfoTip text={tip} />}
      </div>
      <p className={cn("mt-2 text-[26px] font-semibold leading-none tracking-tight sm:text-[28px]", valueTone)} data-value={rawValue === null || rawValue === undefined ? undefined : rawValue}>
        {value}
        {valueSuffix && <span className="ml-1 text-sm font-normal text-ink-400">{valueSuffix}</span>}
      </p>
      {delta ? (
        <p className="mt-2.5 flex items-center gap-1 text-[13px]">
          {change === null ? (
            <span className="text-ink-400">{t("kpi.noComparison")}</span>
          ) : (
            <>
              <span className={cn("inline-flex items-center gap-0.5 font-semibold tnum", flat ? "text-ink-500" : good ? "text-positive" : "text-negative")}>
                {flat ? <Minus className="h-3.5 w-3.5" /> : change > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {delta.text ?? formatSignedPct(change)}
              </span>
              <span className="text-ink-400">{delta.label}</span>
            </>
          )}
        </p>
      ) : null}
      {context && <p className="mt-1.5 truncate text-xs text-ink-400" title={context}>{context}</p>}
    </div>
  );
}

export function KpiRow({ analytics }: { analytics: Analytics }) {
  const { t, locale } = useLocale();
  const k = analytics.kpis;
  const basis = analytics.comparison?.basis ?? null;
  const vsLabel = basis === "ly" ? t("kpi.vsLY") : basis === "prior" ? t("kpi.vsPrior") : "";
  const mom = k.mom;
  const bothTypes = k.current.sellOut > 0 && k.current.sellIn > 0;
  const money = (v: number | null) => (v === null ? "—" : `₮${formatCompact(v, locale)}`);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        testId="volume"
        rawValue={k.current.volume}
        label={t("kpi.volume")}
        value={formatCompact(k.current.volume, locale)}
        valueSuffix={t("kpi.units")}
        tip={t("kpi.volumeTip")}
        delta={{ change: k.volume.change, label: vsLabel }}
        context={
          bothTypes
            ? `${t("where.pos")} ${formatCompact(k.current.sellOut, locale)} · ${t("where.netShipment")} ${formatCompact(k.current.sellIn, locale)}`
            : k.current.sellIn > 0
            ? `${t("where.netShipment")}`
            : undefined
        }
      />
      <KpiTile testId="revenue" rawValue={k.current.netSales} label={t("kpi.revenue")} value={money(k.current.netSales)} tip={t("kpi.netRevenueTip")} delta={{ change: k.netSales.change, label: vsLabel }} context={k.comparisonMetrics ? `${t("kpi.comparedTo")}: ${money(k.comparisonMetrics.netSales)}` : undefined} />
      <KpiTile testId="grossProfit" rawValue={k.current.grossProfit} label={t("kpi.grossProfit")} value={money(k.current.grossProfit)} delta={{ change: k.grossProfit.change, label: vsLabel }} context={k.comparisonMetrics ? `${t("kpi.comparedTo")}: ${money(k.comparisonMetrics.grossProfit)}` : undefined} />
      <KpiTile
        testId="margin"
        rawValue={k.margin.current}
        label={t("kpi.margin")}
        value={formatPct(k.margin.current)}
        tip={t("kpi.marginTip")}
        delta={{ change: k.margin.pointsChange ?? null, text: k.margin.pointsChange === null || k.margin.pointsChange === undefined ? undefined : formatPointsDelta(k.margin.pointsChange, locale), label: vsLabel }}
        context={k.margin.previous !== null ? `${t("kpi.comparedTo")}: ${formatPct(k.margin.previous)}` : undefined}
      />
      <KpiTile testId="avgPrice" rawValue={k.avgPrice.current} label={t("kpi.avgPrice")} value={k.avgPrice.current === null ? "—" : formatMoneyFull(k.avgPrice.current)} delta={{ change: k.avgPrice.change, label: vsLabel }} context={k.avgPrice.previous !== null ? `${t("kpi.comparedTo")}: ${formatMoneyFull(k.avgPrice.previous)}` : undefined} />
      <KpiTile
        testId="mom"
        rawValue={mom?.change.netSales ?? null}
        label={t("kpi.mom")}
        tip={t("kpi.momTip")}
        value={mom && mom.change.netSales !== null ? formatSignedPct(mom.change.netSales) : "—"}
        signedValue={mom?.change.netSales ?? null}
        delta={mom ? { change: mom.change.volume, text: formatSignedPct(mom.change.volume), label: t("kpi.volume").toLowerCase() } : undefined}
        context={mom ? `${formatMonthShort(mom.month, locale)}${mom.mtd ? ` (${t("kpi.mtd")})` : ""} ${t("kpi.vsPrevMonth")} ${formatMonthShort(mom.prevMonth, locale)}` : t("kpi.noComparison")}
      />
    </div>
  );
}
