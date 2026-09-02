/** Centralized presentation formatting. All analytical numbers arrive or are
 *  computed at full precision; rounding happens only here. */
import type { Locale } from "@/types";

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function isBad(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v);
}

/** 1,284 / 12.9K / 4.2M / 1.3B (English) or мянга / сая / тэрбум (Mongolian). */
export function formatCompact(value: number | null | undefined, locale: Locale = "mn", digits = 1): string {
  if (isBad(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const v = Math.abs(value);
  const units =
    locale === "mn"
      ? [
          [1e9, " тэрбум"],
          [1e6, " сая"],
          [1e3, " мянга"],
        ]
      : [
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "K"],
        ];
  for (const [threshold, suffix] of units as [number, string][]) {
    if (v >= threshold) {
      const scaled = v / threshold;
      const text = scaled >= 100 ? nf0.format(scaled) : digits === 2 ? nf2.format(scaled) : nf1.format(scaled);
      return `${sign}${text}${suffix}`;
    }
  }
  return `${sign}${nf0.format(v)}`;
}

export function formatMoney(value: number | null | undefined, locale: Locale = "mn"): string {
  if (isBad(value)) return "—";
  const compact = formatCompact(value, locale);
  return compact.startsWith("−") ? `−₮${compact.slice(1)}` : `₮${compact}`;
}

export function formatMoneyFull(value: number | null | undefined): string {
  if (isBad(value)) return "—";
  return `${value < 0 ? "−" : ""}₮${nf0.format(Math.abs(value))}`;
}

export function formatInt(value: number | null | undefined): string {
  if (isBad(value)) return "—";
  return nf0.format(Math.round(value));
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (isBad(value)) return "—";
  return digits === 0 ? nf0.format(value) : digits === 2 ? nf2.format(value) : nf1.format(value);
}

/** ratio (0.084) -> "8.4%". */
export function formatPct(ratio: number | null | undefined, digits = 1): string {
  if (isBad(ratio)) return "—";
  const pct = ratio * 100;
  const d = Math.abs(pct) >= 100 ? 0 : digits;
  return `${pct.toFixed(d)}%`;
}

/** ratio delta (−0.084) -> "−8.4%"; sign always shown. */
export function formatSignedPct(ratio: number | null | undefined, digits = 1): string {
  if (isBad(ratio)) return "—";
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : digits)}%`;
}

/** percentage-point delta (0.021) -> "+2.1 pp". */
export function formatPointsDelta(ratioDelta: number | null | undefined, locale: Locale = "mn"): string {
  if (isBad(ratioDelta)) return "—";
  const pts = ratioDelta * 100;
  const sign = pts > 0 ? "+" : pts < 0 ? "−" : "";
  return `${sign}${Math.abs(pts).toFixed(1)} ${locale === "mn" ? "нэгж" : "pp"}`;
}

export function formatSignedCompact(value: number | null | undefined, locale: Locale = "mn"): string {
  if (isBad(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompact(Math.abs(value), locale)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-05" -> "May 2026" / "2026 оны 5-р сар". */
export function formatMonth(month: string, locale: Locale = "mn"): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return locale === "mn" ? `${y} оны ${m}-р сар` : `${MONTHS_EN[m - 1]} ${y}`;
}

/** Short axis label: "May '26" / "5-р сар '26". */
export function formatMonthShort(month: string, locale: Locale = "mn"): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const yy = String(y).slice(2);
  return locale === "mn" ? `${m}-р сар '${yy}` : `${MONTHS_EN[m - 1]} '${yy}`;
}

/** "2026-05-14" -> "2026.05.14" (MN) / "14 May 2026" (EN). */
export function formatDate(iso: string | null | undefined, locale: Locale = "mn"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return locale === "mn" ? `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}` : `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

export function formatDateRange(from: string | null | undefined, to: string | null | undefined, locale: Locale = "mn"): string {
  if (!from || !to) return "—";
  return `${formatDate(from, locale)} – ${formatDate(to, locale)}`;
}

/** Replace {a}, {b} style placeholders. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
