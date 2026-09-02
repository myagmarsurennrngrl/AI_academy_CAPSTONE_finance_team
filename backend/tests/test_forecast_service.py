"""Forecast: model library, rolling backtest selection, intervals, API flow."""
import json
import os

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.models.schemas import FilterSpec, ForecastRequest
from app.services import dataset_service, forecast_service
from app.services.forecast_service import ForecastError

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "app", "static", "sample_data.xlsx")


def _frame_from_monthly(values, start="2021-01-01", brand_split=True) -> pd.DataFrame:
    """One row per month (or two, split across brands) so the monthly series
    equals `values` exactly."""
    rows = []
    for i, v in enumerate(values):
        date = pd.Timestamp(start) + pd.DateOffset(months=i)
        date = date.replace(day=15)
        if brand_split:
            rows.append({"date": date, "brand": "A", "product": "P1", "sales_channel": "Retail", "channel_type": "Direct", "sales_type": "POS", "qty": v * 0.6, "sale_price": 1.0, "sale_cost": 0.5, "return_qty": 0.0})
            rows.append({"date": date, "brand": "B", "product": "P2", "sales_channel": "Online", "channel_type": "Direct", "sales_type": "POS", "qty": v * 0.4, "sale_price": 1.0, "sale_cost": 0.5, "return_qty": 0.0})
        else:
            rows.append({"date": date, "brand": "A", "product": "P1", "sales_channel": "Retail", "channel_type": "Direct", "sales_type": "POS", "qty": v, "sale_price": 1.0, "sale_cost": 0.5, "return_qty": 0.0})
    frame, _ = dataset_service.prepare_analytics_frame(pd.DataFrame(rows))
    return frame


def _seasonal_values(n=48, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    season = 300 * np.sin(2 * np.pi * (t % 12) / 12)
    return 2000 + 12 * t + season + rng.normal(0, 40, n)


def test_seasonal_series_picks_a_seasonal_aware_model_and_returns_finite_forecast():
    frame = _frame_from_monthly(_seasonal_values())
    req = ForecastRequest(target="net_sales", forecast_until="2025-06")  # history ends 2024-12 -> 6 months
    res = forecast_service.run_forecast(frame, req)

    assert res.training_months == 48
    assert res.horizon_months == 6
    assert [p.month for p in res.forecast] == ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]
    json.dumps(res.model_dump(), allow_nan=False)
    assert all(p.lower <= p.point <= p.upper for p in res.forecast)
    # the chosen model must beat the flat moving average on a trending, seasonal series
    by_model = {r.model: r for r in res.backtest}
    assert res.selected_model != "moving_average"
    assert by_model[res.selected_model].wape < by_model["moving_average"].wape
    assert by_model[res.selected_model].selected is True
    assert sum(r.selected for r in res.backtest) == 1
    # xgboost / boosting ran (enough history) and produced a score
    assert by_model["xgboost"].available and by_model["xgboost"].wape is not None
    assert res.summary.same_period_last_year_months == 6
    assert res.summary.yoy_change_pct is not None
    assert res.backtest[0].selected  # sorted best first


def test_short_history_still_forecasts_with_simple_methods():
    frame = _frame_from_monthly([100, 120, 130, 125, 140], brand_split=False)  # 2021-01..2021-05
    res = forecast_service.run_forecast(frame, ForecastRequest(target="volume_units", forecast_until="2021-08"))
    assert res.horizon_months == 3
    by_model = {r.model: r for r in res.backtest}
    assert by_model["seasonal_naive"].available is False
    assert by_model["xgboost"].available is False
    assert res.selected_model in {"naive_drift", "moving_average", "holt_winters", "trend_seasonal_regression"}
    assert any("Fewer than 24 months" in n for n in res.notes)
    json.dumps(res.model_dump(), allow_nan=False)


def test_partial_last_month_is_excluded_from_training():
    values = _seasonal_values(30)
    frame = _frame_from_monthly(values)
    # add a few rows for the first days of the next month only
    extra = frame.iloc[:2].copy()
    extra["date"] = pd.Timestamp("2023-07-03")
    frame = pd.concat([frame, extra], ignore_index=True)
    res = forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2023-12"))
    assert res.partial_last_month_excluded is True
    assert res.history_month_max == "2023-06"
    assert res.forecast[0].month == "2023-07"
    assert res.horizon_months == 6

    kept = forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2023-12", include_partial_month=True))
    assert kept.partial_last_month_excluded is False
    assert kept.history_month_max == "2023-07"


def test_filters_restrict_the_series():
    values = _seasonal_values(36)
    frame = _frame_from_monthly(values)
    full = forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2024-03"))
    brand_a = forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2024-03", filters=FilterSpec(brands=["A"])))
    assert brand_a.filter_row_count == full.filter_row_count / 2
    assert brand_a.history[0].actual == pytest.approx(full.history[0].actual * 0.6, rel=1e-6)
    assert "Brand: A" in brand_a.scope_label


def test_invalid_horizons_are_rejected():
    frame = _frame_from_monthly(_seasonal_values(24))
    with pytest.raises(ForecastError):
        forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2022-12"))  # equals last month
    with pytest.raises(ForecastError):
        forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2030-01"))  # > 36 months
    with pytest.raises(ForecastError):
        forecast_service.run_forecast(frame, ForecastRequest(forecast_until="nomonth"))
    with pytest.raises(ForecastError):
        forecast_service.run_forecast(frame, ForecastRequest(forecast_until="2023-06", filters=FilterSpec(brands=["Nope"])))


def test_seasonal_naive_repeats_last_year():
    y = np.array([float(i) for i in range(1, 25)])
    idx = pd.period_range("2020-01", periods=24, freq="M")
    preds = forecast_service._seasonal_naive(y, idx, 15)
    assert list(preds[:12]) == list(y[12:])
    assert list(preds[12:15]) == list(y[12:15])


@pytest.fixture()
def client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", True)
    monkeypatch.setattr(settings, "auth_disabled", True)
    return TestClient(app)


def test_forecast_endpoint_with_sample_file(client):
    with open(SAMPLE, "rb") as fh:
        upload = client.post("/api/upload", files={"file": ("sample_data.xlsx", fh.read())})
    upload_id = upload.json()["upload_id"]
    # sample covers 2026-04-01 .. 2026-07-29 -> July is partial and excluded, history = Apr..Jun
    res = client.post(f"/api/forecast/{upload_id}", json={"target": "net_sales", "forecast_until": "2026-10"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["history_month_max"] == "2026-06"
    assert body["partial_last_month_excluded"] is True
    assert [p["month"] for p in body["forecast"]] == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert body["selected_model"] in {r["model"] for r in body["backtest"] if r["available"]}

    bad = client.post(f"/api/forecast/{upload_id}", json={"target": "net_sales", "forecast_until": "2026-05"})
    assert bad.status_code == 400
    assert client.post("/api/forecast/doesnotexist", json={"forecast_until": "2027-01"}).status_code == 404

    # cached second call is identical
    again = client.post(f"/api/forecast/{upload_id}", json={"target": "net_sales", "forecast_until": "2026-10"}).json()
    assert again == body
