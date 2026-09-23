"""A public number is one the model stands behind, and it says what it is worked out from.

Every test here was a way the public record could be made to say something nobody checked: a score
no person has run, a leaderboard whose time and score disagree, an index counting one race three
times, a race still advertised as scored with nobody left in it, and a page that failed outright
because the model it was scored under had been retired.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from api import db

app_module = importlib.import_module("api.app")

from test_api import _admin_headers, _create_event_and_race, _organizer_auth_headers, _publish_results  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

SANE = b"Rank,Time,Last name,First name,Gender\n1,5:10:00,Real,Ann,F\n"


def _verified(email):
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    return headers


def _race_with_results(email, csv=SANE):
    headers = _verified(email)
    _, race_id = _create_event_and_race(headers)
    assert client.post(f"/races/{race_id}/results", files={"file": ("r.csv", csv, "text/csv")}, headers=headers).status_code == 200
    return headers, race_id


# --- Publishing looks at what it is about to make public ------------------------------------------


def test_figures_edited_after_the_results_passed_cannot_be_published():
    """The guard ran where the file arrived. The course it was scored against could then be
    rewritten, and publishing looked only for the presence of rows."""
    headers, race_id = _race_with_results("edit-then-publish@example.com")
    assert client.patch(f"/races/{race_id}", json={"distance_km": 400, "elevation_gain_m": 30000}, headers=headers).status_code == 200

    answer = client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers)
    assert answer.status_code == 422, "an impossible score reached the public index"
    assert "best run ever recorded" in answer.json()["detail"]
    assert db.find_race(race_id).published_at is None


def test_a_race_with_no_finishers_is_not_published_as_scored():
    headers, race_id = _race_with_results(
        "dnf-only@example.com", b"Rank,Time,Last name,First name,Gender\nDNF,,Stopped,Sam,M\n"
    )
    answer = client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers)
    assert answer.status_code == 422 and "no finishers" in answer.json()["detail"]


def test_an_ordinary_race_still_publishes():
    headers, race_id = _race_with_results("ordinary@example.com")
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200


# --- The freeze is in the write, not only in front of it ------------------------------------------


def test_the_write_refuses_figures_on_a_published_race_without_the_handler():
    """The handler reads the race and then calls the write on another connection; a publish
    committing between those two was enough for the change to land on a public race."""
    headers, race_id = _race_with_results("figures-race@example.com")
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200

    with pytest.raises(db.RacePublished):
        db.update_race(race_id, distance_km=120.0)
    with pytest.raises(db.RacePublished):
        db.update_race(race_id, elevation_gain_m=9000.0)


def test_a_published_race_may_still_be_renamed_through_the_write():
    """The freeze is on what the numbers mean, not on the words around them."""
    headers, race_id = _race_with_results("rename-write@example.com")
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200
    assert db.update_race(race_id, course_name="Renamed").course_name == "Renamed"


def test_restating_the_model_it_already_has_is_not_a_change():
    headers, race_id = _race_with_results("same-model@example.com")
    assert client.post(f"/races/{race_id}/publish", json={"attest": True}, headers=headers).status_code == 200
    current = db.find_race(race_id).scoring_version
    db.update_race(race_id, scoring_version=current)  # a no-op, and must not be refused as one


# --- A row's score and its time are the same row --------------------------------------------------


def test_two_rows_that_share_a_rank_and_a_name_keep_their_own_times():
    """A rank and a name are not unique. Keying on them collapsed the rows and handed every score
    in the group the last row's finish time, so the leaderboard contradicted itself."""
    both = b"Rank,Time,Last name,First name,Gender\n1,5:10:00,Same,Sam,M\n1,6:40:00,Same,Sam,M\n"
    headers, race_id = _race_with_results("duplicate-rows@example.com", both)
    rows = client.get(f"/races/{race_id}/results", headers=headers).json()
    assert len(rows) == 2
    times = sorted(row["finish_time_seconds"] for row in rows)
    assert times == [5 * 3600 + 600, 6 * 3600 + 2400], "a row was given another row's time"
    # The faster row scores higher: the pairing is the right way round, not merely distinct.
    by_time = {row["finish_time_seconds"]: row["otri_score"] for row in rows}
    assert by_time[times[0]] > by_time[times[1]]


def test_one_race_counts_once_towards_a_runner_index():
    """A duplicated row is an ordinary export artefact and the validator lets it through. It used
    to fill a second slot of an index that counts the best three."""
    headers = _verified("index-once@example.com")
    race_id = _publish_results(headers, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Twice,Tina,F\n2,2:10:00,Twice,Tina,F\n")
    rows = client.get(f"/races/{race_id}/results").json()
    runner_id = next(row["runner_id"] for row in rows if row["runner_id"])
    profile = client.get(f"/runners/{runner_id}").json()
    counted = [result for result in profile["results"] if result["counts"]]
    assert len(counted) == 1, f"one race filled {len(counted)} index slots"
    assert profile["provisional"] is True, "a single race should not make an index settled"


# --- A retired model does not take the page down ---------------------------------------------------


def test_a_race_scored_under_a_retired_model_still_serves_its_times():
    """The model a race was published under can be dropped from a later build. The race is public
    and people are reading it, so it answers with what does not depend on the model."""
    headers = _verified("retired-model@example.com")
    race_id = _publish_results(headers, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Kept,Kim,F\n")
    with db.get_connection() as connection:
        connection.execute("UPDATE races SET scoring_version = %s WHERE race_id = %s", ("0.0.1-gone", race_id))

    answer = client.get(f"/races/{race_id}/results")
    assert answer.status_code == 200, "a retired model took a published race page down"
    rows = answer.json()
    assert [row["family_name"] for row in rows] == ["Kept"]
    assert rows[0]["finish_time_seconds"] == 7200
    assert rows[0]["otri_score"] is None, "a score that cannot be reproduced must not be shown"
    assert "scoring_model_retired" in rows[0]["quality_flags"]


# --- Removing a runner does not leave a race saying something that is not so -----------------------


def test_removing_the_last_finisher_takes_the_race_down_and_says_so(monkeypatch):
    owner = _verified("emptied-owner@example.com")
    race_id = _publish_results(owner, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Only,Olive,F\n")
    runner_id = next(row["runner_id"] for row in client.get(f"/races/{race_id}/results").json() if row["runner_id"])

    admin = _admin_headers(monkeypatch)
    answer = client.delete(f"/admin/runners/{runner_id}", headers=admin)
    assert answer.status_code == 200
    assert answer.json()["unpublished_races"] == [race_id], "the admin was not told what else changed"

    assert db.find_race(race_id).published_at is None
    assert client.get(f"/races/{race_id}").status_code == 404, "still public with nobody left in it"


# --- A public count is a count of public things ----------------------------------------------------


def test_the_public_event_list_does_not_count_unpublished_drafts():
    headers = _verified("draft-count@example.com")
    event = client.post("/events", json={"event_name": "Counting", "event_date": "2026-08-01"}, headers=headers)
    event_id = event.json()["event_id"]
    for name in ("50K", "Draft A", "Draft B"):
        client.post(f"/events/{event_id}/races", json={"course_name": name, "distance_km": 50.0, "elevation_gain_m": 2000.0}, headers=headers)
    published = client.get(f"/events/{event_id}", headers=headers).json()["races"][0]["race_id"]
    assert client.post(f"/races/{published}/results", files={"file": ("r.csv", SANE, "text/csv")}, headers=headers).status_code == 200
    assert client.post(f"/races/{published}/publish", json={"attest": True}, headers=headers).status_code == 200

    listed = next(row for row in client.get("/events").json() if row["event_id"] == event_id)
    detail = client.get(f"/events/{event_id}").json()
    assert listed["race_count"] == len(detail["races"]) == 1, "the public list disclosed the drafts"

    mine = next(row for row in client.get("/events", params={"mine": True}, headers=headers).json() if row["event_id"] == event_id)
    assert mine["race_count"] == 3, "the owner should still see all of their own"
