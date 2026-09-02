"""Derives canonical financial and volume fields (gross sales, COGS, net sales,
gross profit, sell-out vs sell-in volume, ...) from whatever subset of source
columns the uploaded workbook actually provides.

Centralized here because validation_service (consistency checks),
metric_service / driver_service (KPI + driver math) and dataset_service (the
row-level payload the dashboard filters on) all need the same derivation
logic and must never disagree with each other. The function is idempotent:
running it on an already-derived frame yields the same values.

Business vocabulary
-------------------
* ``net_qty``          = qty - return_qty                (sell-out, POS rows)
* ``net_shipment_qty`` = shipment_qty - return_qty       (sell-in, SHIPMENT rows)
* ``volume_units``     = net shipment for SHIPMENT rows, net_qty otherwise.
  This is the "sales quantity" the dashboard reports; it is never a blind sum
  of POS and shipment units without the split being shown alongside.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.utils.sales_type import SHIPMENT, normalize_sales_type


def _col(df: pd.DataFrame, name: str, default=0.0) -> pd.Series:
    if name in df.columns:
        return pd.to_numeric(df[name], errors="coerce").fillna(default)
    return pd.Series(default, index=df.index, dtype="float64")


def derive_core_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Returns a copy of df with guaranteed numeric canonical columns:
    net_qty, gross_sales, discount_amt, promotion_amt, refund_amt,
    net_sales_derived, cogs, gross_profit, gross_margin_pct_row, plus the
    volume split: is_shipment, net_shipment_qty, volume_units,
    sell_out_units, sell_in_units. Uses provided monetary columns when
    present, otherwise derives them from qty/price/percent fields.
    """
    out = df.copy()

    qty = _col(out, "qty")
    sale_price = _col(out, "sale_price")
    sale_cost = _col(out, "sale_cost")
    return_qty = _col(out, "return_qty")
    discount_pct = _col(out, "discount_pct")
    promotion_pct = _col(out, "promotion_pct")
    return_qty_units = _col(out, "return_qty_units") if "return_qty_units" in out.columns else return_qty

    # net_qty: prefer supplied column, else qty - return_qty
    if "net_qty" in out.columns:
        net_qty = pd.to_numeric(out["net_qty"], errors="coerce")
        net_qty = net_qty.fillna(qty - return_qty)
    else:
        net_qty = qty - return_qty
    out["net_qty"] = net_qty

    # gross sales: prefer total_sales column, else qty * sale_price
    if "total_sales" in out.columns:
        gross_sales = pd.to_numeric(out["total_sales"], errors="coerce")
        gross_sales = gross_sales.fillna(qty * sale_price)
    else:
        gross_sales = qty * sale_price
    out["gross_sales"] = gross_sales

    # discount amount: prefer explicit column, else qty*sale_price*discount_pct
    if "discount" in out.columns:
        discount_amt = pd.to_numeric(out["discount"], errors="coerce")
        discount_amt = discount_amt.fillna(gross_sales * discount_pct)
    else:
        discount_amt = gross_sales * discount_pct
    out["discount_amt"] = discount_amt

    # promotion amount
    if "promotion" in out.columns:
        promotion_amt = pd.to_numeric(out["promotion"], errors="coerce")
        promotion_amt = promotion_amt.fillna(gross_sales * promotion_pct)
    else:
        promotion_amt = gross_sales * promotion_pct
    out["promotion_amt"] = promotion_amt

    # refund amount: prefer explicit column, else sale_price_net/sale_price * returned units
    unit_price_for_refund = _col(out, "sale_price_net") if "sale_price_net" in out.columns else sale_price
    if "refund_amount" in out.columns:
        refund_amt = pd.to_numeric(out["refund_amount"], errors="coerce")
        refund_amt = refund_amt.fillna(unit_price_for_refund * return_qty_units)
    else:
        refund_amt = unit_price_for_refund * return_qty_units
    out["refund_amt"] = refund_amt

    # net sales: prefer explicit column, else gross - discount - promotion - refund
    if "net_sales" in out.columns:
        net_sales = pd.to_numeric(out["net_sales"], errors="coerce")
        net_sales = net_sales.fillna(gross_sales - discount_amt - promotion_amt - refund_amt)
    else:
        net_sales = gross_sales - discount_amt - promotion_amt - refund_amt
    out["net_sales_derived"] = net_sales

    # COGS / profit
    out["cogs"] = sale_cost * out["net_qty"]
    out["gross_profit"] = out["net_sales_derived"] - out["cogs"]
    with np.errstate(divide="ignore", invalid="ignore"):
        margin = np.where(
            out["net_sales_derived"] != 0,
            out["gross_profit"] / out["net_sales_derived"],
            0.0,
        )
    out["gross_margin_pct_row"] = margin

    # --- sell-out (POS) vs sell-in (SHIPMENT) volume split -------------------
    if "sales_type" in out.columns:
        out["sales_type"] = out["sales_type"].map(normalize_sales_type)
        is_shipment = out["sales_type"] == SHIPMENT
    else:
        is_shipment = pd.Series(False, index=out.index)
    out["is_shipment"] = is_shipment.astype(bool)

    if "shipment_qty" in out.columns:
        shipment_qty = pd.to_numeric(out["shipment_qty"], errors="coerce")
        net_shipment = (shipment_qty - return_qty).where(out["is_shipment"])
    else:
        net_shipment = pd.Series(np.nan, index=out.index, dtype="float64")
    out["net_shipment_qty"] = net_shipment

    net_qty_f = out["net_qty"].astype("float64")
    net_shipment_f = out["net_shipment_qty"].astype("float64")
    has_net_shipment = net_shipment_f.notna()
    out["volume_units"] = np.where(has_net_shipment, net_shipment_f, net_qty_f)
    out["sell_out_units"] = np.where(out["is_shipment"], 0.0, net_qty_f)
    out["sell_in_units"] = np.where(out["is_shipment"], out["volume_units"], 0.0)

    return out
