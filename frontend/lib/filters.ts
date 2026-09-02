/** The single filter implementation used by every KPI, chart, table and
 *  server request. Mirrors backend/app/services/dataset_service.apply_filters:
 *  exact string match on dimensions, inclusive calendar-day bounds on date. */
import type { DimensionKey, Filters, FilterSpec, SalesRow } from "@/types";

export const EMPTY_FILTERS: Filters = {
  brands: [],
  products: [],
  channels: [],
  channelTypes: [],
  salesTypes: [],
  dateFrom: null,
  dateTo: null,
};

export const DIMENSION_KEYS: DimensionKey[] = ["brands", "products", "channels", "channelTypes", "salesTypes"];

const ROW_FIELD: Record<DimensionKey, keyof SalesRow> = {
  brands: "brand",
  products: "product",
  channels: "channel",
  channelTypes: "channelType",
  salesTypes: "salesType",
};

export function isFiltersEmpty(f: Filters): boolean {
  return DIMENSION_KEYS.every((k) => f[k].length === 0) && !f.dateFrom && !f.dateTo;
}

export function countActiveFilters(f: Filters): number {
  return DIMENSION_KEYS.filter((k) => f[k].length > 0).length + (f.dateFrom || f.dateTo ? 1 : 0);
}

/** Dimension filters only (no date) - used to build the comparison window. */
export function applyDimensionFilters(rows: SalesRow[], f: Filters): SalesRow[] {
  const active = DIMENSION_KEYS.filter((k) => f[k].length > 0).map((k) => ({
    field: ROW_FIELD[k],
    set: new Set(f[k]),
  }));
  if (active.length === 0) return rows;
  return rows.filter((r) => active.every(({ field, set }) => set.has(String(r[field]))));
}

export function applyDateRange(rows: SalesRow[], from: string | null, to: string | null): SalesRow[] {
  if (!from && !to) return rows;
  return rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
}

export function applyFilters(rows: SalesRow[], f: Filters): SalesRow[] {
  return applyDateRange(applyDimensionFilters(rows, f), f.dateFrom, f.dateTo);
}

export function toFilterSpec(f: Filters): FilterSpec {
  return {
    brands: f.brands,
    products: f.products,
    channels: f.channels,
    channel_types: f.channelTypes,
    sales_types: f.salesTypes,
    date_from: f.dateFrom,
    date_to: f.dateTo,
  };
}

/** Stable key for memoization / request de-duplication. */
export function filterKey(f: Filters): string {
  return JSON.stringify([
    [...f.brands].sort(),
    [...f.products].sort(),
    [...f.channels].sort(),
    [...f.channelTypes].sort(),
    [...f.salesTypes].sort(),
    f.dateFrom,
    f.dateTo,
  ]);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type FilterAction =
  | { type: "setDimension"; key: DimensionKey; values: string[] }
  | { type: "toggleValue"; key: DimensionKey; value: string }
  | { type: "clearDimension"; key: DimensionKey }
  | { type: "setDateRange"; from: string | null; to: string | null }
  | { type: "reset" };

export function filtersReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case "setDimension":
      return { ...state, [action.key]: action.values };
    case "toggleValue": {
      const current = state[action.key];
      const next = current.includes(action.value)
        ? current.filter((v) => v !== action.value)
        : [...current, action.value];
      return { ...state, [action.key]: next };
    }
    case "clearDimension":
      return { ...state, [action.key]: [] };
    case "setDateRange":
      return { ...state, dateFrom: action.from, dateTo: action.to };
    case "reset":
      return EMPTY_FILTERS;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Date helpers (calendar math on ISO strings, UTC-safe)
// ---------------------------------------------------------------------------

export function isoToUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function utcToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(iso: string, months: number): string {
  const d = isoToUtc(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return utcToIso(d);
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToIso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((isoToUtc(to).getTime() - isoToUtc(from).getTime()) / 86_400_000) + 1;
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export type DatePreset = "all" | "l3m" | "l6m" | "l12m" | "ytd" | "lastMonth";

/** Preset windows are anchored on the dataset's latest date, not today. */
export function presetRange(preset: DatePreset, dataMin: string, dataMax: string): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const maxMonth = dataMax.slice(0, 7);
  if (preset === "lastMonth") return { from: monthStart(maxMonth), to: monthEnd(maxMonth) };
  if (preset === "ytd") return { from: `${dataMax.slice(0, 4)}-01-01`, to: dataMax };
  const months = preset === "l3m" ? 3 : preset === "l6m" ? 6 : 12;
  const from = monthStart(addMonthsIso(monthStart(maxMonth), -(months - 1)).slice(0, 7));
  return { from: from < dataMin ? dataMin : from, to: dataMax };
}
