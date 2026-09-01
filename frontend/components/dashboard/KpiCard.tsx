import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  helpText?: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: React.ReactNode;
}

export function KpiCard({ label, value, helpText, tone = "neutral", icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="section-label">{label}</p>
          <div className="flex items-center gap-1.5">
            {icon}
            {helpText && <InfoTooltip text={helpText} />}
          </div>
        </div>
        <p
          className={cn(
            "mt-2 text-2xl font-semibold tracking-tight",
            tone === "positive" && "text-emerald-700",
            tone === "negative" && "text-rose-700",
            tone === "neutral" && "text-ink-900"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
