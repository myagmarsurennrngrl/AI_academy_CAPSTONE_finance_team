"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { DimensionOption } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  label: string;
  options: DimensionOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  note?: string;
  disabled?: boolean;
  testId?: string;
}

/** Searchable, keyboard-accessible multi-select. The trigger always shows the
 *  current selection so a filter can never be active invisibly. */
export function MultiSelect({ label, options, selected, onChange, note, disabled, testId }: MultiSelectProps) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  const searchable = options.length > 7;
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)) : options;
  }, [options, query]);

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
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, searchable]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary =
    selected.length === 0
      ? t("filters.all")
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : t("filters.selected", { n: selected.length });

  const active = selected.length > 0;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-ctl border bg-surface px-3 text-left text-sm transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50",
          active ? "border-accent/50 bg-accentSoft/40" : "border-line hover:border-lineStrong"
        )}
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
        <span className={cn("min-w-0 flex-1 truncate", active ? "font-medium text-ink-900" : "text-ink-600")}>{summary}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`${t("filters.clear")} ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
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
        <div data-testid={testId ? `${testId}-popover` : undefined} className="absolute left-0 z-40 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-card border border-line bg-surface p-2 shadow-pop">
          {searchable && (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filters.search")}
              aria-label={t("filters.search")}
              className="mb-2 h-8 w-full rounded-ctl border border-line bg-surface2 px-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus-ring"
            />
          )}
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-ink-400">
            <span>{note ?? `${options.length}`}</span>
            <span className="flex gap-2">
              <button type="button" className="hover:text-ink-700 focus-ring rounded" onClick={() => onChange(visible.map((o) => o.value))}>
                {t("filters.selectAll")}
              </button>
              <button type="button" className="hover:text-ink-700 focus-ring rounded" onClick={() => onChange([])}>
                {t("filters.clear")}
              </button>
            </span>
          </div>
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-64 overflow-y-auto">
            {visible.length === 0 && <li className="px-2 py-3 text-center text-sm text-ink-400">{t("filters.noOptions")}</li>}
            {visible.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <li key={o.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-surface2 focus-ring",
                      checked ? "text-ink-900" : "text-ink-700"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                        checked ? "border-accent bg-accent text-white" : "border-lineStrong bg-surface"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[11px] text-ink-400">{o.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-end border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="rounded-ctl bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700 focus-ring"
            >
              {t("filters.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
