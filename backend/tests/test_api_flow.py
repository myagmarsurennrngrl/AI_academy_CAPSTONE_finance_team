"""Upload -> dataset -> filtered drivers -> filtered insight, with the AI stage
mocked (USE_MOCK_AI). Verifies that server-side statistics describe exactly
the rows the browser would select with the same filter."""
import os

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "app", "static", "sample_data.xlsx")


@pytest.fixture()
def client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", True)
    return TestClient(app)


def _upload(client):
    with open(SAMPLE, "rb") as fh:
        response = client.post("/api/upload", files={"file": ("sample_data.xlsx", fh.read())})
    assert response.status_code == 200
    body = response.json()
    assert body["can_analyze"] is True
    return body["upload_id"]


def test_dataset_endpoint_returns_columnar_rows(client):
    upload_id = _upload(client)
    response = client.get(f"/api/dataset/{upload_id}")
    assert response.status_code == 200
    ds = response.json()
    assert ds["row_count"] == 2768
    assert ds["dimensions"]["sales_types"] == ["POS", "SHIPMENT"]
    assert len(ds["columns"]["net_sales"]) == ds["row_count"]
    assert "brand_products" in ds["dimensions"]


def test_filtered_drivers_and_insight_match_client_filter(client):
    upload_id = _upload(client)
    ds = client.get(f"/api/dataset/{upload_id}").json()
    df = pd.DataFrame(ds["columns"])

    spec = {"brands": ["Aurora"], "channels": ["E-commerce"], "date_from": "2026-05-01", "date_to": "2026-06-30"}
    mask = (df["brand"] == "Aurora") & (df["sales_channel"] == "E-commerce") & (df["date"] >= "2026-05-01") & (df["date"] <= "2026-06-30")

    drivers = client.post(f"/api/analysis/{upload_id}/drivers", json=spec)
    assert drivers.status_code == 200
    body = drivers.json()
    assert body["filter_row_count"] == int(mask.sum())
    assert body["target"] == "volume_units"
    assert body["importance_basis"] in ("model_permutation_importance", "univariate_association")
    assert all(0 <= d["importance_score"] <= 100 for d in body["driver_ranking"])

    insight = client.post(f"/api/analysis/{upload_id}/insight", json=spec)
    assert insight.status_code == 200
    ins = insight.json()
    assert ins["filter_row_count"] == int(mask.sum())
    assert "Brand: Aurora" in ins["scope_label"]
    assert ins["kpis"]["net_sales"] == pytest.approx(float(df.loc[mask, "net_sales"].sum()))
    assert ins["kpis"]["volume_units"] == pytest.approx(float(df.loc[mask, "volume_units"].sum()))
    assert ins["kpis"]["sell_in_units"] == pytest.approx(float(df.loc[mask, "sell_in_units"].sum()))
    assert ins["meta"]["mock_ai"] is True

    # second call is served from the per-filter cache and identical
    again = client.post(f"/api/analysis/{upload_id}/insight", json=spec).json()
    assert again["generated_at"] == ins["generated_at"]


def test_insight_rejects_empty_selection(client):
    upload_id = _upload(client)
    response = client.post(f"/api/analysis/{upload_id}/insight", json={"brands": ["NoSuchBrand"]})
    assert response.status_code == 400


def test_unknown_upload_is_404(client):
    assert client.get("/api/dataset/doesnotexist").status_code == 404
    assert client.post("/api/analysis/doesnotexist/drivers", json={}).status_code == 404
