"""What OTRI keeps about a person, and what it hands to whoever holds a session.

Each of these was something the code did that the privacy policy did not describe: a bulk export
of every athlete's name behind nothing but a cookie, one-time tokens that were never deleted, an
address written into a URL and from there into two access logs, a phone number the form stopped
asking for but the endpoint still took.
"""

from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import db, email as email_module

app_module = importlib.import_module("api.app")

from test_api import _create_event_and_race, _organizer_auth_headers  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

REPO = Path(__file__).resolve().parents[2]
PASSWORD = "correct horse battery"


# --- The export asks for the password, like everything else that matters ---------------------------


def test_the_export_is_not_handed_over_on_a_session_alone():
    """It carries every result row the account uploaded, each with a runner's name, gender, year of
    birth and nationality. A session is what an attacker has."""
    headers = _organizer_auth_headers("export-guard@example.com")
    assert client.get("/auth/export", headers=headers).status_code == 405, "the unprotected GET is gone"
    assert client.post("/auth/export", json={"password": "not the password"}, headers=headers).status_code == 400
    assert client.post("/auth/export", json={"password": PASSWORD}, headers=headers).status_code == 200


def test_the_export_names_the_sign_ins_linked_to_the_account():
    """A linked Google account is held about the person and is nowhere else they can see it."""
    headers = _organizer_auth_headers("export-identities@example.com")
    organizer_id = db.find_organizer_id("export-identities@example.com")
    with db.get_connection() as connection:
        connection.execute(
            "INSERT INTO organizer_identities (organizer_id, provider, subject, email) VALUES (%s, %s, %s, %s)",
            (organizer_id, "google", "sub-export-1", "export-identities@gmail.com"),
        )
    data = client.post("/auth/export", json={"password": PASSWORD}, headers=headers).json()
    assert [row["subject"] for row in data["linked_sign_ins"]] == ["sub-export-1"]
    assert data["linked_sign_ins"][0]["email"] == "export-identities@gmail.com"
    assert "password_hash" not in data["account"], "security material stays out"


# --- One-time tokens do not accumulate -------------------------------------------------------------


def test_spent_one_time_tokens_are_swept_on_the_path_that_makes_them():
    """Reset tokens were only ever marked used, never removed, so the table kept a permanent record
    of every time an account asked for recovery. PRIVACY.md said they were deleted after two hours."""
    _organizer_auth_headers("sweeper@example.com")
    organizer_id = db.find_organizer_id("sweeper@example.com")
    stale = datetime.now(timezone.utc) - timedelta(days=3)
    with db.get_connection() as connection:
        connection.execute(
            "INSERT INTO password_reset_tokens (token, organizer_id, expires_at) VALUES (%s, %s, %s)",
            ("stale-reset-digest", organizer_id, stale),
        )
        connection.execute(
            "INSERT INTO email_verification_tokens (token, organizer_id, expires_at) VALUES (%s, %s, %s)",
            ("stale-verify-digest", organizer_id, stale),
        )

    auth_module.create_password_reset_token("sweeper@example.com")

    with db.get_connection() as connection:
        resets = connection.execute("SELECT token FROM password_reset_tokens WHERE token = %s", ("stale-reset-digest",)).fetchall()
        verifies = connection.execute("SELECT token FROM email_verification_tokens WHERE token = %s", ("stale-verify-digest",)).fetchall()
    assert resets == [] and verifies == [], "expired one-time tokens are still on file"


def test_a_reset_token_is_kept_a_little_past_its_expiry():
    """So somebody opening a stale link is told it has expired, not that it never existed."""
    _organizer_auth_headers("recent@example.com")
    organizer_id = db.find_organizer_id("recent@example.com")
    with db.get_connection() as connection:
        connection.execute(
            "INSERT INTO password_reset_tokens (token, organizer_id, expires_at) VALUES (%s, %s, %s)",
            ("just-expired", organizer_id, datetime.now(timezone.utc) - timedelta(minutes=5)),
        )
    auth_module.create_password_reset_token("recent@example.com")
    with db.get_connection() as connection:
        rows = connection.execute("SELECT token FROM password_reset_tokens WHERE token = %s", ("just-expired",)).fetchall()
    assert len(rows) == 1


# --- The application log is not a list of everyone who signed up -----------------------------------


def test_the_log_carries_a_shortened_address_never_the_whole_one():
    assert email_module._for_log("halloween8@googlemail.com") == "ha***@googlemail.com"
    assert email_module._for_log("A@B.example") == "a***@b.example"
    assert email_module._for_log("not-an-address") == "***"


def test_the_development_branch_does_not_print_the_message_body(capsys, monkeypatch):
    """That branch runs whenever the key is missing, including by accident in production -- which
    is exactly when printing a live reset link would matter most."""
    monkeypatch.setattr(email_module, "RESEND_API_KEY", "")
    email_module._send("someone@example.com", "Reset your password", "<p>x</p>", "Open https://otri.run/reset?token=SECRET-TOKEN")
    printed = capsys.readouterr().out
    assert "SECRET-TOKEN" not in printed, "a live reset link was printed to the log"
    assert "someone@example.com" not in printed
    assert "so***@example.com" in printed


# --- A phone number is not asked for, and no longer accepted ----------------------------------------


def test_a_phone_number_is_not_stored_even_if_a_client_sends_one():
    headers = _organizer_auth_headers("no-phone@example.com")
    answer = client.patch("/auth/profile", json={"display_name": "Ann", "phone": "+66 000 0000"}, headers=headers)
    assert answer.status_code == 200
    assert "phone" not in answer.json()
    with db.get_connection() as connection:
        row = connection.execute("SELECT phone FROM organizers WHERE email = %s", ("no-phone@example.com",)).fetchone()
    assert row["phone"] is None


# --- One-time links stay out of the access logs ------------------------------------------------------


def test_the_deployed_access_logs_record_the_path_and_not_the_query_string():
    """A Google identity-link token and an OAuth code arrive as query parameters, and a log is
    kept, rotated, shipped and backed up."""
    service = (REPO / "scripts" / "deploy" / "10-install-service.sh").read_text(encoding="utf-8")
    assert "--access-logformat" in service and "%(U)s" in service, "gunicorn still logs the whole request line"
    assert "%(r)s" not in service

    nginx = (REPO / "scripts" / "deploy" / "03-configure-nginx.sh").read_text(encoding="utf-8")
    assert "log_format otri_no_query" in nginx and "access_log /var/log/nginx/access.log otri_no_query;" in nginx
    assert "$request " not in nginx.split("log_format otri_no_query", 1)[1].split("server {", 1)[0]
