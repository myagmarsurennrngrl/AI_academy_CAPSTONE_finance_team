/** Pure aggregation over SalesRow[]. Every KPI, chart and table derives from
 *  the ONE filtered array produced by lib/filters.ts, so nothing can drift.
 *  No React here - fully unit-testable. */
import type { ComparisonBasis, Filters, SalesRow } from "@/types";
import { addDaysIso, addMonthsIso, applyDateRange, daysBetween, monthEnd } from "@/lib/filters";
import { mean, median, pctChange, safeDiv, spearman } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface Metrics {
  rows: number;
  netSales: number;
  grossSales: number;
  grossProfit: number;
  cogs: number;
  volume: number;
  sellOut: number;
  sellIn: number;
  qty: number;
  returnQty: number;
  discountAmt: number;
  promoAmt: number;
  refundAmt: number;
  stockSum: number;
  stockCount: number;
  posRows: number;
  shipmentRows: number;
}

export const EMPTY_METRICS: Metrics = {
  rows: 0,
  netSales: 0,
  grossSales: 0,
  grossProfit: 0,
  cogs: 0,
  volume: 0,
  sellOut: 0,
  sellIn: 0,
  qty: 0,
  returnQty: 0,
  discountAmt: 0,
  promoAmt: 0,
  refundAmt: 0,
  stockSum: 0,
  stockCount: 0,
  posRows: 0,
  shipmentRows: 0,
};

export function aggregate(rows: SalesRow[]): Metrics {
  const m: Metrics = { ...EMPTY_METRICS };
  for (const r of rows) {
    m.rows++;
    m.netSales += r.netSales;
    m.grossSales += r.grossSales;
    m.grossProfit += r.grossProfit;
    m.cogs += r.cogs;
    m.volume += r.volume;
    m.sellOut += r.sellOut;
    m.sellIn += r.sellIn;
    m.qty += r.qty;
    m.returnQty += r.returnQty;
    m.discountAmt += r.discountAmt;
    m.promoAmt += r.promoAmt;
    m.refundAmt += r.refundAmt;
    if (r.stock !== null) {
      m.stockSum += r.stock;
      m.stockCount++;
    }
    if (r.isShipment) m.shipmentRows++;
    else m.posRows++;
  }
  return m;
}

export const margin = (m: Metrics) => safeDiv(m.grossProfit, m.netSales);
export const avgNetPrice = (m: Metrics) => safeDiv(m.netSales, m.volume);
export const avgStock = (m: Metrics) => safeDiv(m.stockSum, m.stockCount);
export const returnRate = (m: Metrics) => safeDiv(m.returnQty, m.qty);

export type MetricKey = "netSales" | "volume" | "grossProfit";

// ---------------------------------------------------------------------------
// Period & comparison window
// ---------------------------------------------------------------------------

export interface Period {
  from: string;
  to: string;
  days: number;
  months: string[];
  explicit: boolean; // true when the user set a date filter
}

export function resolvePeriod(scopeRows: SalesRow[], filters: Filters, dataMin: string, dataMax: string): Period | null {
  const from = filters.dateFrom ?? dataMin;
  const to = filters.dateTo ?? dataMax;
  if (!from || !to || from > to) return null;
  const monthsSet = new Set<string>();
  for (const r of scopeRows) if (r.date >= from && r.date <= to) monthsSet.add(r.month);
  return { from, to, days: daysBetween(from, to), months: [...monthsSet].sort(), explicit: !!(filters.dateFrom || filters.dateTo) };
}

export interface ComparisonWindow {
  basis: ComparisonBasis;
  from: string;
  to: string;
  rows: SalesRow[];
  /** distinct months with data in the comparison window */
  months: number;
}

const countMonths = (rows: SalesRow[]) => new Set(rows.map((r) => r.month)).size;

const MAX_LY_DAYS = 366;

export function resolveComparison(
  scopeRows: SalesRow[],
  period: Period,
  requested: ComparisonBasis | "auto"
): ComparisonWindow | null {
  const tryLy = (): ComparisonWindow | null => {
    if (period.days > MAX_LY_DAYS) return null;
    const from = addMonthsIso(period.from, -12);
    const to = addMonthsIso(period.to, -12);
    if (to >= period.from) return null; // window would overlap the current period
    const rows = applyDateRange(scopeRows, from, to);
    return rows.length ? { basis: "ly", from, to, rows, months: countMonths(rows) } : null;
  };
  const tryPrior = (): ComparisonWindow | null => {
    const to = addDaysIso(period.from, -1);
    const from = addDaysIso(to, -(period.days - 1));
    const rows = applyDateRange(scopeRows, from, to);
    return rows.length ? { basis: "prior", from, to, rows, months: countMonths(rows) } : null;
  };
  if (requested === "ly") return tryLy();
  if (requested === "prior") return tryPrior();
  return tryLy() ?? tryPrior();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface Delta {
  current: number | null;
  previous: number | null;
  change: number | null; // relative
  pointsChange?: number | null; // for ratios (margin)
}

function delta(current: number | null, previous: number | null, ratio = false): Delta {
  if (current === null || previous === null) return { current, previous, change: null, pointsChange: null };
  return {
    current,
    previous,
    change: ratio ? null : pctChange(current, previous),
    pointsChange: ratio ? current - previous : null,
  };
}

export interface MonthOverMonth {
  month: string;
  prevMonth: string;
  current: Metrics;
  previous: Metrics;
  change: { netSales: number | null; volume: number | null; grossProfit: number | null };
  mtd: boolean; // latest month incomplete -> compared with same day range of previous month
  throughDay: number;
}

export function computeMoM(scopeRows: SalesRow[], period: Period, dataMax: string): MonthOverMonth | null {
  if (!period.months.length) return null;
  const month = period.months[period.months.length - 1];
  const prevMonth = addMonthsIso(`${month}-01`, -1).slice(0, 7);
  const effectiveEnd = period.to < dataMax ? period.to : dataMax;
  const mtd = effectiveEnd < monthEnd(month);
  const throughDay = mtd ? Number(effectiveEnd.slice(8, 10)) : 31;
  const inMonth = (r: SalesRow, m: string) => r.month === m && (!mtd || Number(r.date.slice(8, 10)) <= throughDay);
  const currentRows = scopeRows.filter((r) => inMonth(r, month) && r.date >= period.from && r.date <= period.to);
  const previousRows = scopeRows.filter((r) => inMonth(r, prevMonth));
  if (!previousRows.length) return null;
  const current = aggregate(currentRows);
  const previous = aggregate(previousRows);
  return {
    month,
    prevMonth,
    current,
    previous,
    change: {
      netSales: pctChange(current.netSales, previous.netSales),
      volume: pctChange(current.volume, previous.volume),
      grossProfit: pctChange(current.grossProfit, previous.grossProfit),
    },
    mtd,
    throughDay,
  };
}

export interface KpiSet {
  current: Metrics;
  comparison: ComparisonWindow | null;
  comparisonMetrics: Metrics | null;
  volume: Delta;
  sellOut: Delta;
  sellIn: Delta;
  netSales: Delta;
  grossProfit: Delta;
  margin: Delta;
  avgPrice: Delta;
  mom: MonthOverMonth | null;
}

export function computeKpis(currentRows: SalesRow[], comparison: ComparisonWindow | null, mom: MonthOverMonth | null): KpiSet {
  const current = aggregate(currentRows);
  const cmp = comparison ? aggregate(comparison.rows) : null;
  const d = (k: keyof Metrics) => delta(current[k], cmp ? cmp[k] : null);
  return {
    current,
    comparison,
    comparisonMetrics: cmp,
    volume: d("volume"),
    sellOut: d("sellOut"),
    sellIn: d("sellIn"),
    netSales: d("netSales"),
    grossProfit: d("grossProfit"),
    margin: delta(margin(current), cmp ? margin(cmp) : null, true),
    avgPrice: delta(avgNetPrice(current), cmp ? avgNetPrice(cmp) : null),
    mom,
  };
}

// ---------------------------------------------------------------------------
// Monthly series (current period vs same month last year)
// ---------------------------------------------------------------------------

export interface MonthPoint {
  month: string;
  current: Metrics;
  ly: Metrics | null;
  prev: Metrics | null; // previous calendar month (may be outside the period)
  avgPrice: number | null;
  avgStock: number | null;
}

function groupByMonth(rows: SalesRow[]): Map<string, SalesRow[]> {
  const map = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const list = map.get(r.month);
    if (list) list.push(r);
    else map.set(r.month, [r]);
  }
  return map;
}

export function monthlySeries(currentRows: SalesRow[], scopeRows: SalesRow[]): MonthPoint[] {
  const scopeByMonth = groupByMonth(scopeRows);
  const cache = new Map<string, Metrics>();
  const metricsFor = (month: string): Metrics | null => {
    const rows = scopeByMonth.get(month);
    if (!rows) return null;
    let m = cache.get(month);
    if (!m) {
      m = aggregate(rows);
      cache.set(month, m);
    }
    return m;
  };
  const currentByMonth = groupByMonth(currentRows);
  return [...currentByMonth.keys()].sort().map((month) => {
    const current = aggregate(currentByMonth.get(month)!);
    return {
      month,
      current,
      ly: metricsFor(addMonthsIso(`${month}-01`, -12).slice(0, 7)),
      prev: metricsFor(addMonthsIso(`${month}-01`, -1).slice(0, 7)),
      avgPrice: avgNetPrice(current),
      avgStock: avgStock(current),
    };
  });
}

export function hasLastYearData(points: MonthPoint[]): boolean {
  return points.some((p) => p.ly !== null);
}

// ---------------------------------------------------------------------------
// Group breakdowns (where)
// ---------------------------------------------------------------------------

export type GroupField = "brand" | "product" | "channel" | "channelType" | "salesType";

export interface GroupMetrics {
  key: string;
  current: Metrics;
  comparison: Metrics | null;
}

export function groupBreakdown(currentRows: SalesRow[], comparisonRows: SalesRow[] | null, field: GroupField): GroupMetrics[] {
  const cur = new Map<string, SalesRow[]>();
  for (const r of currentRows) {
    const k = r[field];
    const list = cur.get(k);
    if (list) list.push(r);
    else cur.set(k, [r]);
  }
  const cmp = new Map<string, SalesRow[]>();
  if (comparisonRows) {
    for (const r of comparisonRows) {
      const k = r[field];
      const list = cmp.get(k);
      if (list) list.push(r);
      else cmp.set(k, [r]);
    }
  }
  const keys = new Set([...cur.keys(), ...cmp.keys()]);
  return [...keys].map((key) => ({
    key,
    current: aggregate(cur.get(key) ?? []),
    comparison: comparisonRows ? aggregate(cmp.get(key) ?? []) : null,
  }));
}

export interface RankedGroup {
  key: string;
  value: number;
  previous: number | null;
  share: number | null;
  change: number | null;
  delta: number | null;
  contribution: number | null; // share of total absolute change (signed)
  margin: number | null;
  isOther: boolean;
  members?: number;
}

export function rankGroups(groups: GroupMetrics[], metric: MetricKey, topN = 10, otherLabel = "Other"): RankedGroup[] {
  const total = groups.reduce((s, g) => s + g.current[metric], 0);
  const hasCmp = groups.some((g) => g.comparison !== null);
  const totalPrev = hasCmp ? groups.reduce((s, g) => s + (g.comparison?.[metric] ?? 0), 0) : null;
  const totalDelta = totalPrev === null ? null : total - totalPrev;
  const build = (key: string, cur: Metrics, cmp: Metrics | null, isOther: boolean, members?: number): RankedGroup => {
    const value = cur[metric];
    const previous = cmp ? cmp[metric] : null;
    const d = previous === null ? null : value - previous;
    return {
      key,
      value,
      previous,
      share: safeDiv(value, total),
      change: previous === null ? null : pctChange(value, previous),
      delta: d,
      contribution: d === null || totalDelta === null || totalDelta === 0 ? null : d / Math.abs(totalDelta),
      margin: margin(cur),
      isOther,
      members,
    };
  };
  const sorted = [...groups].sort((a, b) => b.current[metric] - a.current[metric]);
  if (sorted.length <= topN) return sorted.map((g) => build(g.key, g.current, g.comparison, false));
  const head = sorted.slice(0, topN - 1).map((g) => build(g.key, g.current, g.comparison, false));
  const tail = sorted.slice(topN - 1);
  const otherCur = aggregate([]);
  const otherCmp = hasCmp ? aggregate([]) : null;
  for (const g of tail) {
    for (const k of Object.keys(otherCur) as (keyof Metrics)[]) otherCur[k] += g.current[k];
    if (otherCmp && g.comparison) for (const k of Object.keys(otherCmp) as (keyof Metrics)[]) otherCmp[k] += g.comparison[k];
  }
  head.push(build(otherLabel, otherCur, otherCmp, true, tail.length));
  return head;
}

// ---------------------------------------------------------------------------
// Sales type split (sell-out vs sell-in)
// ---------------------------------------------------------------------------

export interface SalesTypeSplit {
  pos: Metrics;
  shipment: Metrics;
  other: Metrics;
  otherLabels: string[];
  monthly: { month: string; sellOut: number; sellIn: number }[];
  hasShipmentQty: boolean;
}

export function salesTypeSplit(rows: SalesRow[]): SalesTypeSplit {
  const pos: SalesRow[] = [];
  const ship: SalesRow[] = [];
  const other: SalesRow[] = [];
  const otherLabels = new Set<string>();
  let hasShipmentQty = false;
  for (const r of rows) {
    if (r.isShipment) {
      ship.push(r);
      if (r.netShipmentQty !== null) hasShipmentQty = true;
    } else if (r.salesType === "POS") pos.push(r);
    else {
      other.push(r);
      otherLabels.add(r.salesType);
    }
  }
  const byMonth = groupByMonth(rows);
  const monthly = [...byMonth.keys()].sort().map((month) => {
    const m = aggregate(byMonth.get(month)!);
    return { month, sellOut: m.sellOut, sellIn: m.sellIn };
  });
  return { pos: aggregate(pos), shipment: aggregate(ship), other: aggregate(other), otherLabels: [...otherLabels], monthly, hasShipmentQty };
}

// ---------------------------------------------------------------------------
// Price vs quantity (product x month)
// ---------------------------------------------------------------------------

export interface PricePoint {
  product: string;
  brand: string;
  month: string;
  price: number;
  volume: number;
  netSales: number;
}

export interface PriceQuantity {
  points: PricePoint[];
  rho: number | null;
  n: number;
  priceChange: number | null; // first month avg price -> last month avg price
  volumeChange: number | null;
}

export function priceQuantity(rows: SalesRow[]): PriceQuantity {
  const map = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const k = `${r.product} ${r.month}`;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  const points: PricePoint[] = [];
  for (const list of map.values()) {
    const m = aggregate(list);
    const price = avgNetPrice(m);
    if (price === null || m.volume <= 0) continue;
    points.push({ product: list[0].product, brand: list[0].brand, month: list[0].month, price, volume: m.volume, netSales: m.netSales });
  }
  // Within-product association (price varies over time for the same product):
  // compute Spearman on price relative to the product's own mean so that
  // product-level price differences do not dominate.
  const byProduct = new Map<string, PricePoint[]>();
  for (const p of points) {
    const list = byProduct.get(p.product);
    if (list) list.push(p);
    else byProduct.set(p.product, [p]);
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const list of byProduct.values()) {
    if (list.length < 2) continue;
    const mp = mean(list.map((p) => p.price)) ?? 1;
    const mv = mean(list.map((p) => p.volume)) ?? 1;
    for (const p of list) {
      xs.push(p.price / mp);
      ys.push(p.volume / mv);
    }
  }
  const months = [...new Set(points.map((p) => p.month))].sort();
  let priceChange: number | null = null;
  let volumeChange: number | null = null;
  if (months.length >= 2) {
    const first = rows.filter((r) => r.month === months[0]);
    const last = rows.filter((r) => r.month === months[months.length - 1]);
    const a = aggregate(first);
    const b = aggregate(last);
    const pa = avgNetPrice(a);
    const pb = avgNetPrice(b);
    priceChange = pa !== null && pb !== null ? pctChange(pb, pa) : null;
    volumeChange = pctChange(b.volume, a.volume);
  }
  return { points, rho: xs.length >= 6 ? spearman(xs, ys) : null, n: xs.length, priceChange, volumeChange };
}

// ---------------------------------------------------------------------------
// Stock vs sales (monthly, indexed)
// ---------------------------------------------------------------------------

export interface StockPoint {
  month: string;
  stock: number | null;
  volume: number;
  stockIdx: number | null;
  volumeIdx: number | null;
}

export interface StockSales {
  available: boolean;
  points: StockPoint[];
  rho: number | null;
  stockChange: number | null;
}

export function stockSales(points: MonthPoint[]): StockSales {
  const available = points.some((p) => p.avgStock !== null);
  if (!available) return { available: false, points: [], rho: null, stockChange: null };
  const baseStock = points.find((p) => p.avgStock !== null)?.avgStock ?? null;
  const baseVol = points[0]?.current.volume || null;
  const out: StockPoint[] = points.map((p) => ({
    month: p.month,
    stock: p.avgStock,
    volume: p.current.volume,
    stockIdx: p.avgStock !== null && baseStock ? (p.avgStock / baseStock) * 100 : null,
    volumeIdx: baseVol ? (p.current.volume / baseVol) * 100 : null,
  }));
  const paired = out.filter((p) => p.stock !== null);
  const rho = paired.length >= 4 ? spearman(paired.map((p) => p.stock as number), paired.map((p) => p.volume)) : null;
  const first = paired[0]?.stock ?? null;
  const last = paired[paired.length - 1]?.stock ?? null;
  return { available, points: out, rho, stockChange: first !== null && last !== null ? pctChange(last, first) : null };
}

// ---------------------------------------------------------------------------
// Discount bands & promotion
// ---------------------------------------------------------------------------

export interface DiscountBand {
  band: string;
  rows: number;
  volume: number;
  netSales: number;
  margin: number | null;
  avgUnits: number | null;
  shareOfRows: number | null;
}

const BANDS: { label: string; min: number; max: number }[] = [
  { label: "0%", min: -Infinity, max: 0.0000001 },
  { label: "0–5%", min: 0.0000001, max: 0.05 },
  { label: "5–10%", min: 0.05, max: 0.1 },
  { label: "10–15%", min: 0.1, max: 0.15 },
  { label: "15%+", min: 0.15, max: Infinity },
];

export function discountBands(rows: SalesRow[]): DiscountBand[] | null {
  if (!rows.some((r) => r.discountPct !== null)) return null;
  const buckets: SalesRow[][] = BANDS.map(() => []);
  for (const r of rows) {
    const d = r.discountPct ?? 0;
    const i = BANDS.findIndex((b) => d > b.min && d <= b.max);
    buckets[i === -1 ? 0 : i].push(r);
  }
  return BANDS.map((b, i) => {
    const m = aggregate(buckets[i]);
    return {
      band: b.label,
      rows: m.rows,
      volume: m.volume,
      netSales: m.netSales,
      margin: margin(m),
      avgUnits: safeDiv(m.volume, m.rows),
      shareOfRows: safeDiv(m.rows, rows.length),
    };
  }).filter((b) => b.rows > 0);
}

export interface PromotionCompare {
  promoted: Metrics;
  nonPromoted: Metrics;
  avgUnits: [number | null, number | null];
  avgPrice: [number | null, number | null];
  margin: [number | null, number | null];
  returnRate: [number | null, number | null];
}

export function promotionComparison(rows: SalesRow[]): PromotionCompare | null {
  if (!rows.some((r) => r.promoAmt > 0)) return null;
  const promoted = aggregate(rows.filter((r) => r.promoAmt > 0));
  const nonPromoted = aggregate(rows.filter((r) => !(r.promoAmt > 0)));
  if (!promoted.rows || !nonPromoted.rows) return null;
  return {
    promoted,
    nonPromoted,
    avgUnits: [safeDiv(promoted.volume, promoted.rows), safeDiv(nonPromoted.volume, nonPromoted.rows)],
    avgPrice: [avgNetPrice(promoted), avgNetPrice(nonPromoted)],
    margin: [margin(promoted), margin(nonPromoted)],
    returnRate: [returnRate(promoted), returnRate(nonPromoted)],
  };
}

// ---------------------------------------------------------------------------
// Returns & inventory
// ---------------------------------------------------------------------------

export interface ReturnRow {
  name: string;
  dimension: "product" | "brand" | "channel";
  rate: number;
  returned: number;
  refund: number;
  qty: number;
}

export function returnRisks(rows: SalesRow[], minQty = 20, topPerDimension = 5): ReturnRow[] {
  if (!rows.some((r) => r.returnQty > 0)) return [];
  const out: ReturnRow[] = [];
  for (const dim of ["product", "brand", "channel"] as const) {
    const groups = groupBreakdown(rows, null, dim);
    const ranked = groups
      .filter((g) => g.current.qty >= minQty)
      .map((g) => ({
        name: g.key,
        dimension: dim,
        rate: safeDiv(g.current.returnQty, g.current.qty) ?? 0,
        returned: g.current.returnQty,
        refund: g.current.refundAmt,
        qty: g.current.qty,
      }))
      .filter((g) => g.returned > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, topPerDimension);
    out.push(...ranked);
  }
  return out;
}

export interface InventoryRow {
  product: string;
  avgStock: number;
  volume: number;
  risk: "low_high" | "high_low";
}

export function inventoryRisks(rows: SalesRow[], top = 8): InventoryRow[] | null {
  if (!rows.some((r) => r.stock !== null)) return null;
  const groups = groupBreakdown(rows, null, "product")
    .map((g) => ({ product: g.key, avgStock: avgStock(g.current), volume: g.current.volume }))
    .filter((g): g is { product: string; avgStock: number; volume: number } => g.avgStock !== null);
  if (groups.length < 2) return [];
  const stockMed = median(groups.map((g) => g.avgStock)) ?? 0;
  const volMed = median(groups.map((g) => g.volume)) ?? 0;
  const lowHigh = groups
    .filter((g) => g.avgStock <= stockMed && g.volume >= volMed)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, top)
    .map((g) => ({ ...g, risk: "low_high" as const }));
  const highLow = groups
    .filter((g) => g.avgStock > stockMed && g.volume < volMed)
    .sort((a, b) => b.avgStock - a.avgStock)
    .slice(0, top)
    .map((g) => ({ ...g, risk: "high_low" as const }));
  return [...lowHigh, ...highLow];
}

// ---------------------------------------------------------------------------
// Annotations for the trend chart
// ---------------------------------------------------------------------------

export interface Annotation {
  month: string;
  kind: "peak" | "low" | "priceUp" | "priceDown" | "stockDown" | "stockUp";
  value: number; // relative change for price/stock, absolute for peak/low
}

export function trendAnnotations(points: MonthPoint[], metric: MetricKey): Annotation[] {
  if (points.length < 2) return [];
  const out: Annotation[] = [];
  let peak = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.current[metric] > peak.current[metric]) peak = p;
    if (p.current[metric] < low.current[metric]) low = p;
  }
  out.push({ month: peak.month, kind: "peak", value: peak.current[metric] });
  if (low.month !== peak.month) out.push({ month: low.month, kind: "low", value: low.current[metric] });
  // largest price step and largest stock drop (only one each, only if material)
  let bestPrice: Annotation | null = null;
  let bestStock: Annotation | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.avgPrice && b.avgPrice) {
      const ch = pctChange(b.avgPrice, a.avgPrice);
      if (ch !== null && Math.abs(ch) >= 0.05 && (!bestPrice || Math.abs(ch) > Math.abs(bestPrice.value)))
        bestPrice = { month: b.month, kind: ch > 0 ? "priceUp" : "priceDown", value: ch };
    }
    if (a.avgStock && b.avgStock) {
      const ch = pctChange(b.avgStock, a.avgStock);
      if (ch !== null && Math.abs(ch) >= 0.15 && (!bestStock || Math.abs(ch) > Math.abs(bestStock.value)))
        bestStock = { month: b.month, kind: ch < 0 ? "stockDown" : "stockUp", value: ch };
    }
  }
  if (bestPrice) out.push(bestPrice);
  if (bestStock && bestStock.kind === "stockDown") out.push(bestStock);
  return out;
}
