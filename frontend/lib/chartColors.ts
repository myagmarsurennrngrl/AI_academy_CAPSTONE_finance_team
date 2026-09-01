/** Palette per the dataviz skill's validated reference instance (light mode only -
 * this dashboard does not need a dark chart surface). Categorical order is fixed;
 * never cycle/reassign hues by rank. */

export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

export const SEQUENTIAL_BLUE = {
  100: "#cde2fb",
  250: "#86b6ef",
  400: "#3987e5",
  450: "#2a78d6",
  500: "#256abf",
  600: "#184f95",
};

export const DIVERGING = {
  positive: "#2a78d6", // blue pole
  negative: "#e34948", // red pole
  neutral: "#f0efec",
};

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const CHART_CHROME = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
};
