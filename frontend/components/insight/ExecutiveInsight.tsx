"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Segmented, Surface, Spinner, StateBox } from "@/components/ui/primitives";
import type { InsightState } from "@/hooks/useInsight";
import { formatInt } from "@/lib/format";
import { driverLabel } from "@/lib/i18n";
import type { Bullet } from "@/lib/narrative";
import { cn } from "@/lib/utils";
import type { AIAnalysisResult, FilterSpec, Locale, ManagementRecommendation } from "@/types";

interface Props {
  bullets: Bullet[];
  insight: InsightState;
  currentKey: string;
  spec: FilterSpec;
  rowCount: number;
}

const PRIORITY_TONE: Record<ManagementRecommendation["priority"], "negative" | "warning" | "neutral"> = {
  High: "negative",
  Medium: "warning",
  Low: "neutral",
};

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</h4>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-700">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExecutiveInsight({ bullets, insight, currentKey, spec, rowCount }: Props) {
  const { t, locale } = useLocale();
  const [lang, setLang] = React.useState<Locale>(locale);
  React.useEffect(() => setLang(locale), [locale]);

  const { data, loading, error, generatedKey } = insight;
  const stale = data !== null && generatedKey !== currentKey;
  const content: AIAnalysisResult | null = data ? (lang === "mn" && data.ai_mongolian ? data.ai_mongolian : data.ai_english) : null;
  const tooFew = rowCount < 5;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {/* Deterministic findings */}
      <Surface className="xl:col-span-1">
        <h3 className="text-[15px] font-semibold text-ink-900">{t("so.deterministic")}</h3>
        <ol className="mt-3 space-y-4">
          {bullets.map((b) => (
            <li key={b.title}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{b.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{b.text}</p>
            </li>
          ))}
        </ol>
      </Surface>

      {/* AI narrative */}
      <Surface className="xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("so.ai.title")}
              {data?.meta.mock_ai && <Badge tone="warning">{t("so.mock")}</Badge>}
            </h3>
            <p className="mt-0.5 text-xs text-ink-500">{t("so.ai.sub")}</p>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <Segmented
                ariaLabel={t("app.language")}
                value={lang}
                onChange={setLang}
                options={[
                  { value: "mn" as Locale, label: t("so.lang.mn"), disabled: !data.ai_mongolian },
                  { value: "en" as Locale, label: t("so.lang.en") },
                ]}
              />
            )}
            <Button
              variant={data && !stale ? "secondary" : "primary"}
              size="sm"
              loading={loading}
              disabled={tooFew || (!!data && !stale && !loading)}
              onClick={() => insight.generate(spec, currentKey, !!data && !stale)}
            >
              {data ? t("so.regenerate") : t("so.generate")}
            </Button>
          </div>
        </div>

        {tooFew && <p className="mt-3 text-sm text-ink-500">{t("so.tooFewRows")}</p>}

        {loading && (
          <div className="mt-4 flex items-center gap-2 rounded-ctl border border-line bg-surface2 px-3 py-2 text-sm text-ink-600" role="status">
            <Spinner className="h-4 w-4 text-accent" />
            {t("so.generating")}
          </div>
        )}

        {error && !loading && (
          <div className="mt-4">
            <StateBox tone="negative" title={t("so.error")} body={error === "network" ? t("upload.errorNetwork") : error} action={<Button variant="secondary" size="sm" onClick={() => insight.generate(spec, currentKey, true)}>{t("common.retry")}</Button>} />
          </div>
        )}

        {!data && !loading && !error && !tooFew && <div className="mt-4"><StateBox title={t("so.empty")} /></div>}

        {data && content && (
          <div className={cn("mt-4 space-y-6 transition-opacity", loading && "opacity-50")} aria-busy={loading || undefined}>
            <div data-testid="insight-scope" data-stale={stale ? "true" : "false"} className={cn("rounded-ctl border px-3 py-2 text-xs", stale ? "border-warning/30 bg-warningSoft text-warning" : "border-line bg-surface2 text-ink-500")}>
              {stale && <span className="font-semibold">{t("so.stale")} </span>}
              <span className="font-medium">{t("so.scope")}:</span> {data.scope_label} · {formatInt(data.filter_row_count)} {t("so.rowsInScope")}
              {lang === "mn" && !data.ai_mongolian && <span className="ml-2 text-warning">{t("so.translationMissing")}</span>}
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("so.executiveSummary")}</h4>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-800">{content.executive_summary}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{content.performance_overview}</p>
            </div>

            {content.top_drivers.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("so.topDrivers")}</h4>
                <ol className="mt-2 divide-y divide-line">
                  {content.top_drivers.map((d) => (
                    <li key={d.rank} className="grid gap-1 py-2.5 sm:grid-cols-[2rem_1fr]">
                      <span className="text-sm font-semibold tnum text-ink-400">{d.rank}</span>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          {driverLabel(lang, d.driver)} <span className="ml-1 text-xs font-normal text-ink-400">· {d.direction.replace(/_/g, " ")} · {d.confidence}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-ink-700">{d.business_impact}</p>
                        <p className="mt-0.5 text-xs text-ink-400">{d.evidence}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <InsightList title={t("so.channels")} items={content.channel_insights} />
              <InsightList title={t("so.brandProduct")} items={content.brand_product_insights} />
              <InsightList title={t("so.pricing")} items={content.pricing_discount_insights} />
              <InsightList title={t("so.promotion")} items={content.promotion_insights} />
              <InsightList title={t("so.risks")} items={content.returns_inventory_risks} />
              <InsightList title={t("so.opportunities")} items={content.opportunities} />
            </div>

            {content.management_recommendations.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("so.recommendations")}</h4>
                <ol className="mt-2 grid gap-3 md:grid-cols-2">
                  {content.management_recommendations.map((rec, i) => (
                    <li key={i} className="rounded-ctl border border-line bg-surface2/60 p-4">
                      <Badge tone={PRIORITY_TONE[rec.priority] ?? "neutral"}>{t(`so.priority.${rec.priority}` as "so.priority.High")}</Badge>
                      <p className="mt-2 text-sm font-semibold text-ink-900">{rec.action}</p>
                      <p className="mt-1.5 text-xs text-ink-600">
                        <span className="font-medium text-ink-500">{t("so.evidence")}: </span>
                        {rec.reason}
                      </p>
                      <p className="mt-1 text-xs text-ink-600">
                        <span className="font-medium text-ink-500">{t("so.effect")}: </span>
                        {rec.expected_business_effect}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {content.data_limitations.length > 0 && (
              <details className="rounded-ctl border border-line bg-surface2/60 px-4 py-3 text-xs text-ink-500">
                <summary className="cursor-pointer font-semibold uppercase tracking-wide text-ink-500">{t("so.limitations")}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {content.data_limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-[11px] text-ink-400">
              {t("so.generatedAt")}: {new Date(data.generated_at).toLocaleString()} · {data.meta.anthropic_model} / {data.meta.openai_model}
            </p>
          </div>
        )}
      </Surface>
    </div>
  );
}
