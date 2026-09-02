"use client";

import * as React from "react";
import { RotateCcw, X } from "lucide-react";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { MultiSelect } from "@/components/filters/MultiSelect";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import type { FiltersApi } from "@/hooks/useFilters";
import { formatInt, formatMonthShort } from "@/lib/format";
import type { DimensionKey } from "@/types";

interface FilterBarProps {
  api: FiltersApi;
  dataMin: string;
  dataMax: string;
  shownRows: number;
  totalRows: number;
}

const DIMENSIONS: { key: DimensionKey; labelKey: "filters.brand" | "filters.product" | "filters.channel" | "filters.channelType" | "filters.salesType" }[] = [
  { key: "brands", labelKey: "filters.brand" },
  { key: "products", labelKey: "filters.product" },
  { key: "channels", labelKey: "filters.channel" },
  { key: "channelTypes", labelKey: "filters.channelType" },
  { key: "salesTypes", labelKey: "filters.salesType" },
];

/** One filter row above everything it scopes. All charts read the same slice. */
export function FilterBar({ api, dataMin, dataMax, shownRows, totalRows }: FilterBarProps) {
  const { t, locale } = useLocale();
  const { filters } = api;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: "date",
      label: `${t("filters.period")}: ${formatMonthShort((filters.dateFrom ?? dataMin).slice(0, 7), locale)} – ${formatMonthShort((filters.dateTo ?? dataMax).slice(0, 7), locale)}`,
      onRemove: () => api.setDateRange(null, null),
    });
  }
  for (const d of DIMENSIONS) {
    for (const v of filters[d.key]) {
      const label = api.options[d.key].find((o) => o.value === v)?.label ?? v;
      chips.push({ key: `${d.key}:${v}`, label: `${t(d.labelKey)}: ${label}`, onRemove: () => api.toggleValue(d.key, v) });
    }
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 border-b border-line bg-ground/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_auto]">
          <DateRangeFilter testId="filter-period" dataMin={dataMin} dataMax={dataMax} from={filters.dateFrom} to={filters.dateTo} onChange={api.setDateRange} />
          {DIMENSIONS.map((d) => (
            <MultiSelect
              key={d.key}
              label={t(d.labelKey)}
              options={api.options[d.key]}
              selected={filters[d.key]}
              onChange={(values) => api.setDimension(d.key, values)}
              note={d.key === "products" && api.productsNarrowedByBrand ? t("filters.narrowedByBrand") : undefined}
              testId={`filter-${d.key}`}
            />
          ))}
          <Button variant="secondary" size="md" onClick={api.reset} disabled={api.isEmpty} data-testid="reset-filters" className="h-9 col-span-2 md:col-span-1 xl:col-auto">
            <RotateCcw className="h-3.5 w-3.5" />
            {t("filters.reset")}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-ink-400">{chips.length ? t("filters.active") : t("filters.none")}</span>
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-chip border border-accent/25 bg-accentSoft px-2 py-0.5 text-[12px] font-medium text-accent">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`${t("filters.remove")} ${c.label}`} className="rounded-full hover:bg-accent/10 focus-ring">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="ml-auto tnum text-ink-500" data-testid="rows-shown">{t("filters.rowsShown", { a: formatInt(shownRows), b: formatInt(totalRows) })}</span>
        </div>
      </div>
    </div>
  );
}
