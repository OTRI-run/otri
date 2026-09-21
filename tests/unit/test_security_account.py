"""Account recovery, the second factor and automated uploads: five findings of an outside review,
each tried here as an attacker would."""

import importlib
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth, db, security

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"
GPX = (Path(__file__).resolve().parents[2] / "public" / "examples" / "otri-example-course.gpx").read_bytes()


def _account(email, *, verified=True):
    client.cookies.clear()
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    if verified:
        with db.get_connection() as connection:
            connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    token = client.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def _with_authenticator(email):
    """An account protected by an authenticator app; returns (headers, secret)."""
    headers = _account(email)
    secret = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).json()["secret"]
    enabled = client.post("/auth/2fa/totp/enable", json={"code": security.totp_now(secret)}, headers=headers)
    assert enabled.status_code == 200
    return {**headers, "Authorization": f"Bearer {enabled.json()['access_token']}"}, secret


def test_wrong_codes_are_counted_and_the_sixth_guess_is_refused_even_when_right():
    """The attempt was counted in the transaction that a wrong code rolled back: eight wrong codes left
    the counter at zero, and the five-attempt limit never applied."""
    _headers, secret = _with_authenticator("guess@example.com")
    challenge = client.post("/auth/login", json={"email": "guess@example.com", "password": PASSWORD}).json()["challenge"]
    for attempt in range(1, 6):
        assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": "000000"}).status_code == 401
        with db.get_connection() as connection:
            assert connection.execute("SELECT attempts FROM login_challenges WHERE token = %s", (auth._token_digest(challenge),)).fetchone()["attempts"] == attempt
    answer = client.post("/auth/login/2fa", json={"challenge": challenge, "code": security.totp_now(secret, at=time.time() + 30)})
    assert answer.status_code == 401 and "too many attempts" in answer.json()["detail"], "the right code, too late"
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM login_challenges WHERE token = %s", (auth._token_digest(challenge),)).fetchone()["n"] == 0
    # A fresh sign-in gets a fresh five.
    challenge = client.post("/auth/login", json={"email": "guess@example.com", "password": PASSWORD}).json()["challenge"]
    assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": security.totp_now(secret, at=time.time() + 30)}).status_code == 200


def test_a_reset_link_does_not_get_past_the_second_factor():
    _headers, secret = _with_authenticator("recover@example.com")
    _organizer, token = auth.create_password_reset_token("recover@example.com")
    answer = client.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-9"}, headers={"X-OTRI-Client": "web"})
    body = answer.json()
    assert answer.status_code == 200 and body["requires_2fa"] is True and body["access_token"] == ""
    assert not answer.cookies, "no session: the mailbox is one factor, not two"
    # The new password works, and still asks for the code.
    login = client.post("/auth/login", json={"email": "recover@example.com", "password": "a-brand-new-password-9"}).json()
    assert login["requires_2fa"] is True and login["access_token"] == ""
    assert client.post("/auth/login/2fa", json={"challenge": login["challenge"], "code": security.totp_now(secret, at=time.time() + 30)}).status_code == 200
    # Without a second factor a reset signs in, as before.
    _account("plain@example.com")
    _organizer, token = auth.create_password_reset_token("plain@example.com")
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-9"}).json()["access_token"]


def test_a_reset_signs_out_every_session_and_kills_other_open_links():
    intruder = _account("victim@example.com")  # a session the owner does not know about
    assert client.get("/auth/me", headers=intruder).status_code == 200
    challenge_holder = client.post("/auth/login", json={"email": "victim@example.com", "password": PASSWORD})
    assert challenge_holder.status_code == 200
    _organizer, first = auth.create_password_reset_token("victim@example.com")
    _organizer, second = auth.create_password_reset_token("victim@example.com")
    assert client.post("/auth/reset-password", json={"token": first, "new_password": "a-brand-new-password-9"}).status_code == 200
    client.cookies.clear()
    assert client.get("/auth/me", headers=intruder).status_code == 401, "the old session died with the old password"
    assert client.post("/auth/reset-password", json={"token": second, "new_password": "the-intruders-password-7"}).status_code == 400, "the other link died too"
    assert client.post("/auth/login", json={"email": "victim@example.com", "password": PASSWORD}).status_code == 401


def test_a_session_alone_cannot_replace_the_authenticator():
    headers, secret = _with_authenticator("swap@example.com")
    # With the session but without the password: nothing starts, and nothing pending can be enabled.
    for body in ({}, {"password": "not-the-password-123"}):
        assert client.post("/auth/2fa/totp/setup", json=body, headers=headers).status_code in (400, 422)
        assert client.post("/auth/2fa/email/start", json=body, headers=headers).status_code in (400, 422)
    assert client.post("/auth/2fa/totp/enable", json={"code": "123456"}, headers=headers).status_code == 400
    with db.get_connection() as connection:
        row = connection.execute("SELECT totp_secret, totp_secret_pending FROM organizers WHERE email = %s", ("swap@example.com",)).fetchone()
    assert row["totp_secret"] == secret and row["totp_secret_pending"] is None, "the owner's authenticator is untouched"
    # The owner, with the password, can.
    assert client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).status_code == 200


def test_a_throwaway_account_cannot_pile_up_events_or_hammer_the_uploads():
    unconfirmed = _account("throwaway@example.com", verified=False)
    made = [client.post("/events", json={"event_name": f"Spam {i}", "event_date": "2027-01-01"}, headers=unconfirmed) for i in range(5)]
    assert [answer.status_code for answer in made] == [201, 201, 201, 403, 403]
    assert "Confirm your email address" in made[3].json()["detail"]

    organizer = _account("real@example.com")
    event = client.post("/events", json={"event_name": "Real Trail", "event_date": "2027-01-01"}, headers=organizer).json()
    race = client.post(f"/events/{event['event_id']}/races", json={"course_name": "24K", "distance_km": 24, "elevation_gain_m": 900}, headers=organizer).json()
    statuses = [client.post(f"/races/{race['race_id']}/gpx", files={"file": ("c.gpx", GPX, "application/gpx+xml")}, headers=organizer).status_code for _ in range(14)]
    assert statuses[:12] == [200] * 12 and statuses[12:] == [429, 429], statuses
    # The limit follows the account across races: another race is not a fresh allowance.
    other = client.post(f"/events/{event['event_id']}/races", json={"course_name": "10K", "distance_km": 10, "elevation_gain_m": 200}, headers=organizer).json()
    assert client.post(f"/races/{other['race_id']}/gpx", files={"file": ("c.gpx", GPX, "application/gpx+xml")}, headers=organizer).status_code == 429
