"use client";

import * as React from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Segmented, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
  numericFrom?: number; // index of first numeric column (right aligned)
}

interface ChartFrameProps {
  /** The finding, not the topic: "MUB explains 64% of the decline". */
  title: string;
  /** What is plotted, units, comparison basis. */
  subtitle?: string;
  footnote?: string;
  actions?: React.ReactNode;
  legend?: React.ReactNode;
  table?: ChartTable;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  dimmed?: boolean;
}

/** Shared chart chrome: insight title, descriptor subtitle, optional controls,
 *  legend row, and a table twin so no value is gated behind hover. */
export function ChartFrame({ title, subtitle, footnote, actions, legend, table, children, className, bodyClassName, dimmed }: ChartFrameProps) {
  const { t } = useLocale();
  const [view, setView] = React.useState<"chart" | "table">("chart");
  return (
    <figure data-testid="chart" data-title={title} className={cn("flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-card", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <Segmented
              ariaLabel={`${t("common.chart")} / ${t("common.table")}`}
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: t("common.chart") },
                { value: "table", label: t("common.table") },
              ]}
            />
          )}
        </div>
      </figcaption>
      {legend && view === "chart" && <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-500">{legend}</div>}
      <div className={cn("mt-3 min-w-0 flex-1 transition-opacity duration-200", dimmed && "opacity-50", bodyClassName)} aria-busy={dimmed || undefined}>
        {view === "table" && table ? (
          <Table dense>
            <THead>
              <TR>
                {table.columns.map((c, i) => (
                  <TH key={c} numeric={table.numericFrom !== undefined && i >= table.numericFrom}>
                    {c}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {table.rows.map((r, ri) => (
                <TR key={ri}>
                  {r.map((cell, ci) => (
                    <TD key={ci} numeric={table.numericFrom !== undefined && ci >= table.numericFrom}>
                      {cell}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          children
        )}
      </div>
      {footnote && <p className="mt-3 text-[11px] leading-relaxed text-ink-400">{footnote}</p>}
    </figure>
  );
}

export function LegendItem({ color, label, shape = "line" }: { color: string; label: string; shape?: "line" | "square" | "dot" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {shape === "line" ? (
        <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
      ) : shape === "dot" ? (
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      )}
      {label}
    </span>
  );
}

/** Tooltip card shared by all Recharts charts. */
export function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-ctl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink-800">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />}
            {r.label}
          </span>
          <span className="tnum font-medium text-ink-800">{r.value}</span>
        </p>
      ))}
    </div>
  );
}
