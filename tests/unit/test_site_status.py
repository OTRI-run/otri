"""Maintenance mode (api/app.py, /site/status): an admin closes the site from the admin page, every
page asks before it shows itself, and the API keeps answering so the admin can open it again.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from api import db

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"


@pytest.fixture(autouse=True)
def _admin_list(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", set())


def _headers(email, admin):
    if admin:
        app_module._ADMIN_EMAILS.add(email)
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE, is_admin = %s WHERE email = %s", (admin, email))
    token = client.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def test_the_site_is_open_until_somebody_closes_it():
    answer = client.get("/site/status")
    assert answer.status_code == 200
    assert answer.json() == {"maintenance": {"on": False, "message": "", "since": None}}
    assert answer.headers["cache-control"] == "no-store", "a closed page polls this; a cached answer would keep it closed"


def test_an_admin_closes_the_site_with_a_message_and_opens_it_again():
    admin = _headers("site-admin@example.com", True)
    closed = client.put("/admin/site/maintenance", json={"on": True, "message": "  Moving the database. Back by 14:00 CET.  "}, headers=admin)
    assert closed.status_code == 200
    state = closed.json()["maintenance"]
    assert state["on"] is True and state["message"] == "Moving the database. Back by 14:00 CET." and state["since"]

    public = client.get("/site/status").json()["maintenance"]
    assert public == state, "the public sees exactly what the admin set, and nothing about who set it"
    assert "by" not in public

    # Changing the message while closed keeps the time it was closed.
    again = client.put("/admin/site/maintenance", json={"on": True, "message": "Nearly done."}, headers=admin).json()["maintenance"]
    assert again["since"] == state["since"] and again["message"] == "Nearly done."

    opened = client.put("/admin/site/maintenance", json={"on": False}, headers=admin).json()["maintenance"]
    assert opened == {"on": False, "message": "", "since": None}
    assert client.get("/site/status").json()["maintenance"]["on"] is False


def test_only_an_admin_can_close_the_site():
    organizer = _headers("plain-organizer@example.com", False)
    assert client.put("/admin/site/maintenance", json={"on": True}, headers=organizer).status_code == 403
    assert client.put("/admin/site/maintenance", json={"on": True}).status_code == 401
    assert client.get("/site/status").json()["maintenance"]["on"] is False


def test_the_message_has_a_ceiling():
    admin = _headers("site-admin@example.com", True)
    assert client.put("/admin/site/maintenance", json={"on": True, "message": "x" * 501}, headers=admin).status_code == 422
