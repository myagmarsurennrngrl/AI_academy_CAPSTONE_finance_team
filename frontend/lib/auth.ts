/** Client-side session storage for the login token.
 *
 *  The token is an opaque bearer string issued by POST /api/auth/login. It is
 *  kept in localStorage so a page refresh keeps the user signed in until the
 *  token expires (AUTH_TOKEN_HOURS on the backend). Every API request attaches
 *  it (lib/api.ts); a 401 from any endpoint clears it and notifies the
 *  AuthProvider so the app falls back to the login screen. */
import type { AuthUser } from "@/types";

const STORAGE_KEY = "sdi.session";

export interface StoredSession {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user?.username) return null;
    if (parsed.expires_at && new Date(parsed.expires_at).getTime() <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable - the session then lives only in memory */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return readSession()?.token ?? null;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** The AuthProvider registers itself here so lib/api.ts can force a sign-out
 *  when the backend rejects the token (expired, user deleted, secret rotated). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  clearSession();
  unauthorizedHandler?.();
}
