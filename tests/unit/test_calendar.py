"""The races page as a calendar: an iCalendar feed of upcoming public races, a single-event
download, and races suggested by runners that an admin lists in one step."""

from datetime import date, datetime, timedelta, timezone

import pytest

from api.calendar_feed import CalendarEvent, CalendarRace, build_calendar
from test_api import _admin_headers, client
from test_listings import FUTURE, PAST, _listing, _public_race

pytestmark = pytest.mark.usefixtures("clean_state")


def _unfold(ics: str) -> str:
    return ics.replace("\r\n ", "")


# ------------------------------------------------------------------ the file format


def test_calendar_is_valid_icalendar_with_escaping_and_folding():
    event = CalendarEvent(
        event_id="evt-1", name="Doi Trail; the long, hard one", day=date(2027, 1, 9), location="Chiang Mai", country="THA", website="https://doitrail.example",
        races=[CalendarRace("race-b", "50K", 50.0, 2600.0), CalendarRace("race-a", "21K", 21.1, 950.0)],
    )
    ics = build_calendar([event], "https://otri.run/", now=datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc))
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and ics.endswith("END:VCALENDAR\r\n")
    assert all(len(line.encode("utf-8")) <= 75 for line in ics.split("\r\n")), "RFC 5545 line length"
    text = _unfold(ics)
    assert "UID:evt-1@otri.run" in text and "DTSTAMP:20260918T120000Z" in text
    assert "DTSTART;VALUE=DATE:20270109" in text and "DTEND;VALUE=DATE:20270110" in text
    assert "SUMMARY:Doi Trail\\; the long\\, hard one" in text
    assert "LOCATION:Chiang Mai\\, THA" in text
    # Shortest distance first, and the link opens that race's page.
    assert "DESCRIPTION:21K: 21.1 km\\, +950 m\\n50K: 50 km\\, +2\\,600 m\\n\\nCourse" in text
    assert "URL:https://otri.run/#races/race-a" in text


def test_folding_never_splits_a_character():
    event = CalendarEvent(event_id="e", name="เชียงใหม่ " * 12, day=date(2027, 1, 9))
    ics = build_calendar([event], "https://otri.run")
    ics.encode("utf-8").decode("utf-8")
    assert all(len(line.encode("utf-8")) <= 75 for line in ics.split("\r\n"))
    assert ("เชียงใหม่ " * 12).strip() in _unfold(ics)


# ------------------------------------------------------------------ the feed


def test_the_feed_lists_upcoming_public_events_once_each(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin, races=[{"course_name": "50K", "distance_km": 50, "elevation_gain_m": 2600}, {"course_name": "21K", "distance_km": 21, "elevation_gain_m": 900}])
    _listing(admin, name="Old Trail", event_date=PAST)
    response = client.get("/calendar.ics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    text = _unfold(response.text)
    assert text.count("BEGIN:VEVENT") == 1, "one entry per event, past events and demo results left out"
    assert "SUMMARY:Doi Trail" in text and "21K: 21 km" in text and "50K: 50 km" in text
    assert f"DTSTART;VALUE=DATE:{FUTURE.replace('-', '')}" in text
    assert "Old Trail" not in text


def test_the_feed_filters_by_country_and_serves_one_event(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)
    assert "Doi Trail" in client.get("/calendar.ics?country=THA").text
    assert "BEGIN:VEVENT" not in client.get("/calendar.ics?country=FRA").text
    assert client.get("/calendar.ics?country=thailand").status_code == 422

    _listing(admin, name="Old Trail", event_date=PAST)
    old = _public_race("Old Trail")
    single = client.get(f"/calendar.ics?event={old['event_id']}")
    assert single.status_code == 200 and "SUMMARY:Old Trail" in single.text, "a past event can still be added"
    assert client.get("/calendar.ics?event=nope").status_code == 404


def test_a_private_race_never_reaches_the_feed():
    from test_api import _organizer_auth_headers

    organizer = _organizer_auth_headers()
    event = client.post("/events", json={"event_name": "Secret Trail", "event_date": FUTURE}, headers=organizer).json()
    client.post(f"/events/{event['event_id']}/races", json={"course_name": "30K", "distance_km": 30, "elevation_gain_m": 1500}, headers=organizer)
    assert "Secret Trail" not in client.get("/calendar.ics").text
    assert client.get(f"/calendar.ics?event={event['event_id']}").status_code == 404


# ------------------------------------------------------------------ suggestions


SUGGESTION = {
    "kind": "suggestion",
    "subject_id": "new-race",
    "subject_label": "Khao Yai Trail",
    "message": "Suggested for the calendar: Khao Yai Trail",
    "reporter_email": "runner@example.com",
    "listing": {
        "event_name": "Khao Yai Trail",
        "event_date": (date.today() + timedelta(days=120)).isoformat(),
        "location": "Khao Yai",
        "country": "THA",
        "website": "https://khaoyai.example",
        "races": [{"course_name": "25K", "distance_km": 25, "elevation_gain_m": 1100}],
    },
}


def test_a_suggested_race_waits_for_an_admin_and_is_listed_in_one_step(monkeypatch):
    admin = _admin_headers(monkeypatch)
    created = client.post("/reports", json=SUGGESTION)
    assert created.status_code == 201, created.text
    assert all(r["event_name"] != "Khao Yai Trail" for r in client.get("/races").json()), "nothing is public before review"

    report = next(r for r in client.get("/admin/reports", headers=admin).json() if r["kind"] == "suggestion")
    assert report["payload"]["races"][0]["course_name"] == "25K"
    assert client.post(f"/admin/reports/{report['id']}/create-listing").status_code == 401
    listed = client.post(f"/admin/reports/{report['id']}/create-listing", headers=admin)
    assert listed.status_code == 200 and listed.json()["created_races"] == 1
    race = _public_race("Khao Yai Trail", "25K")
    assert race["listing_status"] == "upcoming" and race["official_url"] == "https://khaoyai.example"
    assert all(r["id"] != report["id"] for r in client.get("/admin/reports", headers=admin).json()), "the report is resolved"


def test_a_suggestion_is_checked_like_a_listing(monkeypatch):
    admin = _admin_headers(monkeypatch)
    assert client.post("/reports", json={**SUGGESTION, "listing": None}).status_code == 422
    bad_link = {**SUGGESTION, "listing": {**SUGGESTION["listing"], "website": "javascript:alert(1)"}}
    assert client.post("/reports", json=bad_link).status_code == 422
    no_distance = {**SUGGESTION, "listing": {**SUGGESTION["listing"], "races": [{"course_name": "X", "distance_km": 0}]}}
    assert client.post("/reports", json=no_distance).status_code == 422
    # An ordinary report cannot be turned into a listing.
    ordinary = client.post("/reports", json={"kind": "other", "subject_id": "x", "message": "Something else entirely."}).json()
    assert client.post(f"/admin/reports/{ordinary['id']}/create-listing", headers=admin).status_code == 422
