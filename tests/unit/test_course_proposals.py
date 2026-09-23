"""Courses visitors propose for the calculator's "Pick a race" (api/app.py, /calculator-courses/
proposals): measured and kept for an admin, added on their own after the waiting time, never twice.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import db

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

GPX = (Path(__file__).resolve().parents[2] / "public" / "examples" / "otri-example-course.gpx").read_bytes()
PASSWORD = "a-long-test-password-1"


@pytest.fixture(autouse=True)
def _admin_list(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", set())


def _admin(email="course-admin@example.com"):
    app_module._ADMIN_EMAILS.add(email)
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE, is_admin = TRUE WHERE email = %s", (email,))
    token = client.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def _propose(**fields):
    data = {"event_name": "Doi Inthanon Trail", "course_name": "60K", "year": 2026, "location": "Chiang Mai", "country": "tha", "source_url": "https://example.org/course", "attest": "true", "email": "runner@example.com", **fields}
    return client.post("/calculator-courses/proposals", files={"file": ("course.gpx", GPX, "application/gpx+xml")}, data=data)


def test_a_visitor_proposes_a_course_and_an_admin_approves_it():
    answer = _propose()
    assert answer.status_code == 201, answer.text
    proposal = answer.json()
    assert proposal["status"] == "pending" and proposal["auto_approve_at"] and proposal["edition_year"] == 2026
    assert proposal["submitter_email"] is None, "the public answer never carries the address"
    assert client.get("/admin/calculator-courses", headers=_admin()).json() == [], "nothing is in the calculator until somebody says so"

    admin = _admin()
    pending = client.get("/admin/course-proposals", headers=admin).json()
    assert len(pending) == 1 and pending[0]["submitter_email"] == "runner@example.com"
    assert client.get(f"/admin/course-proposals/{proposal['id']}/gpx", headers=admin).status_code == 200

    approved = client.post(f"/admin/course-proposals/{proposal['id']}", json={"action": "approve"}, headers=admin)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved" and approved.json()["race_id"]
    courses = client.get("/admin/calculator-courses", headers=admin).json()
    assert len(courses) == 1
    assert courses[0]["event_name"] == "Doi Inthanon Trail" and courses[0]["course_name"] == "60K"
    assert courses[0]["edition_year"] == 2026 and courses[0]["event_country"] == "THA" and courses[0]["source_url"] == "https://example.org/course"
    assert courses[0]["calculator_only"] and courses[0]["has_gpx"]
    assert client.get(f"/races/{courses[0]['race_id']}/gpx").status_code == 200

    again = client.post(f"/admin/course-proposals/{proposal['id']}", json={"action": "approve"}, headers=admin)
    assert again.status_code == 409, "a decision is made once"


def test_a_rejected_proposal_adds_nothing():
    proposal = _propose().json()
    admin = _admin()
    rejected = client.post(f"/admin/course-proposals/{proposal['id']}", json={"action": "reject", "note": "That is the 2019 course."}, headers=admin)
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected" and rejected.json()["note"] == "That is the 2019 course."
    assert client.get("/admin/calculator-courses", headers=admin).json() == []
    assert client.get("/admin/course-proposals", headers=admin).json() == []
    assert len(client.get("/admin/course-proposals?status=all", headers=admin).json()) == 1


def test_a_proposal_nobody_objected_to_is_added_on_its_own():
    admin = _admin()  # the account the course is filed under: a course nobody owns is never public
    proposal = _propose().json()
    with db.get_connection() as connection:
        connection.execute("UPDATE course_proposals SET auto_approve_at = now() - interval '1 minute' WHERE id = %s", (proposal["id"],))
    # Any public read settles what is due, as with the publish review.
    listed = client.get("/races").json()
    ours = [race for race in listed if race["calculator_only"]]
    assert len(ours) == 1 and ours[0]["event_name"] == "Doi Inthanon Trail"
    settled = client.get("/admin/course-proposals?status=all", headers=admin).json()[0]
    assert settled["status"] == "approved" and settled["decided_by"] == "auto" and settled["race_id"] == ours[0]["race_id"]


def test_the_same_track_is_not_taken_twice():
    first = _propose()
    assert first.status_code == 201
    twice = _propose(event_name="Same course, other name")
    assert twice.status_code == 409 and "already been proposed" in twice.json()["detail"]["message"]

    admin = _admin()
    client.post(f"/admin/course-proposals/{first.json()['id']}", json={"action": "approve"}, headers=admin)
    course = client.get("/admin/calculator-courses", headers=admin).json()[0]
    after = _propose(event_name="Same course, third name")
    assert after.status_code == 409
    assert after.json()["detail"]["race_id"] == course["race_id"], "the refusal points at the course that is already there"


def test_what_a_proposal_must_carry():
    assert _propose(attest="false").status_code == 422, "the visitor's word that it may be shared"
    assert _propose(source_url="not a link").status_code == 422
    assert _propose(email="nobody").status_code == 422
    assert _propose(year=1800).status_code == 422
    assert client.post("/calculator-courses/proposals", files={"file": ("course.gpx", GPX, "application/gpx+xml")}, data={"event_name": "X"}).status_code == 422
    assert client.get("/admin/course-proposals").status_code == 401
