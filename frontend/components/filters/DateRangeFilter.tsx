"use client";

import * as React from "react";
import { CalendarRange, ChevronDown, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatMonthShort } from "@/lib/format";
import { addMonthsIso, monthEnd, monthStart, presetRange, type DatePreset } from "@/lib/filters";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  dataMin: string;
  dataMax: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  testId?: string;
}

const PRESETS: DatePreset[] = ["all", "l3m", "l6m", "l12m", "ytd", "lastMonth"];

function monthsBetween(min: string, max: string): string[] {
  const out: string[] = [];
  let cur = monthStart(min.slice(0, 7));
  const end = monthStart(max.slice(0, 7));
  while (cur <= end) {
    out.push(cur.slice(0, 7));
    cur = addMonthsIso(cur, 1);
  }
  return out;
}

/** Month-granularity period picker with presets anchored on the dataset's
 *  latest date (not on today), so "last 12 months" always means the data. */
export function DateRangeFilter({ dataMin, dataMax, from, to, onChange, testId }: DateRangeFilterProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const months = React.useMemo(() => monthsBetween(dataMin, dataMax), [dataMin, dataMax]);
  const active = !!(from || to);
  const fromMonth = (from ?? dataMin).slice(0, 7);
  const toMonth = (to ?? dataMax).slice(0, 7);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activePreset = React.useMemo<DatePreset | null>(() => {
    for (const p of PRESETS) {
      const r = presetRange(p, dataMin, dataMax);
      if (r.from === from && r.to === to) return p;
    }
    return null;
  }, [from, to, dataMin, dataMax]);

  const summary = active ? `${formatMonthShort(fromMonth, locale)} – ${formatMonthShort(toMonth, locale)}` : t("filters.preset.all");

  const setMonths = (fm: string, tm: string) => {
    const f = fm > tm ? tm : fm;
    const tt = fm > tm ? fm : tm;
    const nf = monthStart(f);
    const nt = monthEnd(tt);
    const isAll = f === months[0] && tt === months[months.length - 1];
    onChange(isAll ? null : nf, isAll ? null : nt);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-ctl border bg-surface px-3 text-left text-sm transition-colors focus-ring",
          active ? "border-accent/50 bg-accentSoft/40" : "border-line hover:border-lineStrong"
        )}
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("filters.period")}</span>
        <span className={cn("min-w-0 flex-1 truncate tnum", active ? "font-medium text-ink-900" : "text-ink-600")}>{summary}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`${t("filters.clear")} ${t("filters.period")}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null, null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange(null, null);
              }
            }}
            className="rounded-full p-0.5 text-ink-400 hover:bg-line hover:text-ink-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div role="dialog" data-testid={testId ? `${testId}-popover` : undefined} aria-label={t("filters.period")} className="absolute left-0 z-40 mt-1 w-[min(360px,calc(100vw-2rem))] rounded-card border border-line bg-surface p-3 shadow-pop">
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((p) => {
              const isActive = activePreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    const r = presetRange(p, dataMin, dataMax);
                    onChange(r.from, r.to);
                  }}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1.5 text-left text-sm focus-ring",
                    isActive ? "bg-accentSoft font-medium text-accent" : "text-ink-700 hover:bg-surface2"
                  )}
                >
                  {t(`filters.preset.${p}` as const)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t("filters.from")}
              <select
                value={fromMonth}
                onChange={(e) => setMonths(e.target.value, toMonth)}
                className="h-8 rounded-ctl border border-line bg-surface px-2 text-sm font-normal normal-case tracking-normal text-ink-800 focus-ring"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthShort(m, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t("filters.to")}
              <select
                value={toMonth}
                onChange={(e) => setMonths(fromMonth, e.target.value)}
                className="h-8 rounded-ctl border border-line bg-surface px-2 text-sm font-normal normal-case tracking-normal text-ink-800 focus-ring"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthShort(m, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
