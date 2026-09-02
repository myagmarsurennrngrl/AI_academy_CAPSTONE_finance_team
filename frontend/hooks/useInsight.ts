"use client";

import * as React from "react";
import { ApiError, fetchInsight } from "@/lib/api";
import type { FilterSpec, InsightResponse } from "@/types";

export interface InsightState {
  data: InsightResponse | null;
  loading: boolean;
  error: string | null;
  /** filter key the current insight was generated for */
  generatedKey: string | null;
  generate: (spec: FilterSpec, key: string, force?: boolean) => void;
  cancel: () => void;
}

/** The AI narrative is expensive (two LLM calls), so it is generated on
 *  demand for an explicit filter selection and tagged with that selection.
 *  The UI marks it stale when filters move on, instead of silently showing a
 *  narrative about a different slice. */
export function useInsight(uploadId: string | null): InsightState {
  const [data, setData] = React.useState<InsightResponse | null>(null);
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const uploadRef = React.useRef(uploadId);

  React.useEffect(() => {
    // New upload -> forget the previous narrative. Guarded by a ref so that
    // React StrictMode's effect replay (dev) never aborts a live request.
    if (uploadRef.current === uploadId) return;
    uploadRef.current = uploadId;
    controllerRef.current?.abort();
    setData(null);
    setGeneratedKey(null);
    setLoading(false);
    setError(null);
  }, [uploadId]);

  const cancel = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }, []);

  const generate = React.useCallback(
    async (spec: FilterSpec, key: string, force = false) => {
      if (!uploadId) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchInsight(uploadId, spec, force, controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setGeneratedKey(key);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "network");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [uploadId]
  );

  return { data, loading, error, generatedKey, generate, cancel };
}
