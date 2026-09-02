"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, LegendItem, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import { AXIS_TICK, CHART } from "@/lib/chartTheme";
import { formatCompact, formatMonth, formatMonthShort } from "@/lib/format";
import type { ForecastResponse } from "@/types";

interface Props {
  title: string;
  subtitle: string;
  result: ForecastResponse;
  isMoney: boolean;
  dimmed?: boolean;
  footnote?: string;
}

type Row = {
  month: string;
  label: string;
  actual: number | null;
  fitted: number | null;
  point: number | null;
  band: [number, number] | null;
  isForecast: boolean;
};

const MAX_HISTORY_MONTHS = 36;

/** Actuals (solid), the selected model's backtest predictions (thin dashed
 *  gray), the forecast (dashed accent) and its 80% band. The forecast line
 *  starts from the last actual so the series read as one continuous story. */
export function ForecastChart({ title, subtitle, result, isMoney, dimmed, footnote }: Props) {
  const { t, locale } = useLocale();
  const fmt = (v: number) => (isMoney ? `₮${formatCompact(v, locale)}` : formatCompact(v, locale));

  const history = result.history.slice(-MAX_HISTORY_MONTHS);
  const lastActual = history[history.length - 1];
  const rows: Row[] = [
    ...history.map((h, i) => ({
      month: h.month,
      label: formatMonthShort(h.month, locale),
      actual: h.actual,
      fitted: h.fitted,
      // anchor the forecast line on the last observed month
      point: i === history.length - 1 ? h.actual : null,
      band: null,
      isForecast: false,
    })),
    ...result.forecast.map((f) => ({
      month: f.month,
      label: formatMonthShort(f.month, locale),
      actual: null,
      fitted: null,
      point: f.point,
      band: [f.lower, f.upper] as [number, number],
      isForecast: true,
    })),
  ];

  const table: ChartTable = {
    columns: [t("common.month"), t("forecast.legend.actual"), t("forecast.legend.forecast"), t("forecast.table.low"), t("forecast.table.high")],
    rows: rows.map((r) => [
      formatMonth(r.month, locale),
      r.actual === null ? "—" : fmt(r.actual),
      r.isForecast && r.point !== null ? fmt(r.point) : "—",
      r.band ? fmt(r.band[0]) : "—",
      r.band ? fmt(r.band[1]) : "—",
    ]),
    numericFrom: 1,
  };

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    const lines: { label: string; value: string; color?: string }[] = [];
    if (row.actual !== null) lines.push({ label: t("forecast.legend.actual"), value: fmt(row.actual), color: CHART.primary });
    if (row.fitted !== null) lines.push({ label: t("forecast.legend.fitted"), value: fmt(row.fitted), color: CHART.comparisonInk });
    if (row.isForecast && row.point !== null) {
      lines.push({ label: t("forecast.legend.forecast"), value: fmt(row.point), color: CHART.secondary });
      if (row.band) lines.push({ label: t("forecast.legend.band"), value: `${fmt(row.band[0])} – ${fmt(row.band[1])}` });
    }
    return <TooltipCard title={formatMonth(row.month, locale)} rows={lines} />;
  };

  const showDots = rows.length <= 30;
  const hasFitted = history.some((h) => h.fitted !== null);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      table={table}
      dimmed={dimmed}
      footnote={footnote}
      legend={
        <>
          <LegendItem color={CHART.primary} label={t("forecast.legend.actual")} />
          {hasFitted && <LegendItem color={CHART.comparisonInk} label={t("forecast.legend.fitted")} />}
          <LegendItem color={CHART.secondary} label={t("forecast.legend.forecast")} />
          <LegendItem color={CHART.primarySoft} label={t("forecast.legend.band")} shape="square" />
        </>
      }
    >
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 20, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={18} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v, locale)} width={60} tickCount={5} />
            <Tooltip content={renderTooltip} cursor={{ stroke: CHART.axis }} />
            <Area type="monotone" dataKey="band" stroke="none" fill={CHART.primarySoft} fillOpacity={0.55} isAnimationActive={false} connectNulls={false} activeDot={false} />
            {lastActual && (
              <ReferenceLine
                x={formatMonthShort(lastActual.month, locale)}
                stroke={CHART.axis}
                strokeDasharray="3 3"
                label={{ value: t("forecast.chart.boundary"), position: "insideTopRight", fill: CHART.inkMuted, fontSize: 11 }}
              />
            )}
            {hasFitted && <Line type="monotone" dataKey="fitted" stroke={CHART.comparisonInk} strokeWidth={1.5} strokeDasharray="2 4" dot={false} connectNulls isAnimationActive={false} />}
            <Line
              type="monotone"
              dataKey="actual"
              stroke={CHART.primary}
              strokeWidth={2.5}
              dot={showDots ? { r: 3, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="point"
              stroke={CHART.secondary}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ r: 3.5, fill: CHART.secondary, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART.secondary, stroke: CHART.surface, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
