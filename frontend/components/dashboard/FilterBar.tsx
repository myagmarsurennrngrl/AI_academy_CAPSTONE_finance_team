import { Filter } from "lucide-react";
import type { GroupAnalysisRow } from "@/types";

export const ALL_VALUE = "ALL";

function uniqueGroups(rows: GroupAnalysisRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b));
}

interface FilterBarProps {
  brands: GroupAnalysisRow[];
  products: GroupAnalysisRow[];
  channels: GroupAnalysisRow[];
  brand: string;
  product: string;
  channel: string;
  onBrandChange: (v: string) => void;
  onProductChange: (v: string) => void;
  onChannelChange: (v: string) => void;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-1 min-w-[160px] flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-200 bg-white/80 px-3 py-2 text-sm text-ink-800 outline-none transition-colors focus:border-accent-400"
      >
        <option value={ALL_VALUE}>Бүгд</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({
  brands,
  products,
  channels,
  brand,
  product,
  channel,
  onBrandChange,
  onProductChange,
  onChannelChange,
}: FilterBarProps) {
  return (
    <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="flex items-center gap-1.5 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:pb-2.5">
        <Filter className="h-3.5 w-3.5" />
        Шүүлтүүр
      </div>
      <div className="flex flex-1 flex-col gap-3 sm:flex-row">
        <FilterSelect label="Брэнд" value={brand} options={uniqueGroups(brands)} onChange={onBrandChange} />
        <FilterSelect
          label="Бүтээгдэхүүн / SKU"
          value={product}
          options={uniqueGroups(products)}
          onChange={onProductChange}
        />
        <FilterSelect label="Суваг" value={channel} options={uniqueGroups(channels)} onChange={onChannelChange} />
      </div>
    </div>
  );
}
