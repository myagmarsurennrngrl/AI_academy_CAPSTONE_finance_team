"""Login, token validation, admin-only user management and route protection."""
import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services import auth_service

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "app", "static", "sample_data.xlsx")


@pytest.fixture()
def client(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "use_mock_ai", True)
    monkeypatch.setattr(settings, "auth_disabled", False)
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "auth_secret", "")
    monkeypatch.setattr(settings, "admin_username", "boss")
    monkeypatch.setattr(settings, "admin_password", "secret123")
    auth_service.reset_store_cache()
    with TestClient(app) as c:  # runs the startup hook -> bootstraps the admin
        yield c
    auth_service.reset_store_cache()


def _login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_admin_is_bootstrapped_and_can_login(client):
    response = _login(client, "boss", "secret123")
    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"username": "boss", "role": "admin", "created_at": body["user"]["created_at"]}
    assert body["token"].count(".") == 1
    me = client.get("/api/auth/me", headers=_auth(body["token"]))
    assert me.status_code == 200
    assert me.json() == {"username": "boss", "role": "admin"}


def test_wrong_password_and_unknown_user_are_rejected(client):
    assert _login(client, "boss", "nope").status_code == 401
    assert _login(client, "ghost", "secret123").status_code == 401


def test_analysis_endpoints_require_login(client):
    with open(SAMPLE, "rb") as fh:
        content = fh.read()
    assert client.post("/api/upload", files={"file": ("s.xlsx", content)}).status_code == 401
    assert client.get("/api/dataset/x").status_code == 401
    assert client.post("/api/analysis/x/drivers", json={}).status_code == 401
    assert client.post("/api/analysis/x/insight", json={}).status_code == 401
    # health and the sample workbook stay public
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/health").json()["auth_required"] is True
    assert client.get("/api/sample/download").status_code == 200


def test_invalid_or_tampered_token_is_rejected(client):
    token = _login(client, "boss", "secret123").json()["token"]
    body, sig = token.split(".")
    assert client.get("/api/auth/me", headers=_auth("garbage")).status_code == 401
    assert client.get("/api/auth/me", headers=_auth(f"{body}.{sig[:-2]}xx")).status_code == 401


def test_admin_creates_user_who_can_analyse_but_not_administer(client):
    admin_token = _login(client, "boss", "secret123").json()["token"]

    created = client.post(
        "/api/auth/users",
        json={"username": "analyst", "password": "pass1234", "role": "user"},
        headers=_auth(admin_token),
    )
    assert created.status_code == 201
    assert created.json()["role"] == "user"

    # duplicate + weak password are rejected
    assert client.post("/api/auth/users", json={"username": "analyst", "password": "pass1234"}, headers=_auth(admin_token)).status_code == 409
    assert client.post("/api/auth/users", json={"username": "weak", "password": "123"}, headers=_auth(admin_token)).status_code == 400

    user_token = _login(client, "analyst", "pass1234").json()["token"]

    with open(SAMPLE, "rb") as fh:
        upload = client.post("/api/upload", files={"file": ("sample_data.xlsx", fh.read())}, headers=_auth(user_token))
    assert upload.status_code == 200
    upload_id = upload.json()["upload_id"]
    assert client.get(f"/api/dataset/{upload_id}", headers=_auth(user_token)).status_code == 200
    assert client.post(f"/api/analysis/{upload_id}/drivers", json={}, headers=_auth(user_token)).status_code == 200

    # a plain user cannot manage accounts
    assert client.get("/api/auth/users", headers=_auth(user_token)).status_code == 403
    assert client.post("/api/auth/users", json={"username": "x1", "password": "pass1234"}, headers=_auth(user_token)).status_code == 403

    listed = client.get("/api/auth/users", headers=_auth(admin_token)).json()["users"]
    assert [u["username"] for u in listed] == ["boss", "analyst"]


def test_admin_resets_password_and_deletes_user(client):
    admin_token = _login(client, "boss", "secret123").json()["token"]
    client.post("/api/auth/users", json={"username": "temp", "password": "pass1234"}, headers=_auth(admin_token))

    assert client.put("/api/auth/users/temp/password", json={"password": "newpass99"}, headers=_auth(admin_token)).status_code == 200
    assert _login(client, "temp", "pass1234").status_code == 401
    temp_token = _login(client, "temp", "newpass99").json()["token"]

    assert client.delete("/api/auth/users/temp", headers=_auth(admin_token)).status_code == 204
    # deleted user's still-valid token no longer works
    assert client.get("/api/auth/me", headers=_auth(temp_token)).status_code == 401
    # the last administrator cannot be removed
    assert client.delete("/api/auth/users/boss", headers=_auth(admin_token)).status_code == 400


def test_user_changes_own_password(client):
    admin_token = _login(client, "boss", "secret123").json()["token"]
    client.post("/api/auth/users", json={"username": "self", "password": "pass1234"}, headers=_auth(admin_token))
    token = _login(client, "self", "pass1234").json()["token"]
    bad = client.put("/api/auth/me/password", json={"current_password": "wrong", "new_password": "another1"}, headers=_auth(token))
    assert bad.status_code == 401
    ok = client.put("/api/auth/me/password", json={"current_password": "pass1234", "new_password": "another1"}, headers=_auth(token))
    assert ok.status_code == 200
    assert _login(client, "self", "another1").status_code == 200


def test_cli_creates_users(monkeypatch, tmp_path, capsys):
    from app import manage

    settings = get_settings()
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "cli-users.json"))
    monkeypatch.setattr(settings, "auth_secret", "")
    auth_service.reset_store_cache()
    assert manage.main(["create-user", "cli-admin", "adminpass", "--admin"]) == 0
    assert manage.main(["create-user", "cli-user", "userpass1"]) == 0
    assert manage.main(["create-user", "cli-user", "userpass1"]) == 1  # duplicate
    assert manage.main(["list-users"]) == 0
    out = capsys.readouterr().out
    assert "cli-admin" in out and "cli-user" in out
    assert manage.main(["delete-user", "cli-user"]) == 0
    assert auth_service.get_store().get("cli-user") is None
    auth_service.reset_store_cache()
