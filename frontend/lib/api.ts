import type { AnalysisResponse, UploadResponse } from "@/types";

// Analysis requests call the backend directly (not through Next's rewrite
// proxy): the deterministic pipeline + two sequential LLM calls can run well
// past a minute, and Next's dev-server proxy has been observed to give up on
// long-lived proxied requests around ~30s, returning a client-side 500 even
// though the backend keeps working and finishes successfully. Calling the
// backend's own origin (CORS-enabled - see backend/app/main.py) avoids that
// entirely. Override with NEXT_PUBLIC_API_BASE_URL if the backend runs
// somewhere other than localhost:8000.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Тодорхойгүй алдаа гарлаа.";
  }
}

export async function uploadExcel(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: formData });
  if (!res.ok) {
    throw new ApiError(await parseErrorDetail(res), res.status);
  }
  return res.json();
}

export async function runAnalysis(uploadId: string): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE_URL}/api/analysis/${uploadId}`, { method: "POST" });
  if (!res.ok) {
    throw new ApiError(await parseErrorDetail(res), res.status);
  }
  return res.json();
}

export function sampleDownloadUrl(): string {
  return `${API_BASE_URL}/api/sample/download`;
}
