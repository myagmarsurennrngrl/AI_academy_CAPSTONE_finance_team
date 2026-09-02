/** Chart tokens. One primary hue for "the data", a quiet gray for comparison
 *  context, semantic colors only for direction (positive / negative), and a
 *  second validated categorical hue used solely where two real categories
 *  must be told apart (sell-out vs sell-in). Palette pairs validated with the
 *  dataviz validator (light surface #ffffff). */

export const CHART = {
  primary: "#2a78d6",
  primarySoft: "#cde2fb",
  secondary: "#eb6834", // second categorical slot (sell-in / shipment)
  comparison: "#c3c9d3", // last year / prior period - deliberately quiet
  comparisonInk: "#7b8494",
  positive: "#1f8a5b",
  negative: "#d64545",
  neutral: "#98a2b3",
  ink: "#101828",
  inkSecondary: "#475467",
  inkMuted: "#8a94a6",
  grid: "#eceff3",
  axis: "#d5dae2",
  surface: "#ffffff",
  highlight: "#0f4c9a",
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
