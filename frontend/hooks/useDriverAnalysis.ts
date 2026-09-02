"use client";

import * as React from "react";
import { ApiError, fetchDriverAnalysis } from "@/lib/api";
import type { DriverAnalysisResponse, FilterSpec } from "@/types";

export interface DriverAnalysisState {
  data: DriverAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  /** true while `data` belongs to a previous filter selection */
  stale: boolean;
  retry: () => void;
}

const DEBOUNCE_MS = 350;

/** Fetches the server-side driver statistics for the current filter. The
 *  previous result stays on screen (dimmed) until the new one arrives, and
 *  superseded requests are aborted so a slow response can never overwrite a
 *  newer selection. */
export function useDriverAnalysis(uploadId: string | null, spec: FilterSpec, filterKey: string, rowCount: number): DriverAnalysisState {
  const [data, setData] = React.useState<DriverAnalysisResponse | null>(null);
  const [dataKey, setDataKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const specRef = React.useRef(spec);
  specRef.current = spec;

  React.useEffect(() => {
    if (!uploadId) return;
    if (rowCount === 0) {
      setData(null);
      setDataKey(filterKey);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const result = await fetchDriverAnalysis(uploadId, specRef.current, controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setDataKey(filterKey);
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
  }, [uploadId, filterKey, rowCount, attempt]);

  return {
    data,
    loading,
    error,
    stale: data !== null && dataKey !== filterKey,
    retry: React.useCallback(() => setAttempt((a) => a + 1), []),
  };
}
