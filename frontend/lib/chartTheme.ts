/** Chart tokens. One primary hue for "the data", a quiet gray for comparison
 *  context, semantic colors only for direction (positive / negative), and a
 *  second validated categorical hue used solely where two real categories
 *  must be told apart (sell-out vs sell-in).
 *
 *  Values are CSS variable references resolved by the browser, so every chart
 *  follows the light / dark palette declared in app/globals.css without the
 *  components knowing which theme is active. SVG presentation attributes
 *  (fill, stroke, stopColor) accept var() in all supported browsers. Palette
 *  pairs validated with the dataviz validator for both surfaces. */

export const CHART = {
  primary: "var(--chart-primary)",
  primarySoft: "var(--chart-primary-soft)",
  secondary: "var(--chart-secondary)", // second categorical slot (sell-in / shipment)
  comparison: "var(--chart-comparison)", // last year / prior period - deliberately quiet
  comparisonInk: "var(--chart-comparison-ink)",
  positive: "var(--chart-positive)",
  negative: "var(--chart-negative)",
  neutral: "var(--chart-neutral)",
  ink: "var(--chart-ink)",
  inkSecondary: "var(--chart-ink-secondary)",
  inkMuted: "var(--chart-ink-muted)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  surface: "var(--chart-surface)",
  highlight: "var(--chart-highlight)",
  cursor: "var(--chart-cursor)",
} as const;

export const AXIS_TICK = { fill: CHART.inkMuted, fontSize: 11, fontFamily: "inherit" } as const;
export const AXIS_TICK_STRONG = { fill: CHART.inkSecondary, fontSize: 12, fontFamily: "inherit" } as const;

export const BAR_RADIUS_H: [number, number, number, number] = [0, 4, 4, 0];
export const BAR_RADIUS_V: [number, number, number, number] = [4, 4, 0, 0];
export const BAR_MAX = 22;

export function deltaColor(delta: number | null | undefined, higherIsBetter = true): string {
  if (delta === null || delta === undefined || Number.isNaN(delta) || Math.abs(delta) < 1e-9) return CHART.neutral;
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return good ? CHART.positive : CHART.negative;
}

/** Nice rounded axis domain top for positive-only bars/lines. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
