"""Sales-driver statistical analysis.

Everything here is deterministic (pandas / numpy / scipy / scikit-learn).
No AI call happens in this module - its output is exactly the structured
evidence that later gets summarized (not recalculated) by Claude.

Target
------
The driver analysis explains **sales quantity** (``volume_units``: sell-out
units for POS rows, net shipment for SHIPMENT rows). Explaining revenue with
quantity as a feature is a tautology (revenue = quantity x price), so
quantity-type fields are never used as features - only price, cost, discount,
promotion, stock availability, seasonality (month) and the categorical mix
(brand, product, channel, channel type, sales type).

Vocabulary discipline: this module only ever describes *association*
(correlation, model permutation importance, group concentration), never
causation.
"""
from __future__ import annotations

import warnings
from typing import Dict, List, Optional

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
from app.utils.formatting import finite, finite_or_none, safe_div

TARGET_FIELD = "volume_units"

# Numeric fields whose association with the target is reported.
NUMERIC_DRIVERS = [
    "sale_price",
    "sale_cost",
    "discount_pct",
    "promotion_pct",
    "stock_available",
    "return_qty",
]
# Numeric features used by the multivariate model (sale_price_net is a
# combination of sale_price and discount_pct, so it is left out to avoid
# double counting).
MODEL_NUMERIC_FEATURES = ["sale_price", "sale_cost", "discount_pct", "promotion_pct", "stock_available"]
CATEGORICAL_DRIVERS = ["brand", "product", "sales_channel", "channel_type", "sales_type"]
SEASONALITY_FEATURE = "month"

MIN_ROWS_RIDGE = 30
MIN_ROWS_RF = 80
TOP_N = 10
MAX_CATEGORY_LEVELS = 20
RF_ESTIMATORS = 120
PERMUTATION_REPEATS = 5

BASIS_MODEL = "model_permutation_importance"
BASIS_CORRELATION = "univariate_association"
MIN_MODEL_R2_FOR_RANKING = 0.10


def prepare_derived_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Adds the derived financial + volume columns every driver-analysis
    function below relies on."""
    d = derive_core_fields(df)
    d["net_sales"] = d["net_sales_derived"]
    return d


def _target(d: pd.DataFrame) -> str:
    return TARGET_FIELD if TARGET_FIELD in d.columns else "net_sales"


# ---------------------------------------------------------------------------
# Correlation analysis
# ---------------------------------------------------------------------------

def compute_correlations(d: pd.DataFrame, target_field: Optional[str] = None) -> List[Dict]:
    target_field = target_field or _target(d)
    results = []
    target = pd.to_numeric(d[target_field], errors="coerce")
    for field in NUMERIC_DRIVERS:
        if field not in d.columns:
            continue
        series = pd.to_numeric(d[field], errors="coerce")
        paired = pd.concat([series, target], axis=1).replace([np.inf, -np.inf], np.nan).dropna()
        n = len(paired)
        pearson = spearman = None
        if n >= 3 and paired.iloc[:, 0].std() > 0 and paired.iloc[:, 1].std() > 0:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pearson = finite_or_none(stats.pearsonr(paired.iloc[:, 0], paired.iloc[:, 1])[0])
                spearman = finite_or_none(stats.spearmanr(paired.iloc[:, 0], paired.iloc[:, 1])[0])
        results.append({"field": field, "pearson": pearson, "spearman": spearman, "n": n})
    return results


# ---------------------------------------------------------------------------
# Group contribution analysis
# ---------------------------------------------------------------------------

def compute_group_analysis(d: pd.DataFrame, group_field: str, top_n: int = TOP_N) -> List[GroupAnalysisRow]:
    if group_field not in d.columns or d.empty:
        return []
    total_net_sales = finite(d["net_sales"].sum())
    grouped = d.groupby(group_field, dropna=True).agg(
        net_sales=("net_sales", "sum"),
        net_qty=("net_qty", "sum"),
        volume_units=("volume_units", "sum") if "volume_units" in d.columns else ("net_qty", "sum"),
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
                net_sales=finite(r["net_sales"]),
                share_of_sales_pct=safe_div(finite(r["net_sales"]), total_net_sales),
                net_qty=finite(r["net_qty"]),
                volume_units=finite(r["volume_units"]),
                gross_profit=finite(r["gross_profit"]),
                gross_margin_pct=finite(gross_margin_pct),
                return_rate_pct=finite(return_rate_pct),
                avg_discount_pct=finite(r["discount_pct"]),
                avg_promotion_pct=finite(r["promotion_pct"]),
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Promotion effect
# ---------------------------------------------------------------------------

def compute_promotion_comparison(d: pd.DataFrame) -> List[PromotionComparisonRow]:
    if "promotion_amt" not in d.columns or d.empty:
        return []
    promoted_mask = d["promotion_amt"] > 0
    rows = []
    for label, mask in (("promoted", promoted_mask), ("non_promoted", ~promoted_mask)):
        subset = d[mask]
        if subset.empty:
            continue
        avg_units = finite(subset["net_qty"].mean())
        avg_net_sales = finite(subset["net_sales"].mean())
        avg_gross_profit = finite(subset["gross_profit"].mean())
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
# Discount bands
# ---------------------------------------------------------------------------

def compute_discount_bands(d: pd.DataFrame) -> List[DiscountBandRow]:
    if "discount_pct" not in d.columns or d.empty:
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
                net_sales=finite(r["net_sales"]),
                net_qty=finite(r["net_qty"]),
                gross_profit=finite(r["gross_profit"]),
                gross_margin_pct=safe_div(float(r["gross_profit"]), float(r["net_sales"])),
                row_count=int(r["row_count"]),
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Returns analysis
# ---------------------------------------------------------------------------

def compute_return_risk(d: pd.DataFrame, top_n: int = TOP_N) -> List[ReturnRiskRow]:
    rows: List[ReturnRiskRow] = []
    if "return_qty" not in d.columns or "qty" not in d.columns or d.empty:
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
        grouped["return_rate"] = (grouped["return_qty"] / grouped["qty"]).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        top = grouped.sort_values("return_rate", ascending=False).head(top_n)
        for name, r in top.iterrows():
            rows.append(
                ReturnRiskRow(
                    name=str(name),
                    dimension=dim,  # type: ignore[arg-type]
                    return_rate_pct=finite(r["return_rate"]),
                    returned_units=finite(r["return_qty"]),
                    refund_amount=finite(r["refund_amt"]),
                    net_sales=finite(r["net_sales"]),
                )
            )
    return rows


# ---------------------------------------------------------------------------
# Inventory risk
# ---------------------------------------------------------------------------

def compute_inventory_risk(d: pd.DataFrame, top_n: int = TOP_N) -> List[InventoryRiskRow]:
    if "stock_available" not in d.columns or "product" not in d.columns or d.empty:
        return []
    volume_col = "volume_units" if "volume_units" in d.columns else "net_qty"
    grouped = d.groupby("product", dropna=True).agg(
        stock_available=("stock_available", "mean"),
        net_qty=(volume_col, "sum"),
    )
    grouped = grouped.replace([np.inf, -np.inf], np.nan).dropna(subset=["stock_available", "net_qty"])
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
                stock_available=finite(r["stock_available"]),
                net_qty=finite(r["net_qty"]),
                risk="low_stock_high_sales",
            )
        )
    for name, r in high_stock_low_sales.iterrows():
        rows.append(
            InventoryRiskRow(
                product=str(name),
                stock_available=finite(r["stock_available"]),
                net_qty=finite(r["net_qty"]),
                risk="high_stock_low_sales",
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Multivariate driver model
# ---------------------------------------------------------------------------

def _cap_categories(series: pd.Series, max_levels: int = MAX_CATEGORY_LEVELS) -> pd.Series:
    counts = series.value_counts()
    keep = set(counts.head(max_levels).index)
    return series.where(series.isin(keep), other="Other")


def build_statistical_model(d: pd.DataFrame) -> StatisticalModelResult:
    target = _target(d)
    numeric_features = [f for f in MODEL_NUMERIC_FEATURES if f in d.columns]
    categorical_features = [f for f in CATEGORICAL_DRIVERS if f in d.columns]

    model_df = d[numeric_features + categorical_features + [target]].copy()
    for c in numeric_features + [target]:
        model_df[c] = pd.to_numeric(model_df[c], errors="coerce").replace([np.inf, -np.inf], np.nan)
    if "date" in d.columns:
        dates = pd.to_datetime(d["date"], errors="coerce")
        model_df["date"] = dates
        if len(dates) > 0 and dates.notna().all():
            model_df[SEASONALITY_FEATURE] = dates.dt.month.map(lambda m: f"M{int(m):02d}")
            categorical_features = categorical_features + [SEASONALITY_FEATURE]

    model_df = model_df.dropna(subset=[target])
    n = len(model_df)

    if n < MIN_ROWS_RIDGE or not numeric_features:
        return StatisticalModelResult(
            model_status="insufficient_data",
            sample_size=n,
            target=target,
            notes=[
                f"At least {MIN_ROWS_RIDGE} rows with a valid {target} value are required to fit a "
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
            target=target,
            notes=["Not enough rows remain in the holdout split to validate a model reliably."],
        )

    X = model_df[numeric_features + categorical_features]
    y = model_df[target]

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

    mae = finite_or_none(mean_absolute_error(y_test, y_pred))
    rmse = finite_or_none(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2 = finite_or_none(r2_score(y_test, y_pred)) if len(set(y_test)) > 1 else None

    feature_names = ridge.named_steps["prep"].get_feature_names_out()
    coefs = ridge.named_steps["model"].coef_
    coefficients = [
        {"feature": str(name), "standardized_coefficient": finite(coef)}
        for name, coef in sorted(zip(feature_names, coefs), key=lambda t: -abs(finite(t[1])))[:25]
    ]

    notes = [validation_note]
    if r2 is not None and r2 < 0.2:
        notes.append("Model R2 is low; treat driver importances as directional signals, not precise effects.")

    model_type = "RidgeCV (linear, standardized numeric + one-hot categorical)"
    permutation_importances: List[Dict] = []

    if n >= MIN_ROWS_RF:
        # n_jobs=1: joblib's process-based backend can hang under some process
        # launchers; datasets here are small enough for single-process fitting.
        rf = Pipeline(
            [
                ("prep", preprocessor),
                (
                    "model",
                    RandomForestRegressor(
                        n_estimators=RF_ESTIMATORS,
                        max_depth=8,
                        min_samples_leaf=3,
                        random_state=42,
                        n_jobs=1,
                    ),
                ),
            ]
        )
        rf.fit(X_train, y_train)
        y_pred_rf = rf.predict(X_test)
        rf_r2 = finite_or_none(r2_score(y_test, y_pred_rf)) if len(set(y_test)) > 1 else None
        if rf_r2 is not None and (r2 is None or rf_r2 > r2):
            mae = finite_or_none(mean_absolute_error(y_test, y_pred_rf))
            rmse = finite_or_none(np.sqrt(mean_squared_error(y_test, y_pred_rf)))
            r2 = rf_r2
            model_type = "RandomForestRegressor (with permutation importance)"

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            perm = permutation_importance(
                rf, X_test, y_test, n_repeats=PERMUTATION_REPEATS, random_state=42, scoring="r2", n_jobs=1
            )
        rf_feature_names = rf.named_steps["prep"].get_feature_names_out()
        permutation_importances = [
            {"feature": str(name), "importance_mean": finite(m), "importance_std": finite(s)}
            for name, m, s in sorted(
                zip(rf_feature_names, perm.importances_mean, perm.importances_std),
                key=lambda t: -finite(t[1]),
            )
        ]
    else:
        notes.append(
            f"RandomForest + permutation importance requires at least {MIN_ROWS_RF} rows; "
            f"only {n} available, so only the linear model is reported."
        )

    return StatisticalModelResult(
        model_status="ok",
        sample_size=n,
        target=target,
        model_type=model_type,
        mae=mae,
        rmse=rmse,
        r2=r2,
        coefficients=coefficients,
        permutation_importance=permutation_importances,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Final combined driver ranking
# ---------------------------------------------------------------------------

def _permutation_score_for_field(model: StatisticalModelResult, field: str) -> float:
    total = 0.0
    for entry in model.permutation_importance:
        name = entry["feature"]
        if name == f"num__{field}" or name.startswith(f"cat__{field}_"):
            total += max(float(entry["importance_mean"]), 0.0)
    return total


def _categorical_fields_in_model(model: StatisticalModelResult) -> List[str]:
    fields: List[str] = []
    for entry in model.permutation_importance:
        name = entry["feature"]
        if name.startswith("cat__"):
            rest = name[len("cat__"):]
            for candidate in CATEGORICAL_DRIVERS + [SEASONALITY_FEATURE]:
                if rest.startswith(candidate + "_") and candidate not in fields:
                    fields.append(candidate)
    return fields


def importance_basis(model: StatisticalModelResult) -> str:
    """Permutation importance is only meaningful when the model actually explains
    the target; a model with R2 near zero produces noise rankings, so the
    univariate association basis (Spearman^2 for numeric fields, eta^2 for
    categorical fields) is used instead."""
    if (
        model.model_status == "ok"
        and model.permutation_importance
        and model.r2 is not None
        and model.r2 >= MIN_MODEL_R2_FOR_RANKING
    ):
        return BASIS_MODEL
    return BASIS_CORRELATION


def compute_eta_squared(d: pd.DataFrame, fields: List[str], target_field: Optional[str] = None) -> Dict[str, float]:
    """Share of target variance explained by group means (eta^2, 0..1) for
    each categorical field - the univariate analogue of a correlation."""
    target_field = target_field or _target(d)
    out: Dict[str, float] = {}
    if d.empty or target_field not in d.columns:
        return out
    y = pd.to_numeric(d[target_field], errors="coerce").replace([np.inf, -np.inf], np.nan)
    total_ss = finite(((y - y.mean()) ** 2).sum())
    if total_ss <= 0:
        return out
    for field in fields:
        if field not in d.columns:
            continue
        groups = y.groupby(d[field].astype(str))
        between = finite(((groups.transform("mean") - y.mean()) ** 2).sum())
        out[field] = max(0.0, min(1.0, between / total_ss))
    if "date" in d.columns:
        months = pd.to_datetime(d["date"], errors="coerce").dt.month
        if len(months) and months.notna().all():
            groups = y.groupby(months.astype(int))
            between = finite(((groups.transform("mean") - y.mean()) ** 2).sum())
            out[SEASONALITY_FEATURE] = max(0.0, min(1.0, between / total_ss))
    return out


def build_driver_ranking(
    correlations: List[Dict],
    model: StatisticalModelResult,
    group_analyses: Dict[str, List[GroupAnalysisRow]],
    eta_squared: Optional[Dict[str, float]] = None,
) -> List[DriverEvidence]:
    basis = importance_basis(model)
    eta_squared = eta_squared or {}
    candidates: List[Dict] = []

    for c in correlations:
        spearman = c["spearman"]
        pearson = c["pearson"]
        perm = _permutation_score_for_field(model, c["field"])
        raw = finite(perm if basis == BASIS_MODEL else (spearman or 0.0) ** 2)
        evidence: List[str] = []
        if pearson is not None:
            evidence.append(f"Pearson r = {pearson:.2f} with sales quantity (n={c['n']}).")
        if spearman is not None:
            evidence.append(f"Spearman rho = {spearman:.2f} with sales quantity (n={c['n']}).")
        if basis == BASIS_MODEL:
            evidence.append(f"Model permutation importance (mean R2 drop when shuffled) = {perm:.3f}.")
        if not evidence:
            evidence.append("Insufficient paired observations to compute an association.")

        confidence = "low"
        rho = abs(spearman or 0.0)
        if c["n"] >= 200 and rho >= 0.3:
            confidence = "high"
        elif c["n"] >= 50 and rho >= 0.15:
            confidence = "medium"
        if basis == BASIS_MODEL and perm >= 0.05 and c["n"] >= 50 and confidence == "low":
            confidence = "medium"

        candidates.append(
            {
                "driver": c["field"],
                "raw": raw,
                "direction": "positive" if (spearman or 0.0) >= 0 else "negative",
                "confidence": confidence,
                "evidence": evidence,
            }
        )

    categorical_fields = list(group_analyses.keys())
    for f in list(_categorical_fields_in_model(model)) + list(eta_squared.keys()):
        if f not in categorical_fields:
            categorical_fields.append(f)

    for field in categorical_fields:
        rows = group_analyses.get(field) or []
        perm = _permutation_score_for_field(model, field)
        eta = finite(eta_squared.get(field, 0.0))
        raw = finite(perm if basis == BASIS_MODEL else eta)
        if raw <= 0 and not rows:
            continue
        evidence = []
        if field in eta_squared:
            evidence.append(f"Group means explain {eta*100:.1f}% of quantity variance (eta-squared).")
        if rows:
            top = rows[0]
            evidence.append(
                f"Top group '{top.group}' accounts for {top.share_of_sales_pct*100:.1f}% of net sales "
                f"across {len(rows)} groups."
            )
        if basis == BASIS_MODEL:
            evidence.append(f"Model permutation importance summed over its levels = {perm:.3f}.")
        if field == SEASONALITY_FEATURE:
            evidence.append("Calendar month captures seasonality in the observed quantities.")
        confidence = "medium" if (basis == BASIS_MODEL and perm > 0.01) or eta >= 0.02 else "low"
        candidates.append(
            {
                "driver": field,
                "raw": raw,
                "direction": "mix_effect",
                "confidence": confidence,
                "evidence": evidence or ["No group-level evidence available."],
            }
        )

    max_raw = max((c["raw"] for c in candidates), default=0.0)
    entries: List[DriverEvidence] = []
    for c in candidates:
        score = finite(round((c["raw"] / max_raw) * 100, 1)) if max_raw > 0 else 0.0
        entries.append(
            DriverEvidence(
                driver=c["driver"],
                importance_score=score,
                direction=c["direction"],
                confidence=c["confidence"],  # type: ignore[arg-type]
                evidence=c["evidence"],
            )
        )

    entries.sort(key=lambda e: -e.importance_score)
    return entries
