"use client";

import * as React from "react";
import { FileSpreadsheet, RotateCcw } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button, Segmented } from "@/components/ui/primitives";
import { formatDateRange, formatInt } from "@/lib/format";
import type { Locale } from "@/types";

interface Props {
  dataset?: { filename: string; rows: number; dateMin: string | null; dateMax: string | null } | null;
  onNewFile?: () => void;
}

export function AppHeader({ dataset, onNewFile }: Props) {
  const { t, locale, setLocale } = useLocale();
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-ink-900 text-[11px] font-bold text-white" aria-hidden="true">
            SD
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink-900">{t("app.title")}</p>
            <p className="hidden truncate text-[11px] text-ink-500 sm:block">{t("app.subtitle")}</p>
          </div>
        </div>

        {dataset && (
          <div className="hidden min-w-0 items-center gap-2 rounded-chip border border-line bg-surface2 px-2.5 py-1 text-xs text-ink-600 md:flex">
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
          {onNewFile && (
            <Button variant="secondary" size="sm" onClick={onNewFile}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t("app.newFile")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
