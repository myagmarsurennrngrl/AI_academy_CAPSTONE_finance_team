"use client";

import * as React from "react";
import { ApiError, NetworkError, fetchMe, login as apiLogin } from "@/lib/api";
import { clearSession, readSession, setUnauthorizedHandler, writeSession } from "@/lib/auth";
import type { AuthUser } from "@/types";

export type LoginErrorKey = "auth.error.invalid" | "auth.error.network" | "auth.error.generic";

interface AuthContextValue {
  /** false until the stored session has been validated against the backend */
  ready: boolean;
  user: AuthUser | null;
  /** set when the session was ended by the server (expired / revoked token) */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<LoginErrorKey | null>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [ready, setReady] = React.useState(false);
  const [sessionExpired, setSessionExpired] = React.useState(false);

  // Validate the persisted token once on mount. A network failure keeps the
  // stored user (the backend may simply be starting up); an explicit 401
  // clears it.
  React.useEffect(() => {
    let cancelled = false;
    const stored = readSession();
    if (!stored) {
      setReady(true);
      return;
    }
    setUser(stored.user);
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          clearSession();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 anywhere in the app ends the session.
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((current) => {
        if (current) setSessionExpired(true);
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = React.useCallback(async (username: string, password: string): Promise<LoginErrorKey | null> => {
    try {
      const result = await apiLogin(username.trim(), password);
      writeSession({ token: result.token, expires_at: result.expires_at, user: result.user });
      setUser(result.user);
      setSessionExpired(false);
      return null;
    } catch (err) {
      if (err instanceof NetworkError) return "auth.error.network";
      if (err instanceof ApiError && (err.status === 401 || err.status === 400 || err.status === 422)) return "auth.error.invalid";
      return "auth.error.generic";
    }
  }, []);

  const logout = React.useCallback(() => {
    clearSession();
    setSessionExpired(false);
    setUser(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ ready, user, sessionExpired, login, logout }),
    [ready, user, sessionExpired, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
