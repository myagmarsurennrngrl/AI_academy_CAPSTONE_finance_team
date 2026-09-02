"use client";

import * as React from "react";
import { BridgeChart } from "@/components/charts/BridgeChart";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, InfoTip, Segmented, StateBox, Surface, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { bridgeNarrative, effectLabel, type BridgeDimension, type SalesBridge } from "@/lib/bridge";
import { formatCompact, formatPct, formatPointsDelta, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComparisonBasis } from "@/types";

interface Props {
  bridge: SalesBridge | null;
  basis: ComparisonBasis | null;
  currentLabel: string;
  baseLabel: string;
  /** true when the selected period is too long for a last-year comparison */
  periodTooLong: boolean;
}

const DIMS: BridgeDimension[] = ["channel", "brand", "product", "channelType"];
const TOP_N = 8;

/** "Why did sales change?" - the variance bridge by effect and by origin. */
export function BridgePanel({ bridge, basis, currentLabel, baseLabel, periodTooLong }: Props) {
  const { t, locale } = useLocale();
  const [dim, setDim] = React.useState<BridgeDimension>("channel");

  if (!bridge || !basis) {
    return <StateBox title={t("bridge.noComparison")} body={periodTooLong ? t("kpi.selectPeriodHint") : t("bridge.noComparison.body")} />;
  }

  const fmt = (v: number) => `₮${formatCompact(v, locale)}`;
  const fmtSigned = (v: number) => `${v < 0 ? "−" : "+"}₮${formatCompact(Math.abs(v), locale)}`;
  const narrative = bridgeNarrative(locale, bridge, currentLabel, baseLabel);
  const basisLabel = basis === "ly" ? t("kpi.basis.ly") : t("kpi.basis.prior");

  const rows = bridge.groups[dim];
  const gainers = rows.filter((r) => r.delta > 0).slice(0, TOP_N);
  const losers = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, TOP_N);
  const shown = [...gainers, ...losers];
  const restDelta = rows.filter((r) => !shown.includes(r)).reduce((s, r) => s + r.delta, 0);
  const maxAbs = Math.max(1, ...shown.map((r) => Math.abs(r.delta)));

  return (
    <div className="space-y-4">
      {/* Headline + effects narrative */}
      <Surface>
        <p className="text-[15px] font-semibold leading-snug text-ink-900">{narrative.headline}</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("bridge.byEffect")}</h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-700">
              {narrative.effects.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("bridge.byOrigin")}</h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-700">
              {narrative.origins.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Waterfall */}
        <div className="xl:col-span-3">
          <BridgeChart
            title={t("bridge.chart.title", { from: baseLabel, to: currentLabel })}
            subtitle={`${t("bridge.chart.sub")} · ${basisLabel}`}
            bridge={bridge}
            baseLabel={baseLabel}
            currentLabel={currentLabel}
            footnote={t("bridge.method", { matched: bridge.matchedItems, added: bridge.newItems, lost: bridge.lostItems })}
          />
        </div>

        {/* Effects table */}
        <Surface padded={false} className="xl:col-span-2">
          <div className="flex items-center gap-1.5 px-5 pt-5">
            <h3 className="text-[15px] font-semibold text-ink-900">{t("bridge.effects")}</h3>
            <InfoTip text={t("bridge.effects.tip")} />
          </div>
          <div className="mt-3">
            <Table dense>
              <THead>
                <TR>
                  <TH>{t("bridge.step")}</TH>
                  <TH numeric>{t("bridge.amount")}</TH>
                  <TH numeric>{t("bridge.pctOfBase")}</TH>
                  <TH numeric>{t("bridge.shareOfDelta")}</TH>
                </TR>
              </THead>
              <TBody>
                {bridge.steps.map((s) => (
                  <TR key={s.key}>
                    <TD>
                      <p className="font-medium text-ink-800">{effectLabel(locale, s.key)}</p>
                      <p className="text-[11px] text-ink-400">{t(`bridge.effect.desc.${s.key}` as "bridge.effect.desc.volume")}</p>
                    </TD>
                    <TD numeric className={cn("font-semibold", s.amount > 0 ? "text-positive" : s.amount < 0 ? "text-negative" : "text-ink-500")}>{fmtSigned(s.amount)}</TD>
                    <TD numeric>{s.pctOfBase === null ? "—" : formatSignedPct(s.pctOfBase)}</TD>
                    <TD numeric>{s.shareOfDelta === null ? "—" : formatPct(s.shareOfDelta, 0)}</TD>
                  </TR>
                ))}
                <TR className="bg-surface2/60 hover:bg-surface2/60">
                  <TD className="font-semibold text-ink-900">{t("bridge.totalChange")}</TD>
                  <TD numeric className={cn("font-semibold", bridge.delta >= 0 ? "text-positive" : "text-negative")}>{fmtSigned(bridge.delta)}</TD>
                  <TD numeric className="font-semibold text-ink-900">{bridge.change === null ? "—" : formatSignedPct(bridge.change)}</TD>
                  <TD numeric className="font-semibold text-ink-900">100%</TD>
                </TR>
              </TBody>
            </Table>
          </div>
        </Surface>
      </div>

      {/* Origin table */}
      <Surface padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">{t("bridge.where")}</h3>
            <p className="mt-0.5 text-xs text-ink-500">{t("bridge.where.sub", { basis: basisLabel })}</p>
          </div>
          <Segmented ariaLabel={t("bridge.where")} value={dim} onChange={setDim} options={DIMS.map((d) => ({ value: d, label: t(`bridge.dim.${d}` as "bridge.dim.channel") }))} />
        </div>
        <div className="mt-3">
          <Table dense>
            <THead>
              <TR>
                <TH>{t(`bridge.dim.${dim}` as "bridge.dim.channel")}</TH>
                <TH numeric>{baseLabel}</TH>
                <TH numeric>{currentLabel}</TH>
                <TH numeric>{t("bridge.delta")}</TH>
                <TH className="w-[22%]">
                  <span className="sr-only">{t("bridge.delta")}</span>
                </TH>
                <TH numeric>{t("where.change")}</TH>
                <TH numeric>
                  <span className="inline-flex items-center gap-1">
                    {t("bridge.contribution")} <InfoTip text={t("bridge.contribution.tip")} />
                  </span>
                </TH>
                <TH numeric>{t("bridge.shareOfDelta")}</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((r) => (
                <TR key={r.key}>
                  <TD>
                    <span className="font-medium text-ink-800">{r.key}</span>
                    {r.isNew && <Badge tone="accent" className="ml-2">{t("bridge.new")}</Badge>}
                    {r.isLost && <Badge tone="neutral" className="ml-2">{t("bridge.lost")}</Badge>}
                  </TD>
                  <TD numeric>{fmt(r.previous)}</TD>
                  <TD numeric>{fmt(r.current)}</TD>
                  <TD numeric className={cn("font-semibold", r.delta > 0 ? "text-positive" : "text-negative")}>{fmtSigned(r.delta)}</TD>
                  <TD>
                    <div className="relative h-2 w-full">
                      <span className="absolute left-1/2 top-0 h-full w-px bg-lineStrong" aria-hidden="true" />
                      <span
                        className={cn("absolute top-0 h-full rounded-sm", r.delta > 0 ? "bg-positive/70" : "bg-negative/70")}
                        style={r.delta > 0 ? { left: "50%", width: `${(Math.abs(r.delta) / maxAbs) * 50}%` } : { right: "50%", width: `${(Math.abs(r.delta) / maxAbs) * 50}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </TD>
                  <TD numeric>{r.isNew ? t("bridge.new") : r.change === null ? "—" : formatSignedPct(r.change)}</TD>
                  <TD numeric>{r.contributionPts === null ? "—" : formatPointsDelta(r.contributionPts, locale)}</TD>
                  <TD numeric>{r.shareOfDelta === null ? "—" : formatPct(r.shareOfDelta, 0)}</TD>
                </TR>
              ))}
              {Math.abs(restDelta) > 0.5 && (
                <TR>
                  <TD className="text-ink-500">{t("bridge.others", { n: rows.length - shown.length })}</TD>
                  <TD numeric colSpan={2} />
                  <TD numeric className={cn(restDelta > 0 ? "text-positive" : "text-negative")}>{fmtSigned(restDelta)}</TD>
                  <TD />
                  <TD numeric>—</TD>
                  <TD numeric>{formatPointsDelta(restDelta / Math.abs(bridge.base || 1), locale)}</TD>
                  <TD numeric>{formatPct(restDelta / Math.abs(bridge.delta || 1), 0)}</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </Surface>
    </div>
  );
}
