"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORICAL, CHART_CHROME } from "@/lib/chartColors";
import { formatCurrencyMnt, formatPercent } from "@/lib/format";
import type { DiscountBandRow } from "@/types";

function BandTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  const row: DiscountBandRow = payload[0].payload;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink-800">Хөнгөлөлт: {label}</p>
      <p className="text-ink-500">{formatter(payload[0].value)}</p>
      <p className="text-ink-400">{row.row_count.toLocaleString()} мөр</p>
    </div>
  );
}

export function DiscountChart({ data }: { data: DiscountBandRow[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-400">Хөнгөлөлтийн мэдээлэл олдсонгүй.</p>;
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <p className="section-label mb-2">Борлуулалт хөнгөлөлтийн зэрэглэлээр</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
              <XAxis
                dataKey="band"
                tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
                axisLine={{ stroke: CHART_CHROME.baseline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
                axisLine={{ stroke: CHART_CHROME.baseline }}
                tickLine={false}
                tickFormatter={formatCurrencyMnt}
                width={80}
              />
              <Tooltip content={<BandTooltip formatter={formatCurrencyMnt} />} cursor={{ fill: "rgba(11,11,11,0.03)" }} />
              <Bar dataKey="net_sales" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <p className="section-label mb-2">Нийт ашгийн хувь хөнгөлөлтийн зэрэглэлээр</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
              <XAxis
                dataKey="band"
                tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
                axisLine={{ stroke: CHART_CHROME.baseline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_CHROME.mutedInk, fontSize: 11 }}
                axisLine={{ stroke: CHART_CHROME.baseline }}
                tickLine={false}
                tickFormatter={(v) => formatPercent(v)}
                width={48}
              />
              <Tooltip content={<BandTooltip formatter={(v: number) => formatPercent(v)} />} cursor={{ fill: "rgba(11,11,11,0.03)" }} />
              <Bar dataKey="gross_margin_pct" fill={CATEGORICAL[6]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardContent className="p-5">
          <p className="mb-3 text-sm text-ink-600">
            <span className="font-semibold">Удирдлагад:</span> хөнгөлөлт нэмэгдэхийн хэрээр борлуулалтын
            хэмжээ өссөн эсэх, харин ашгийн хувь буурсан эсэхийг харьцуулж үзнэ үү.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
