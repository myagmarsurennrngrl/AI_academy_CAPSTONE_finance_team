"use client";

import * as React from "react";
import { ArrowRight, BarChart3, FileSpreadsheet, RotateCcw, TrendingUp } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/types";

interface Props {
  onSelect: (module: AppModule) => void;
  /** the file already loaded in this session, if any */
  dataset?: { filename: string; rows: number } | null;
  onNewFile?: () => void;
}

const MODULES: { key: AppModule; icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
  { key: "drivers", icon: BarChart3, accent: "from-accent/15 to-accent/0" },
  { key: "forecast", icon: TrendingUp, accent: "from-positive/15 to-positive/0" },
];

/** First screen after sign-in: two large squares, one per module, each with a
 *  short explanation beneath it. */
export function ModuleChooser({ onSelect, dataset, onNewFile }: Props) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">{t("home.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">{t("home.lead")}</p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 sm:gap-8">
        {MODULES.map(({ key, icon: Icon, accent }) => (
          <div key={key} className="flex flex-col">
            <button
              type="button"
              onClick={() => onSelect(key)}
              data-testid={`module-${key}`}
              className={cn(
                "group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface p-6 text-center shadow-card transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-lineStrong hover:shadow-pop focus-ring"
              )}
            >
              <span className={cn("pointer-events-none absolute inset-0 bg-gradient-to-b opacity-70 transition-opacity group-hover:opacity-100", accent)} aria-hidden="true" />
              <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-line bg-surface text-ink-800 shadow-card transition-colors group-hover:border-accent/40 group-hover:text-accent">
                <Icon className="h-8 w-8" />
              </span>
              <span className="relative mt-6 text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">{t(`home.${key}.title` as "home.drivers.title")}</span>
              <span className="relative mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                {t("home.open")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            <p className="mt-3 px-1 text-center text-sm leading-relaxed text-ink-500">{t(`home.${key}.desc` as "home.drivers.desc")}</p>
          </div>
        ))}
      </div>

      {dataset && (
        <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3 rounded-ctl border border-line bg-surface2/70 px-4 py-2.5 text-xs text-ink-600">
          <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>
            <span className="font-medium text-ink-800">{dataset.filename}</span> · {formatInt(dataset.rows)} {t("app.rows")} · {t("home.continueWith")}
          </span>
          {onNewFile && (
            <Button variant="ghost" size="sm" onClick={onNewFile}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t("app.newFile")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
