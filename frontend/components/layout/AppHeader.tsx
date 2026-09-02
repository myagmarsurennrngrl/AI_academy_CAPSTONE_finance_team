"use client";

import * as React from "react";
import { ChevronRight, FileSpreadsheet, Home, LogOut, Monitor, Moon, RotateCcw, ShieldCheck, Sun } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useTheme, type ThemePreference } from "@/components/providers/ThemeProvider";
import { Badge, Button, Segmented } from "@/components/ui/primitives";
import { formatDateRange, formatInt } from "@/lib/format";
import type { AuthUser, Locale } from "@/types";

interface Props {
  dataset?: { filename: string; rows: number; dateMin: string | null; dateMax: string | null } | null;
  onNewFile?: () => void;
  user?: AuthUser | null;
  onLogout?: () => void;
  /** shown to administrators only */
  onAdmin?: () => void;
  adminActive?: boolean;
  /** back to the module chooser */
  onHome?: () => void;
  /** name of the module currently open */
  moduleLabel?: string;
}

const THEME_ICON: Record<ThemePreference, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function ThemeToggle() {
  const { t } = useLocale();
  const { preference, cycle } = useTheme();
  const Icon = THEME_ICON[preference];
  const label = t(`theme.${preference}` as "theme.light");
  return (
    <Button variant="ghost" size="sm" onClick={cycle} aria-label={`${t("app.theme")}: ${label}`} title={`${t("app.theme")}: ${label}`} className="px-2">
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function AppHeader({ dataset, onNewFile, user, onLogout, onAdmin, adminActive, onHome, moduleLabel }: Props) {
  const { t, locale, setLocale } = useLocale();
  return (
    <header className="glass sticky top-0 z-40 h-14 border-b">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-ink-900 text-[12px] font-bold text-onInk" aria-hidden="true">
            D
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink-900">{t("app.title")}</p>
            <p className="hidden truncate text-[11px] text-ink-500 sm:block">{t("app.subtitle")}</p>
          </div>
        </div>

        {onHome && (
          <nav aria-label={t("app.home")} className="hidden items-center gap-1 text-xs text-ink-500 md:flex">
            <button type="button" onClick={onHome} className="inline-flex items-center gap-1 rounded-ctl px-1.5 py-1 hover:bg-surface2 hover:text-ink-800 focus-ring">
              <Home className="h-3.5 w-3.5" />
              {t("app.home")}
            </button>
            {moduleLabel && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
                <span className="font-medium text-ink-800">{moduleLabel}</span>
              </>
            )}
          </nav>
        )}

        {dataset && (
          <div className="hidden min-w-0 items-center gap-2 rounded-chip border border-line/80 bg-surface2/70 px-2.5 py-1 text-xs text-ink-600 md:flex">
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            <span className="truncate font-medium text-ink-800">{dataset.filename}</span>
            <span className="text-ink-300">·</span>
            <span className="tnum">
              {formatInt(dataset.rows)} {t("app.rows")}
            </span>
            <span className="text-ink-300">·</span>
            <span className="tnum">{formatDateRange(dataset.dateMin, dataset.dateMax, locale)}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Segmented
            ariaLabel={t("app.language")}
            value={locale}
            onChange={(v: Locale) => setLocale(v)}
            options={[
              { value: "mn" as Locale, label: "MN" },
              { value: "en" as Locale, label: "EN" },
            ]}
          />
          <ThemeToggle />
          {onNewFile && (
            <Button variant="secondary" size="sm" onClick={onNewFile}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t("app.newFile")}
            </Button>
          )}
          {user && (
            <>
              <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
              <div className="hidden items-center gap-2 sm:flex" title={t("auth.signedInAs", { name: user.username })}>
                <span className="max-w-[140px] truncate text-xs font-medium text-ink-700">{user.username}</span>
                <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{user.role === "admin" ? t("auth.role.admin") : t("auth.role.user")}</Badge>
              </div>
              {user.role === "admin" && onAdmin && (
                <Button variant={adminActive ? "subtle" : "ghost"} size="sm" onClick={onAdmin} aria-pressed={adminActive}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t("app.admin")}</span>
                </Button>
              )}
              {onLogout && (
                <Button variant="ghost" size="sm" onClick={onLogout} aria-label={t("auth.signOut")} title={t("auth.signOut")}>
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t("auth.signOut")}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
