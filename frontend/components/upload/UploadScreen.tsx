"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Spinner, Surface, Table, TBody, TD, TH, THead, TR, buttonClasses } from "@/components/ui/primitives";
import type { DatasetState } from "@/hooks/useDataset";
import { sampleDownloadUrl } from "@/lib/api";
import { formatBytes, formatDateRange, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  state: DatasetState;
  onFile: (file: File) => void;
  onOpen: () => void;
  onReset: () => void;
}

const REQUIRED: { field: string; mn: string; en: string }[] = [
  { field: "date", mn: "Борлуулалтын огноо", en: "Transaction date" },
  { field: "brand", mn: "Брэнд", en: "Brand" },
  { field: "product", mn: "Бүтээгдэхүүн / SKU", en: "Product / SKU" },
  { field: "qty", mn: "Борлуулсан тоо хэмжээ", en: "Quantity sold" },
  { field: "sale_price", mn: "Нэгжийн худалдах үнэ", en: "Unit selling price" },
  { field: "sale_cost", mn: "Нэгжийн өртөг", en: "Unit cost" },
  { field: "sales_channel", mn: "Борлуулалтын суваг", en: "Sales channel" },
  { field: "channel_type", mn: "Сувгийн төрөл", en: "Channel type" },
  { field: "sales_type", mn: "POS (sell-out) / Shipment (sell-in)", en: "POS (sell-out) / Shipment (sell-in)" },
  { field: "return_qty", mn: "Буцаалтын тоо", en: "Returned quantity" },
  { field: "net_qty", mn: "Цэвэр тоо хэмжээ (qty − буцаалт)", en: "Net quantity (qty − returns)" },
  { field: "stock_available", mn: "Боломжит үлдэгдэл", en: "Stock available" },
];
const OPTIONAL: { field: string; mn: string; en: string }[] = [
  { field: "shipment_qty", mn: "Ачилтын тоо (цэвэр ачилт = ачилт − буцаалт)", en: "Shipment quantity (net shipment = shipment − returns)" },
  { field: "discount_pct", mn: "Хөнгөлөлтийн хувь", en: "Discount %" },
  { field: "promotion_pct", mn: "Урамшууллын хувь", en: "Promotion %" },
  { field: "total_sales", mn: "Нийт борлуулалт (дүн)", en: "Gross sales amount" },
  { field: "discount", mn: "Хөнгөлөлтийн дүн", en: "Discount amount" },
  { field: "promotion", mn: "Урамшууллын дүн", en: "Promotion amount" },
  { field: "refund_amount", mn: "Буцаалтын дүн", en: "Refund amount" },
  { field: "net_sales", mn: "Цэвэр борлуулалтын орлого", en: "Net sales amount" },
  { field: "sale_price_net", mn: "Хөнгөлөлтийн дараах нэгж үнэ", en: "Net unit price after discount" },
];

export function UploadScreen({ state, onFile, onOpen, onReset }: Props) {
  const { t, locale } = useLocale();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const { status } = state;
  const busy = status === "uploading" || status === "preparing";
  const profile = state.upload?.profile ?? null;
  const dataset = state.dataset;

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-14">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">{t("upload.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">{t("upload.lead")}</p>
        <ol className="mx-auto mt-5 flex max-w-sm items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          {[t("upload.step1"), t("upload.step2"), t("upload.step3")].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px] tnum", i === 0 || (i === 1 && status !== "idle") || (i === 2 && status === "ready") ? "border-accent bg-accentSoft text-accent" : "border-line text-ink-400")}>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <Surface className="mt-8" padded={false}>
        {status === "idle" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={cn("m-3 flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-14 text-center transition-colors", drag ? "border-accent bg-accentSoft/50" : "border-line bg-surface2/40")}
          >
            <UploadCloud className="h-8 w-8 text-ink-400" aria-hidden="true" />
            <p className="mt-3 text-sm text-ink-700">
              {t("upload.drop")}{" "}
              <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline focus-ring rounded" onClick={() => inputRef.current?.click()}>
                {t("upload.browse")}
              </button>
            </p>
            <p className="mt-1 text-xs text-ink-400">{t("upload.formats")}</p>
            <a href={sampleDownloadUrl()} download className={buttonClasses("secondary", "sm", "mt-5")}>
              <Download className="h-3.5 w-3.5" />
              {t("upload.sample")}
            </a>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              aria-label={t("upload.browse")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-center justify-between gap-3 rounded-ctl border border-line bg-surface2/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{state.fileName}</p>
                  <p className="text-xs text-ink-400">{formatBytes(state.fileSize)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {busy && (
                  <Badge tone="accent">
                    <Spinner className="h-3 w-3" /> {status === "uploading" ? t("upload.processing") : t("upload.preparing")}
                  </Badge>
                )}
                {status === "ready" && (
                  <Badge tone="positive">
                    <CheckCircle2 className="h-3 w-3" /> {t("upload.ready")}
                  </Badge>
                )}
                {status === "blocked" && (
                  <Badge tone="negative">
                    <AlertTriangle className="h-3 w-3" /> {t("upload.blocked")}
                  </Badge>
                )}
                {status === "error" && (
                  <Badge tone="negative">
                    <AlertTriangle className="h-3 w-3" /> {t("upload.invalid")}
                  </Badge>
                )}
                <button type="button" onClick={onReset} aria-label={t("upload.replace")} className="rounded-full p-1 text-ink-400 hover:bg-line hover:text-ink-700 focus-ring">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {status === "error" && state.errorKey && (
              <div role="alert" data-testid="upload-error" className="mt-3 flex items-start gap-2 rounded-ctl border border-negative/25 bg-negativeSoft px-4 py-3 text-sm text-negative">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t(state.errorKey)}</p>
              </div>
            )}

            {status === "blocked" && profile && (
              <div role="alert" data-testid="upload-blocked" className="mt-3 rounded-ctl border border-negative/25 bg-negativeSoft px-4 py-3 text-sm text-negative">
                <p className="font-semibold">{t("upload.missingRequired")}</p>
                <p className="mt-1 font-mono text-xs">{profile.missing_required_fields.join(", ")}</p>
              </div>
            )}

            {profile && status !== "error" && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label={t("upload.rows")} value={formatInt(dataset?.row_count ?? profile.rows)} />
                <Stat label={t("upload.period")} value={formatDateRange(profile.date_min, profile.date_max, locale)} wide />
                <Stat label={t("upload.months")} value={dataset ? String(dataset.dimensions.months.length) : "—"} />
                <Stat label={t("upload.brands")} value={String(profile.brands)} />
                <Stat label={t("upload.products")} value={String(profile.products)} />
                <Stat label={t("upload.channels")} value={String(profile.channels)} />
              </div>
            )}

            {profile && status !== "error" && (
              <div className="mt-4 space-y-2 text-xs">
                <p className="text-ink-500">
                  <span className="font-semibold text-ink-700">{t("upload.columnsDetected")}:</span>{" "}
                  <span className="font-mono">{Object.values(profile.column_mapping).filter((c) => REQUIRED.concat(OPTIONAL).some((f) => f.field === c)).join(", ")}</span>
                </p>
                {profile.missing_recommended_fields.length > 0 && (
                  <p className="text-ink-400">
                    <span className="font-semibold text-ink-500">{t("upload.missingOptional")}:</span> <span className="font-mono">{profile.missing_recommended_fields.join(", ")}</span>
                  </p>
                )}
                {profile.unmapped_columns.length > 0 && (
                  <p className="text-ink-400">
                    <span className="font-semibold text-ink-500">{t("upload.unmapped")}:</span> <span className="font-mono">{profile.unmapped_columns.join(", ")}</span>
                  </p>
                )}
                {dataset && dataset.excluded_rows > 0 && (
                  <p className="text-warning">
                    {t("upload.excludedRows")}: {formatInt(dataset.excluded_rows)}
                  </p>
                )}
                {dataset && (
                  <p className="text-ink-500">
                    <span className="font-semibold text-ink-700">{t("upload.validation")}:</span> {dataset.data_quality.issues.length === 0 ? t("quality.noIssues") : `${dataset.data_quality.issues.length} ${t("quality.issues").toLowerCase()}`}
                    {dataset.data_quality.auto_corrections.length > 0 && ` · ${dataset.data_quality.auto_corrections.length} ${t("quality.corrections").toLowerCase()}`}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" onClick={onReset}>
                {t("upload.replace")}
              </Button>
              <Button onClick={onOpen} disabled={status !== "ready"} loading={busy} data-testid="open-dashboard">
                {t("upload.open")}
              </Button>
            </div>
          </div>
        )}
      </Surface>

      <details className="mt-6 rounded-card border border-line bg-surface shadow-card" open={status === "idle" || status === "blocked"}>
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ink-900">{t("upload.guide.title")}</summary>
        <div className="space-y-5 border-t border-line px-5 py-4">
          <p className="text-xs text-ink-500">{t("upload.guide.lead")}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <FieldTable title={t("upload.guide.required")} rows={REQUIRED} />
            <FieldTable title={t("upload.guide.optional")} rows={OPTIONAL} />
          </div>
          <p className="text-xs leading-relaxed text-ink-400">{t("upload.guide.note")}</p>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("rounded-ctl border border-line bg-surface2/60 px-3 py-2", wide && "col-span-2")}>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="truncate text-sm font-semibold tnum text-ink-900">{value}</p>
    </div>
  );
}

function FieldTable({ title, rows }: { title: string; rows: { field: string; mn: string; en: string }[] }) {
  const { t, locale } = useLocale();
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <Table dense>
        <THead>
          <TR>
            <TH>{t("upload.guide.field")}</TH>
            <TH>{t("upload.guide.description")}</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.field}>
              <TD className="font-mono text-xs text-ink-800">{r.field}</TD>
              <TD className="text-ink-600">{locale === "mn" ? r.mn : r.en}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
