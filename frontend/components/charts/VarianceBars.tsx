"use client";

import * as React from "react";
import { ChartFrame, TooltipCard, type ChartTable } from "@/components/charts/ChartFrame";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { MetricKey, MonthPoint } from "@/lib/analytics";
import { CHART, deltaColor } from "@/lib/chartTheme";
import { formatCompact, formatMonth, formatMonthShort, formatSignedPct } from "@/lib/format";

interface VarianceBarsProps {
  title: string;
  subtitle: string;
  points: MonthPoint[];
  metric: MetricKey;
  hasLY: boolean;
}

type Row = { month: string; label: string; change: number; current: number; ref: number };

const H = 200;
const PAD = { top: 22, right: 8, bottom: 22, left: 44 };

function niceStep(maxAbs: number): number {
  if (maxAbs <= 0) return 0.1;
  const raw = maxAbs / 2;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Diverging monthly variance vs last year (or vs previous month when no LY).
 *  Drawn as plain SVG: thin bars, hairline baseline, selective direct labels. */
export function VarianceBars({ title, subtitle, points, metric, hasLY }: VarianceBarsProps) {
  const { t, locale } = useLocale();
  const isMoney = metric !== "volume";
  const fmt = (v: number) => (isMoney ? `₮${formatCompact(v, locale)}` : formatCompact(v, locale));
  const [hover, setHover] = React.useState<number | null>(null);
  const [width, setWidth] = React.useState(600);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(240, w));
    });
    ro.observe(el);
    setWidth(Math.max(240, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const data: Row[] = points
    .map((p) => {
      const ref = hasLY ? p.ly : p.prev;
      if (!ref || !ref[metric]) return null;
      return { month: p.month, label: formatMonthShort(p.month, locale), change: (p.current[metric] - ref[metric]) / Math.abs(ref[metric]), current: p.current[metric], ref: ref[metric] };
    })
    .filter((r): r is Row => r !== null);

  if (!data.length) return null;

  const table: ChartTable = {
    columns: [t("common.month"), t("when.current"), hasLY ? t("when.lastYear") : t("kpi.vsPrevMonth"), t("where.change")],
    rows: data.map((d) => [formatMonth(d.month, locale), fmt(d.current), fmt(d.ref), formatSignedPct(d.change)]),
    numericFrom: 1,
  };

  const maxAbs = Math.max(0.01, ...data.map((d) => Math.abs(d.change)));
  const step = niceStep(maxAbs);
  const top = Math.ceil(maxAbs / step) * step;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const zeroY = PAD.top + plotH / 2;
  const scale = plotH / 2 / top;
  const slot = plotW / data.length;
  const barW = Math.min(22, Math.max(4, slot * 0.6));
  const ticks: number[] = [];
  for (let v = -top; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  const minRow = data.reduce((a, b) => (b.change < a.change ? b : a));
  const maxRow = data.reduce((a, b) => (b.change > a.change ? b : a));
  const labelAll = data.length <= 9;
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 8) : 1;

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table}>
      <div ref={wrapRef} className="relative w-full">
        <svg width={width} height={H} role="img" aria-label={title} className="block max-w-full">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={zeroY - v * scale} y2={zeroY - v * scale} stroke={v === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
              <text x={PAD.left - 6} y={zeroY - v * scale + 3.5} textAnchor="end" fontSize={11} fill={CHART.inkMuted}>
                {formatSignedPct(v, 0)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.abs(d.change) * scale;
            const y = d.change >= 0 ? zeroY - h : zeroY;
            const showLabel = labelAll || d.month === minRow.month || d.month === maxRow.month;
            const showTick = i % labelEvery === 0 || i === data.length - 1;
            return (
              <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill={hover === i ? "rgba(16,24,40,0.04)" : "transparent"} />
                <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(1, h)} rx={2} fill={deltaColor(d.change)} />
                {showLabel && (
                  <text x={cx} y={d.change >= 0 ? y - 5 : y + h + 12} textAnchor="middle" fontSize={11} fontWeight={500} fill={CHART.inkSecondary}>
                    {formatSignedPct(d.change, 0)}
                  </text>
                )}
                {showTick && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={CHART.inkMuted}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div className="pointer-events-none absolute z-10" style={{ left: Math.min(width - 190, Math.max(0, PAD.left + slot * hover + slot / 2 - 90)), top: 0 }}>
            <TooltipCard
              title={formatMonth(data[hover].month, locale)}
              rows={[
                { label: t("when.current"), value: fmt(data[hover].current) },
                { label: hasLY ? t("when.lastYear") : t("kpi.vsPrevMonth"), value: fmt(data[hover].ref) },
                { label: t("where.change"), value: formatSignedPct(data[hover].change) },
              ]}
            />
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
