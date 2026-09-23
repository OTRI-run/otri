"""What a date may be, what a deletion leaves, and what a link in an email can do.

An event date was any date at all, and the arithmetic that fades a result's weight added two years
to it, so an event in the year 9999 took every page that runner appears on down with a ValueError.
An account deletion left the address in the delivery log and in the abuse counters. And the terms
promised an unsubscribe link that nothing could produce.
"""

from __future__ import annotations

import importlib
from datetime import date

import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import db
from scoring.runner_index import add_months

app_module = importlib.import_module("api.app")

from test_api import _create_event_and_race, _organizer_auth_headers, _publish_results  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

SANE = b"Rank,Time,Last name,First name,Gender\n1,5:10:00,Real,Ann,F\n"
PASSWORD = "correct horse battery"


def _verified(email):
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    return headers


# --- A race happens within a human span of years --------------------------------------------------


def test_an_event_date_far_in_the_future_is_refused():
    headers = _organizer_auth_headers("far-future@example.com")
    answer = client.post("/events", json={"event_name": "Year 9999", "event_date": "9999-01-01"}, headers=headers)
    assert answer.status_code == 422, "an event date nothing downstream can handle was accepted"


def test_an_event_date_long_before_trail_running_is_refused():
    headers = _organizer_auth_headers("far-past@example.com")
    assert client.post("/events", json={"event_name": "Antiquity", "event_date": "0001-01-01"}, headers=headers).status_code == 422


def test_ordinary_event_dates_are_accepted():
    headers = _organizer_auth_headers("ordinary-date@example.com")
    for when in ("2019-06-01", date.today().isoformat(), f"{date.today().year + 2}-06-01"):
        answer = client.post("/events", json={"event_name": f"Race {when}", "event_date": when}, headers=headers)
        assert answer.status_code == 201, (when, answer.text)


def test_the_weight_arithmetic_cannot_overflow_a_date():
    """Defence in depth: a row stored before the bound existed must not take a page down."""
    assert add_months(date(9999, 1, 1), 24) == date.max
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


# --- A published race is not deleted out from under the people reading it --------------------------


def test_a_published_race_cannot_be_deleted_while_it_is_public():
    headers = _verified("delete-published@example.com")
    _, race_id = _create_event_and_race(headers)
    assert client.post(f"/races/{race_id}/results", files={"file": ("r.csv", SANE, "text/csv")}, headers=headers).status_code == 200
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200

    answer = client.delete(f"/races/{race_id}", headers=headers)
    assert answer.status_code == 409 and "Unpublish it first" in answer.json()["detail"]
    assert db.find_race(race_id) is not None

    # Taking it down first is the way through, as it is for the course and the results.
    assert client.delete(f"/races/{race_id}/publish", headers=headers).status_code == 200
    assert client.delete(f"/races/{race_id}", headers=headers).status_code == 204


def test_an_event_holding_a_published_race_cannot_be_deleted():
    headers = _verified("delete-event@example.com")
    event_id, race_id = _create_event_and_race(headers)
    assert client.post(f"/races/{race_id}/results", files={"file": ("r.csv", SANE, "text/csv")}, headers=headers).status_code == 200
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200

    answer = client.delete(f"/events/{event_id}", headers=headers)
    assert answer.status_code == 409 and "published races" in answer.json()["detail"]
    assert db.find_event(event_id) is not None


def test_a_draft_race_is_still_deleted_in_one_step():
    headers = _verified("delete-draft@example.com")
    _, race_id = _create_event_and_race(headers)
    assert client.delete(f"/races/{race_id}", headers=headers).status_code == 204


# --- Deleting an account takes the address with it -------------------------------------------------


def test_deleting_an_account_takes_the_address_out_of_the_delivery_log():
    """The log is keyed on the address rather than the account, so it survived a deletion and kept
    a list of everyone who had ever had one, readable by any admin."""
    email = "forget-me@example.com"
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        rows = connection.execute("SELECT count(*) AS n FROM email_log WHERE to_email = %s", (email,)).fetchone()
    assert rows["n"] > 0, "registering sent nothing, so there is nothing to test"

    assert client.request("DELETE", "/auth/account", json={"password": PASSWORD}, headers=headers).status_code == 200

    with db.get_connection() as connection:
        left = connection.execute("SELECT count(*) AS n FROM email_log WHERE to_email = %s", (email,)).fetchone()
        failures = connection.execute("SELECT count(*) AS n FROM login_failures WHERE email LIKE %s", (f"%{email}%",)).fetchone()
    assert left["n"] == 0, "the address is still in the delivery log"
    assert failures["n"] == 0, "the address is still in the abuse counters"


# --- The unsubscribe link the terms promise --------------------------------------------------------


def test_the_unsubscribe_link_turns_the_news_off_and_signs_nobody_in():
    email = "newsreader@example.com"
    headers = _organizer_auth_headers(email)
    assert client.patch("/auth/profile", json={"marketing_opt_in": True}, headers=headers).status_code == 200

    answer = client.get("/auth/unsubscribe", params={"token": auth_module.unsubscribe_token(email)})
    assert answer.status_code == 200 and "unsubscribed" in answer.text
    assert "otri_session" not in answer.cookies, "an unsubscribe link must not be a way in"

    me = client.get("/auth/me", headers=headers).json()
    assert me["profile"]["marketing_opt_in"] is False
    assert me["profile"]["marketing_opt_in_at"] is None


def test_a_forged_unsubscribe_token_does_nothing():
    email = "keeps-news@example.com"
    headers = _organizer_auth_headers(email)
    assert client.patch("/auth/profile", json={"marketing_opt_in": True}, headers=headers).status_code == 200

    real = auth_module.unsubscribe_token(email)
    for forged in (real[:-1] + ("a" if real[-1] != "a" else "b"), "nonsense", real.split(".")[0] + ".0" * 32, ""):
        assert client.get("/auth/unsubscribe", params={"token": forged}).status_code == 200
    assert client.get("/auth/me", headers=headers).json()["profile"]["marketing_opt_in"] is True


def test_one_address_cannot_unsubscribe_another():
    headers = _organizer_auth_headers("mine@example.com")
    assert client.patch("/auth/profile", json={"marketing_opt_in": True}, headers=headers).status_code == 200
    client.get("/auth/unsubscribe", params={"token": auth_module.unsubscribe_token("someone-else@example.com")})
    assert client.get("/auth/me", headers=headers).json()["profile"]["marketing_opt_in"] is True
