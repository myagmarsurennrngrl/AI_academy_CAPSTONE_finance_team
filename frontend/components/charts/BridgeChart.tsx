"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { ChartFrame, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import { effectLabel, type SalesBridge } from "@/lib/bridge";
import { AXIS_TICK, CHART } from "@/lib/chartTheme";
import { formatCompact, formatPct, formatSignedPct } from "@/lib/format";

interface Props {
  title: string;
  subtitle: string;
  bridge: SalesBridge;
  baseLabel: string;
  currentLabel: string;
  footnote?: string;
}

type Row = {
  key: string;
  label: string;
  kind: "total" | "up" | "down";
  /** invisible offset the visible bar sits on */
  offset: number;
  /** visible bar height (always positive) */
  size: number;
  amount: number;
  pctOfBase: number | null;
  shareOfDelta: number | null;
};

/** Waterfall: comparison total → each effect → current total. Built from two
 *  stacked bars (a transparent offset and the visible step). */
export function BridgeChart({ title, subtitle, bridge, baseLabel, currentLabel, footnote }: Props) {
  const { t, locale } = useLocale();
  const fmt = (v: number) => `₮${formatCompact(v, locale)}`;
  const fmtSigned = (v: number) => `${v < 0 ? "−" : "+"}₮${formatCompact(Math.abs(v), locale)}`;

  const rows: Row[] = [];
  rows.push({ key: "base", label: baseLabel, kind: "total", offset: 0, size: Math.abs(bridge.base), amount: bridge.base, pctOfBase: null, shareOfDelta: null });
  let running = bridge.base;
  for (const s of bridge.steps) {
    const next = running + s.amount;
    rows.push({
      key: s.key,
      label: effectLabel(locale, s.key),
      kind: s.amount >= 0 ? "up" : "down",
      offset: Math.min(running, next),
      size: Math.abs(s.amount),
      amount: s.amount,
      pctOfBase: s.pctOfBase,
      shareOfDelta: s.shareOfDelta,
    });
    running = next;
  }
  rows.push({ key: "current", label: currentLabel, kind: "total", offset: 0, size: Math.abs(bridge.current), amount: bridge.current, pctOfBase: null, shareOfDelta: null });

  const table: ChartTable = {
    columns: [t("bridge.step"), t("bridge.amount"), t("bridge.pctOfBase"), t("bridge.shareOfDelta")],
    rows: rows.map((r) => [r.label, r.kind === "total" ? fmt(r.amount) : fmtSigned(r.amount), r.pctOfBase === null ? "—" : formatSignedPct(r.pctOfBase), r.shareOfDelta === null ? "—" : formatPct(r.shareOfDelta, 0)]),
    numericFrom: 1,
  };

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    const lines: { label: string; value: string }[] = [{ label: row.kind === "total" ? t("bridge.total") : t("bridge.amount"), value: row.kind === "total" ? fmt(row.amount) : fmtSigned(row.amount) }];
    if (row.pctOfBase !== null) lines.push({ label: t("bridge.pctOfBase"), value: formatSignedPct(row.pctOfBase) });
    if (row.shareOfDelta !== null) lines.push({ label: t("bridge.shareOfDelta"), value: formatPct(row.shareOfDelta, 0) });
    return <TooltipCard title={row.label} rows={lines} />;
  };

  const colorOf = (r: Row) => (r.kind === "total" ? CHART.ink : r.kind === "up" ? CHART.positive : CHART.negative);
  const minY = Math.min(0, ...rows.map((r) => r.offset));

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table} footnote={footnote}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} height={44} angle={rows.length > 7 ? -18 : 0} textAnchor={rows.length > 7 ? "end" : "middle"} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v, locale)} width={60} domain={[minY, "auto"]} />
            <Tooltip content={renderTooltip} cursor={{ fill: CHART.cursor }} />
            <ReferenceLine y={0} stroke={CHART.axis} />
            <Bar dataKey="offset" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="size" stackId="w" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={56}>
              {rows.map((r) => (
                <Cell key={r.key} fill={colorOf(r)} fillOpacity={r.kind === "total" ? 0.9 : 0.85} />
              ))}
              <LabelList
                dataKey="amount"
                position="top"
                content={(props) => {
                  const { x, y, width, value, index } = props as { x?: number; y?: number; width?: number; value?: number; index?: number };
                  if (x === undefined || y === undefined || width === undefined || value === undefined || index === undefined) return null;
                  const row = rows[index];
                  const text = row.kind === "total" ? fmt(value) : fmtSigned(value);
                  return (
                    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={colorOf(row)}>
                      {text}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
