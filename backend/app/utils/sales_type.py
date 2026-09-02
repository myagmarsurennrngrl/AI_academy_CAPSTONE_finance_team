"""Canonical sales-type vocabulary.

Uploaded workbooks label the same business concept in many ways ("POS",
"Sell-out", "SELL_OUT", "Shipment", "Sell-in", ...). Every downstream
calculation distinguishes two concepts and must never mix them up:

* ``POS``      - sell-out: units actually sold to the end customer.
* ``SHIPMENT`` - sell-in: units shipped/invoiced into a channel or
                 distributor. Net shipment = shipment_qty - return_qty.

Anything unrecognised is kept verbatim (title-cased) so the user can still
filter on it; it is treated like sell-out for volume purposes and flagged in
the data-quality report.
"""
from __future__ import annotations

import re
from typing import Optional

POS = "POS"
SHIPMENT = "SHIPMENT"

_POS_ALIASES = {
    "pos",
    "sellout",
    "sell_out",
    "sell-out",
    "sell out",
    "retail",
    "retail_sale",
    "retail sale",
    "sale",
    "sales",
    "store",
    "b2c",
}
_SHIPMENT_ALIASES = {
    "shipment",
    "shipments",
    "ship",
    "shipped",
    "sellin",
    "sell_in",
    "sell-in",
    "sell in",
    "wholesale",
    "distribution",
    "distributor",
    "import",
    "delivery",
    "b2b",
}


def _key(value: object) -> str:
    s = str(value).strip().lower()
    s = re.sub(r"[\s\-]+", " ", s)
    return s


def normalize_sales_type(value: object) -> Optional[str]:
    """Returns ``POS``, ``SHIPMENT`` or a cleaned copy of the original label.
    ``None``/blank values return ``None``."""
    if value is None:
        return None
    if isinstance(value, float) and value != value:  # NaN
        return None
    key = _key(value)
    if not key or key == "nan":
        return None
    if key in _POS_ALIASES or key.replace(" ", "_") in _POS_ALIASES:
        return POS
    if key in _SHIPMENT_ALIASES or key.replace(" ", "_") in _SHIPMENT_ALIASES:
        return SHIPMENT
    return str(value).strip()


def is_shipment_label(value: object) -> bool:
    return normalize_sales_type(value) == SHIPMENT
