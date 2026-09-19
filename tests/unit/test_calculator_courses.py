"""Courses an admin hand-picks for the calculator's "Pick a race" (Admin, Calculator courses)."""

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import db

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

GPX = (Path(__file__).resolve().parents[2] / "public" / "examples" / "otri-example-course.gpx").read_bytes()


def _headers(email, admin):
    client.post("/auth/register", json={"email": email, "password": "a-long-test-password-1", "accept_terms": True})
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE, is_admin = %s WHERE email = %s", (admin, email))
    token = client.post("/auth/login", json={"email": email, "password": "a-long-test-password-1"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def _add(headers, **fields):
    data = {"event_name": "Lavaredo Ultra Trail", "course_name": "120K", "location": "Cortina", "country": "ita", "source_url": "https://example.org/course", **fields}
    return client.post("/admin/calculator-courses", files={"file": ("lut.gpx", GPX, "application/gpx+xml")}, data=data, headers=headers)


def test_an_admin_adds_a_course_and_the_calculator_offers_it_but_the_races_page_does_not_call_it_a_race():
    admin = _headers("calc-admin@example.com", True)
    answer = _add(admin)
    assert answer.status_code == 201, answer.text
    course = answer.json()
    assert course["calculator_only"] is True and course["has_gpx"] is True and course["is_published"] is False
    assert course["event_country"] == "ITA" and course["source_url"] == "https://example.org/course"
    assert 23 < course["distance_km"] < 25, "the figures are the measured ones, not typed in"

    # Public: in the list the calculator reads, flagged so the races page leaves it out; its course opens.
    public = {race["race_id"]: race for race in client.get("/races").json()}
    assert public[course["race_id"]]["calculator_only"] is True
    assert client.get(f"/races/{course['race_id']}/gpx").status_code == 200
    # Not one of the admin's events, and not in the public list of events.
    assert course["event_id"] not in {event["event_id"] for event in client.get("/events?mine=true", headers=admin).json()}
    assert course["event_id"] not in {event["event_id"] for event in client.get("/events").json()}

    assert [row["race_id"] for row in client.get("/admin/calculator-courses", headers=admin).json()] == [course["race_id"]]
    assert client.delete(f"/admin/calculator-courses/{course['race_id']}", headers=admin).status_code == 204
    assert course["race_id"] not in {race["race_id"] for race in client.get("/races").json()}
    assert client.delete(f"/admin/calculator-courses/{course['race_id']}", headers=admin).status_code == 404


def test_only_an_admin_may_and_a_bad_file_or_link_is_said_plainly():
    organizer = _headers("calc-organizer@example.com", False)
    assert _add(organizer).status_code == 403
    assert client.get("/admin/calculator-courses", headers=organizer).status_code == 403
    admin = _headers("calc-admin-2@example.com", True)
    assert "must start with http" in _add(admin, source_url="ftp://example.org").json()["detail"]
    bad = client.post("/admin/calculator-courses", files={"file": ("x.gpx", b"<kml/>", "application/gpx+xml")}, data={"event_name": "Some race", "course_name": "50K"}, headers=admin)
    assert bad.status_code == 422 and "Google Earth KML" in bad.json()["detail"]
    assert client.get("/admin/calculator-courses", headers=admin).json() == [], "nothing is created when the file cannot be measured"


def test_a_course_can_be_edited_cleared_and_given_another_file():
    admin = _headers("calc-admin-3@example.com", True)
    course = _add(admin).json()
    url = f"/admin/calculator-courses/{course['race_id']}"

    # Names and place change; a field sent empty is cleared; the course itself is untouched.
    edited = client.patch(url, data={"event_name": "Lavaredo Ultra Trail 2027", "course_name": "LUT 120K", "location": "", "country": "", "source_url": ""}, headers=admin)
    assert edited.status_code == 200, edited.text
    body = edited.json()
    assert (body["event_name"], body["course_name"], body["event_location"], body["event_country"], body["source_url"]) == ("Lavaredo Ultra Trail 2027", "LUT 120K", None, None, None)
    assert body["distance_km"] == course["distance_km"] and body["calculator_only"] is True

    # With a file, the course is measured again: here half of it.
    half = GPX.decode("utf-8").split("</trkpt>")
    shorter = ("</trkpt>".join(half[: len(half) // 2]) + "</trkpt></trkseg></trk></gpx>").encode("utf-8")
    replaced = client.patch(url, files={"file": ("half.gpx", shorter, "application/gpx+xml")}, data={"event_name": "Lavaredo Ultra Trail 2027", "course_name": "LUT 60K", "country": "ITA"}, headers=admin)
    assert replaced.status_code == 200, replaced.text
    assert 11 < replaced.json()["distance_km"] < 13 and replaced.json()["event_country"] == "ITA"

    # A file that cannot be measured changes nothing, names included.
    refused = client.patch(url, files={"file": ("x.gpx", b"<kml/>", "application/gpx+xml")}, data={"event_name": "Renamed", "course_name": "X"}, headers=admin)
    assert refused.status_code == 422
    assert client.get("/admin/calculator-courses", headers=admin).json()[0]["course_name"] == "LUT 60K"

    # Only calculator courses, only admins.
    assert client.patch("/admin/calculator-courses/race-nope", data={"event_name": "Some race", "course_name": "X"}, headers=admin).status_code == 404
    assert client.patch(url, data={"event_name": "Some race", "course_name": "X"}, headers=_headers("calc-organizer-2@example.com", False)).status_code == 403
