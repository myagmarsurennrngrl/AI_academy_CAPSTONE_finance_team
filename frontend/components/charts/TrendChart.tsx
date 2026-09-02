"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, LegendItem, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Annotation, MetricKey, MonthPoint } from "@/lib/analytics";
import { AXIS_TICK, CHART } from "@/lib/chartTheme";
import { formatCompact, formatMonth, formatMonthShort, formatSignedPct } from "@/lib/format";

interface TrendChartProps {
  title: string;
  subtitle: string;
  points: MonthPoint[];
  metric: MetricKey;
  hasLY: boolean;
  annotations: Annotation[];
  actions?: React.ReactNode;
  footnote?: string;
}

type Row = { month: string; label: string; current: number; ly: number | null };

/** Current period emphasised (accent, 2.5px, markers), last year quiet (gray). */
export function TrendChart({ title, subtitle, points, metric, hasLY, annotations, actions, footnote }: TrendChartProps) {
  const { t, locale } = useLocale();
  const isMoney = metric !== "volume";
  const fmt = (v: number) => (isMoney ? `₮${formatCompact(v, locale)}` : formatCompact(v, locale));

  const data: Row[] = points.map((p) => ({
    month: p.month,
    label: formatMonthShort(p.month, locale),
    current: p.current[metric],
    ly: p.ly ? p.ly[metric] : null,
  }));

  const table: ChartTable = {
    columns: [t("common.month"), t("when.current"), ...(hasLY ? [t("when.lastYear"), t("where.change")] : [])],
    rows: data.map((d) => [
      formatMonth(d.month, locale),
      fmt(d.current),
      ...(hasLY ? [d.ly === null ? "—" : fmt(d.ly), d.ly ? formatSignedPct((d.current - d.ly) / Math.abs(d.ly)) : "—"] : []),
    ]),
    numericFrom: 1,
  };

  const annotationLabel = (a: Annotation): string => {
    switch (a.kind) {
      case "peak":
        return `${t("when.peak")} ${fmt(a.value)}`;
      case "low":
        return `${t("when.low")} ${fmt(a.value)}`;
      case "priceUp":
      case "priceDown":
        return `${t("when.priceUp")} ${formatSignedPct(a.value, 0)}`;
      case "stockDown":
      case "stockUp":
        return `${t("when.stockDown")} ${formatSignedPct(a.value, 0)}`;
    }
  };

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    const rows: { label: string; value: string; color?: string }[] = [{ label: t("when.current"), value: fmt(row.current), color: CHART.primary }];
    if (row.ly !== null) {
      rows.push({ label: t("when.lastYear"), value: fmt(row.ly), color: CHART.comparison });
      rows.push({ label: t("where.change"), value: formatSignedPct((row.current - row.ly) / Math.abs(row.ly)) });
    }
    return <TooltipCard title={formatMonth(row.month, locale)} rows={rows} />;
  };

  const showDots = data.length <= 26;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      actions={actions}
      footnote={footnote}
      table={table}
      legend={
        hasLY ? (
          <>
            <LegendItem color={CHART.primary} label={t("when.current")} />
            <LegendItem color={CHART.comparison} label={t("when.lastYear")} />
          </>
        ) : undefined
      }
    >
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={18} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v, locale)} width={56} tickCount={5} />
            <Tooltip content={renderTooltip} cursor={{ stroke: CHART.axis }} />
            {hasLY && (
              <Line type="monotone" dataKey="ly" stroke={CHART.comparison} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART.comparison, stroke: CHART.surface, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            )}
            <Line
              type="monotone"
              dataKey="current"
              stroke={CHART.primary}
              strokeWidth={2.5}
              dot={showDots ? { r: 3.5, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {annotations.map((a) => {
              const row = data.find((d) => d.month === a.month);
              if (!row) return null;
              const isEvent = a.kind !== "peak" && a.kind !== "low";
              return (
                <ReferenceDot
                  key={`${a.kind}-${a.month}`}
                  x={row.label}
                  y={row.current}
                  r={isEvent ? 5 : 0}
                  fill={CHART.surface}
                  stroke={isEvent ? CHART.ink : "none"}
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                  label={{
                    value: annotationLabel(a),
                    position: a.kind === "low" ? "bottom" : "top",
                    fill: CHART.inkSecondary,
                    fontSize: 11,
                    fontWeight: 500,
                    offset: 10,
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
