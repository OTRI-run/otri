"""Counting visits without following anybody (api/analytics.py).

The point of these is less that the numbers add up and more that nothing is kept which should not
be: no address, no search anybody typed, no row that says which race a particular person looked
at, and nothing that joins today to yesterday.
"""

from __future__ import annotations

import importlib
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from api import analytics, db

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"


def _hit(path="/#races", referrer="", zone="Asia/Bangkok", agent=CHROME, action=None):
    body = {"p": path, "r": referrer, "tz": zone}
    if action:
        body["e"] = action
    return client.post("/site/hit", content=json.dumps(body), headers={"user-agent": agent, "content-type": "text/plain"})


def _traffic(days=30):
    return db.site_traffic(date.today() - timedelta(days=days - 1))


# --- What is counted ----------------------------------------------------------------------------


def test_a_page_view_is_counted():
    assert _hit().status_code == 204
    traffic = _traffic()
    assert traffic["totals"]["hits"] == 1 and traffic["totals"]["visitors"] == 1
    assert traffic["pages"][0]["name"] == "/#races"
    assert traffic["devices"][0]["name"] == "desktop"
    assert traffic["zones"][0]["name"] == "Asia/Bangkok"


def test_one_person_reading_five_pages_is_one_visitor():
    for page in ("/", "/#races", "/#runners", "/#faq", "/#calculator"):
        _hit(path=page)
    traffic = _traffic()
    assert traffic["totals"]["hits"] == 5
    assert traffic["totals"]["visitors"] == 1, "the same browser at the same address is one visitor"
    assert len(traffic["pages"]) == 5


def test_two_different_browsers_are_two_visitors():
    _hit(agent=CHROME)
    _hit(agent=IPHONE)
    traffic = _traffic()
    assert traffic["totals"]["visitors"] == 2
    assert {row["name"] for row in traffic["devices"]} == {"desktop", "mobile"}


def test_the_beacon_answers_even_when_it_is_nonsense():
    """It is sent as a page closes and nothing waits on it, so it never argues."""
    for body in ("", "not json", json.dumps({"p": 12}), json.dumps({"p": "/" + "x" * 5_000})):
        assert client.post("/site/hit", content=body, headers={"user-agent": CHROME, "content-type": "text/plain"}).status_code == 204


def test_a_robot_is_not_a_visitor():
    _hit(agent="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
    _hit(agent="python-requests/2.32")
    _hit(agent="HeadlessChrome/140.0")
    assert _traffic()["totals"]["hits"] == 0


# --- What is not kept ----------------------------------------------------------------------------


def test_a_visitor_today_is_a_different_number_tomorrow():
    """The date is inside the digest, so no two days can be joined into one person's history."""
    today = analytics.visitor_key("198.51.100.7", CHROME, date(2026, 9, 22))
    tomorrow = analytics.visitor_key("198.51.100.7", CHROME, date(2026, 9, 23))
    assert today != tomorrow
    assert analytics.visitor_key("198.51.100.7", CHROME, date(2026, 9, 22)) == today, "but the same day is the same person"


def test_no_address_is_anywhere_in_what_is_stored():
    address = "198.51.100.7"
    _hit()
    with db.get_connection() as connection:
        rows = connection.execute("SELECT * FROM site_hits").fetchall()
        visitors = connection.execute("SELECT visitor FROM site_visitors").fetchall()
    assert address not in json.dumps([dict(row) for row in rows], default=str)
    assert all(address not in row["visitor"] for row in visitors)


def test_what_somebody_searched_for_is_not_kept():
    """A search engine sends the query in the referring address. It is the visitor's own words."""
    _hit(referrer="https://www.google.com/search?q=how+do+i+score+a+trail+race+for+my+club")
    sources = _traffic()["sources"]
    assert sources[0]["name"] == "google.com"
    assert "trail+race" not in json.dumps(sources)


def test_which_race_a_person_looked_at_is_not_kept():
    """Every race page counts as one page. A row per race is a list of what was looked at."""
    _hit(path="/#races/race-d8d0c2c5")
    _hit(path="/#races/race-1a2b3c4d")
    pages = _traffic()["pages"]
    assert len(pages) == 1 and pages[0]["hits"] == 2
    assert "d8d0c2c5" not in json.dumps(pages)


def test_a_visit_from_otri_itself_is_not_a_referral():
    _hit(referrer="https://otri.run/")
    assert _traffic()["sources"][0]["name"] == "direct"


def test_yesterdays_visitor_digests_are_thrown_away():
    with db.get_connection() as connection:
        connection.execute("INSERT INTO site_visitors (day, visitor) VALUES (%s, %s)", (date.today() - timedelta(days=9), "old"))
    assert db.prune_site_visitors(date.today() - timedelta(days=3)) == 1


# --- The named counts ----------------------------------------------------------------------------


def test_an_action_the_api_watched_is_counted():
    analytics.count("race_scored")
    analytics.count("race_scored")
    analytics.count("organizer_signup")
    actions = {row["name"]: row["hits"] for row in _traffic()["actions"]}
    assert actions == {"race_scored": 2, "organizer_signup": 1}


def test_a_made_up_action_is_dropped():
    analytics.count("something_invented")
    assert _hit(action="also_invented").status_code == 204
    assert _traffic()["actions"] == []


def test_an_action_never_stops_the_work_it_was_counting(monkeypatch):
    """Counting is never why a request fails."""
    monkeypatch.setattr(db, "record_site_action", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("database is away")))
    analytics.count("race_scored")  # must not raise


# --- Who may read it ------------------------------------------------------------------------------


def test_the_numbers_are_for_admins_only():
    from test_api import _organizer_auth_headers

    assert client.get("/admin/traffic").status_code == 401
    plain = _organizer_auth_headers("not-an-admin@example.com")
    assert client.get("/admin/traffic", headers=plain).status_code == 403


def test_an_admin_reads_the_summary(monkeypatch):
    from test_api import _organizer_auth_headers

    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss-traffic@example.com"})
    headers = _organizer_auth_headers("boss-traffic@example.com")
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE, is_admin = TRUE WHERE email = %s", ("boss-traffic@example.com",))
    _hit()
    body = client.get("/admin/traffic?days=7", headers=headers).json()
    assert body["totals"]["hits"] == 1
    assert set(body) >= {"by_day", "pages", "sources", "zones", "devices", "browsers", "actions", "totals"}
