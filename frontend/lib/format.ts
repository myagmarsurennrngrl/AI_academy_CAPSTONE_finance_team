/** Presentation-layer number formatting - mirrors backend/app/utils/formatting.py.
 * Only used for display; all analytical numbers arrive already computed from the API. */

/** Mongolian magnitude words, matching how MNT amounts are normally read aloud
 * (тэрбум = billion, сая = million, мянга = thousand). */
export function formatCurrencyMnt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "₮0";
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1_000_000_000) return `${sign}₮${(v / 1_000_000_000).toFixed(2)} тэрбум`;
  if (v >= 1_000_000) return `${sign}₮${(v / 1_000_000).toFixed(1)} сая`;
  if (v >= 1_000) return `${sign}₮${(v / 1_000).toFixed(1)} мянга`;
  return `${sign}₮${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatCurrencyFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "₮0";
  return `₮${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Auto-adjusts precision when `decimals` isn't explicitly passed: sub-1%
 * values (common for return rates, discount deltas) get 2 decimals so they
 * don't all round to the same displayed figure; everything else gets 1. */
export function formatPercent(value: number | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0%";
  const pct = value * 100;
  const d = decimals ?? (Math.abs(pct) > 0 && Math.abs(pct) < 1 ? 2 : 1);
  return `${pct.toFixed(d)}%`;
}

export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0 units";
  return `${Math.round(value).toLocaleString("en-US")} units`;
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateRange(min?: string | null, max?: string | null): string {
  if (!min || !max) return "—";
  return `${min} → ${max}`;
}
