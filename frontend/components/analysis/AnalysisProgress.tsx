"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const ANALYSIS_STEPS = [
  "Excel файл уншиж байна",
  "Өгөгдөл шалгаж байна",
  "KPI тооцоолж байна",
  "Борлуулалтын хүчин зүйл шинжилж байна",
  "Claude AI дүгнэлт боловсруулж байна",
  "Монгол орчуулга хийж байна",
  "Тайлан бэлтгэж байна",
];

export function AnalysisProgress({ currentStep }: { currentStep: number }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="p-8">
        <p className="mb-6 text-center text-sm font-medium text-ink-500">
          Таны өгөгдлийг шинжилж байна...
        </p>
        <ul className="space-y-3">
          {ANALYSIS_STEPS.map((label, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active && "bg-accent-50/80",
                  done && "text-ink-500",
                  !done && !active && "text-ink-400"
                )}
              >
                {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                {active && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-600" />}
                {!done && !active && <Circle className="h-4 w-4 shrink-0 text-ink-300" />}
                <span className={cn(active && "font-medium text-ink-800")}>{label}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
