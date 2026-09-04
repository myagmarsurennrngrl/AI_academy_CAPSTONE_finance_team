"use client";

import * as React from "react";
import { ApiError, NetworkError, fetchDataset, loadSampleUpload, uploadExcel } from "@/lib/api";
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

/** Name the backend gives the bundled sample workbook (POST /api/upload/sample). */
export const SAMPLE_FILE_NAME = "sample_data.xlsx";

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

  /** Upload (or sample) -> profile -> row-level dataset. Resolves true when
   *  the dataset is ready; a newer request supersedes an older one. */
  const run = React.useCallback(async (fileName: string, fileSize: number, start: () => Promise<UploadResponse>): Promise<boolean> => {
    const requestId = ++requestRef.current;
    const isCurrent = () => requestRef.current === requestId;

    setState({ ...INITIAL, fileName, fileSize, status: "uploading" });
    let upload: UploadResponse;
    try {
      upload = await start();
    } catch (err) {
      if (isCurrent()) setState((s) => ({ ...s, status: "error", errorKey: errorKeyFor(err) }));
      return false;
    }
    if (!isCurrent()) return false;

    if (!upload.can_analyze) {
      setState((s) => ({ ...s, status: "blocked", upload }));
      return false;
    }
    setState((s) => ({ ...s, status: "preparing", upload, fileSize: s.fileSize || upload.file_size_bytes }));
    try {
      const dataset = await fetchDataset(upload.upload_id);
      if (!isCurrent()) return false;
      const rows = toSalesRows(dataset);
      setState((s) => ({ ...s, status: "ready", dataset, rows }));
      return true;
    } catch (err) {
      if (isCurrent()) setState((s) => ({ ...s, status: "error", errorKey: errorKeyFor(err) }));
      return false;
    }
  }, []);

  const uploadFile = React.useCallback(
    async (file: File): Promise<boolean> => {
      if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
        requestRef.current++;
        setState({ ...INITIAL, fileName: file.name, fileSize: file.size, status: "error", errorKey: "upload.errorType" });
        return false;
      }
      return run(file.name, file.size, () => uploadExcel(file));
    },
    [run]
  );

  /** "Try with sample data": nothing leaves the browser, the backend registers its own sample. */
  const loadSample = React.useCallback((): Promise<boolean> => run(SAMPLE_FILE_NAME, 0, loadSampleUpload), [run]);

  const reset = React.useCallback(() => {
    requestRef.current++;
    setState(INITIAL);
  }, []);

  return { state, uploadFile, loadSample, reset };
}
