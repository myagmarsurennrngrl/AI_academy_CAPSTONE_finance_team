"use client";

import * as React from "react";
import { ApiError, fetchForecast } from "@/lib/api";
import type { ForecastRequest, ForecastResponse } from "@/types";

export interface ForecastState {
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
  /** true while `data` belongs to a previous request */
  stale: boolean;
  retry: () => void;
}

const DEBOUNCE_MS = 300;

/** Runs the backtested forecast for the current target / horizon / filters.
 *  Superseded requests are aborted so a slow response never overwrites a
 *  newer selection; the previous result stays visible (dimmed) meanwhile. */
export function useForecast(uploadId: string | null, req: ForecastRequest | null): ForecastState {
  const [data, setData] = React.useState<ForecastResponse | null>(null);
  const [dataKey, setDataKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const key = req ? JSON.stringify(req) : null;
  const reqRef = React.useRef(req);
  reqRef.current = req;

  React.useEffect(() => {
    if (!uploadId || !key) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const result = await fetchForecast(uploadId, reqRef.current as ForecastRequest, controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setDataKey(key);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "network");
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [uploadId, key, attempt]);

  return {
    data,
    loading,
    error,
    stale: data !== null && dataKey !== key,
    retry: React.useCallback(() => setAttempt((a) => a + 1), []),
  };
}
