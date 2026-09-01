import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "info" | "accent";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-600 border-ink-200",
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-rose-50 text-rose-700 border-rose-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  accent: "bg-accent-50 text-accent-700 border-accent-200",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
