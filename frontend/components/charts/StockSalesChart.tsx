"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, LegendItem, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { StockSales } from "@/lib/analytics";
import { AXIS_TICK, CHART } from "@/lib/chartTheme";
import { formatInt, formatMonth, formatMonthShort, formatNumber } from "@/lib/format";

interface Props {
  title: string;
  stock: StockSales;
}

/** Two series on ONE axis by indexing both to the first month (=100). */
export function StockSalesChart({ title, stock }: Props) {
  const { t, locale } = useLocale();
  if (!stock.available) {
    return (
      <ChartFrame title={t("why.stock.unavailable")} subtitle={t("why.stock.sub")}>
        <p className="py-8 text-center text-sm text-ink-400">{t("why.stock.unavailable")}</p>
      </ChartFrame>
    );
  }
  const data = stock.points.map((p) => ({ ...p, label: formatMonthShort(p.month, locale) }));
  const table: ChartTable = {
    columns: [t("common.month"), t("inventory.stock"), t("why.stock.sales"), t("why.stock.stock")],
    rows: data.map((d) => [formatMonth(d.month, locale), d.stock === null ? "—" : formatInt(d.stock), `${formatInt(d.volume)} (${d.volumeIdx === null ? "—" : formatNumber(d.volumeIdx, 0)})`, d.stockIdx === null ? "—" : formatNumber(d.stockIdx, 0)]),
    numericFrom: 1,
  };
  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <TooltipCard
        title={formatMonth(p.month, locale)}
        rows={[
          { label: t("why.stock.sales"), value: `${formatInt(p.volume)} (${p.volumeIdx === null ? "—" : formatNumber(p.volumeIdx, 0)})`, color: CHART.primary },
          { label: t("why.stock.stock"), value: `${p.stock === null ? "—" : formatInt(p.stock)} (${p.stockIdx === null ? "—" : formatNumber(p.stockIdx, 0)})`, color: CHART.secondary },
        ]}
      />
    );
  };
  return (
    <ChartFrame
      title={title}
      subtitle={t("why.stock.sub")}
      table={table}
      footnote={t("why.disclaimer")}
      legend={
        <>
          <LegendItem color={CHART.primary} label={t("why.stock.sales")} />
          <LegendItem color={CHART.secondary} label={t("why.stock.stock")} />
        </>
      }
    >
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickCount={5} domain={["auto", "auto"]} />
            <ReferenceLine y={100} stroke={CHART.axis} />
            <Tooltip content={renderTooltip} cursor={{ stroke: CHART.axis }} />
            <Line type="monotone" dataKey="stockIdx" stroke={CHART.secondary} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART.secondary, stroke: CHART.surface, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="volumeIdx" stroke={CHART.primary} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
