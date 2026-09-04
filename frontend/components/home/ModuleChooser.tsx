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

/** Explicit grid placement keeps each description under its own square at
 *  every breakpoint while the two presenters occupy the outer columns on
 *  large screens (row 1 only, so their feet line up with the squares). */
const MODULES: {
  key: AppModule;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  cell: string;
  descCell: string;
}[] = [
  {
    key: "drivers",
    icon: BarChart3,
    accent: "from-accent/15 to-accent/0",
    cell: "sm:col-start-1 sm:row-start-1 lg:col-start-2",
    descCell: "sm:col-start-1 sm:row-start-2 lg:col-start-2",
  },
  {
    key: "forecast",
    icon: TrendingUp,
    accent: "from-positive/15 to-positive/0",
    cell: "sm:col-start-2 sm:row-start-1 lg:col-start-3",
    descCell: "sm:col-start-2 sm:row-start-2 lg:col-start-3",
  },
];

/** Illustrated presenter standing beside the module squares. Decorative:
 *  hidden from assistive tech, hidden on small screens, and removed entirely
 *  if the image file is missing so the layout never shows a broken image. */
function Presenter({ src, glow, className }: { src: string; glow: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    <div className={cn("relative hidden self-stretch lg:block", className)} aria-hidden="true">
      <span className={cn("pointer-events-none absolute inset-x-3 bottom-2 top-1/3 rounded-full blur-3xl", glow)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_12px_24px_rgba(16,24,40,0.18)]"
      />
    </div>
  );
}

/** First screen after sign-in: two large squares, one per module, each with a
 *  short explanation beneath it, flanked by two presenters on large screens. */
export function ModuleChooser({ onSelect, dataset, onNewFile }: Props) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center py-12 lg:max-w-5xl xl:max-w-7xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">{t("home.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">{t("home.lead")}</p>
      </div>

      {/* Presenters gesture towards the squares: he points right, she points left. */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-3 lg:grid-cols-[160px_1fr_1fr_160px] lg:gap-x-6 xl:grid-cols-[220px_1fr_1fr_220px]">
        <Presenter src="/characters/analyst-male.png" glow="bg-accent/20" className="lg:col-start-1 lg:row-start-1" />

        {MODULES.map(({ key, icon: Icon, accent, cell, descCell }) => (
          <React.Fragment key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              data-testid={`module-${key}`}
              className={cn(
                "group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface p-6 text-center shadow-card transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-lineStrong hover:shadow-pop focus-ring",
                cell
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
            <p className={cn("-mt-3 px-1 text-center text-sm leading-relaxed text-ink-500 sm:mt-0", descCell)}>{t(`home.${key}.desc` as "home.drivers.desc")}</p>
          </React.Fragment>
        ))}

        <Presenter src="/characters/analyst-female.png" glow="bg-positive/20" className="lg:col-start-4 lg:row-start-1" />
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
