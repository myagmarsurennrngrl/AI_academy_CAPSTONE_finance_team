"use client";

import * as React from "react";
import { ArrowRight, BarChart3, FileSpreadsheet, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
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
  /** "try it without uploading anything" - loads the bundled sample workbook */
  onTrySample?: () => void;
  sampleLoading?: boolean;
  sampleError?: string | null;
}

/** Each module is a pair: presenter + square. The presenter stands on the
 *  outer side and gestures towards the square (he points right, she points
 *  left), on every screen size - the pair simply gets narrower on a phone. */
const MODULES: {
  key: AppModule;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  side: "left" | "right";
  presenter: string;
  glow: string;
}[] = [
  { key: "drivers", icon: BarChart3, accent: "from-accent/15 to-accent/0", side: "left", presenter: "/characters/analyst-male.png", glow: "bg-accent/20" },
  { key: "forecast", icon: TrendingUp, accent: "from-positive/15 to-positive/0", side: "right", presenter: "/characters/analyst-female.png", glow: "bg-positive/20" },
];

// presenter column ≈ a quarter of the pair; the square takes the rest
const PAIR_LEFT = "grid-cols-[minmax(64px,26%)_minmax(0,1fr)]";
const PAIR_RIGHT = "grid-cols-[minmax(0,1fr)_minmax(64px,26%)]";
const DESC_LEFT = "pl-[calc(26%+0.75rem)]";
const DESC_RIGHT = "pr-[calc(26%+0.75rem)]";

/** Illustrated presenter standing beside a module square. Decorative: hidden
 *  from assistive tech and removed entirely if the image is missing so the
 *  layout never shows a broken image. The image is absolutely positioned so
 *  the square alone decides the row height; feet sit on the square's bottom. */
function Presenter({ src, glow }: { src: string; glow: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    <div className="relative self-stretch" aria-hidden="true">
      <span className={cn("pointer-events-none absolute inset-x-2 bottom-1 top-1/3 rounded-full blur-2xl", glow)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full select-none object-contain object-bottom drop-shadow-[0_10px_20px_rgba(16,24,40,0.18)]"
      />
    </div>
  );
}

/** First screen after sign-in: two squares, one per module, each with its
 *  presenter beside it and a short explanation beneath. */
export function ModuleChooser({ onSelect, dataset, onNewFile, onTrySample, sampleLoading, sampleError }: Props) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center py-10 sm:py-12 lg:max-w-5xl xl:max-w-6xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">{t("home.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">{t("home.lead")}</p>
      </div>

      {/* grid-cols-1 (= minmax(0,1fr)) matters on phones: an implicit auto column would grow to
          the pair's max-content width and push the square past the viewport. */}
      <div className="mt-8 grid grid-cols-1 gap-8 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:gap-8">
        {MODULES.map(({ key, icon: Icon, accent, side, presenter, glow }) => (
          <div key={key} className="flex min-w-0 flex-col">
            <div className={cn("grid items-stretch gap-3", side === "left" ? PAIR_LEFT : PAIR_RIGHT)}>
              {side === "left" && <Presenter src={presenter} glow={glow} />}
              <button
                type="button"
                onClick={() => onSelect(key)}
                data-testid={`module-${key}`}
                className={cn(
                  "group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface p-4 text-center shadow-card transition-all duration-200 lg:p-6",
                  "hover:-translate-y-0.5 hover:border-lineStrong hover:shadow-pop focus-ring"
                )}
              >
                <span className={cn("pointer-events-none absolute inset-0 bg-gradient-to-b opacity-70 transition-opacity group-hover:opacity-100", accent)} aria-hidden="true" />
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface text-ink-800 shadow-card transition-colors group-hover:border-accent/40 group-hover:text-accent sm:h-14 sm:w-14 lg:h-16 lg:w-16">
                  <Icon className="h-6 w-6 lg:h-8 lg:w-8" />
                </span>
                <span className="relative mt-4 text-base font-semibold tracking-tight text-ink-900 lg:mt-6 lg:text-lg xl:text-xl">{t(`home.${key}.title` as "home.drivers.title")}</span>
                <span className="relative mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent lg:mt-3">
                  {t("home.open")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
              {side === "right" && <Presenter src={presenter} glow={glow} />}
            </div>
            <p className={cn("mt-3 text-center text-sm leading-relaxed text-ink-500", side === "left" ? DESC_LEFT : DESC_RIGHT)}>{t(`home.${key}.desc` as "home.drivers.desc")}</p>
          </div>
        ))}
      </div>

      {dataset ? (
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
      ) : (
        onTrySample && (
          <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-2 text-center">
            <Button variant="secondary" onClick={onTrySample} loading={sampleLoading} data-testid="try-sample" className="h-auto min-h-10 whitespace-normal py-2 leading-snug">
              {!sampleLoading && <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />}
              {t("home.trySample")}
            </Button>
            <p className="text-xs leading-relaxed text-ink-400">{t("home.trySample.hint")}</p>
            {sampleError && (
              <p role="alert" className="text-xs text-negative">
                {sampleError}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
