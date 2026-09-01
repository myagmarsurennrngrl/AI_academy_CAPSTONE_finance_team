/** Period-over-period comparisons (WoW / MoM / QoQ / YoY), derived purely
 * from the already-backend-computed time_analysis arrays - no new numbers
 * are invented here, just simple deltas between two backend-computed sums. */
import type { TimeSeriesPoint } from "@/types";

export interface PeriodComparison {
  currentLabel: string;
  previousLabel: string;
  current: TimeSeriesPoint;
  previous: TimeSeriesPoint;
  deltas: {
    net_sales: number;
    gross_profit: number;
    net_qty: number;
  };
}

function pctChange(curr: number, prev: number): number {
  if (!prev) return 0;
  return (curr - prev) / Math.abs(prev);
}

function toComparison(
  current: TimeSeriesPoint,
  previous: TimeSeriesPoint,
  currentLabel: string,
  previousLabel: string
): PeriodComparison {
  return {
    currentLabel,
    previousLabel,
    current,
    previous,
    deltas: {
      net_sales: pctChange(current.net_sales, previous.net_sales),
      gross_profit: pctChange(current.gross_profit, previous.gross_profit),
      net_qty: pctChange(current.net_qty, previous.net_qty),
    },
  };
}

export function computeWoW(weekly: TimeSeriesPoint[]): PeriodComparison | null {
  if (weekly.length < 2) return null;
  const current = weekly[weekly.length - 1];
  const previous = weekly[weekly.length - 2];
  return toComparison(current, previous, current.period, previous.period);
}

export function computeMoM(monthly: TimeSeriesPoint[]): PeriodComparison | null {
  if (monthly.length < 2) return null;
  const current = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];
  return toComparison(current, previous, current.period, previous.period);
}

function monthKey(period: string): { year: number; month: number } {
  const d = new Date(period);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

function sumField(points: TimeSeriesPoint[], key: keyof Omit<TimeSeriesPoint, "period">): number {
  return points.reduce((acc, p) => acc + (p[key] as number), 0);
}

function bucketToPoint(bucket: TimeSeriesPoint[], label: string): TimeSeriesPoint {
  return {
    period: label,
    net_sales: sumField(bucket, "net_sales"),
    gross_sales: sumField(bucket, "gross_sales"),
    net_qty: sumField(bucket, "net_qty"),
    gross_profit: sumField(bucket, "gross_profit"),
  };
}

export function computeQoQ(monthly: TimeSeriesPoint[]): PeriodComparison | null {
  // Always compare two equal, complete 3-month windows (the most recent 6
  // months) - a leftover partial bucket compared against a full quarter would
  // produce a misleadingly large swing, so require the full 6 months instead.
  if (monthly.length < 6) return null;
  const last6 = monthly.slice(-6);
  const previousBucket = last6.slice(0, 3);
  const currentBucket = last6.slice(3, 6);
  const current = bucketToPoint(
    currentBucket,
    `${currentBucket[0].period} .. ${currentBucket[currentBucket.length - 1].period}`
  );
  const previous = bucketToPoint(
    previousBucket,
    `${previousBucket[0].period} .. ${previousBucket[previousBucket.length - 1].period}`
  );
  return toComparison(current, previous, "Энэ улирал", "Өмнөх улирал");
}

export function computeYoY(monthly: TimeSeriesPoint[]): PeriodComparison | null {
  if (monthly.length === 0) return null;
  const current = monthly[monthly.length - 1];
  const { year, month } = monthKey(current.period);
  const previous = monthly.find((p) => {
    const k = monthKey(p.period);
    return k.year === year - 1 && k.month === month;
  });
  if (!previous) return null;
  return toComparison(current, previous, current.period, previous.period);
}
