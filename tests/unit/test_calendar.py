"""The races page as a calendar: an iCalendar feed of upcoming public races, a single-event
download, and races suggested by runners that an admin lists in one step."""

from datetime import date, datetime, timedelta, timezone

import pytest

from api.calendar_feed import CalendarEvent, CalendarRace, build_calendar
from test_api import _organizer_auth_headers, client
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


def test_the_feed_lists_upcoming_public_events_once_each():
    organizer = _organizer_auth_headers()
    _listing(organizer, races=[{"course_name": "50K", "distance_km": 50, "elevation_gain_m": 2600}, {"course_name": "21K", "distance_km": 21, "elevation_gain_m": 900}])
    _listing(organizer, name="Old Trail", event_date=PAST)
    response = client.get("/calendar.ics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    text = _unfold(response.text)
    assert text.count("BEGIN:VEVENT") == 1, "one entry per event, past events and demo results left out"
    assert "SUMMARY:Doi Trail" in text and "21K: 21 km" in text and "50K: 50 km" in text
    assert f"DTSTART;VALUE=DATE:{FUTURE.replace('-', '')}" in text
    assert "Old Trail" not in text


def test_the_feed_filters_by_country_and_serves_one_event():
    organizer = _organizer_auth_headers()
    _listing(organizer)
    assert "Doi Trail" in client.get("/calendar.ics?country=THA").text
    assert "BEGIN:VEVENT" not in client.get("/calendar.ics?country=FRA").text
    assert client.get("/calendar.ics?country=thailand").status_code == 422

    _listing(organizer, name="Old Trail", event_date=PAST)
    old = _public_race("Old Trail")
    single = client.get(f"/calendar.ics?event={old['event_id']}")
    assert single.status_code == 200 and "SUMMARY:Old Trail" in single.text, "a past event can still be added"
    assert client.get("/calendar.ics?event=nope").status_code == 404


def test_a_private_race_never_reaches_the_feed():
    organizer = _organizer_auth_headers()
    event = client.post("/events", json={"event_name": "Secret Trail", "event_date": FUTURE}, headers=organizer).json()
    client.post(f"/events/{event['event_id']}/races", json={"course_name": "30K", "distance_km": 30, "elevation_gain_m": 1500}, headers=organizer)
    assert "Secret Trail" not in client.get("/calendar.ics").text
    assert client.get(f"/calendar.ics?event={event['event_id']}").status_code == 404
