"""
Normalizes arbitrary Excel column headers into canonical internal field names.

The uploaded workbook is not guaranteed to use consistent naming ("Discount ",
"Total Sales", "Refund %", ...). This module turns whatever the user's sheet
calls a column into one of the CANONICAL_COLUMNS names used throughout the
backend, so every downstream service can rely on a single vocabulary.
"""
import re
from typing import Dict, List, Tuple

# The full set of fields the analytical pipeline understands.
CANONICAL_COLUMNS = [
    "date",
    "brand",
    "product",
    "qty",
    "sale_price",
    "sale_cost",
    "sales_channel",
    "channel_type",
    "sales_type",
    "shipment_qty",
    "return_qty",
    "net_qty",
    "stock_available",
    "discount_pct",
    "promotion_pct",
    "return_qty_units",
    "sale_price_net",
    "total_sales",
    "discount",
    "promotion",
    "refund_amount",
    "net_sales",
]

REQUIRED_CORE_FIELDS = [
    "date",
    "brand",
    "product",
    "qty",
    "sale_price",
    "sale_cost",
    "sales_channel",
    "channel_type",
    "sales_type",
    "return_qty",
    "net_qty",
    "stock_available",
]

RECOMMENDED_DRIVER_FIELDS = [
    "discount_pct",
    "promotion_pct",
    "shipment_qty",
    "return_qty_units",
    "sale_price_net",
    "total_sales",
    "discount",
    "promotion",
    "refund_amount",
    "net_sales",
]

# Direct alias -> canonical mapping. Keys are already lightly normalized
# (lowercase, trimmed, single-underscore separated, "%" and "#" stripped)
# before this table is consulted, so we only need to cover the remaining
# ambiguous / renamed cases here.
_ALIAS_MAP: Dict[str, str] = {
    # date
    "date": "date",
    "sale_date": "date",
    "transaction_date": "date",
    "order_date": "date",
    # brand / product
    "brand": "brand",
    "brand_name": "brand",
    "product": "product",
    "product_name": "product",
    "sku": "product",
    "item": "product",
    # quantities
    "qty": "qty",
    "quantity": "qty",
    "sold_qty": "qty",
    "units_sold": "qty",
    "shipment_qty": "shipment_qty",
    "shipped_qty": "shipment_qty",
    "shipment_quantity": "shipment_qty",
    "return_qty": "return_qty",
    "returned_qty": "return_qty",
    "return_quantity": "return_qty",
    "return_qty_units": "return_qty_units",
    "returned_units": "return_qty_units",
    "net_qty": "net_qty",
    "net_quantity": "net_qty",
    "net_units": "net_qty",
    # price / cost
    "sale_price": "sale_price",
    "unit_price": "sale_price",
    "price": "sale_price",
    "sale_cost": "sale_cost",
    "unit_cost": "sale_cost",
    "cost": "sale_cost",
    "sale_price_net": "sale_price_net",
    "net_price": "sale_price_net",
    "net_unit_price": "sale_price_net",
    # channel / type
    "sales_channel": "sales_channel",
    "channel": "sales_channel",
    "channel_type": "channel_type",
    "sales_type": "sales_type",
    "sale_type": "sales_type",
    "order_type": "sales_type",
    # stock
    "stock_available": "stock_available",
    "available_stock": "stock_available",
    "stock_on_hand": "stock_available",
    "inventory": "stock_available",
    # discount / promotion (percentages)
    "discount_pct": "discount_pct",
    "discount_percent": "discount_pct",
    "discount_percentage": "discount_pct",
    "promotion_pct": "promotion_pct",
    "promotion_percent": "promotion_pct",
    "promo_pct": "promotion_pct",
    # money amounts
    "total_sales": "total_sales",
    "gross_sales": "total_sales",
    "discount": "discount",
    "discount_amount": "discount",
    "promotion": "promotion",
    "promotion_amount": "promotion",
    "promo": "promotion",
    # NOTE: a column literally named "Refund %" in the sample dataset is,
    # on inspection of its values, a monetary refund amount rather than a
    # true percentage (values are currency-scale, not 0-1 or 0-100 ratios).
    # We therefore map it to the monetary canonical field, per spec section 44.
    "refund": "refund_amount",
    "refund_amount": "refund_amount",
    "refund_pct": "refund_amount",
    "net_sales": "net_sales",
    "net_revenue": "net_sales",
}


def _basic_normalize(raw: str) -> str:
    """lowercase, trim, strip a trailing '%'/'#', collapse whitespace/punct to '_'."""
    if raw is None:
        return ""
    s = str(raw).strip()
    s = s.replace("%", " pct ")
    s = s.replace("#", " num ")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    return s


def normalize_column_name(raw: str) -> str:
    """Return the canonical field name for a raw header, or the normalized
    (but unmapped) name if no alias is known."""
    key = _basic_normalize(raw)
    if key in _ALIAS_MAP:
        return _ALIAS_MAP[key]
    # try again without a trailing "_pct" in case it was appended from '%'
    if key.endswith("_pct") and key[:-4] in _ALIAS_MAP:
        return _ALIAS_MAP[key[:-4]]
    return key


def build_column_mapping(raw_columns: List[str]) -> Tuple[Dict[str, str], List[str]]:
    """
    Maps every raw column header to a canonical name.

    Returns:
        mapping: {raw_column_name: canonical_name}
        unmapped: canonical names that were produced but are not part of
                  CANONICAL_COLUMNS (i.e. unknown/extra columns kept as-is)
    """
    mapping: Dict[str, str] = {}
    unmapped: List[str] = []
    seen_canonical: Dict[str, str] = {}

    for raw in raw_columns:
        canonical = normalize_column_name(raw)
        if canonical in seen_canonical and canonical in CANONICAL_COLUMNS:
            # duplicate column mapping to the same canonical field - keep first,
            # rename subsequent occurrences to avoid silent overwrite
            canonical = f"{canonical}_dup_{raw}"
        mapping[raw] = canonical
        seen_canonical[canonical] = raw
        if canonical not in CANONICAL_COLUMNS:
            unmapped.append(canonical)

    return mapping, unmapped


def missing_required_fields(available_canonical_columns: List[str]) -> List[str]:
    available = set(available_canonical_columns)
    return [f for f in REQUIRED_CORE_FIELDS if f not in available]
