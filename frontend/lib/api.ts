import type { DatasetResponse, DriverAnalysisResponse, FilterSpec, InsightResponse, UploadResponse } from "@/types";

// The frontend calls the backend origin directly (CORS-enabled) instead of
// proxying through Next's dev server: the AI insight call can run past a
// minute and the rewrite proxy was observed to drop long requests.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "network") {
    super(message);
    this.name = "NetworkError";
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Request failed";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }
  if (!res.ok) throw new ApiError(await parseErrorDetail(res), res.status);
  return res.json() as Promise<T>;
}

export function uploadExcel(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<UploadResponse>("/api/upload", { method: "POST", body: formData });
}

export function fetchDataset(uploadId: string): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/dataset/${uploadId}`);
}

export function fetchDriverAnalysis(uploadId: string, spec: FilterSpec, signal?: AbortSignal): Promise<DriverAnalysisResponse> {
  return request<DriverAnalysisResponse>(`/api/analysis/${uploadId}/drivers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
    signal,
  });
}

export function fetchInsight(uploadId: string, spec: FilterSpec, forceRefresh = false, signal?: AbortSignal): Promise<InsightResponse> {
  return request<InsightResponse>(`/api/analysis/${uploadId}/insight${forceRefresh ? "?force_refresh=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
    signal,
  });
}

export function sampleDownloadUrl(): string {
  return `${API_BASE_URL}/api/sample/download`;
}
