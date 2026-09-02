"use client";

import * as React from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { PriceQuantity } from "@/lib/analytics";
import { AXIS_TICK, CHART } from "@/lib/chartTheme";
import { formatCompact, formatInt, formatMonth, formatMoneyFull } from "@/lib/format";

interface Props {
  title: string;
  pq: PriceQuantity;
}

export function PriceQuantityScatter({ title, pq }: Props) {
  const { t, locale } = useLocale();
  const data = pq.points.map((p) => ({ ...p, label: `${p.product} · ${formatMonth(p.month, locale)}` }));

  const table: ChartTable = {
    columns: [t("filters.product"), t("common.month"), t("why.priceQty.x"), t("why.priceQty.y")],
    rows: [...pq.points].sort((a, b) => a.product.localeCompare(b.product) || a.month.localeCompare(b.month)).map((p) => [p.product, formatMonth(p.month, locale), formatMoneyFull(p.price), formatInt(p.volume)]),
    numericFrom: 2,
  };

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <TooltipCard
        title={p.label}
        rows={[
          { label: t("why.priceQty.x"), value: formatMoneyFull(p.price) },
          { label: t("why.priceQty.y"), value: formatInt(p.volume) },
          { label: t("kpi.revenue"), value: `₮${formatCompact(p.netSales, locale)}` },
        ]}
      />
    );
  };

  if (pq.points.length < 3) {
    return (
      <ChartFrame title={title} subtitle={t("why.priceQty.sub")}>
        <p className="py-8 text-center text-sm text-ink-400">{t("why.priceQty.insufficient")}</p>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={title} subtitle={t("why.priceQty.sub")} table={table} footnote={t("why.disclaimer")}>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} />
            <XAxis
              dataKey="price"
              type="number"
              name={t("why.priceQty.x")}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCompact(v, locale)}
              domain={["auto", "auto"]}
              label={{ value: t("why.priceQty.x"), position: "insideBottom", offset: -4, fill: CHART.inkMuted, fontSize: 11 }}
            />
            <YAxis
              dataKey="volume"
              type="number"
              name={t("why.priceQty.y")}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCompact(v, locale)}
              width={52}
              label={{ value: t("why.priceQty.y"), angle: -90, position: "insideLeft", offset: 12, fill: CHART.inkMuted, fontSize: 11 }}
            />
            <Tooltip content={renderTooltip} cursor={{ stroke: CHART.axis }} />
            <Scatter data={data} fill={CHART.primary} fillOpacity={0.55} stroke={CHART.surface} strokeWidth={1} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
