"use client";

import * as React from "react";
import {
  computeKpis,
  computeMoM,
  discountBands,
  groupBreakdown,
  hasLastYearData,
  inventoryRisks,
  monthlySeries,
  priceQuantity,
  promotionComparison,
  resolveComparison,
  resolvePeriod,
  returnRisks,
  salesTypeSplit,
  stockSales,
  type ComparisonWindow,
  type DiscountBand,
  type GroupMetrics,
  type InventoryRow,
  type KpiSet,
  type MonthPoint,
  type Period,
  type PriceQuantity,
  type PromotionCompare,
  type ReturnRow,
  type SalesTypeSplit,
  type StockSales,
} from "@/lib/analytics";
import { applyDateRange, applyDimensionFilters } from "@/lib/filters";
import type { ComparisonBasis, Filters, SalesRow } from "@/types";

export interface Analytics {
  totalRows: number;
  scopeRows: SalesRow[];
  currentRows: SalesRow[];
  isEmpty: boolean;
  period: Period | null;
  comparison: ComparisonWindow | null;
  lyAvailable: boolean;
  priorAvailable: boolean;
  kpis: KpiSet;
  monthly: MonthPoint[];
  hasLY: boolean;
  byBrand: GroupMetrics[];
  byProduct: GroupMetrics[];
  byChannel: GroupMetrics[];
  byChannelType: GroupMetrics[];
  salesType: SalesTypeSplit;
  priceQty: PriceQuantity;
  stock: StockSales;
  discount: DiscountBand[] | null;
  promo: PromotionCompare | null;
  returns: ReturnRow[];
  inventory: InventoryRow[] | null;
}

/** The single derivation pipeline. Memoized on the filter key so every
 *  consumer re-renders from one identical filtered slice. */
export function useAnalytics(
  rows: SalesRow[],
  filters: Filters,
  filterKey: string,
  basis: ComparisonBasis | "auto",
  dataMin: string,
  dataMax: string
): Analytics {
  return React.useMemo(() => {
    const scopeRows = applyDimensionFilters(rows, filters);
    const currentRows = applyDateRange(scopeRows, filters.dateFrom, filters.dateTo);
    const period = resolvePeriod(scopeRows, filters, dataMin, dataMax);

    const ly = period ? resolveComparison(scopeRows, period, "ly") : null;
    const prior = period ? resolveComparison(scopeRows, period, "prior") : null;
    const comparison = basis === "ly" ? ly : basis === "prior" ? prior : ly ?? prior;

    const mom = period ? computeMoM(scopeRows, period, dataMax) : null;
    const kpis = computeKpis(currentRows, comparison, mom);
    const monthly = monthlySeries(currentRows, scopeRows);
    const cmpRows = comparison?.rows ?? null;

    return {
      totalRows: rows.length,
      scopeRows,
      currentRows,
      isEmpty: currentRows.length === 0,
      period,
      comparison,
      lyAvailable: ly !== null,
      priorAvailable: prior !== null,
      kpis,
      monthly,
      hasLY: hasLastYearData(monthly),
      byBrand: groupBreakdown(currentRows, cmpRows, "brand"),
      byProduct: groupBreakdown(currentRows, cmpRows, "product"),
      byChannel: groupBreakdown(currentRows, cmpRows, "channel"),
      byChannelType: groupBreakdown(currentRows, cmpRows, "channelType"),
      salesType: salesTypeSplit(currentRows),
      priceQty: priceQuantity(currentRows),
      stock: stockSales(monthly),
      discount: discountBands(currentRows),
      promo: promotionComparison(currentRows),
      returns: returnRisks(currentRows),
      inventory: inventoryRisks(currentRows),
    };
    // filterKey is the stable identity of `filters`; the object itself is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterKey, basis, dataMin, dataMax]);
}
