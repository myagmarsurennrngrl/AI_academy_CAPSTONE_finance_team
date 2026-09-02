/** Data-driven headlines: every chart title states the finding the data
 *  supports (Storytelling with Data), in the active language. All numbers
 *  come from lib/analytics; nothing here computes new facts. */
import type { ComparisonBasis, DriverEvidence, Locale } from "@/types";
import type {
  Delta,
  DiscountBand,
  KpiSet,
  MetricKey,
  MonthOverMonth,
  MonthPoint,
  PriceQuantity,
  RankedGroup,
  SalesTypeSplit,
  StockSales,
} from "@/lib/analytics";
import { formatCompact, formatMonth, formatPct, formatSignedPct } from "@/lib/format";
import { driverLabel, translate } from "@/lib/i18n";

const metricLabel = (locale: Locale, metric: MetricKey): string =>
  metric === "netSales"
    ? translate(locale, "kpi.revenue")
    : metric === "volume"
    ? translate(locale, "kpi.volume")
    : translate(locale, "kpi.grossProfit");

const absPct = (v: number) => formatPct(Math.abs(v), 1);

/** Mongolian genitive ("of revenue") / English lowercase noun phrase. */
const metricGenitive = (locale: Locale, metric: MetricKey): string =>
  locale === "mn"
    ? metric === "netSales"
      ? "цэвэр борлуулалтын"
      : metric === "volume"
      ? "борлуулалтын тоо хэмжээний"
      : "нийт ашгийн"
    : metricLabel(locale, metric).toLowerCase();

function joinNames(locale: Locale, names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  const head = names.slice(0, -1).join(", ");
  return locale === "mn" ? `${head} ба ${names[names.length - 1]}` : `${head} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Level 2 - when
// ---------------------------------------------------------------------------

export function trendHeadline(
  locale: Locale,
  metric: MetricKey,
  delta: Delta,
  basis: ComparisonBasis | null,
  mom: MonthOverMonth | null,
  points: MonthPoint[]
): string {
  const label = metricLabel(locale, metric);
  const peak = points.reduce<MonthPoint | null>((p, c) => (!p || c.current[metric] > p.current[metric] ? c : p), null);
  const peakText = peak ? formatMonth(peak.month, locale) : null;

  if (delta.change !== null && basis) {
    const down = delta.change < 0;
    const pct = absPct(delta.change);
    if (locale === "mn") {
      const ref = basis === "ly" ? "өнгөрсөн жилийн ижил үеэс" : "өмнөх үеэс";
      const dir = Math.abs(delta.change) < 0.005 ? "өөрчлөлтгүй" : down ? `${pct}-иар буурсан` : `${pct}-иар өссөн`;
      return peakText ? `${label} ${ref} ${dir}; оргил нь ${peakText}` : `${label} ${ref} ${dir}`;
    }
    const ref = basis === "ly" ? "the same period last year" : "the prior period";
    const dir = Math.abs(delta.change) < 0.005 ? "flat versus" : down ? `${pct} below` : `${pct} above`;
    return peakText ? `${label} is ${dir} ${ref}; peak in ${peakText}` : `${label} is ${dir} ${ref}`;
  }
  const momChange = mom ? mom.change[metric] : null;
  if (mom && momChange !== null) {
    const pct = absPct(momChange);
    const m = formatMonth(mom.month, locale);
    if (locale === "mn") {
      const dir = Math.abs(momChange) < 0.005 ? "өмнөх сартай ижил" : momChange < 0 ? `өмнөх сараас ${pct}-иар буурсан` : `өмнөх сараас ${pct}-иар өссөн`;
      return `${label} ${m}д${mom.mtd ? " (сарын эхнээс)" : ""} ${dir}`;
    }
    const dir = Math.abs(momChange) < 0.005 ? "was flat" : momChange < 0 ? `fell ${pct}` : `rose ${pct}`;
    return `${label} ${dir} in ${m}${mom.mtd ? " (month to date)" : ""} vs the previous month`;
  }
  if (peakText) {
    const low = points.reduce<MonthPoint | null>((p, c) => (!p || c.current[metric] < p.current[metric] ? c : p), null);
    const lowText = low && low.month !== peak?.month ? formatMonth(low.month, locale) : null;
    if (locale === "mn") return lowText ? `${label}: оргил ${peakText}, хамгийн бага ${lowText}` : `${label}: оргил ${peakText}`;
    return lowText ? `${label} peaked in ${peakText} and was lowest in ${lowText}` : `${label} peaked in ${peakText}`;
  }
  return label;
}

export function varianceHeadline(locale: Locale, metric: MetricKey, points: MonthPoint[], hasLY: boolean): string {
  const label = metricLabel(locale, metric);
  const changes = points
    .map((p) => {
      const ref = hasLY ? p.ly : p.prev;
      return ref && ref[metric] ? { month: p.month, change: (p.current[metric] - ref[metric]) / Math.abs(ref[metric]) } : null;
    })
    .filter((x): x is { month: string; change: number } => x !== null);
  if (!changes.length) return hasLY ? translate(locale, "when.variance.ly") : translate(locale, "when.variance.mom");
  const neg = changes.filter((c) => c.change < 0).length;
  const worst = changes.reduce((a, b) => (b.change < a.change ? b : a));
  const best = changes.reduce((a, b) => (b.change > a.change ? b : a));
  if (locale === "mn") {
    const ref = hasLY ? "өнгөрсөн жилээс" : "өмнөх сараас";
    if (neg === changes.length) return `${label} бүх ${changes.length} сард ${ref} буурсан; хамгийн их ${formatMonth(worst.month, locale)} (${formatSignedPct(worst.change)})`;
    if (neg === 0) return `${label} бүх ${changes.length} сард ${ref} өссөн; хамгийн их ${formatMonth(best.month, locale)} (${formatSignedPct(best.change)})`;
    return `${changes.length} сарын ${neg} нь ${ref} буурсан; хамгийн их бууралт ${formatMonth(worst.month, locale)} (${formatSignedPct(worst.change)})`;
  }
  const ref = hasLY ? "last year" : "the previous month";
  if (neg === changes.length) return `${label} was below ${ref} in all ${changes.length} months; worst ${formatMonth(worst.month, locale)} (${formatSignedPct(worst.change)})`;
  if (neg === 0) return `${label} was above ${ref} in all ${changes.length} months; best ${formatMonth(best.month, locale)} (${formatSignedPct(best.change)})`;
  return `${neg} of ${changes.length} months were below ${ref}; largest drop ${formatMonth(worst.month, locale)} (${formatSignedPct(worst.change)})`;
}

// ---------------------------------------------------------------------------
// Level 3 - where
// ---------------------------------------------------------------------------

export function whereHeadline(locale: Locale, ranked: RankedGroup[], metric: MetricKey, dimensionLabel: string): string {
  const real = ranked.filter((r) => !r.isOther);
  if (!real.length) return dimensionLabel;
  const label = metricLabel(locale, metric);
  const hasCmp = ranked.some((r) => r.contribution !== null);
  const totalDelta = hasCmp ? ranked.reduce((s, r) => s + (r.delta ?? 0), 0) : 0;

  if (hasCmp && Math.abs(totalDelta) > 0) {
    const declining = totalDelta < 0;
    const movers = real
      .filter((r) => (r.delta ?? 0) !== 0 && (declining ? (r.delta ?? 0) < 0 : (r.delta ?? 0) > 0))
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
    let cum = 0;
    const picked: RankedGroup[] = [];
    for (const m of movers) {
      picked.push(m);
      cum += Math.abs(m.contribution ?? 0);
      if (cum >= 0.7 || picked.length >= 3) break;
    }
    if (picked.length) {
      const names = joinNames(locale, picked.map((p) => p.key));
      const share = formatPct(Math.min(cum, 1.5), 0);
      if (locale === "mn") return declining ? `${names} нийт бууралтын ${share}-ийг бүрдүүлж байна` : `${names} нийт өсөлтийн ${share}-ийг бүрдүүлж байна`;
      const verb = picked.length > 1 ? "explain" : "explains";
      return declining ? `${names} ${verb} ${share} of the decline` : `${names} ${verb} ${share} of the growth`;
    }
  }
  const top = real[0];
  const top2 = real.slice(0, 2).reduce((s, r) => s + (r.share ?? 0), 0);
  const topShare = formatPct(top.share, 0);
  if (locale === "mn") {
    const base = `${top.key} ${metricGenitive(locale, metric)} ${topShare}-ийг эзэлж байна`;
    return real.length > 2 && top2 >= 0.6 ? `${base}; эхний хоёр нь ${formatPct(top2, 0)}` : base;
  }
  const base = `${top.key} accounts for ${topShare} of ${metricGenitive(locale, metric)}`;
  return real.length > 2 && top2 >= 0.6 ? `${base}; the top two reach ${formatPct(top2, 0)}` : base;
}

export function salesTypeHeadline(locale: Locale, split: SalesTypeSplit): string {
  const so = split.pos.sellOut;
  const si = split.shipment.sellIn;
  if (so > 0 && si > 0) {
    const diff = (si - so) / so;
    const pct = absPct(diff);
    if (locale === "mn")
      return `Sell-out ${formatCompact(so, locale)} ш, цэвэр ачилт ${formatCompact(si, locale)} ш — ачилт sell-out-аас ${pct}-иар ${diff >= 0 ? "их" : "бага"}`;
    return `Sell-out ${formatCompact(so, locale)} units vs net shipment ${formatCompact(si, locale)} units — shipments ${pct} ${diff >= 0 ? "above" : "below"} sell-out`;
  }
  if (so > 0) return locale === "mn" ? "Энэ сонголтод зөвхөн sell-out (POS) борлуулалт байна" : "Only sell-out (POS) sales in this selection";
  if (si > 0) return locale === "mn" ? "Энэ сонголтод зөвхөн ачилт (sell-in) байна" : "Only shipments (sell-in) in this selection";
  return translate(locale, "where.salesType.title");
}

// ---------------------------------------------------------------------------
// Level 4 - why
// ---------------------------------------------------------------------------

export function driversHeadline(locale: Locale, ranking: DriverEvidence[]): string {
  const top = ranking.filter((d) => d.importance_score > 0).slice(0, 2);
  if (!top.length) return translate(locale, "why.drivers.title");
  const names = joinNames(locale, top.map((d) => driverLabel(locale, d.driver)));
  return locale === "mn"
    ? `${names} борлуулалтын тоо хэмжээтэй хамгийн их хамааралтай`
    : `${names} show the strongest association with sales quantity`;
}

export function priceQuantityHeadline(locale: Locale, pq: PriceQuantity): string {
  const rhoText = pq.rho === null ? "" : ` (ρ = ${pq.rho.toFixed(2)})`;
  let head: string;
  if (pq.rho === null) head = locale === "mn" ? "Үнэ ба тоо хэмжээ" : "Price vs quantity";
  else if (pq.rho <= -0.3) head = locale === "mn" ? `Үнэ өндөр байсан сард тоо хэмжээ бага байх хамаарал ажиглагдаж байна${rhoText}` : `Months with higher prices tend to show lower quantities${rhoText}`;
  else if (pq.rho >= 0.3) head = locale === "mn" ? `Үнэ ба тоо хэмжээ хамт хөдөлж байна${rhoText}` : `Price and quantity move together${rhoText}`;
  else head = locale === "mn" ? `Үнэ ба тоо хэмжээний хооронд тодорхой хамаарал ажиглагдсангүй${rhoText}` : `No clear relationship between price and quantity${rhoText}`;
  if (pq.priceChange !== null && Math.abs(pq.priceChange) >= 0.05) {
    head += locale === "mn" ? ` — дундаж үнэ ${formatSignedPct(pq.priceChange)}` : ` — average price ${formatSignedPct(pq.priceChange)}`;
  }
  return head;
}

export function stockHeadline(locale: Locale, stock: StockSales): string {
  if (!stock.available) return translate(locale, "why.stock.unavailable");
  const rhoText = stock.rho === null ? "" : ` (ρ = ${stock.rho.toFixed(2)})`;
  if (stock.rho !== null && stock.rho >= 0.3)
    return locale === "mn" ? `Нөөц багассан сард борлуулалт ч бага байна${rhoText}` : `Months with lower stock also show lower sales${rhoText}`;
  if (stock.rho !== null && stock.rho <= -0.3)
    return locale === "mn" ? `Нөөц их сард борлуулалт бага — удаан хөдлөх нөөцийн шинж${rhoText}` : `Higher stock coincides with lower sales — a slow-moving pattern${rhoText}`;
  return locale === "mn" ? `Нөөц ба борлуулалтын хооронд тодорхой хамаарал ажиглагдсангүй${rhoText}` : `No clear relationship between stock and sales${rhoText}`;
}

export function discountHeadline(locale: Locale, bands: DiscountBand[] | null): string {
  if (!bands || bands.length < 2) return translate(locale, "why.discount.sub");
  const base = bands[0];
  const deep = [...bands].reverse().find((b) => b.rows >= 5 && b.band !== base.band) ?? bands[bands.length - 1];
  if (base.margin === null || deep.margin === null) return translate(locale, "why.discount.sub");
  const pts = (deep.margin - base.margin) * 100;
  const unitsUp = base.avgUnits && deep.avgUnits ? (deep.avgUnits - base.avgUnits) / base.avgUnits : null;
  const unitsText = unitsUp === null || Math.abs(unitsUp) < 0.03 ? "" : locale === "mn" ? `, нэг мөрийн тоо ${formatSignedPct(unitsUp)}` : `, units per row ${formatSignedPct(unitsUp)}`;
  if (locale === "mn") return `${deep.band} хөнгөлөлтөд ашгийн хувь 0%-тай харьцуулахад ${Math.abs(pts).toFixed(1)} нэгжээр ${pts < 0 ? "бага" : "их"}${unitsText}`;
  return `Margin is ${Math.abs(pts).toFixed(1)} pp ${pts < 0 ? "lower" : "higher"} in the ${deep.band} band than with no discount${unitsText}`;
}

// ---------------------------------------------------------------------------
// Level 5 - deterministic executive bullets
// ---------------------------------------------------------------------------

export interface Bullet {
  title: string;
  text: string;
}

export function executiveBullets(
  locale: Locale,
  kpis: KpiSet,
  basis: ComparisonBasis | null,
  byChannel: RankedGroup[],
  byBrand: RankedGroup[],
  drivers: DriverEvidence[] | null,
  pq: PriceQuantity,
  stock: StockSales,
  split: SalesTypeSplit
): Bullet[] {
  const mn = locale === "mn";
  const bullets: Bullet[] = [];
  const cur = kpis.current;

  // What
  const parts: string[] = [];
  parts.push(
    mn
      ? `Цэвэр борлуулалт ₮${formatCompact(cur.netSales, locale)}, нийт ашиг ₮${formatCompact(cur.grossProfit, locale)} (ашгийн хувь ${formatPct(kpis.margin.current)})`
      : `Net revenue ₮${formatCompact(cur.netSales, locale)}, gross profit ₮${formatCompact(cur.grossProfit, locale)} (margin ${formatPct(kpis.margin.current)})`
  );
  if (kpis.netSales.change !== null && basis) {
    const ref = mn ? (basis === "ly" ? "өнгөрсөн жилтэй" : "өмнөх үетэй") : basis === "ly" ? "vs last year" : "vs prior period";
    parts.push(
      mn
        ? `${ref} харьцуулахад орлого ${formatSignedPct(kpis.netSales.change)}, тоо хэмжээ ${formatSignedPct(kpis.volume.change)}, ашгийн хувь ${kpis.margin.pointsChange !== null && kpis.margin.pointsChange !== undefined ? `${kpis.margin.pointsChange >= 0 ? "+" : "−"}${Math.abs(kpis.margin.pointsChange * 100).toFixed(1)} нэгж` : "—"}`
        : `revenue ${formatSignedPct(kpis.netSales.change)}, quantity ${formatSignedPct(kpis.volume.change)}, margin ${kpis.margin.pointsChange !== null && kpis.margin.pointsChange !== undefined ? `${kpis.margin.pointsChange >= 0 ? "+" : "−"}${Math.abs(kpis.margin.pointsChange * 100).toFixed(1)} pp` : "—"} ${ref}`
    );
  } else if (kpis.mom?.change.netSales !== null && kpis.mom) {
    parts.push(
      mn
        ? `${formatMonth(kpis.mom.month, locale)} орлого өмнөх сараас ${formatSignedPct(kpis.mom.change.netSales)}`
        : `${formatMonth(kpis.mom.month, locale)} revenue ${formatSignedPct(kpis.mom.change.netSales)} vs the previous month`
    );
  }
  bullets.push({ title: translate(locale, "section.what"), text: parts.join(mn ? "; " : "; ") + "." });

  // Where
  const whereParts: string[] = [];
  if (byChannel.length) whereParts.push(whereHeadline(locale, byChannel, "netSales", translate(locale, "where.byChannel")));
  if (byBrand.length) whereParts.push(whereHeadline(locale, byBrand, "netSales", translate(locale, "where.byBrand")));
  if (split.pos.sellOut > 0 && split.shipment.sellIn > 0) whereParts.push(salesTypeHeadline(locale, split));
  if (whereParts.length) bullets.push({ title: translate(locale, "section.where"), text: whereParts.join(". ") + "." });

  // Why
  const whyParts: string[] = [];
  if (drivers && drivers.length) whyParts.push(driversHeadline(locale, drivers));
  if (pq.rho !== null) whyParts.push(priceQuantityHeadline(locale, pq));
  if (stock.available && stock.rho !== null) whyParts.push(stockHeadline(locale, stock));
  if (whyParts.length) bullets.push({ title: translate(locale, "section.why"), text: whyParts.join(". ") + ". " + translate(locale, "why.disclaimer") });

  return bullets;
}
