"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_CHROME, SEQUENTIAL_BLUE } from "@/lib/chartColors";
import { formatCurrencyMnt, formatCurrencyFull } from "@/lib/format";
import type { TimeAnalysis } from "@/types";
import { cn } from "@/lib/utils";

type Granularity = "daily" | "weekly" | "monthly";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  daily: "Өдөр тутам",
  weekly: "7 хоног",
  monthly: "Сар",
};

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink-800">{label}</p>
      <p className="text-ink-500">Цэвэр борлуулалт: {formatCurrencyFull(payload[0].value)}</p>
    </div>
  );
}

export function SalesTrendChart({ timeAnalysis }: { timeAnalysis: TimeAnalysis }) {
  const hasWeekly = timeAnalysis.weekly.length > 0;
  const hasMonthly = timeAnalysis.monthly.length > 0;
  const [granularity, setGranularity] = React.useState<Granularity>(
    hasMonthly && timeAnalysis.date_span_days >= 60 ? "monthly" : hasWeekly ? "weekly" : "daily"
  );

  const data = timeAnalysis[granularity];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="section-label">Цэвэр борлуулалт огноогоор</p>
        <div className="flex gap-1 rounded-lg border border-ink-200 bg-white/70 p-1">
          {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                granularity === g ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
              )}
            >
              {GRANULARITY_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {timeAnalysis.short_history_warning && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {timeAnalysis.short_history_warning}
        </p>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
            axisLine={{ stroke: CHART_CHROME.baseline }}
            tickLine={false}
            tickFormatter={(v) => formatCurrencyMnt(v)}
            width={88}
          />
          <Tooltip content={<TrendTooltip />} />
          <Line
            type="monotone"
            dataKey="net_sales"
            stroke={SEQUENTIAL_BLUE[450]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
