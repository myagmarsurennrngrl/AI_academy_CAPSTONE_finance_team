"use client";

import * as React from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Surface, TabList, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import type { Analytics } from "@/hooks/useAnalytics";
import type { DriverAnalysisState } from "@/hooks/useDriverAnalysis";
import type { InventoryRow } from "@/lib/analytics";
import { formatCompact, formatInt, formatNumber, formatPct } from "@/lib/format";
import { driverLabel } from "@/lib/i18n";
import type { DatasetResponse } from "@/types";

type Tab = "returns" | "quality" | "model";

export function Appendix({ analytics, dataset, drivers }: { analytics: Analytics; dataset: DatasetResponse; drivers: DriverAnalysisState }) {
  const { t } = useLocale();
  const [tab, setTab] = React.useState<Tab>("returns");
  return (
    <Surface padded={false}>
      <div className="px-5 pt-3">
        <TabList
          ariaLabel={t("section.appendix")}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "returns", label: t("appendix.returns") },
            { value: "quality", label: t("appendix.quality") },
            { value: "model", label: t("appendix.model") },
          ]}
        />
      </div>
      <div className="p-5">
        {tab === "returns" && <ReturnsInventory analytics={analytics} />}
        {tab === "quality" && <DataQuality dataset={dataset} />}
        {tab === "model" && <ModelDetails drivers={drivers} />}
      </div>
    </Surface>
  );
}

function ReturnsInventory({ analytics }: { analytics: Analytics }) {
  const { t, locale } = useLocale();
  const dimLabel = (d: string) => (d === "product" ? t("dim.product") : d === "brand" ? t("dim.brand") : t("dim.channel"));
  const low = analytics.inventory?.filter((r) => r.risk === "low_high") ?? [];
  const high = analytics.inventory?.filter((r) => r.risk === "high_low") ?? [];
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{t("returns.title")}</h3>
        <p className="mb-3 text-xs text-ink-500">{t("returns.sub")}</p>
        {analytics.returns.length === 0 ? (
          <p className="text-sm text-ink-400">{t("returns.none")}</p>
        ) : (
          <Table dense>
            <THead>
              <TR>
                <TH>{t("returns.name")}</TH>
                <TH>{t("returns.dimension")}</TH>
                <TH numeric>{t("returns.rate")}</TH>
                <TH numeric>{t("returns.units")}</TH>
                <TH numeric>{t("returns.refund")}</TH>
              </TR>
            </THead>
            <TBody>
              {analytics.returns.map((r) => (
                <TR key={`${r.dimension}-${r.name}`}>
                  <TD className="font-medium text-ink-800">{r.name}</TD>
                  <TD className="text-ink-500">{dimLabel(r.dimension)}</TD>
                  <TD numeric>
                    <Badge tone={r.rate > 0.05 ? "negative" : r.rate > 0.02 ? "warning" : "neutral"}>{formatPct(r.rate)}</Badge>
                  </TD>
                  <TD numeric>{formatInt(r.returned)}</TD>
                  <TD numeric>₮{formatCompact(r.refund, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      <div className="space-y-6">
        {analytics.inventory === null ? (
          <p className="text-sm text-ink-400">{t("why.stock.unavailable")}</p>
        ) : (
          <>
            <InventoryTable title={t("inventory.lowStock")} rows={low} tone="warning" />
            <InventoryTable title={t("inventory.highStock")} rows={high} tone="neutral" />
          </>
        )}
      </div>
    </div>
  );
}

function InventoryTable({ title, rows, tone }: { title: string; rows: InventoryRow[]; tone: "warning" | "neutral" }) {
  const { t } = useLocale();
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400">{t("inventory.none")}</p>
      ) : (
        <Table dense>
          <THead>
            <TR>
              <TH>{t("dim.product")}</TH>
              <TH numeric>{t("inventory.stock")}</TH>
              <TH numeric>{t("inventory.volume")}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.product}>
                <TD className="font-medium text-ink-800">{r.product}</TD>
                <TD numeric>
                  <Badge tone={tone}>{formatInt(r.avgStock)}</Badge>
                </TD>
                <TD numeric>{formatInt(r.volume)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function DataQuality({ dataset }: { dataset: DatasetResponse }) {
  const { t } = useLocale();
  const q = dataset.data_quality;
  const stats = [
    [t("quality.total"), q.total_rows],
    [t("quality.valid"), dataset.row_count],
    [t("quality.excluded"), dataset.excluded_rows],
    [t("quality.duplicates"), q.duplicate_rows],
    [t("quality.missing"), q.missing_value_count],
  ] as const;
  const severityTone = (s: string) => (s === "error" ? "negative" : s === "warning" ? "warning" : "neutral");
  const mapping = Object.entries(dataset.profile.column_mapping);
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-ctl border border-line bg-surface2/60 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tnum text-ink-900">{formatInt(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">{t("quality.issues")}</h3>
          {q.issues.length === 0 ? (
            <p className="text-sm text-ink-400">{t("quality.noIssues")}</p>
          ) : (
            <Table dense>
              <THead>
                <TR>
                  <TH>{t("quality.severity")}</TH>
                  <TH>{t("quality.field")}</TH>
                  <TH>{t("quality.message")}</TH>
                  <TH numeric>{t("quality.rows")}</TH>
                </TR>
              </THead>
              <TBody>
                {q.issues.map((i, idx) => (
                  <TR key={idx}>
                    <TD>
                      <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">{i.field ?? "—"}</TD>
                    <TD>{i.message}</TD>
                    <TD numeric>{i.affected_rows === null ? "—" : formatInt(i.affected_rows)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">{t("quality.corrections")}</h3>
          {q.auto_corrections.length === 0 ? (
            <p className="text-sm text-ink-400">{t("quality.noCorrections")}</p>
          ) : (
            <Table dense>
              <THead>
                <TR>
                  <TH>{t("quality.field")}</TH>
                  <TH>{t("quality.action")}</TH>
                  <TH numeric>{t("quality.rows")}</TH>
                </TR>
              </THead>
              <TBody>
                {q.auto_corrections.map((c, idx) => (
                  <TR key={idx}>
                    <TD className="font-mono text-xs">{c.field ?? "—"}</TD>
                    <TD>{c.action}</TD>
                    <TD numeric>{formatInt(c.affected_rows)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-ink-900">{t("quality.mapping")} ({mapping.length})</summary>
        <div className="mt-2 max-w-xl">
          <Table dense>
            <THead>
              <TR>
                <TH>{t("quality.source")}</TH>
                <TH>{t("quality.canonical")}</TH>
              </TR>
            </THead>
            <TBody>
              {mapping.map(([src, canonical]) => (
                <TR key={src}>
                  <TD>{src}</TD>
                  <TD className="font-mono text-xs">{canonical}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </details>
    </div>
  );
}

function ModelDetails({ drivers }: { drivers: DriverAnalysisState }) {
  const { t, locale } = useLocale();
  const d = drivers.data;
  if (!d) return <p className="text-sm text-ink-400">{drivers.loading ? t("why.drivers.loading") : t("why.drivers.unavailable")}</p>;
  const m = d.statistical_model;
  const cleanFeature = (f: string) => {
    const s = f.replace(/^num__/, "").replace(/^cat__/, "");
    const base = s.split("_")[0];
    const known = ["brand", "product", "sales", "channel", "month"];
    if (known.includes(base)) {
      const field = s.startsWith("sales_channel_") ? "sales_channel" : s.startsWith("channel_type_") ? "channel_type" : s.startsWith("sales_type_") ? "sales_type" : base;
      return `${driverLabel(locale, field)} = ${s.slice(field.length + 1)}`;
    }
    return driverLabel(locale, s);
  };
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          [t("model.type"), m.model_type ?? "—"],
          [t("model.target"), t("model.targetVolume")],
          [t("model.sample"), formatInt(m.sample_size)],
          [t("model.r2"), m.r2 === null ? "—" : formatNumber(m.r2, 3)],
          [t("model.mae"), m.mae === null ? "—" : formatNumber(m.mae, 1)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-ctl border border-line bg-surface2/60 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
      {m.model_status !== "ok" && <p className="text-sm text-ink-500">{t("model.insufficient")}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">{t("model.correlations")}</h3>
          <Table dense>
            <THead>
              <TR>
                <TH>{t("model.feature")}</TH>
                <TH numeric>ρ</TH>
                <TH numeric>r</TH>
                <TH numeric>n</TH>
              </TR>
            </THead>
            <TBody>
              {d.correlations.map((c) => (
                <TR key={c.field}>
                  <TD>{driverLabel(locale, c.field)}</TD>
                  <TD numeric>{c.spearman === null ? "—" : formatNumber(c.spearman, 2)}</TD>
                  <TD numeric>{c.pearson === null ? "—" : formatNumber(c.pearson, 2)}</TD>
                  <TD numeric>{formatInt(c.n)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">{t("model.coefficients")}</h3>
          <Table dense>
            <THead>
              <TR>
                <TH>{t("model.feature")}</TH>
                <TH numeric>{t("model.value")}</TH>
              </TR>
            </THead>
            <TBody>
              {m.coefficients.slice(0, 12).map((c) => (
                <TR key={c.feature}>
                  <TD>{cleanFeature(c.feature)}</TD>
                  <TD numeric>{formatNumber(c.standardized_coefficient, 2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">{t("model.permutation")}</h3>
          {m.permutation_importance.length === 0 ? (
            <p className="text-sm text-ink-400">—</p>
          ) : (
            <Table dense>
              <THead>
                <TR>
                  <TH>{t("model.feature")}</TH>
                  <TH numeric>{t("model.value")}</TH>
                </TR>
              </THead>
              <TBody>
                {m.permutation_importance.slice(0, 12).map((p) => (
                  <TR key={p.feature}>
                    <TD>{cleanFeature(p.feature)}</TD>
                    <TD numeric>{formatNumber(p.importance_mean, 3)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink-900">{t("model.notes")}</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-500">
          {d.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
