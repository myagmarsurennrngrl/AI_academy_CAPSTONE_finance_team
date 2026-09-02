import * as React from "react";

export function SectionHeader({ index, title, subtitle, right }: { index: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[11px] font-semibold tnum text-ink-500">{index}</span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
