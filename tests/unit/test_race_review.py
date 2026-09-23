"""Publishing is the organizer's act; what happens right after it is the publish review.

The organizer confirms the race is theirs to publish. A clean race is public at once and marks
itself verified after a window unless an admin objects. A race with a strong sign of being invented
or copied is held, not public, with the reasons written down, and an admin decides. The rules are in
api/screening.py; this file pins them and the flow around them.
"""

from __future__ import annotations

import importlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import db, screening

app_module = importlib.import_module("api.app")

from test_api import DEMO_RESULT_001, FLAT_LOOP_GPX, REPO_ROOT, _admin_headers, _create_event_and_race, _organizer_auth_headers  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

EXAMPLE_RESULTS = REPO_ROOT / "public" / "examples" / "otri-example-results.csv"
EXAMPLE_COURSE = REPO_ROOT / "public" / "examples" / "otri-example-course.gpx"


def _verified_organizer(email: str) -> dict:
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    return headers


def _race_with(headers: dict, *, results: bytes, gpx: Path | None = FLAT_LOOP_GPX) -> str:
    _, race_id = _create_event_and_race(headers)
    if gpx is not None:
        course = {"file": (gpx.name, gpx.read_bytes(), "application/gpx+xml")}
        assert client.post(f"/races/{race_id}/gpx", files=course, headers=headers).status_code == 200
    answer = client.post(f"/races/{race_id}/results", files={"file": ("results.csv", results, "text/csv")}, headers=headers)
    assert answer.status_code == 200, answer.text
    return race_id


def _csv(rows: list[tuple[str, str, str]]) -> bytes:
    body = "Rank,Time,Last name,First name,Gender\n"
    for i, (family, first, time) in enumerate(rows, start=1):
        body += f"{i},{time},{family},{first},M\n"
    return body.encode()


def _plausible_rows(n: int) -> list[tuple[str, str, str]]:
    families = ["Okafor", "Lindqvist", "Nakamura", "Petrov", "Haddad", "Silva", "Brennan", "Yilmaz", "Kowalski", "Moreau", "Sato", "Andersen"]
    firsts = ["Ama", "Elin", "Kenji", "Nadia", "Youssef", "Ines", "Ciara", "Deniz", "Marek", "Lea", "Hana", "Soren"]
    rows = []
    seconds = 5 * 3600 + 17 * 60
    for i in range(n):
        seconds += 173 + (i * 37) % 291  # uneven gaps, like a field
        h, rem = divmod(seconds, 3600)
        m, s = divmod(rem, 60)
        rows.append((families[i % len(families)] + ("" if i < len(families) else str(i)), firsts[(i * 7) % len(firsts)], f"{h}:{m:02d}:{s:02d}"))
    return rows


def _publish(race_id: str, headers: dict):
    return client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers)


# --- The organizer's word ------------------------------------------------------------------------


def test_publishing_needs_the_organizers_confirmation():
    headers = _verified_organizer("attest@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    refused = client.post(f"/races/{race_id}/publish", headers=headers)
    assert refused.status_code == 422 and "organize" in refused.json()["detail"]
    refused = client.post(f"/races/{race_id}/publish", json={"attest": False}, headers=headers)
    assert refused.status_code == 422
    assert db.find_race(race_id).published_at is None

    published = _publish(race_id, headers)
    assert published.status_code == 200, published.text
    body = published.json()
    assert body["is_published"] is True
    assert body["review_status"] == "pending", body["review_flags"]
    assert body["auto_verify_at"] and body["publish_attested_at"]


# --- A clean race: public now, verified on its own -----------------------------------------------


def test_a_clean_race_is_public_at_once_and_verifies_itself_after_the_window():
    headers = _verified_organizer("clean@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    assert _publish(race_id, headers).json()["review_status"] == "pending"

    # Public right away, and the public sees the status but not the reasons.
    public = client.get(f"/races/{race_id}")
    assert public.status_code == 200
    assert public.json()["review_status"] == "pending"
    assert public.json()["review_flags"] is None and public.json()["auto_verify_at"] is None
    assert race_id in {r["race_id"] for r in client.get("/races").json()}

    # The window passes: the next public read settles it.
    with db.get_connection() as connection:
        connection.execute("UPDATE races SET auto_verify_at = now() - INTERVAL '1 minute' WHERE race_id = %s", (race_id,))
    assert client.get(f"/races/{race_id}").json()["review_status"] == "verified"
    mine = client.get(f"/races/{race_id}", headers=headers).json()
    assert mine["reviewed_by"] == "auto" and mine["reviewed_at"]


def test_the_window_is_the_configured_number_of_hours(monkeypatch):
    monkeypatch.setattr(app_module, "AUTO_VERIFY_HOURS", 6.0)
    headers = _verified_organizer("window@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    before = datetime.now(timezone.utc)
    body = _publish(race_id, headers).json()
    at = datetime.fromisoformat(body["auto_verify_at"])
    assert timedelta(hours=5, minutes=59) < at - before < timedelta(hours=6, minutes=1)


def test_taking_a_race_down_ends_its_review_and_a_new_publish_is_screened_again():
    headers = _verified_organizer("down@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    assert _publish(race_id, headers).json()["review_status"] == "pending"
    down = client.delete(f"/races/{race_id}/publish", headers=headers).json()
    assert down["is_published"] is False and down["review_status"] == "none"
    assert _publish(race_id, headers).json()["review_status"] == "pending"


# --- Obvious fakes are held -----------------------------------------------------------------------


def test_otris_own_example_files_published_as_a_race_are_held():
    headers = _verified_organizer("example@example.com")
    race_id = _race_with(headers, results=EXAMPLE_RESULTS.read_bytes(), gpx=EXAMPLE_COURSE)
    answer = _publish(race_id, headers)
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["is_published"] is False and body["review_status"] == "held"
    codes = {flag["code"] for flag in body["review_flags"]}
    assert "example_results" in codes and "example_course" in codes, codes
    assert all(flag["detail"] for flag in body["review_flags"])

    # Not public anywhere, and the organizer sees why.
    assert client.get(f"/races/{race_id}").status_code == 404
    assert race_id not in {r["race_id"] for r in client.get("/races").json()}
    assert client.get(f"/races/{race_id}/results").status_code == 403
    assert client.get(f"/races/{race_id}", headers=headers).json()["review_status"] == "held"


def test_a_field_of_made_up_names_is_held():
    headers = _verified_organizer("names@example.com")
    rows = [("Runner", f"Test {i}", f"5:{10 + i * 3:02d}:1{i % 10}") for i in range(10)]
    race_id = _race_with(headers, results=_csv(rows))
    body = _publish(race_id, headers).json()
    assert body["review_status"] == "held" and "placeholder_names" in {f["code"] for f in body["review_flags"]}


def test_a_generated_list_of_times_is_held():
    headers = _verified_organizer("times@example.com")
    rows = [(family, first, time) for (family, first, _), time in zip(_plausible_rows(12), (f"5:{i:02d}:00" for i in range(12)))]
    race_id = _race_with(headers, results=_csv(rows))
    body = _publish(race_id, headers).json()
    assert body["review_status"] == "held" and "uniform_times" in {f["code"] for f in body["review_flags"]}


def test_a_race_dated_in_the_future_with_results_is_held():
    headers = _verified_organizer("future@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE events SET event_date = %s WHERE event_id = (SELECT event_id FROM races WHERE race_id = %s)",
            (date.today() + timedelta(days=30), race_id),
        )
    body = _publish(race_id, headers).json()
    assert body["review_status"] == "held" and "future_date" in {f["code"] for f in body["review_flags"]}


def test_results_copied_from_another_published_race_are_held():
    first = _verified_organizer("first@example.com")
    original = _race_with(first, results=DEMO_RESULT_001.read_bytes())
    assert _publish(original, first).json()["review_status"] == "pending"

    second = _verified_organizer("second@example.com")
    copy = _race_with(second, results=DEMO_RESULT_001.read_bytes())
    body = _publish(copy, second).json()
    assert body["review_status"] == "held" and "duplicate_results" in {f["code"] for f in body["review_flags"]}


def test_a_race_that_calls_itself_a_test_is_held():
    headers = _verified_organizer("named@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    with db.get_connection() as connection:
        connection.execute("UPDATE events SET event_name = 'Test upload please ignore' WHERE event_id = (SELECT event_id FROM races WHERE race_id = %s)", (race_id,))
    body = _publish(race_id, headers).json()
    assert body["review_status"] == "held" and "test_name" in {f["code"] for f in body["review_flags"]}


# --- The admin's decision --------------------------------------------------------------------------


def test_an_admin_hears_about_every_publish(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss@example.com"})
    headers = _verified_organizer("loud@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    _publish(race_id, headers)
    with db.get_connection() as connection:
        rows = connection.execute("SELECT subject FROM email_log WHERE to_email = 'boss@example.com'").fetchall()
    assert any(row["subject"].startswith("Published:") for row in rows), rows


def test_an_admin_can_verify_hold_and_reject(monkeypatch):
    admin = _admin_headers(monkeypatch)
    headers = _verified_organizer("judged@example.com")
    race_id = _race_with(headers, results=DEMO_RESULT_001.read_bytes())
    assert _publish(race_id, headers).json()["review_status"] == "pending"

    listed = client.get("/admin/reviews", headers=admin)
    assert listed.status_code == 200
    mine = next(r for r in listed.json() if r["race_id"] == race_id)
    assert mine["organizer_email"] == "judged@example.com" and mine["finisher_count"] > 0

    # Hold: off the site, an admin's decision.
    held = client.post(f"/admin/reviews/{race_id}", json={"action": "hold"}, headers=admin)
    assert held.status_code == 200 and held.json()["review_status"] == "held" and held.json()["is_published"] is False
    assert client.get(f"/races/{race_id}").status_code == 404

    # The organizer publishing again does not get past the hold.
    again = _publish(race_id, headers).json()
    assert again["review_status"] == "held" and again["is_published"] is False
    assert "previous_review" in {f["code"] for f in again["review_flags"]}

    # Verify: public, and the review is over.
    verified = client.post(f"/admin/reviews/{race_id}", json={"action": "verify"}, headers=admin).json()
    assert verified["review_status"] == "verified" and verified["is_published"] is True
    assert verified["reviewed_by"] == "dash-admin@example.com"
    assert client.get(f"/races/{race_id}").status_code == 200

    # Reject needs a note; the organizer hears.
    assert client.post(f"/admin/reviews/{race_id}", json={"action": "reject"}, headers=admin).status_code == 422
    rejected = client.post(f"/admin/reviews/{race_id}", json={"action": "reject", "note": "The 50K results are the 25K file."}, headers=admin).json()
    assert rejected["review_status"] == "rejected" and rejected["is_published"] is False
    assert rejected["review_note"].startswith("The 50K")
    with db.get_connection() as connection:
        rows = connection.execute("SELECT subject FROM email_log WHERE to_email = 'judged@example.com'").fetchall()
    assert any(row["subject"].startswith("Taken down:") for row in rows), rows
    assert client.get(f"/races/{race_id}", headers=headers).json()["review_note"].startswith("The 50K")
    assert client.get(f"/races/{race_id}").status_code == 404

    # Anything else is refused, and only admins get here.
    assert client.post(f"/admin/reviews/{race_id}", json={"action": "bless"}, headers=admin).status_code == 422
    assert client.post(f"/admin/reviews/{race_id}", json={"action": "verify"}, headers=headers).status_code == 403
    assert client.get("/admin/reviews", headers=headers).status_code == 403


# --- The rules on their own ---------------------------------------------------------------------


def _subject(finishers, **overrides) -> screening.Subject:
    base = dict(
        event_name="Ridge Run",
        course_name="30K",
        event_date=date(2026, 5, 3),
        has_course_file=True,
        finishers=tuple(finishers),
        non_finishers=0,
        course_geometry_hash="abc",
        organizer_created_at=datetime.now(timezone.utc) - timedelta(days=30),
        previous_review_status="none",
    )
    base.update(overrides)
    return screening.Subject(**base)


def _finishers(n: int, *, score=500.0, step=97):
    rows = _plausible_rows(n)
    out = []
    seconds = 18000
    for i, (family, first, _) in enumerate(rows):
        seconds += step + (i * 31) % 59
        out.append(screening.Finisher(family, first, seconds, score))
    return out


def _screen(subject):
    return screening.screen(subject, known_fingerprints={}, known_course_hashes={}, today=date(2026, 9, 23))


def test_a_plausible_field_passes_with_nothing_strong():
    result = _screen(_subject(_finishers(40)))
    assert not result.hold, result.to_list()


def test_identical_times_and_repeated_names_are_strong_signs():
    same_time = [screening.Finisher(f"Fam{i}", "Ann", 20000, 500.0) for i in range(6)] + _finishers(6)
    assert "identical_times" in {f.code for f in _screen(_subject(same_time)).flags}
    repeated = [screening.Finisher("Okafor", "Ama", 20000 + i * 91, 500.0) for i in range(8)] + _finishers(4)
    assert "repeated_names" in {f.code for f in _screen(_subject(repeated)).flags}


def test_scores_at_the_human_ceiling_are_a_strong_sign_and_near_it_a_weak_one():
    at = _finishers(12, score=500.0)
    at[0] = screening.Finisher(at[0].family_name, at[0].first_name, at[0].finish_time_seconds, 1003.0)
    assert "score_at_ceiling" in {f.code for f in _screen(_subject(at)).flags}
    near = _finishers(12, score=500.0)
    near[0] = screening.Finisher(near[0].family_name, near[0].first_name, near[0].finish_time_seconds, 965.0)
    flags = _screen(_subject(near))
    assert "score_near_ceiling" in {f.code for f in flags.flags} and not flags.hold
    strong = _finishers(12, score=930.0)
    assert "field_too_strong" in {f.code for f in _screen(_subject(strong)).flags}


def test_weak_signs_add_up_to_a_hold_only_together():
    two = _subject(
        _finishers(2),
        has_course_file=False,
        organizer_created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    result = _screen(two)
    assert {f.code for f in result.flags} >= {"tiny_field", "no_course_file", "new_account"}
    assert not result.hold
    more = _subject(
        _finishers(2),
        has_course_file=False,
        organizer_created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        event_date=date(2010, 1, 1),
        course_published_by_other_organizer=True,
    )
    assert _screen(more).hold


def test_the_fingerprint_ignores_order_case_and_accents():
    a = screening.results_fingerprint([("Møller", "Ann", 100), ("okafor", "AMA", 200)])
    b = screening.results_fingerprint([("Okafor", "Ama", 200), ("MØLLER", "ann", 100)])
    assert a == b
    assert a != screening.results_fingerprint([("Moller", "Ann", 101), ("Okafor", "Ama", 200)])
