"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/tooltip";
import { CHART_CHROME, DIVERGING } from "@/lib/chartColors";
import type { DriverEvidence } from "@/types";

const confidenceTone: Record<string, "positive" | "warning" | "neutral"> = {
  high: "positive",
  medium: "warning",
  low: "neutral",
};

function barColor(direction: string): string {
  if (direction.startsWith("negative")) return DIVERGING.negative;
  if (direction.startsWith("positive")) return DIVERGING.positive;
  return "#4a3aa7"; // categorical_effect / other -> violet
}

function DriverTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: DriverEvidence = payload[0].payload;
  return (
    <div className="max-w-xs rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink-800">{d.driver}</p>
      <p className="mt-1 text-ink-500">
        Ач холбогдол: <span className="font-medium text-ink-800">{d.importance_score.toFixed(0)}/100</span>
      </p>
      <p className="text-ink-500">Чиглэл: {d.direction.replaceAll("_", " ")}</p>
      <p className="text-ink-500">Итгэлцэл: {d.confidence}</p>
      {d.evidence?.[0] && <p className="mt-1 text-ink-400">{d.evidence[0]}</p>}
    </div>
  );
}

export function DriverChart({ drivers }: { drivers: DriverEvidence[] }) {
  const data = [...drivers].sort((a, b) => a.importance_score - b.importance_score);
  const height = Math.max(280, data.length * 42);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="section-label">Топ хүчин зүйлс</p>
        <InfoTooltip text="Driver importance represents statistical association, not guaranteed causal impact." />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={CHART_CHROME.gridline} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: CHART_CHROME.mutedInk, fontSize: 12 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="driver"
            width={130}
            tick={{ fill: CHART_CHROME.secondaryInk, fontSize: 12 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
          />
          <Tooltip content={<DriverTooltip />} cursor={{ fill: "rgba(11,11,11,0.03)" }} />
          <Bar dataKey="importance_score" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={barColor(d.direction)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">
        <LegendDot color={DIVERGING.positive} label="Эерэг хамаарал" />
        <LegendDot color={DIVERGING.negative} label="Сөрөг хамаарал" />
        <LegendDot color="#4a3aa7" label="Категори үзүүлэлт" />
      </div>

      <div className="mt-4 space-y-2">
        {[...drivers]
          .sort((a, b) => b.importance_score - a.importance_score)
          .map((d) => (
            <div
              key={d.driver}
              className="flex items-center justify-between rounded-lg border border-ink-100 bg-white/60 px-3 py-2 text-xs"
            >
              <span className="font-mono text-ink-700">{d.driver}</span>
              <Badge tone={confidenceTone[d.confidence]}>{d.confidence}</Badge>
            </div>
          ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
