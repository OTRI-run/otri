"""The organizer web app keeps its session in an HttpOnly cookie; API clients keep using bearer
tokens. Both paths, the CSRF guard, logout, and revocation through the cookie."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from test_api import _register_and_verify

pytestmark = pytest.mark.usefixtures("clean_state")
app_module = importlib.import_module("api.app")
WEB = {"X-OTRI-Client": "web"}
PASSWORD = "correct horse battery"


def _web_client() -> TestClient:
    return TestClient(app_module.app, base_url="http://testserver")


def test_web_client_gets_an_httponly_cookie_and_no_token_in_the_body():
    _register_and_verify("cookie@example.com", PASSWORD)
    client = _web_client()
    response = client.post("/auth/login", json={"email": "cookie@example.com", "password": PASSWORD, "remember": True}, headers=WEB)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"] == "" and body["token_type"] == "cookie" and body["email"] == "cookie@example.com"
    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith("otri_session=") and "HttpOnly" in set_cookie and "SameSite=lax" in set_cookie.replace("Lax", "lax")
    assert "Max-Age=2592000" in set_cookie, "remember me: 30 days"
    assert "Secure" not in set_cookie, "plain http in tests; Secure is added behind HTTPS"
    # the cookie alone authenticates reads
    me = client.get("/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "cookie@example.com"


def test_cookie_is_secure_behind_a_tls_proxy():
    _register_and_verify("tls@example.com", PASSWORD)
    client = _web_client()
    response = client.post("/auth/login", json={"email": "tls@example.com", "password": PASSWORD}, headers={**WEB, "X-Forwarded-Proto": "https"})
    assert "Secure" in response.headers["set-cookie"] and "Max-Age=43200" in response.headers["set-cookie"]


def test_state_changing_requests_with_the_cookie_need_the_client_header():
    _register_and_verify("csrf@example.com", PASSWORD)
    client = _web_client()
    assert client.post("/auth/login", json={"email": "csrf@example.com", "password": PASSWORD}, headers=WEB).status_code == 200
    # a cross-site form post can carry the cookie but not a custom header
    forged = client.post("/events", json={"event_name": "Forged", "event_date": "2026-07-01"})
    assert forged.status_code == 403 and "X-OTRI-Client" in forged.json()["detail"]
    genuine = client.post("/events", json={"event_name": "Genuine", "event_date": "2026-07-01"}, headers=WEB)
    assert genuine.status_code == 201, genuine.text
    assert client.get("/events?mine=true").status_code == 200, "reads never need the header"


def test_logout_clears_the_cookie_and_logout_everywhere_revokes_it():
    _register_and_verify("bye-cookie@example.com", PASSWORD)
    client = _web_client()
    client.post("/auth/login", json={"email": "bye-cookie@example.com", "password": PASSWORD}, headers=WEB)
    response = client.post("/auth/logout", headers=WEB)
    assert response.status_code == 200 and 'otri_session=""' in response.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 401

    client.post("/auth/login", json={"email": "bye-cookie@example.com", "password": PASSWORD}, headers=WEB)
    stolen = client.cookies.get("otri_session")
    assert client.post("/auth/logout-all", json={"password": PASSWORD}, headers=WEB).status_code == 200
    other = _web_client()
    other.cookies.set("otri_session", stolen)
    assert other.get("/auth/me").status_code == 401, "a copied cookie is dead after sign out everywhere"


def test_password_change_and_two_factor_flow_keep_the_web_session_in_the_cookie():
    from api.security import totp_now

    _register_and_verify("cookie-2fa@example.com", PASSWORD)
    client = _web_client()
    client.post("/auth/login", json={"email": "cookie-2fa@example.com", "password": PASSWORD}, headers=WEB)
    changed = client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "a brand new passphrase 9"}, headers=WEB)
    assert changed.status_code == 200 and changed.json()["access_token"] == "" and "otri_session=" in changed.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200, "this device keeps working on the fresh cookie"

    setup = client.post("/auth/2fa/totp/setup", headers=WEB).json()
    assert client.post("/auth/2fa/totp/enable", json={"code": totp_now(setup["secret"])}, headers=WEB).status_code == 200
    fresh = _web_client()
    first = fresh.post("/auth/login", json={"email": "cookie-2fa@example.com", "password": "a brand new passphrase 9"}, headers=WEB).json()
    assert first["requires_2fa"] and fresh.cookies.get("otri_session") is None, "no cookie before the second step"
    second = fresh.post("/auth/login/2fa", json={"challenge": first["challenge"], "code": totp_now(setup["secret"])}, headers=WEB)
    assert second.status_code == 200 and second.json()["access_token"] == "" and fresh.cookies.get("otri_session")
    assert fresh.get("/auth/me").status_code == 200


def test_bearer_clients_are_unchanged():
    _register_and_verify("bearer@example.com", PASSWORD)
    client = _web_client()
    response = client.post("/auth/login", json={"email": "bearer@example.com", "password": PASSWORD})
    assert response.status_code == 200 and response.json()["access_token"] and "set-cookie" not in response.headers
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.post("/events", json={"event_name": "Bearer", "event_date": "2026-07-01"}, headers=headers).status_code == 201


def test_bearer_header_wins_over_a_cookie_for_a_different_account():
    _register_and_verify("one@example.com", PASSWORD)
    _register_and_verify("two@example.com", PASSWORD)
    client = _web_client()
    client.post("/auth/login", json={"email": "one@example.com", "password": PASSWORD}, headers=WEB)
    token = client.post("/auth/login", json={"email": "two@example.com", "password": PASSWORD}).json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["email"] == "two@example.com"
    assert client.get("/auth/me").json()["email"] == "one@example.com"
