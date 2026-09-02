"use client";

import * as React from "react";
import { ApiError, NetworkError, fetchDataset, uploadExcel } from "@/lib/api";
import { toSalesRows } from "@/lib/dataset";
import type { StringKey } from "@/lib/i18n";
import type { DatasetResponse, SalesRow, UploadResponse } from "@/types";

export type DatasetStatus = "idle" | "uploading" | "blocked" | "preparing" | "ready" | "error";

export interface DatasetState {
  status: DatasetStatus;
  fileName: string | null;
  fileSize: number;
  upload: UploadResponse | null;
  dataset: DatasetResponse | null;
  rows: SalesRow[];
  errorKey: StringKey | null;
}

const INITIAL: DatasetState = {
  status: "idle",
  fileName: null,
  fileSize: 0,
  upload: null,
  dataset: null,
  rows: [],
  errorKey: null,
};

const ACCEPTED = [".xlsx", ".xls"];

function errorKeyFor(err: unknown): StringKey {
  if (err instanceof NetworkError) return "upload.errorNetwork";
  if (err instanceof ApiError) {
    if (err.status === 413) return "upload.errorTooLarge";
    if (err.status === 400) return "upload.errorInvalid";
  }
  return "upload.errorGeneric";
}

export function useDataset() {
  const [state, setState] = React.useState<DatasetState>(INITIAL);
  const requestRef = React.useRef(0);

  const uploadFile = React.useCallback(async (file: File) => {
    const requestId = ++requestRef.current;
    const isCurrent = () => requestRef.current === requestId;

    if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setState({ ...INITIAL, fileName: file.name, fileSize: file.size, status: "error", errorKey: "upload.errorType" });
      return;
    }

    setState({ ...INITIAL, fileName: file.name, fileSize: file.size, status: "uploading" });
    let upload: UploadResponse;
    try {
      upload = await uploadExcel(file);
    } catch (err) {
      if (isCurrent()) setState((s) => ({ ...s, status: "error", errorKey: errorKeyFor(err) }));
      return;
    }
    if (!isCurrent()) return;

    if (!upload.can_analyze) {
      setState((s) => ({ ...s, status: "blocked", upload }));
      return;
    }
    setState((s) => ({ ...s, status: "preparing", upload }));
    try {
      const dataset = await fetchDataset(upload.upload_id);
      if (!isCurrent()) return;
      const rows = toSalesRows(dataset);
      setState((s) => ({ ...s, status: "ready", dataset, rows }));
    } catch (err) {
      if (isCurrent()) setState((s) => ({ ...s, status: "error", errorKey: errorKeyFor(err) }));
    }
  }, []);

  const reset = React.useCallback(() => {
    requestRef.current++;
    setState(INITIAL);
  }, []);

  return { state, uploadFile, reset };
}
