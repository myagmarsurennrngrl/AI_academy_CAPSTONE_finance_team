"""Monthly sales forecasting with model selection by backtest.

Pipeline
--------
1. Aggregate the (filtered) analytics frame into one monthly series for the
   chosen target (net sales, sales quantity or gross profit). Missing months
   inside the observed range count as zero; a partial final month (the data
   ends before month end) is excluded from training by default.
2. Fit a small library of candidate methods - from very simple baselines to a
   gradient-boosted tree model on lag features:
     seasonal_naive · naive_drift · moving_average · holt_winters ·
     trend_seasonal_regression · xgboost (HistGradientBoosting fallback)
   Each candidate declares the minimum history it needs; unavailable ones are
   reported as such instead of being silently dropped.
3. Backtest every candidate with a rolling origin over the most recent months:
   at each origin the model is refit on the past only and asked for the same
   multi-step horizon the user requested (truncated to the data that exists).
   Accuracy = WAPE (sum |error| / sum |actual|), the most robust choice for
   series containing zeros; MAPE, MAE, RMSE and bias are reported alongside.
4. The candidate with the lowest backtest WAPE is refit on the full history and
   produces the forecast; an approximate 80% interval per step is derived from
   that model's backtest errors at the same step.

Everything is deterministic (fixed seeds) and returns plain, JSON-safe floats.
"""
from __future__ import annotations

import calendar
import hashlib
import json
import logging
import math
import warnings
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from app.models.schemas import (
    FilterSpec,
    ForecastBacktestRow,
    ForecastPoint,
    ForecastRequest,
    ForecastResponse,
    ForecastSummary,
    HistoryPoint,
)
from app.services import dataset_service
from app.utils.formatting import finite, finite_or_none

logger = logging.getLogger(__name__)

try:  # optional dependency - the sklearn fallback keeps the method available
    from xgboost import XGBRegressor  # type: ignore

    _HAS_XGBOOST = True
except Exception:  # noqa: BLE001  (ImportError or a broken native install)
    XGBRegressor = None  # type: ignore
    _HAS_XGBOOST = False
from sklearn.ensemble import HistGradientBoostingRegressor

TARGET_COLUMNS = {
    "net_sales": "net_sales",
    "volume_units": "volume_units",
    "gross_profit": "gross_profit",
}
MAX_HORIZON = 36
MIN_MONTHS = 3
Z80 = 1.2816  # two-sided 80% normal quantile


class ForecastError(Exception):
    """Raised when the selection cannot be forecast (too little history, bad horizon)."""


# ---------------------------------------------------------------------------
# Series preparation
# ---------------------------------------------------------------------------

def month_str(period: pd.Period) -> str:
    return f"{period.year:04d}-{period.month:02d}"


def build_monthly_series(frame: pd.DataFrame, target: str) -> Tuple[pd.Series, bool]:
    """Returns (series indexed by monthly Period with no gaps, partial_last_month)."""
    column = TARGET_COLUMNS[target]
    if "date" not in frame.columns or frame.empty:
        raise ForecastError("The selected rows contain no dated records to forecast from.")
    dated = frame.dropna(subset=["date"])
    if dated.empty:
        raise ForecastError("The selected rows contain no dated records to forecast from.")
    values = pd.to_numeric(dated[column], errors="coerce").fillna(0.0)
    periods = pd.to_datetime(dated["date"]).dt.to_period("M")
    monthly = values.groupby(periods).sum()
    full_index = pd.period_range(monthly.index.min(), monthly.index.max(), freq="M")
    monthly = monthly.reindex(full_index, fill_value=0.0).astype("float64")

    return monthly, _last_month_is_partial(pd.to_datetime(dated["date"]))


def _last_month_is_partial(dates: pd.Series) -> bool:
    """A final month counts as incomplete when the data stops noticeably before
    month end *and* earlier months typically ran closer to month end. Monthly
    snapshots (every month booked on the 15th, say) are therefore not flagged,
    while daily data that ends on the 29th is."""
    if dates.empty:
        return False
    last_day = dates.max()
    days_in_month = calendar.monthrange(last_day.year, last_day.month)[1]
    gap = days_in_month - last_day.day
    if gap < 2:
        return False
    per_month_last_day = dates.groupby(dates.dt.to_period("M")).max().dt.day
    previous = per_month_last_day.iloc[:-1]
    if len(previous) >= 2:
        typical = float(previous.median())
        return last_day.day <= typical - 1
    return True


# ---------------------------------------------------------------------------
# Candidate models. Each is a pure function: history -> h-step forecast.
# ---------------------------------------------------------------------------

Predictor = Callable[[np.ndarray, pd.PeriodIndex, int], np.ndarray]


@dataclass
class Candidate:
    key: str
    label: str
    min_months: int
    predict: Predictor
    description: str
    implementation: str = ""


def _seasonal_naive(y: np.ndarray, _: pd.PeriodIndex, h: int) -> np.ndarray:
    n = len(y)
    out = np.empty(h)
    for i in range(h):
        idx = n + i - 12
        # walk back in 12-month steps until we land inside the history
        while idx >= n:
            idx -= 12
        out[i] = y[idx] if idx >= 0 else y[-1]
    return out


def _naive_drift(y: np.ndarray, _: pd.PeriodIndex, h: int) -> np.ndarray:
    n = len(y)
    drift = (y[-1] - y[0]) / (n - 1) if n > 1 else 0.0
    return y[-1] + drift * np.arange(1, h + 1)


def _moving_average(y: np.ndarray, _: pd.PeriodIndex, h: int) -> np.ndarray:
    window = min(3, len(y))
    return np.full(h, float(np.mean(y[-window:])))


def _holt_winters(y: np.ndarray, _: pd.PeriodIndex, h: int) -> np.ndarray:
    """Additive Holt-Winters (level + trend + 12-month season) with a coarse grid
    search on the smoothing parameters, minimising one-step-ahead SSE on the
    training data. Falls back to Holt's linear method below two seasons."""
    n = len(y)
    m = 12
    seasonal = n >= 2 * m

    def run(alpha: float, beta: float, gamma: float, horizon: int) -> Tuple[float, np.ndarray]:
        if seasonal:
            season_means = [np.mean(y[i * m : (i + 1) * m]) for i in range(n // m)]
            level = float(np.mean(y[:m]))
            trend = (np.mean(y[m : 2 * m]) - np.mean(y[:m])) / m
            seas = np.array([y[i] - season_means[0] for i in range(m)], dtype="float64")
        else:
            level = float(y[0])
            trend = float(y[1] - y[0]) if n > 1 else 0.0
            seas = np.zeros(m)
        sse = 0.0
        for t in range(n):
            s_idx = t % m
            forecast_t = level + trend + (seas[s_idx] if seasonal else 0.0)
            err = y[t] - forecast_t
            if t >= (m if seasonal else 1):
                sse += err * err
            prev_level = level
            level = alpha * (y[t] - (seas[s_idx] if seasonal else 0.0)) + (1 - alpha) * (level + trend)
            trend = beta * (level - prev_level) + (1 - beta) * trend
            if seasonal:
                seas[s_idx] = gamma * (y[t] - level) + (1 - gamma) * seas[s_idx]
        preds = np.array(
            [level + (k + 1) * trend + (seas[(n + k) % m] if seasonal else 0.0) for k in range(horizon)]
        )
        return sse, preds

    grid_a = (0.2, 0.4, 0.6, 0.8)
    grid_b = (0.05, 0.15, 0.3)
    grid_g = (0.1, 0.3, 0.5) if seasonal else (0.0,)
    best: Tuple[float, np.ndarray] | None = None
    for a in grid_a:
        for b in grid_b:
            for g in grid_g:
                sse, preds = run(a, b, g, h)
                if best is None or sse < best[0]:
                    best = (sse, preds)
    assert best is not None
    return best[1]


def _trend_seasonal_regression(y: np.ndarray, index: pd.PeriodIndex, h: int) -> np.ndarray:
    """Ridge regression on a linear time trend plus month-of-year dummies
    (dummies only once at least 14 months exist, otherwise trend only)."""
    n = len(y)
    use_season = n >= 14
    t_all = np.arange(n + h, dtype="float64")
    months = [(index[0] + k).month for k in range(n + h)]

    def design(rows: range) -> np.ndarray:
        cols = [t_all[list(rows)]]
        if use_season:
            for mth in range(1, 13):
                cols.append(np.array([1.0 if months[r] == mth else 0.0 for r in rows]))
        return np.column_stack(cols)

    x_train = design(range(n))
    x_future = design(range(n, n + h))
    model = Ridge(alpha=1.0).fit(x_train, y)
    return model.predict(x_future)


def _lag_features(history: List[float], months: List[int], t: int, n_total: int) -> List[float]:
    def lag(k: int) -> float:
        return history[-k] if len(history) >= k else history[0]

    recent = history[-3:]
    yearly = history[-12:]
    month = months[t]
    return [
        lag(1),
        lag(2),
        lag(3),
        lag(6),
        lag(12),
        float(np.mean(recent)),
        float(np.mean(yearly)),
        lag(1) - lag(2),
        math.sin(2 * math.pi * month / 12),
        math.cos(2 * math.pi * month / 12),
        float(t) / max(n_total, 1),
    ]


def _gradient_boosting(y: np.ndarray, index: pd.PeriodIndex, h: int) -> np.ndarray:
    """XGBoost (or sklearn HistGradientBoosting when xgboost is unavailable) on
    lag / rolling / calendar features, forecasting recursively."""
    n = len(y)
    months = [(index[0] + k).month for k in range(n + h)]
    warmup = 3
    rows: List[List[float]] = []
    targets: List[float] = []
    for t in range(warmup, n):
        rows.append(_lag_features(list(y[:t]), months, t, n))
        targets.append(float(y[t]))
    x = np.array(rows)
    t_arr = np.array(targets)
    if _HAS_XGBOOST:
        model = XGBRegressor(
            n_estimators=200,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            min_child_weight=2,
            reg_lambda=1.0,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=1,
            verbosity=0,
        )
    else:
        model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_depth=3, min_samples_leaf=2, random_state=42)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(x, t_arr)
    history = list(y)
    out = np.empty(h)
    for k in range(h):
        feats = np.array([_lag_features(history, months, n + k, n)])
        pred = float(model.predict(feats)[0])
        out[k] = pred
        history.append(pred)
    return out


CANDIDATES: List[Candidate] = [
    Candidate(
        "seasonal_naive",
        "Seasonal naive",
        13,
        _seasonal_naive,
        "Repeats the value observed in the same month one year earlier.",
    ),
    Candidate(
        "naive_drift",
        "Naive with drift",
        2,
        _naive_drift,
        "Last observed value extended by the average historical change per month.",
    ),
    Candidate(
        "moving_average",
        "Moving average (3 months)",
        2,
        _moving_average,
        "Average of the last three months, held flat.",
    ),
    Candidate(
        "holt_winters",
        "Holt-Winters (exponential smoothing)",
        6,
        _holt_winters,
        "Level, trend and additive 12-month seasonality smoothed over time; seasonality only with two full years.",
    ),
    Candidate(
        "trend_seasonal_regression",
        "Trend + seasonality regression",
        6,
        _trend_seasonal_regression,
        "Ridge regression on a linear trend and month-of-year effects.",
    ),
    Candidate(
        "xgboost",
        "XGBoost (gradient-boosted trees)" if _HAS_XGBOOST else "Gradient boosting (sklearn fallback)",
        18,
        _gradient_boosting,
        "Boosted trees on lag, rolling-mean and calendar features, forecasting month by month.",
        implementation="xgboost" if _HAS_XGBOOST else "sklearn.HistGradientBoostingRegressor",
    ),
]


# ---------------------------------------------------------------------------
# Backtest + selection
# ---------------------------------------------------------------------------

@dataclass
class BacktestResult:
    key: str
    available: bool
    reason: Optional[str] = None
    folds: int = 0
    wape: Optional[float] = None
    mape: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    bias: Optional[float] = None
    # per-step RMSE (step 1..h) for interval estimation
    step_rmse: Dict[int, float] = field(default_factory=dict)
    # one-step-ahead predictions in the backtest window (for the fit chart)
    one_step: Dict[int, float] = field(default_factory=dict)


def _safe_predict(candidate: Candidate, y: np.ndarray, index: pd.PeriodIndex, h: int) -> np.ndarray:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        preds = np.asarray(candidate.predict(y, index, h), dtype="float64")
    preds = np.where(np.isfinite(preds), preds, y[-1])
    return preds


def _backtest(candidate: Candidate, y: np.ndarray, index: pd.PeriodIndex, horizon: int, n_test: int, non_negative: bool) -> BacktestResult:
    n = len(y)
    min_train = max(candidate.min_months, 2)
    origins = [o for o in range(n - n_test, n) if o >= min_train]
    if not origins:
        return BacktestResult(
            key=candidate.key,
            available=False,
            reason=f"Needs at least {candidate.min_months} months of history before the backtest window; only {n} months available.",
        )
    abs_err: List[float] = []
    sq_err: List[float] = []
    signed: List[float] = []
    actual_abs: List[float] = []
    pct: List[float] = []
    step_sq: Dict[int, List[float]] = {}
    one_step: Dict[int, float] = {}
    for origin in origins:
        h = min(horizon, n - origin)
        preds = _safe_predict(candidate, y[:origin], index[:origin], h)
        if non_negative:
            preds = np.maximum(preds, 0.0)
        actual = y[origin : origin + h]
        for step in range(h):
            e = float(preds[step] - actual[step])
            abs_err.append(abs(e))
            sq_err.append(e * e)
            signed.append(e)
            actual_abs.append(abs(float(actual[step])))
            if abs(actual[step]) > 1e-9:
                pct.append(abs(e) / abs(float(actual[step])))
            step_sq.setdefault(step + 1, []).append(e * e)
        one_step[origin] = float(preds[0])
    total_actual = float(np.sum(actual_abs))
    wape = float(np.sum(abs_err) / total_actual) if total_actual > 0 else None
    return BacktestResult(
        key=candidate.key,
        available=True,
        folds=len(origins),
        wape=finite_or_none(wape),
        mape=finite_or_none(float(np.mean(pct))) if pct else None,
        mae=finite_or_none(float(np.mean(abs_err))),
        rmse=finite_or_none(float(np.sqrt(np.mean(sq_err)))),
        bias=finite_or_none(float(np.mean(signed))),
        step_rmse={k: float(np.sqrt(np.mean(v))) for k, v in step_sq.items()},
        one_step=one_step,
    )


def _select(results: List[BacktestResult]) -> Tuple[BacktestResult, str]:
    scored = [r for r in results if r.available and r.wape is not None]
    if scored:
        best = min(scored, key=lambda r: (r.wape, r.mae if r.mae is not None else float("inf")))
        runner_up = sorted(scored, key=lambda r: (r.wape, r.mae or 0))[1:2]
        reason = f"Lowest backtest WAPE ({best.wape * 100:.1f}%) over {best.folds} rolling origins"
        if runner_up:
            reason += f"; next best {runner_up[0].key} at {runner_up[0].wape * 100:.1f}%"
        return best, reason + "."
    available = [r for r in results if r.available]
    if available:
        return available[0], "Backtest could not score any candidate (all actuals were zero); first available method used."
    raise ForecastError("Not enough monthly history to run any forecasting method.")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def request_hash(req: ForecastRequest) -> str:
    payload = json.dumps(req.model_dump(), sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def _parse_month(text: str) -> pd.Period:
    try:
        return pd.Period(text[:7], freq="M")
    except Exception as exc:  # noqa: BLE001
        raise ForecastError(f"'{text}' is not a valid month (expected YYYY-MM).") from exc


def run_forecast(frame: pd.DataFrame, req: ForecastRequest) -> ForecastResponse:
    filtered = dataset_service.apply_filters(frame, req.filters)
    if filtered.empty:
        raise ForecastError("No rows match the selected filters.")
    series, partial_last = build_monthly_series(filtered, req.target)
    notes: List[str] = []

    if partial_last and not req.include_partial_month and len(series) > MIN_MONTHS:
        last_month = month_str(series.index[-1])
        series = series.iloc[:-1]
        notes.append(
            f"{last_month} is incomplete in the data (ends before month end) and was excluded from training; "
            "the forecast starts from that month."
        )
        partial_excluded = True
    else:
        partial_excluded = False
        if partial_last:
            notes.append("The final month is incomplete in the data but was kept because the history is very short.")

    n = len(series)
    if n < MIN_MONTHS:
        raise ForecastError(f"At least {MIN_MONTHS} complete months are needed to forecast; only {n} available.")

    last_hist = series.index[-1]
    until = _parse_month(req.forecast_until)
    horizon = (until.year - last_hist.year) * 12 + (until.month - last_hist.month)
    if horizon < 1:
        raise ForecastError(f"The forecast end month must be after the last month of data ({month_str(last_hist)}).")
    if horizon > MAX_HORIZON:
        raise ForecastError(f"The forecast horizon is limited to {MAX_HORIZON} months.")
    if horizon > n:
        notes.append(f"The horizon ({horizon} months) is longer than the available history ({n} months); treat later months as indicative only.")

    y = series.to_numpy(dtype="float64")
    index = series.index
    non_negative = bool(np.all(y >= 0))
    # Backtest window: the most recent third of the history (3..12 months),
    # always leaving at least two months to train the simplest methods on.
    n_test = int(min(12, max(3, n // 3)))
    n_test = max(1, min(n_test, n - 2))

    results = [_backtest(c, y, index, horizon, n_test, non_negative) for c in CANDIDATES]
    best, reason = _select(results)
    chosen = next(c for c in CANDIDATES if c.key == best.key)

    preds = _safe_predict(chosen, y, index, horizon)
    if non_negative:
        preds = np.maximum(preds, 0.0)

    overall_rmse = best.rmse if best.rmse is not None else float(np.std(y)) if n > 1 else 0.0
    forecast_points: List[ForecastPoint] = []
    for k in range(horizon):
        step = k + 1
        sigma = best.step_rmse.get(step)
        if sigma is None:
            # steps beyond the backtest reach: grow the last known spread with sqrt(step)
            known = sorted(best.step_rmse.items())
            if known:
                last_step, last_sigma = known[-1]
                sigma = last_sigma * math.sqrt(step / max(last_step, 1))
            else:
                sigma = float(overall_rmse or 0.0)
        margin = Z80 * float(sigma)
        lower = float(preds[k]) - margin
        upper = float(preds[k]) + margin
        if non_negative:
            lower = max(lower, 0.0)
        forecast_points.append(
            ForecastPoint(month=month_str(last_hist + step), point=finite(preds[k]), lower=finite(lower), upper=finite(upper))
        )

    history_points = [
        HistoryPoint(month=month_str(p), actual=finite(v), fitted=finite_or_none(best.one_step.get(i)))
        for i, (p, v) in enumerate(zip(index, y))
    ]

    backtest_rows = []
    for c in CANDIDATES:
        r = next(x for x in results if x.key == c.key)
        backtest_rows.append(
            ForecastBacktestRow(
                model=c.key,
                label=c.label,
                description=c.description,
                available=r.available,
                reason=r.reason,
                folds=r.folds,
                wape=r.wape,
                mape=r.mape,
                mae=r.mae,
                rmse=r.rmse,
                bias=r.bias,
                selected=(c.key == chosen.key),
            )
        )
    backtest_rows.sort(key=lambda r: (not r.available, r.wape if r.wape is not None else float("inf")))

    # --- summary figures ------------------------------------------------------
    forecast_total = float(np.sum(preds))
    last12 = float(np.sum(y[-12:]))
    ly_total: Optional[float] = None
    ly_months = 0
    for k in range(horizon):
        ly_period = last_hist + (k + 1) - 12
        pos = index.get_loc(ly_period) if ly_period in index else None
        if pos is not None:
            ly_total = (ly_total or 0.0) + float(y[pos])
            ly_months += 1
    yoy = None
    if ly_total is not None and ly_months == horizon and abs(ly_total) > 1e-9:
        yoy = (forecast_total - ly_total) / abs(ly_total)
    elif ly_total is not None and ly_months < horizon:
        notes.append(f"Same-period-last-year comparison covers only {ly_months} of {horizon} forecast months.")

    if n < 24:
        notes.append("Fewer than 24 months of history: seasonal patterns cannot be fully learned, so seasonal methods may be unavailable or weak.")
    zero_months = int(np.sum(y == 0))
    if zero_months:
        notes.append(f"{zero_months} month(s) in the history have zero {req.target.replace('_', ' ')}; they were kept as observed zeros.")
    notes.append("Forecasts describe the statistical continuation of past patterns, not a plan; the 80% band comes from backtest errors at the same step.")

    return ForecastResponse(
        target=req.target,
        scope_label=dataset_service.describe_scope(req.filters, filtered),
        filter_row_count=int(len(filtered)),
        history_month_min=month_str(index[0]),
        history_month_max=month_str(last_hist),
        training_months=n,
        partial_last_month_excluded=partial_excluded,
        horizon_months=horizon,
        forecast_until=month_str(until),
        selected_model=chosen.key,
        selected_label=chosen.label,
        selection_reason=reason,
        implementation=chosen.implementation or None,
        backtest_window_months=n_test,
        history=history_points,
        forecast=forecast_points,
        backtest=backtest_rows,
        summary=ForecastSummary(
            forecast_total=finite(forecast_total),
            forecast_monthly_avg=finite(forecast_total / horizon),
            last_12_months_total=finite(last12),
            same_period_last_year_total=finite_or_none(ly_total),
            same_period_last_year_months=ly_months,
            yoy_change_pct=finite_or_none(yoy),
            accuracy_wape=best.wape,
            accuracy_mape=best.mape,
        ),
        notes=notes,
    )
