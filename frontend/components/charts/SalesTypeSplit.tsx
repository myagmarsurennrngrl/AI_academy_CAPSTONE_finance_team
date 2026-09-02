"use client";

import * as React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, LegendItem, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import { margin, type SalesTypeSplit as Split } from "@/lib/analytics";
import { AXIS_TICK, BAR_MAX, CHART } from "@/lib/chartTheme";
import { formatCompact, formatInt, formatMonth, formatMonthShort, formatPct } from "@/lib/format";

interface Props {
  title: string;
  split: Split;
}

/** POS sell-out and shipment sell-in side by side - never summed. */
export function SalesTypeSplit({ title, split }: Props) {
  const { t, locale } = useLocale();
  const hasPos = split.pos.rows > 0;
  const hasShip = split.shipment.rows > 0;
  const both = hasPos && hasShip;

  const data = split.monthly.map((m) => ({ month: m.month, label: formatMonthShort(m.month, locale), sellOut: m.sellOut, sellIn: m.sellIn }));
  const table: ChartTable = {
    columns: [t("common.month"), t("where.pos"), t("where.shipment")],
    rows: data.map((d) => [formatMonth(d.month, locale), formatInt(d.sellOut), formatInt(d.sellIn)]),
    numericFrom: 1,
  };

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as (typeof data)[number];
    return (
      <TooltipCard
        title={formatMonth(row.month, locale)}
        rows={[
          { label: t("where.pos"), value: formatInt(row.sellOut), color: CHART.primary },
          { label: t("where.shipment"), value: formatInt(row.sellIn), color: CHART.secondary },
        ]}
      />
    );
  };

  const Block = ({ label, color, units, unitsLabel, rows, revenue, m }: { label: string; color: string; units: number; unitsLabel: string; rows: number; revenue: number; m: number | null }) => (
    <div className="rounded-ctl border border-line bg-surface2/60 p-4">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold text-ink-900">
        {formatCompact(units, locale)} <span className="text-sm font-normal text-ink-400">{unitsLabel}</span>
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-400">{t("where.byTypeRevenue")}</dt>
          <dd className="tnum font-medium text-ink-700">₮{formatCompact(revenue, locale)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">{t("where.byTypeMargin")}</dt>
          <dd className="tnum font-medium text-ink-700">{formatPct(m)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">{t("where.rows")}</dt>
          <dd className="tnum font-medium text-ink-700">{formatInt(rows)}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <ChartFrame
      title={title}
      subtitle={t("where.salesType.note")}
      table={both ? table : undefined}
      legend={
        both ? (
          <>
            <LegendItem color={CHART.primary} label={t("where.pos")} shape="square" />
            <LegendItem color={CHART.secondary} label={t("where.shipment")} shape="square" />
          </>
        ) : undefined
      }
    >
      <div className={both ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        {hasPos ? (
          <Block label={t("where.pos")} color={CHART.primary} units={split.pos.sellOut} unitsLabel={t("kpi.units")} rows={split.pos.rows} revenue={split.pos.netSales} m={margin(split.pos)} />
        ) : (
          <p className="rounded-ctl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">{t("where.noPos")}</p>
        )}
        {hasShip ? (
          <Block label={`${t("where.shipment")} · ${t("where.netShipment")}`} color={CHART.secondary} units={split.shipment.sellIn} unitsLabel={t("kpi.units")} rows={split.shipment.rows} revenue={split.shipment.netSales} m={margin(split.shipment)} />
        ) : (
          <p className="rounded-ctl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">{t("where.noShipment")}</p>
        )}
      </div>
      {both && data.length > 1 && (
        <div className="mt-4 h-[180px] w-full">
          <p className="mb-1 text-[11px] font-medium text-ink-500">{t("where.monthlyByType")}</p>
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v, locale)} width={44} tickCount={4} />
              <Tooltip content={renderTooltip} cursor={{ fill: "rgba(16,24,40,0.04)" }} />
              <Bar dataKey="sellOut" fill={CHART.primary} maxBarSize={BAR_MAX} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="sellIn" fill={CHART.secondary} maxBarSize={BAR_MAX} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {split.other.rows > 0 && (
        <p className="mt-3 text-[11px] text-ink-400">
          {t("where.otherType")}: {split.otherLabels.join(", ")} · {formatInt(split.other.rows)} {t("where.rows")}
        </p>
      )}
    </ChartFrame>
  );
}
