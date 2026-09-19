"""An organizer's own race, shown publicly before it has results: the facts and the course are
public, results stay behind publishing. OTRI lists no race on anyone's behalf: the OTRI-compiled
listings, requests for scores, claims and suggestions were retired
(docs/product/open-scoring-tool.md), and what they left in the database stays out of sight."""

from datetime import date, timedelta

import pytest

from api import db
from test_api import DEMO_RESULT_001, SINGLE_CLIMB_GPX, _admin_headers, _organizer_auth_headers, client

pytestmark = pytest.mark.usefixtures("clean_state")

FUTURE = (date.today() + timedelta(days=90)).isoformat()
PAST = (date.today() - timedelta(days=200)).isoformat()


def _listing(organizer, *, event_date=FUTURE, name="Doi Trail", races=None):
    """An event with its races, listed by the organizer who owns it."""
    event = client.post("/events", json={"event_name": name, "event_date": event_date, "location": "Chiang Mai", "country": "THA"}, headers=organizer)
    assert event.status_code == 201, event.text
    for race in races or [{"course_name": "50K", "distance_km": 50.0, "elevation_gain_m": 2600.0}]:
        created = client.post(f"/events/{event.json()['event_id']}/races", json=race, headers=organizer)
        assert created.status_code == 201, created.text
        assert client.post(f"/races/{created.json()['race_id']}/listing", headers=organizer).status_code == 200
    return event.json()


def _public_race(name="Doi Trail", course="50K"):
    return next(r for r in client.get("/races").json() if r["event_name"] == name and r["course_name"] == course)


def test_an_organizer_can_list_their_own_upcoming_race_and_take_it_down():
    organizer = _organizer_auth_headers()
    event = client.post("/events", json={"event_name": "My Race", "event_date": FUTURE}, headers=organizer).json()
    race = client.post(f"/events/{event['event_id']}/races", json={"course_name": "30K", "distance_km": 30, "elevation_gain_m": 1500}, headers=organizer).json()
    assert race["listing_status"] == "private"
    assert all(r["race_id"] != race["race_id"] for r in client.get("/races").json())

    other = _organizer_auth_headers("other@example.com")
    assert client.post(f"/races/{race['race_id']}/listing", headers=other).status_code == 403
    listed = client.post(f"/races/{race['race_id']}/listing", headers=organizer)
    assert listed.status_code == 200 and listed.json()["listing_status"] == "upcoming"
    assert any(r["race_id"] == race["race_id"] for r in client.get("/races").json())

    assert client.delete(f"/races/{race['race_id']}/listing", headers=organizer).json()["listing_status"] == "private"
    assert all(r["race_id"] != race["race_id"] for r in client.get("/races").json())


def test_a_listed_race_says_what_it_is_and_its_course_is_public():
    organizer = _organizer_auth_headers()
    _listing(organizer)
    race = _public_race()
    assert race["listing_status"] == "upcoming" and race["is_listed"] is True and race["is_published"] is False
    assert race["finisher_count"] == 0
    assert not {"is_claimed", "request_count", "official_url", "course_permission"} & race.keys()

    _listing(organizer, event_date=PAST, name="Old Trail")
    assert _public_race("Old Trail")["listing_status"] == "awaiting_results"

    with SINGLE_CLIMB_GPX.open("rb") as handle:
        attached = client.post(f"/races/{race['race_id']}/gpx", files={"file": ("c.gpx", handle, "application/gpx+xml")}, headers=organizer)
    assert attached.status_code == 200 and attached.json()["has_gpx"] is True
    # The course of a listed race is public: it is what the calculator, and an embed, open.
    assert client.get(f"/races/{race['race_id']}/gpx").status_code == 200
    assert client.get(f"/races/{race['race_id']}/measurement").status_code == 200


def test_results_of_a_listed_race_stay_private_until_published():
    organizer = _organizer_auth_headers("rd@doitrail.example")
    _listing(organizer, event_date=PAST)
    race = _public_race()

    with DEMO_RESULT_001.open("rb") as handle:
        uploaded = client.post(f"/races/{race['race_id']}/results", files={"file": ("r.csv", handle, "text/csv")}, headers=organizer)
    assert uploaded.status_code == 200, uploaded.text
    # Listed, results uploaded, not published: the public still sees a listing and no results.
    assert client.get(f"/races/{race['race_id']}/results").status_code == 403
    assert _public_race()["listing_status"] == "awaiting_results"

    assert client.post(f"/races/{race['race_id']}/publish", headers=organizer).status_code == 200
    assert _public_race()["listing_status"] == "scored"
    assert client.get(f"/races/{race['race_id']}/results").status_code == 200


def test_a_listed_race_nobody_owns_is_not_public(monkeypatch):
    """Rows left by the retired OTRI-compiled listings: kept in the table, never shown."""
    orphan = db.create_event("Imported Trail", date.fromisoformat(FUTURE), None)
    race = db.create_race(orphan.event_id, "50K", 50.0, 2600.0)
    db.set_race_listed(race.race_id, True)
    assert all(r["race_id"] != race.race_id for r in client.get("/races").json())
    # An admin still sees it, to delete it.
    admin = _admin_headers(monkeypatch)
    assert any(e["event_id"] == orphan.event_id for e in client.get("/admin/events", headers=admin).json())
    assert client.delete(f"/events/{orphan.event_id}", headers=admin).status_code == 204


def test_the_retired_listing_routes_are_gone(monkeypatch):
    admin = _admin_headers(monkeypatch)
    organizer = _organizer_auth_headers()
    event = _listing(organizer)
    race_id = _public_race()["race_id"]
    for method, path in [
        ("POST", "/admin/listings"),
        ("POST", "/admin/listings/import"),
        ("POST", f"/admin/events/{event['event_id']}/assign"),
        ("POST", f"/events/{event['event_id']}/claim"),
        ("POST", "/admin/reports/1/create-listing"),
        ("POST", f"/races/{race_id}/score-requests"),
        ("GET", "/calendar.ics"),
    ]:
        assert client.request(method, path, json={}, headers=admin).status_code in (404, 405), path
    # A claim or a suggestion is no longer a kind of report.
    for kind in ("claim", "suggestion"):
        filed = client.post("/reports", json={"kind": kind, "subject_id": race_id, "message": "I organize this race, please."})
        assert filed.status_code == 422, kind
