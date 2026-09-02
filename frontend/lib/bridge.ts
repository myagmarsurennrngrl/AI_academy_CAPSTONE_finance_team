/** Sales variance bridge: explains the change in net sales between the current
 *  period and its comparison window (last year / prior period) by
 *
 *   (a) effect  - volume · price · mix · new items · discontinued items ·
 *                 discount · promotion · returns (· residual)
 *   (b) origin  - which channels / brands / products / channel types gained
 *                 or lost, with amount, % change, contribution to growth in
 *                 percentage points of the base, and share of the total delta.
 *
 *  Method (price-volume-mix on gross sales, then commercial deductions):
 *    for every product present in both periods with quantity > 0
 *      volume_i = (q1 - q0) x p0           price_i = (p1 - p0) x q1
 *    volume    = sum(volume_i) split into pure volume (total quantity change at
 *                the base average price) and mix (the remainder: the shift of
 *                quantity between cheaper and dearer products)
 *    new items = gross sales of products only sold in the current period
 *    lost items= - gross sales of products only sold in the comparison period
 *    discount / promotion / returns = -(deduction_1 - deduction_0)
 *    residual  = anything the file's own net_sales column does not reconcile
 *  All figures come from the same filtered rows every chart uses. */
import type { Locale, SalesRow } from "@/types";
import { formatCompact, formatMonthShort, formatPct, formatSignedPct } from "@/lib/format";
import { translate } from "@/lib/i18n";

export type BridgeEffectKey = "volume" | "price" | "mix" | "newItems" | "lostItems" | "discount" | "promotion" | "returns" | "residual";

export interface BridgeStep {
  key: BridgeEffectKey;
  amount: number;
  /** amount / base net sales */
  pctOfBase: number | null;
  /** amount / |total delta| (signed) */
  shareOfDelta: number | null;
}

export interface BridgeGroupRow {
  key: string;
  previous: number;
  current: number;
  delta: number;
  change: number | null;
  /** delta / base total, i.e. growth contribution in points of the base */
  contributionPts: number | null;
  /** delta / |total delta| (signed) */
  shareOfDelta: number | null;
  isNew: boolean;
  isLost: boolean;
}

export type BridgeDimension = "channel" | "brand" | "product" | "channelType";

export interface SalesBridge {
  base: number;
  current: number;
  delta: number;
  change: number | null;
  steps: BridgeStep[];
  groups: Record<BridgeDimension, BridgeGroupRow[]>;
  matchedItems: number;
  newItems: number;
  lostItems: number;
}

const EPS = 1e-9;
const safeDiv = (a: number, b: number): number | null => (Math.abs(b) < EPS ? null : a / b);

interface ItemAgg {
  q: number;
  gross: number;
}

function aggregateItems(rows: SalesRow[]): Map<string, ItemAgg> {
  const m = new Map<string, ItemAgg>();
  for (const r of rows) {
    const a = m.get(r.product);
    if (a) {
      a.q += r.qty;
      a.gross += r.grossSales;
    } else m.set(r.product, { q: r.qty, gross: r.grossSales });
  }
  return m;
}

function sum(rows: SalesRow[], pick: (r: SalesRow) => number): number {
  let s = 0;
  for (const r of rows) s += pick(r);
  return s;
}

export function computeSalesBridge(currentRows: SalesRow[], comparisonRows: SalesRow[]): SalesBridge {
  const base = sum(comparisonRows, (r) => r.netSales);
  const current = sum(currentRows, (r) => r.netSales);
  const delta = current - base;

  // --- price / volume / mix on gross sales, per product -------------------
  const items0 = aggregateItems(comparisonRows);
  const items1 = aggregateItems(currentRows);
  let volumeRaw = 0;
  let price = 0;
  let newItems = 0;
  let lostItems = 0;
  let q0m = 0;
  let q1m = 0;
  let g0m = 0;
  let matched = 0;
  let newCount = 0;
  let lostCount = 0;
  const keys = new Set<string>([...items0.keys(), ...items1.keys()]);
  for (const k of keys) {
    const a0 = items0.get(k);
    const a1 = items1.get(k);
    const g0 = a0?.gross ?? 0;
    const g1 = a1?.gross ?? 0;
    if (!a0 || Math.abs(g0) < EPS) {
      if (Math.abs(g1) >= EPS) {
        newItems += g1;
        newCount++;
      }
      continue;
    }
    if (!a1 || Math.abs(g1) < EPS) {
      lostItems -= g0;
      lostCount++;
      continue;
    }
    matched++;
    if (a0.q > EPS && a1.q > EPS) {
      const p0 = g0 / a0.q;
      const p1 = g1 / a1.q;
      volumeRaw += (a1.q - a0.q) * p0;
      price += (p1 - p0) * a1.q;
      q0m += a0.q;
      q1m += a1.q;
      g0m += g0;
    } else {
      // value moved without a usable quantity: treat as a price/value effect
      price += g1 - g0;
    }
  }
  const avgP0 = q0m > EPS ? g0m / q0m : 0;
  const pureVolume = (q1m - q0m) * avgP0;
  const mix = volumeRaw - pureVolume;

  // --- commercial deductions ---------------------------------------------
  const discount = -(sum(currentRows, (r) => r.discountAmt) - sum(comparisonRows, (r) => r.discountAmt));
  const promotion = -(sum(currentRows, (r) => r.promoAmt) - sum(comparisonRows, (r) => r.promoAmt));
  const returns = -(sum(currentRows, (r) => r.refundAmt) - sum(comparisonRows, (r) => r.refundAmt));

  const explained = pureVolume + price + mix + newItems + lostItems + discount + promotion + returns;
  const residual = delta - explained;

  const mk = (key: BridgeEffectKey, amount: number): BridgeStep => ({
    key,
    amount,
    pctOfBase: safeDiv(amount, Math.abs(base)),
    shareOfDelta: safeDiv(amount, Math.abs(delta)),
  });
  const steps: BridgeStep[] = [mk("volume", pureVolume), mk("price", price), mk("mix", mix)];
  if (Math.abs(newItems) >= EPS) steps.push(mk("newItems", newItems));
  if (Math.abs(lostItems) >= EPS) steps.push(mk("lostItems", lostItems));
  steps.push(mk("discount", discount), mk("promotion", promotion), mk("returns", returns));
  // keep the bridge honest: show the unexplained part only when it matters
  const tolerance = Math.max(Math.abs(delta) * 0.005, Math.abs(base) * 0.0005, 1);
  if (Math.abs(residual) > tolerance) steps.push(mk("residual", residual));

  const groups: Record<BridgeDimension, BridgeGroupRow[]> = {
    channel: groupBridge(currentRows, comparisonRows, "channel", base, delta),
    brand: groupBridge(currentRows, comparisonRows, "brand", base, delta),
    product: groupBridge(currentRows, comparisonRows, "product", base, delta),
    channelType: groupBridge(currentRows, comparisonRows, "channelType", base, delta),
  };

  return { base, current, delta, change: safeDiv(delta, Math.abs(base)), steps, groups, matchedItems: matched, newItems: newCount, lostItems: lostCount };
}

function groupBridge(currentRows: SalesRow[], comparisonRows: SalesRow[], field: BridgeDimension, base: number, totalDelta: number): BridgeGroupRow[] {
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const r of currentRows) cur.set(r[field], (cur.get(r[field]) ?? 0) + r.netSales);
  for (const r of comparisonRows) prev.set(r[field], (prev.get(r[field]) ?? 0) + r.netSales);
  const keys = new Set<string>([...cur.keys(), ...prev.keys()]);
  const rows: BridgeGroupRow[] = [];
  for (const k of keys) {
    const c = cur.get(k) ?? 0;
    const p = prev.get(k) ?? 0;
    const d = c - p;
    rows.push({
      key: k,
      previous: p,
      current: c,
      delta: d,
      change: safeDiv(d, Math.abs(p)),
      contributionPts: safeDiv(d, Math.abs(base)),
      shareOfDelta: safeDiv(d, Math.abs(totalDelta)),
      isNew: !prev.has(k) || Math.abs(p) < EPS,
      isLost: !cur.has(k) || Math.abs(c) < EPS,
    });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return rows;
}

// ---------------------------------------------------------------------------
// Labels + narrative
// ---------------------------------------------------------------------------

/** "2025" for a calendar year, "Jan '25" for one month, "Jan – Jun '25" otherwise. */
export function periodShortLabel(from: string, to: string, locale: Locale): string {
  const fm = from.slice(0, 7);
  const tm = to.slice(0, 7);
  if (fm.slice(5) === "01" && tm.slice(5) === "12" && fm.slice(0, 4) === tm.slice(0, 4)) return fm.slice(0, 4);
  if (fm === tm) return formatMonthShort(fm, locale);
  return `${formatMonthShort(fm, locale)} – ${formatMonthShort(tm, locale)}`;
}

export function effectLabel(locale: Locale, key: BridgeEffectKey): string {
  return translate(locale, `bridge.effect.${key}` as "bridge.effect.volume");
}

const money = (v: number, locale: Locale) => `₮${formatCompact(Math.abs(v), locale)}`;
const signedMoney = (v: number, locale: Locale) => `${v < 0 ? "−" : "+"}${money(v, locale)}`;

export interface BridgeNarrative {
  headline: string;
  effects: string[];
  origins: string[];
}

/** Sentences the panel (and the executive summary) show. Every number is read
 *  from the bridge; nothing is recomputed here. */
export function bridgeNarrative(locale: Locale, bridge: SalesBridge, currentLabel: string, baseLabel: string): BridgeNarrative {
  const mn = locale === "mn";
  const dir = bridge.delta >= 0 ? (mn ? "өссөн" : "up") : mn ? "буурсан" : "down";
  const headline = mn
    ? `${currentLabel} цэвэр борлуулалт ₮${formatCompact(bridge.current, locale)}: ${baseLabel} (₮${formatCompact(bridge.base, locale)})-тай харьцуулахад ${signedMoney(bridge.delta, locale)} (${bridge.change === null ? "—" : formatSignedPct(bridge.change)}) ${dir}.`
    : `${currentLabel} net sales ₮${formatCompact(bridge.current, locale)}: ${signedMoney(bridge.delta, locale)} (${bridge.change === null ? "—" : formatSignedPct(bridge.change)}) ${dir} on ${baseLabel} (₮${formatCompact(bridge.base, locale)}).`;

  const effects = [...bridge.steps]
    .filter((s) => Math.abs(s.amount) >= Math.max(1, Math.abs(bridge.base) * 0.001))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5)
    .map((s) => {
      const share = s.shareOfDelta === null ? "" : mn ? `өөрчлөлтийн ${formatPct(Math.abs(s.shareOfDelta), 0)}` : `${formatPct(Math.abs(s.shareOfDelta), 0)} of the change`;
      const ofBase = s.pctOfBase === null ? "" : mn ? `суурийн ${formatSignedPct(s.pctOfBase)}` : `${formatSignedPct(s.pctOfBase)} of base`;
      return `${effectLabel(locale, s.key)}: ${signedMoney(s.amount, locale)}${share || ofBase ? ` (${[share, ofBase].filter(Boolean).join(", ")})` : ""}`;
    });

  const origins: string[] = [];
  const describe = (dimKey: BridgeDimension, rows: BridgeGroupRow[]) => {
    if (!rows.length) return;
    const label = translate(locale, `bridge.dim.${dimKey}` as "bridge.dim.channel");
    const up = rows.filter((r) => r.delta > 0).slice(0, 3);
    const down = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
    const fmtRow = (r: BridgeGroupRow) =>
      `${r.key} ${signedMoney(r.delta, locale)}${r.shareOfDelta !== null ? ` (${mn ? "өөрчлөлтийн" : ""} ${formatPct(Math.abs(r.shareOfDelta), 0)}${mn ? "" : " of the change"}${r.change !== null && !r.isNew ? `, ${formatSignedPct(r.change)}` : r.isNew ? (mn ? ", шинэ" : ", new") : ""})` : ""}`;
    const parts: string[] = [];
    if (up.length) parts.push((mn ? "өсгөсөн: " : "gained: ") + up.map(fmtRow).join("; "));
    if (down.length) parts.push((mn ? "бууруулсан: " : "lost: ") + down.map(fmtRow).join("; "));
    origins.push(`${label} — ${parts.join(mn ? ". " : ". ")}`);
  };
  describe("channel", bridge.groups.channel);
  describe("brand", bridge.groups.brand);
  describe("product", bridge.groups.product);

  return { headline, effects, origins };
}
