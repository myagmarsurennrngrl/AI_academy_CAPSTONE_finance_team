"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_CHROME } from "@/lib/chartColors";
import type { GroupAnalysisRow } from "@/types";

type MetricKey = keyof Pick<
  GroupAnalysisRow,
  "net_sales" | "gross_profit" | "gross_margin_pct" | "return_rate_pct" | "net_qty"
>;

function MetricTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink-800">{label}</p>
      <p className="text-ink-500">{formatter(payload[0].value)}</p>
    </div>
  );
}

export function GroupMetricBarChart({
  data,
  metric,
  label,
  color,
  formatter,
  tickFormatter,
}: {
  data: GroupAnalysisRow[];
  metric: MetricKey;
  label: string;
  color: string;
  formatter: (v: number) => string;
  tickFormatter?: (v: number) => string;
}) {
  const chartData = [...data].sort((a, b) => b[metric] - a[metric]).slice(0, 8);
  return (
    <div>
      <p className="section-label mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
          <XAxis
            dataKey="group"
            tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
            tickFormatter={tickFormatter ?? formatter}
            width={80}
          />
          <Tooltip content={<MetricTooltip formatter={formatter} />} cursor={{ fill: "rgba(11,11,11,0.03)" }} />
          <Bar dataKey={metric} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
