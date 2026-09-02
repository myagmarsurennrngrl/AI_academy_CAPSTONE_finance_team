"use client";

import * as React from "react";
import { EMPTY_FILTERS, countActiveFilters, filterKey, filtersReducer, isFiltersEmpty, toFilterSpec } from "@/lib/filters";
import type { DatasetDimensions, DimensionKey, Filters, FilterSpec } from "@/types";

export interface DimensionOption {
  value: string;
  label: string;
  hint?: string;
}

export interface FiltersApi {
  filters: Filters;
  spec: FilterSpec;
  key: string;
  isEmpty: boolean;
  activeCount: number;
  setDimension: (key: DimensionKey, values: string[]) => void;
  toggleValue: (key: DimensionKey, value: string) => void;
  clearDimension: (key: DimensionKey) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  reset: () => void;
  options: Record<DimensionKey, DimensionOption[]>;
  productsNarrowedByBrand: boolean;
}

export function useFilters(dimensions: DatasetDimensions | null): FiltersApi {
  const [filters, dispatch] = React.useReducer(filtersReducer, EMPTY_FILTERS);

  const key = React.useMemo(() => filterKey(filters), [filters]);
  const spec = React.useMemo(() => toFilterSpec(filters), [filters]);

  // Dependent options: products narrow to the selected brands, but any
  // product the user already selected stays visible so it is never silently
  // dropped from the control.
  const options = React.useMemo<Record<DimensionKey, DimensionOption[]>>(() => {
    const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));
    if (!dimensions) return { brands: [], products: [], channels: [], channelTypes: [], salesTypes: [] };
    let products = dimensions.products;
    if (filters.brands.length) {
      const allowed = new Set<string>();
      for (const b of filters.brands) for (const p of dimensions.brand_products[b] ?? []) allowed.add(p);
      for (const p of filters.products) allowed.add(p);
      products = dimensions.products.filter((p) => allowed.has(p));
    }
    const productOptions: DimensionOption[] = products.map((p) => {
      const brand = Object.keys(dimensions.brand_products).find((b) => dimensions.brand_products[b].includes(p));
      return { value: p, label: p, hint: brand && dimensions.brands.length > 1 ? brand : undefined };
    });
    const salesTypeLabel = (v: string) => (v === "POS" ? "Sell-out (POS)" : v === "SHIPMENT" ? "Sell-in (Shipment)" : v);
    return {
      brands: toOptions(dimensions.brands),
      products: productOptions,
      channels: toOptions(dimensions.channels),
      channelTypes: toOptions(dimensions.channel_types),
      salesTypes: dimensions.sales_types.map((v) => ({ value: v, label: salesTypeLabel(v) })),
    };
  }, [dimensions, filters.brands, filters.products]);

  return {
    filters,
    spec,
    key,
    isEmpty: isFiltersEmpty(filters),
    activeCount: countActiveFilters(filters),
    setDimension: React.useCallback((k, values) => dispatch({ type: "setDimension", key: k, values }), []),
    toggleValue: React.useCallback((k, value) => dispatch({ type: "toggleValue", key: k, value }), []),
    clearDimension: React.useCallback((k) => dispatch({ type: "clearDimension", key: k }), []),
    setDateRange: React.useCallback((from, to) => dispatch({ type: "setDateRange", from, to }), []),
    reset: React.useCallback(() => dispatch({ type: "reset" }), []),
    options,
    productsNarrowedByBrand: filters.brands.length > 0,
  };
}
