"use client";

import * as React from "react";
import { DARK_MEDIA, THEME_STORAGE_KEY, resolveTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

export type { ResolvedTheme, ThemePreference } from "@/lib/theme";

interface ThemeContextValue {
  /** what the user chose (system follows the OS setting) */
  preference: ThemePreference;
  /** what is actually rendered right now */
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** light -> dark -> system -> light */
  cycle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("system");
  const [resolved, setResolved] = React.useState<ResolvedTheme>("light");

  // Adopt the stored preference after mount (the inline script in
  // app/layout.tsx already applied the class, so this only syncs React state).
  React.useEffect(() => {
    const p = readPreference();
    setPreferenceState(p);
    setResolved(resolveTheme(p));
  }, []);

  // Apply the class + follow OS changes while in "system" mode.
  React.useEffect(() => {
    const apply = () => {
      const r = resolveTheme(preference);
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    apply();
    if (preference !== "system") return;
    const mq = window.matchMedia(DARK_MEDIA);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = React.useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  const cycle = React.useCallback(() => {
    setPreference(preference === "light" ? "dark" : preference === "dark" ? "system" : "light");
  }, [preference, setPreference]);

  const value = React.useMemo<ThemeContextValue>(() => ({ preference, resolved, setPreference, cycle }), [preference, resolved, setPreference, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
