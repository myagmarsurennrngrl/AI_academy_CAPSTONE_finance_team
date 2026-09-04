import { getToken, notifyUnauthorized } from "@/lib/auth";
import type {
  AuthUser,
  ChatRequest,
  ChatResponse,
  DatasetResponse,
  DriverAnalysisResponse,
  FilterSpec,
  ForecastRequest,
  ForecastResponse,
  InsightResponse,
  LoginResponse,
  Role,
  UploadResponse,
  UserPublic,
} from "@/types";

// The frontend calls the backend origin directly (CORS-enabled) instead of
// proxying through Next's dev server: the AI insight call can run past a
// minute and the rewrite proxy was observed to drop long requests.
// Unset -> local dev default. Set to "" at build time -> same-origin /api (reverse
// proxy routes it to the backend). Set to a URL -> that backend origin (CORS).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

interface RequestOptions {
  /** Do not treat a 401 as "session lost" (used by the login call itself,
   *  where 401 simply means wrong credentials). */
  keepSessionOn401?: boolean;
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }
  if (res.status === 401 && !options.keepSessionOn401) notifyUnauthorized();
  if (!res.ok) throw new ApiError(await parseErrorDetail(res), res.status);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function jsonInit(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", jsonInit("POST", { username, password }), { keepSessionOn401: true });
}

export function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me");
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  return request<AuthUser>(
    "/api/auth/me/password",
    jsonInit("PUT", { current_password: currentPassword, new_password: newPassword }),
    { keepSessionOn401: true }
  );
}

export function listUsers(): Promise<UserPublic[]> {
  return request<{ users: UserPublic[] }>("/api/auth/users").then((r) => r.users);
}

export function createUser(username: string, password: string, role: Role): Promise<UserPublic> {
  return request<UserPublic>("/api/auth/users", jsonInit("POST", { username, password, role }));
}

export function deleteUser(username: string): Promise<void> {
  return request<void>(`/api/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export function resetUserPassword(username: string, password: string): Promise<UserPublic> {
  return request<UserPublic>(`/api/auth/users/${encodeURIComponent(username)}/password`, jsonInit("PUT", { password }));
}

export function updateUserRole(username: string, role: Role): Promise<UserPublic> {
  return request<UserPublic>(`/api/auth/users/${encodeURIComponent(username)}/role`, jsonInit("PUT", { role }));
}

// ---------------------------------------------------------------------------
// Dataset + analysis
// ---------------------------------------------------------------------------

export function uploadExcel(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<UploadResponse>("/api/upload", { method: "POST", body: formData });
}

/** Registers the backend's bundled sample workbook as an upload - "try it
 *  without your own data" on phones and laptops alike. */
export function loadSampleUpload(): Promise<UploadResponse> {
  return request<UploadResponse>("/api/upload/sample", { method: "POST" });
}

export function fetchDataset(uploadId: string): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/dataset/${uploadId}`);
}

export function fetchDriverAnalysis(uploadId: string, spec: FilterSpec, signal?: AbortSignal): Promise<DriverAnalysisResponse> {
  return request<DriverAnalysisResponse>(`/api/analysis/${uploadId}/drivers`, jsonInit("POST", spec, signal));
}

export function fetchInsight(uploadId: string, spec: FilterSpec, forceRefresh = false, signal?: AbortSignal): Promise<InsightResponse> {
  return request<InsightResponse>(
    `/api/analysis/${uploadId}/insight${forceRefresh ? "?force_refresh=true" : ""}`,
    jsonInit("POST", spec, signal)
  );
}

export function sampleDownloadUrl(): string {
  return `${API_BASE_URL}/api/sample/download`;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export function fetchForecast(uploadId: string, req: ForecastRequest, signal?: AbortSignal): Promise<ForecastResponse> {
  return request<ForecastResponse>(`/api/forecast/${uploadId}`, jsonInit("POST", req, signal));
}

// ---------------------------------------------------------------------------
// AI data assistant
// ---------------------------------------------------------------------------

export function fetchChatAnswer(uploadId: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return request<ChatResponse>(`/api/chat/${uploadId}`, jsonInit("POST", req, signal));
}
