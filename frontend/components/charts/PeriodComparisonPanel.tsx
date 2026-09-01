"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyMnt, formatPercent, formatUnits } from "@/lib/format";
import { computeMoM, computeQoQ, computeWoW, computeYoY, type PeriodComparison } from "@/lib/periodComparison";
import { cn } from "@/lib/utils";
import type { TimeAnalysis } from "@/types";

type Mode = "wow" | "mom" | "qoq" | "yoy";

const MODE_LABEL: Record<Mode, string> = {
  wow: "7 хоног (WoW)",
  mom: "Сар (MoM)",
  qoq: "Улирал (QoQ)",
  yoy: "Жил (YoY)",
};

export function PeriodComparisonPanel({ timeAnalysis }: { timeAnalysis: TimeAnalysis }) {
  const [mode, setMode] = React.useState<Mode>("mom");

  const comparison: PeriodComparison | null = React.useMemo(() => {
    if (mode === "wow") return computeWoW(timeAnalysis.weekly);
    if (mode === "mom") return computeMoM(timeAnalysis.monthly);
    if (mode === "qoq") return computeQoQ(timeAnalysis.monthly);
    return computeYoY(timeAnalysis.monthly);
  }, [mode, timeAnalysis]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="section-label">Хугацааны харьцуулалт</p>
        <div className="flex gap-1 rounded-lg border border-ink-200 bg-white/70 p-1">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {!comparison ? (
        <p className="rounded-lg border border-ink-200 bg-white/60 px-4 py-3 text-sm text-ink-400">
          Энэ харьцуулалтыг ({MODE_LABEL[mode]}) хийхэд хугацааны түүх хангалтгүй байна.
        </p>
      ) : (
        <>
          <div className="mb-2 flex justify-between text-xs text-ink-400">
            <span>{comparison.previousLabel}</span>
            <span>{comparison.currentLabel}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ComparisonCard
              label="Цэвэр борлуулалт"
              value={comparison.current.net_sales}
              deltaPct={comparison.deltas.net_sales}
              formatter={formatCurrencyMnt}
            />
            <ComparisonCard
              label="Нийт ашиг"
              value={comparison.current.gross_profit}
              deltaPct={comparison.deltas.gross_profit}
              formatter={formatCurrencyMnt}
            />
            <ComparisonCard
              label="Цэвэр тоо хэмжээ"
              value={comparison.current.net_qty}
              deltaPct={comparison.deltas.net_qty}
              formatter={formatUnits}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ComparisonCard({
  label,
  value,
  deltaPct,
  formatter,
}: {
  label: string;
  value: number;
  deltaPct: number;
  formatter: (v: number) => string;
}) {
  const isFlat = Math.abs(deltaPct) < 0.001;
  const isUp = deltaPct > 0;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="section-label">{label}</p>
        <p className="mt-2 text-xl font-semibold text-ink-900">{formatter(value)}</p>
        <span
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs font-medium",
            isFlat ? "text-ink-400" : isUp ? "text-emerald-600" : "text-rose-600"
          )}
        >
          {isFlat ? (
            <Minus className="h-3 w-3" />
          ) : isUp ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
          {formatPercent(Math.abs(deltaPct))}
        </span>
      </CardContent>
    </Card>
  );
}
