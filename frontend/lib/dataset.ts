/** Converts the columnar DatasetResponse into typed SalesRow objects once,
 *  right after loading. Everything downstream works on this array. */
import type { ColumnValue, DatasetResponse, SalesRow } from "@/types";

const num = (v: ColumnValue | undefined, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const numOrNull = (v: ColumnValue | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: ColumnValue | undefined, fallback = "Unknown"): string =>
  v === null || v === undefined || v === "" ? fallback : String(v);

export function toSalesRows(dataset: DatasetResponse): SalesRow[] {
  const c = dataset.columns;
  const n = dataset.row_count;
  const rows: SalesRow[] = new Array(n);
  const has = (k: string) => Array.isArray(c[k]);

  for (let i = 0; i < n; i++) {
    const date = str(c.date?.[i], "");
    const salesType = str(c.sales_type?.[i], "POS");
    const [y, m, d] = date.split("-").map(Number);
    rows[i] = {
      date,
      month: date.slice(0, 7),
      ts: date ? Date.UTC(y, (m || 1) - 1, d || 1) : 0,
      brand: str(c.brand?.[i]),
      product: str(c.product?.[i]),
      channel: str(c.sales_channel?.[i]),
      channelType: str(c.channel_type?.[i]),
      salesType,
      isShipment: salesType === "SHIPMENT",
      qty: num(c.qty?.[i]),
      returnQty: num(c.return_qty?.[i]),
      netQty: num(c.net_qty?.[i]),
      shipmentQty: has("shipment_qty") ? numOrNull(c.shipment_qty[i]) : null,
      netShipmentQty: has("net_shipment_qty") ? numOrNull(c.net_shipment_qty[i]) : null,
      volume: num(c.volume_units?.[i]),
      sellOut: num(c.sell_out_units?.[i]),
      sellIn: num(c.sell_in_units?.[i]),
      stock: has("stock_available") ? numOrNull(c.stock_available[i]) : null,
      price: num(c.sale_price?.[i]),
      cost: num(c.sale_cost?.[i]),
      discountPct: has("discount_pct") ? numOrNull(c.discount_pct[i]) : null,
      promoPct: has("promotion_pct") ? numOrNull(c.promotion_pct[i]) : null,
      grossSales: num(c.gross_sales?.[i]),
      discountAmt: num(c.discount_amt?.[i]),
      promoAmt: num(c.promotion_amt?.[i]),
      refundAmt: num(c.refund_amt?.[i]),
      netSales: num(c.net_sales?.[i]),
      cogs: num(c.cogs?.[i]),
      grossProfit: num(c.gross_profit?.[i]),
    };
  }
  return rows;
}

export function datasetHasField(dataset: DatasetResponse, field: string): boolean {
  return dataset.available_fields.includes(field);
}
