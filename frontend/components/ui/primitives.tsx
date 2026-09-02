"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accentHover border border-transparent shadow-card",
  secondary: "bg-surface text-ink-700 border border-line hover:bg-surface2 hover:border-lineStrong",
  subtle: "bg-surface2 text-ink-700 border border-transparent hover:bg-line/70",
  ghost: "bg-transparent text-ink-500 border border-transparent hover:bg-surface2 hover:text-ink-700",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-ctl",
  md: "h-10 px-4 text-sm gap-2 rounded-ctl",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 focus-ring disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button ref={ref} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin text-current", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Surface (card) - used only where it improves hierarchy
// ---------------------------------------------------------------------------

export function Surface({
  className,
  as: Tag = "div",
  padded = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: "div" | "section" | "article"; padded?: boolean }) {
  return <Tag className={cn("rounded-card border border-line bg-surface shadow-card", padded && "p-5", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "accent";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface2 text-ink-600 border-line",
  positive: "bg-positiveSoft text-positive border-positive/20",
  negative: "bg-negativeSoft text-negative border-negative/20",
  warning: "bg-warningSoft text-warning border-warning/25",
  accent: "bg-accentSoft text-accent border-accent/20",
};

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[11px] font-medium leading-4", BADGE_TONE[tone], className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Segmented control (radiogroup)
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
  className?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.value === value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(enabled[(idx + 1) % enabled.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(enabled[(idx - 1 + enabled.length) % enabled.length].value);
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center rounded-ctl border border-line bg-surface2 p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[6px] font-medium transition-colors focus-ring disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-surface text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-700"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info tooltip
// ---------------------------------------------------------------------------

export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="info"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-300 text-[10px] font-semibold leading-none text-ink-400 hover:border-ink-400 hover:text-ink-600 focus-ring"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-ctl bg-ink-900 px-3 py-2 text-xs font-normal leading-relaxed text-onInk shadow-pop"
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / states
// ---------------------------------------------------------------------------

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-ctl bg-line/60", className)} style={style} aria-hidden="true" />;
}

export function StateBox({
  title,
  body,
  action,
  tone = "neutral",
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "negative" | "warning";
  className?: string;
}) {
  return (
    <div
      role={tone === "negative" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-6 py-10 text-center",
        tone === "negative" ? "border-negative/30 bg-negativeSoft/40" : tone === "warning" ? "border-warning/30 bg-warningSoft/40" : "border-line bg-surface2/60",
        className
      )}
    >
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {body && <p className="max-w-md text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({ className, dense, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { dense?: boolean }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", dense && "text-[13px]", className)} {...props} />
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-surface2/70", className)} {...props} />;
}
export function TH({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-lineStrong px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  );
}
export function TD({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("px-3 py-2 text-ink-700", numeric && "tnum text-right", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Tabs (simple, accessible)
// ---------------------------------------------------------------------------

export function TabList<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-ring",
              active ? "border-accent text-ink-900" : "border-transparent text-ink-500 hover:text-ink-700"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
