"""Sales-driver statistical analysis (spec sections 10-20).

Everything here is deterministic (pandas / numpy / scipy / scikit-learn).
No AI call happens in this module - its output is exactly the structured
evidence that later gets summarized (not recalculated) by Claude.

Vocabulary discipline: this module only ever describes *association*
(correlation, group contribution, permutation importance), never causation.
"""
from __future__ import annotations

import warnings
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.models.schemas import (
    DiscountBandRow,
    DriverEvidence,
    GroupAnalysisRow,
    InventoryRiskRow,
    PromotionComparisonRow,
    ReturnRiskRow,
    StatisticalModelResult,
)
from app.utils.derive import derive_core_fields
from app.utils.formatting import safe_div

NUMERIC_DRIVERS = [
    "qty",
    "sale_price",
    "sale_cost",
    "sale_price_net",
    "discount_pct",
    "promotion_pct",
    "return_qty",
    "net_qty",
    "stock_available",
]
CATEGORICAL_DRIVERS = ["brand", "product", "sales_channel", "channel_type", "sales_type"]

MIN_ROWS_RIDGE = 30
MIN_ROWS_RF = 80
TOP_N = 10
MAX_CATEGORY_LEVELS = 20


def prepare_derived_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Adds the derived financial columns (net_sales, gross_profit, ...) that
    every driver-analysis function below relies on."""
    d = derive_core_fields(df)
    d["net_sales"] = d["net_sales_derived"]
    return d


# ---------------------------------------------------------------------------
# Correlation analysis
# ---------------------------------------------------------------------------

def compute_correlations(d: pd.DataFrame) -> List[Dict]:
    results = []
    target = pd.to_numeric(d["net_sales"], errors="coerce")
    for field in NUMERIC_DRIVERS:
        if field not in d.columns:
            continue
        series = pd.to_numeric(d[field], errors="coerce")
        paired = pd.concat([series, target], axis=1).dropna()
        n = len(paired)
        pearson = spearman = None
        if n >= 3 and paired.iloc[:, 0].std() > 0 and paired.iloc[:, 1].std() > 0:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pearson = float(stats.pearsonr(paired.iloc[:, 0], paired.iloc[:, 1])[0])
                spearman = float(stats.spearmanr(paired.iloc[:, 0], paired.iloc[:, 1])[0])
        results.append({"field": field, "pearson": pearson, "spearman": spearman, "n": n})
    return results


# ---------------------------------------------------------------------------
# Group contribution analysis
# ---------------------------------------------------------------------------

def compute_group_analysis(d: pd.DataFrame, group_field: str, top_n: int = TOP_N) -> List[GroupAnalysisRow]:
    if group_field not in d.columns:
        return []
    total_net_sales = float(d["net_sales"].sum())
    grouped = d.groupby(group_field, dropna=True).agg(
        net_sales=("net_sales", "sum"),
        net_qty=("net_qty", "sum"),
        gross_profit=("gross_profit", "sum"),
        return_qty=("return_qty", "sum") if "return_qty" in d.columns else ("net_qty", "sum"),
        qty=("qty", "sum") if "qty" in d.columns else ("net_qty", "sum"),
        discount_pct=("discount_pct", "mean") if "discount_pct" in d.columns else ("net_qty", "mean"),
        promotion_pct=("promotion_pct", "mean") if "promotion_pct" in d.columns else ("net_qty", "mean"),
    )
    grouped = grouped.sort_values("net_sales", ascending=False).head(top_n)

    rows = []
    for name, r in grouped.iterrows():
        gross_margin_pct = safe_div(r["gross_profit"], r["net_sales"])
        return_rate_pct = safe_div(r.get("return_qty", 0), r.get("qty", 0)) if "return_qty" in d.columns else 0.0
        rows.append(
            GroupAnalysisRow(
                group=str(name),
                net_sales=float(r["net_sales"]),
                share_of_sales_pct=safe_div(float(r["net_sales"]), total_net_sales),
                net_qty=float(r["net_qty"]),
                gross_profit=float(r["gross_profit"]),
                gross_margin_pct=gross_margin_pct,
                return_rate_pct=return_rate_pct,
                avg_discount_pct=float(r["discount_pct"]) if not pd.isna(r["discount_pct"]) else 0.0,
                avg_promotion_pct=float(r["promotion_pct"]) if not pd.isna(r["promotion_pct"]) else 0.0,
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Promotion effect (section 13)
# ---------------------------------------------------------------------------

def compute_promotion_comparison(d: pd.DataFrame) -> List[PromotionComparisonRow]:
    if "promotion_amt" not in d.columns:
        return []
    promoted_mask = d["promotion_amt"] > 0
    rows = []
    for label, mask in (("promoted", promoted_mask), ("non_promoted", ~promoted_mask)):
        subset = d[mask]
        if subset.empty:
            continue
        avg_units = float(subset["net_qty"].mean())
        avg_net_sales = float(subset["net_sales"].mean())
        avg_gross_profit = float(subset["gross_profit"].mean())
        avg_margin = safe_div(float(subset["gross_profit"].sum()), float(subset["net_sales"].sum()))
        avg_price = safe_div(float(subset["gross_sales"].sum()), float(subset["qty"].sum())) if "qty" in subset.columns else 0.0
        return_rate = (
            safe_div(float(subset["return_qty"].sum()), float(subset["qty"].sum()))
            if "return_qty" in subset.columns and "qty" in subset.columns
            else 0.0
        )
        rows.append(
            PromotionComparisonRow(
                group=label,
                avg_net_sales=avg_net_sales,
                avg_units=avg_units,
                avg_selling_price=avg_price,
                avg_gross_profit=avg_gross_profit,
                avg_gross_margin_pct=avg_margin,
                return_rate_pct=return_rate,
                row_count=int(len(subset)),
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Discount bands (section 14)
# ---------------------------------------------------------------------------

def compute_discount_bands(d: pd.DataFrame) -> List[DiscountBandRow]:
    if "discount_pct" not in d.columns:
        return []
    bins = [-0.001, 0.0, 0.05, 0.10, 0.15, np.inf]
    labels = ["0%", "0-5%", "5-10%", "10-15%", "15%+"]
    band = pd.cut(d["discount_pct"].fillna(0.0), bins=bins, labels=labels)
    grouped = d.groupby(band, observed=True).agg(
        net_sales=("net_sales", "sum"),
        net_qty=("net_qty", "sum"),
        gross_profit=("gross_profit", "sum"),
        row_count=("net_sales", "count"),
    )
    rows = []
    for label in labels:
        if label not in grouped.index:
            continue
        r = grouped.loc[label]
        if r["row_count"] == 0:
            continue
        rows.append(
            DiscountBandRow(
                band=label,
                net_sales=float(r["net_sales"]),
                net_qty=float(r["net_qty"]),
                gross_profit=float(r["gross_profit"]),
                gross_margin_pct=safe_div(float(r["gross_profit"]), float(r["net_sales"])),
                row_count=int(r["row_count"]),
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Returns analysis (section 16)
# ---------------------------------------------------------------------------

def compute_return_risk(d: pd.DataFrame, top_n: int = TOP_N) -> List[ReturnRiskRow]:
    rows: List[ReturnRiskRow] = []
    if "return_qty" not in d.columns or "qty" not in d.columns:
        return rows
    for dim, field in (("product", "product"), ("brand", "brand"), ("channel", "sales_channel")):
        if field not in d.columns:
            continue
        grouped = d.groupby(field, dropna=True).agg(
            qty=("qty", "sum"),
            return_qty=("return_qty", "sum"),
            refund_amt=("refund_amt", "sum"),
            net_sales=("net_sales", "sum"),
        )
        grouped = grouped[grouped["qty"] > 0]
        grouped["return_rate"] = grouped["return_qty"] / grouped["qty"]
        top = grouped.sort_values("return_rate", ascending=False).head(top_n)
        for name, r in top.iterrows():
            rows.append(
                ReturnRiskRow(
                    name=str(name),
                    dimension=dim,  # type: ignore[arg-type]
                    return_rate_pct=float(r["return_rate"]),
                    returned_units=float(r["return_qty"]),
                    refund_amount=float(r["refund_amt"]),
                    net_sales=float(r["net_sales"]),
                )
            )
    return rows


# ---------------------------------------------------------------------------
# Inventory risk (section 17)
# ---------------------------------------------------------------------------

def compute_inventory_risk(d: pd.DataFrame, top_n: int = TOP_N) -> List[InventoryRiskRow]:
    if "stock_available" not in d.columns or "product" not in d.columns:
        return []
    grouped = d.groupby("product", dropna=True).agg(
        stock_available=("stock_available", "mean"),
        net_qty=("net_qty", "sum"),
    )
    if grouped.empty:
        return []
    stock_median = grouped["stock_available"].median()
    sales_median = grouped["net_qty"].median()

    low_stock_high_sales = grouped[
        (grouped["stock_available"] <= stock_median) & (grouped["net_qty"] >= sales_median)
    ].sort_values("net_qty", ascending=False).head(top_n)

    high_stock_low_sales = grouped[
        (grouped["stock_available"] > stock_median) & (grouped["net_qty"] < sales_median)
    ].sort_values("stock_available", ascending=False).head(top_n)

    rows: List[InventoryRiskRow] = []
    for name, r in low_stock_high_sales.iterrows():
        rows.append(
            InventoryRiskRow(
                product=str(name),
                stock_available=float(r["stock_available"]),
                net_qty=float(r["net_qty"]),
                risk="low_stock_high_sales",
            )
        )
    for name, r in high_stock_low_sales.iterrows():
        rows.append(
            InventoryRiskRow(
                product=str(name),
                stock_available=float(r["stock_available"]),
                net_qty=float(r["net_qty"]),
                risk="high_stock_low_sales",
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Multivariate driver model (section 18-19)
# ---------------------------------------------------------------------------

def _cap_categories(series: pd.Series, max_levels: int = MAX_CATEGORY_LEVELS) -> pd.Series:
    counts = series.value_counts()
    keep = set(counts.head(max_levels).index)
    return series.where(series.isin(keep), other="Other")


def build_statistical_model(d: pd.DataFrame) -> StatisticalModelResult:
    numeric_features = [f for f in NUMERIC_DRIVERS if f in d.columns]
    categorical_features = [f for f in CATEGORICAL_DRIVERS if f in d.columns]

    model_df = d[numeric_features + categorical_features + ["net_sales"]].copy()
    if "date" in d.columns:
        model_df["date"] = d["date"]

    model_df = model_df.dropna(subset=["net_sales"])
    n = len(model_df)

    if n < MIN_ROWS_RIDGE or not numeric_features:
        return StatisticalModelResult(
            model_status="insufficient_data",
            sample_size=n,
            notes=[
                f"At least {MIN_ROWS_RIDGE} rows with a valid net_sales value are required to fit a "
                f"driver model; only {n} were available."
            ],
        )

    for c in categorical_features:
        model_df[c] = _cap_categories(model_df[c].astype(str))

    if "date" in model_df.columns and model_df["date"].notna().sum() == n:
        model_df = model_df.sort_values("date")
        split_idx = int(n * 0.8)
        train_idx = model_df.index[:split_idx]
        test_idx = model_df.index[split_idx:]
        validation_note = "Time-aware split: earliest 80% of rows trained, most recent 20% held out."
    else:
        shuffled = model_df.sample(frac=1.0, random_state=42)
        split_idx = int(n * 0.8)
        train_idx = shuffled.index[:split_idx]
        test_idx = shuffled.index[split_idx:]
        validation_note = "No usable date column for a time-aware split; used a random 80/20 split."

    if len(test_idx) < 5:
        return StatisticalModelResult(
            model_status="insufficient_data",
            sample_size=n,
            notes=["Not enough rows remain in the holdout split to validate a model reliably."],
        )

    X = model_df[numeric_features + categorical_features]
    y = model_df["net_sales"]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]),
                numeric_features,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_features,
            ),
        ]
    )

    ridge = Pipeline([("prep", preprocessor), ("model", RidgeCV(alphas=np.logspace(-3, 3, 13)))])
    X_train, X_test = X.loc[train_idx], X.loc[test_idx]
    y_train, y_test = y.loc[train_idx], y.loc[test_idx]

    ridge.fit(X_train, y_train)
    y_pred = ridge.predict(X_test)

    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2 = float(r2_score(y_test, y_pred)) if len(set(y_test)) > 1 else None

    feature_names = ridge.named_steps["prep"].get_feature_names_out()
    coefs = ridge.named_steps["model"].coef_
    coefficients = [
        {"feature": str(name), "standardized_coefficient": float(coef)}
        for name, coef in sorted(zip(feature_names, coefs), key=lambda t: -abs(t[1]))[:25]
    ]

    notes = [validation_note]
    if r2 is not None and r2 < 0.2:
        notes.append("Model R² is low; treat driver coefficients as directional signals, not precise effects.")

    model_type = "RidgeCV (linear, standardized numeric + one-hot categorical)"
    permutation_importances: List[Dict] = []

    if n >= MIN_ROWS_RF:
        # n_jobs=1: joblib's process-based backend (n_jobs=-1) can hang the whole
        # request under some process-launcher setups (e.g. a backgrounded/nohup'd
        # server) since the worker subprocess never bootstraps. Datasets here are
        # small enough that single-process fitting is plenty fast.
        rf = Pipeline(
            [
                ("prep", preprocessor),
                ("model", RandomForestRegressor(n_estimators=300, max_depth=8, random_state=42, n_jobs=1)),
            ]
        )
        rf.fit(X_train, y_train)
        y_pred_rf = rf.predict(X_test)
        rf_r2 = r2_score(y_test, y_pred_rf) if len(set(y_test)) > 1 else -np.inf
        if r2 is None or rf_r2 > r2:
            mae = float(mean_absolute_error(y_test, y_pred_rf))
            rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_rf)))
            r2 = float(rf_r2)
            model_type = "RandomForestRegressor (with permutation importance)"

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            perm = permutation_importance(
                rf, X_test, y_test, n_repeats=8, random_state=42, scoring="r2", n_jobs=1
            )
        rf_feature_names = rf.named_steps["prep"].get_feature_names_out()
        permutation_importances = [
            {"feature": str(name), "importance_mean": float(m), "importance_std": float(s)}
            for name, m, s in sorted(
                zip(rf_feature_names, perm.importances_mean, perm.importances_std),
                key=lambda t: -t[1],
            )[:25]
        ]
    else:
        notes.append(
            f"RandomForest + permutation importance requires at least {MIN_ROWS_RF} rows; "
            f"only {n} available, so only the linear model is reported."
        )

    return StatisticalModelResult(
        model_status="ok",
        sample_size=n,
        model_type=model_type,
        mae=mae,
        rmse=rmse,
        r2=r2,
        coefficients=coefficients,
        permutation_importance=permutation_importances,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Final combined driver score (section 20)
# ---------------------------------------------------------------------------

def _minmax(values: List[float]) -> List[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-12:
        return [0.5 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def _permutation_score_for_field(model: StatisticalModelResult, field: str) -> float:
    total = 0.0
    for entry in model.permutation_importance:
        if entry["feature"].endswith(f"__{field}") or f"__{field}_" in entry["feature"] or entry["feature"] == f"num__{field}":
            total += max(entry["importance_mean"], 0.0)
    return total


def build_driver_ranking(
    correlations: List[Dict],
    model: StatisticalModelResult,
    group_analyses: Dict[str, List[GroupAnalysisRow]],
) -> List[DriverEvidence]:
    entries = []

    abs_spearman_values = [abs(c["spearman"]) for c in correlations if c["spearman"] is not None]
    perm_values = [_permutation_score_for_field(model, c["field"]) for c in correlations]
    norm_spearman = _minmax([abs(c["spearman"]) if c["spearman"] is not None else 0.0 for c in correlations])
    norm_perm = _minmax(perm_values) if any(perm_values) else [0.0] * len(correlations)

    for i, c in enumerate(correlations):
        spearman = c["spearman"] or 0.0
        pearson = c["pearson"] or 0.0
        combined = 0.6 * norm_spearman[i] + 0.4 * norm_perm[i]
        score = round(combined * 100, 1)

        direction = "positive" if spearman >= 0 else "negative"
        evidence = []
        if c["pearson"] is not None:
            evidence.append(f"Pearson r = {pearson:.2f} with net sales (n={c['n']}).")
        if c["spearman"] is not None:
            evidence.append(f"Spearman rho = {spearman:.2f} with net sales (n={c['n']}).")
        if norm_perm[i] > 0:
            evidence.append("Contributes measurable permutation importance in the driver model.")

        confidence = "low"
        if c["n"] >= 200 and abs(spearman) >= 0.3:
            confidence = "high"
        elif c["n"] >= 50 and abs(spearman) >= 0.15:
            confidence = "medium"

        if c["field"] in ("discount_pct", "promotion_pct"):
            direction = f"{'negative' if spearman < 0 else 'positive'}_correlation_with_net_sales"

        entries.append(
            DriverEvidence(
                driver=c["field"],
                importance_score=score,
                direction=direction,
                confidence=confidence,  # type: ignore[arg-type]
                evidence=evidence or ["Insufficient paired observations to compute correlation."],
            )
        )

    for field, rows in group_analyses.items():
        if not rows:
            continue
        shares = [r.share_of_sales_pct for r in rows]
        concentration = max(shares) if shares else 0.0
        score = round(min(concentration, 1.0) * 100, 1)
        top = rows[0]
        entries.append(
            DriverEvidence(
                driver=field,
                importance_score=score,
                direction="categorical_effect",
                confidence="medium" if len(rows) >= 3 else "low",
                evidence=[
                    f"Top group '{top.group}' accounts for {top.share_of_sales_pct*100:.1f}% of net sales.",
                    f"Analyzed across {len(rows)} groups.",
                ],
            )
        )

    entries.sort(key=lambda e: -e.importance_score)
    return entries
