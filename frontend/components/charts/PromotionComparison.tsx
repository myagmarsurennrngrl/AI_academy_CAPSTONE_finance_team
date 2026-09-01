import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyFull, formatPercent, formatNumber } from "@/lib/format";
import type { PromotionComparisonRow } from "@/types";
import { cn } from "@/lib/utils";

interface MetricRow {
  label: string;
  key: keyof PromotionComparisonRow;
  formatter: (v: number) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricRow[] = [
  { label: "Дундаж цэвэр борлуулалт", key: "avg_net_sales", formatter: formatCurrencyFull, higherIsBetter: true },
  { label: "Дундаж борлуулсан тоо", key: "avg_units", formatter: (v) => formatNumber(v, 1), higherIsBetter: true },
  { label: "Дундаж борлуулах үнэ", key: "avg_selling_price", formatter: formatCurrencyFull, higherIsBetter: true },
  { label: "Дундаж нийт ашиг", key: "avg_gross_profit", formatter: formatCurrencyFull, higherIsBetter: true },
  { label: "Нийт ашгийн хувь", key: "avg_gross_margin_pct", formatter: (v) => formatPercent(v), higherIsBetter: true },
  { label: "Буцаалтын хувь", key: "return_rate_pct", formatter: (v) => formatPercent(v), higherIsBetter: false },
];

export function PromotionComparison({ data }: { data: PromotionComparisonRow[] }) {
  const promoted = data.find((d) => d.group === "promoted");
  const nonPromoted = data.find((d) => d.group === "non_promoted");

  if (!promoted || !nonPromoted) {
    return <p className="text-sm text-ink-400">Промошны харьцуулалт хийхэд хангалттай өгөгдөл алга.</p>;
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between text-xs text-ink-500">
          <span>{promoted.row_count.toLocaleString()} мөр — Промотой</span>
          <span>{nonPromoted.row_count.toLocaleString()} мөр — Промогүй</span>
        </div>
        <div className="space-y-3">
          {METRICS.map((m) => {
            const a = promoted[m.key] as number;
            const b = nonPromoted[m.key] as number;
            const diffPct = b !== 0 ? (a - b) / Math.abs(b) : 0;
            const isBetter = m.higherIsBetter ? diffPct > 0 : diffPct < 0;
            return (
              <div key={m.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-800">{m.formatter(a)}</p>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <p className="text-[11px] text-ink-400">{m.label}</p>
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[11px] font-medium",
                      Math.abs(diffPct) < 0.01
                        ? "text-ink-400"
                        : isBetter
                        ? "text-emerald-600"
                        : "text-rose-600"
                    )}
                  >
                    {Math.abs(diffPct) < 0.01 ? (
                      <Minus className="h-3 w-3" />
                    ) : diffPct > 0 ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {formatPercent(Math.abs(diffPct), 0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-800">{m.formatter(b)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-400">
          <span>Промотой</span>
          <span>Промогүй</span>
        </div>
      </CardContent>
    </Card>
  );
}
