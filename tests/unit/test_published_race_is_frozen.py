"""What the public has already read does not change underneath it.

A score is worked out from the course and the finish time every time it is asked for, and a
runner's index is worked out from their scores. So replacing either on a published race restates a
leaderboard people have read and moves the index of every runner on it, with no version, no notice
and nothing in the history to say it happened.

The refusal lives in the write, not only in the handler in front of it: a handler reads the race
and then calls the write, and a publish committing between those two was enough.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from api import db

app_module = importlib.import_module("api.app")

from test_api import DEMO_RESULT_001, FLAT_LOOP_GPX, _create_event_and_race, _organizer_auth_headers  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")


def _published_race(email="freeze@example.com"):
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    _, race_id = _create_event_and_race(headers)
    course = {"file": ("course.gpx", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")}
    assert client.post(f"/races/{race_id}/gpx", files=course, headers=headers).status_code == 200
    results = {"file": ("results.csv", DEMO_RESULT_001.read_bytes(), "text/csv")}
    assert client.post(f"/races/{race_id}/results", files=results, headers=headers).status_code == 200
    assert client.post(f"/races/{race_id}/publish", headers=headers).status_code == 200
    return headers, race_id


# --- Through the handler -------------------------------------------------------------------------


def test_the_results_of_a_published_race_are_refused():
    headers, race_id = _published_race()
    before = db.get_results(race_id)
    answer = client.post(
        f"/races/{race_id}/results",
        files={"file": ("other.csv", b"Rank,Time,Last name,First name,Gender\n1,5:00:00,Other,Sam,M\n", "text/csv")},
        headers=headers,
    )
    assert answer.status_code == 409 and "Unpublish" in answer.json()["detail"]
    assert len(db.get_results(race_id)) == len(before), "the results were replaced anyway"


def test_the_course_of_a_published_race_is_refused():
    headers, race_id = _published_race()
    answer = client.post(
        f"/races/{race_id}/gpx",
        files={"file": ("other.gpx", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")},
        headers=headers,
    )
    assert answer.status_code == 409 and "Unpublish" in answer.json()["detail"]


def test_the_scoring_model_of_a_published_race_is_refused():
    """A different model is a different meaning for every number on the page."""
    from scoring import available_scoring_models

    headers, race_id = _published_race()
    current = db.find_race(race_id).scoring_version
    others = [model.version for model in available_scoring_models() if model.version != current]
    if not others:
        pytest.skip("only one scoring model is available to move between")
    answer = client.patch(f"/races/{race_id}", json={"scoring_version": others[0]}, headers=headers)
    assert answer.status_code == 409 and "scoring model" in answer.json()["detail"]


def test_a_published_race_may_still_be_renamed():
    """The freeze is on what the numbers mean, not on the words around them."""
    headers, race_id = _published_race()
    answer = client.patch(f"/races/{race_id}", json={"course_name": "The 50K, renamed"}, headers=headers)
    assert answer.status_code == 200 and answer.json()["course_name"] == "The 50K, renamed"


def test_taking_the_race_down_first_is_the_way_through():
    headers, race_id = _published_race()
    assert client.delete(f"/races/{race_id}/publish", headers=headers).status_code == 200
    assert client.post(
        f"/races/{race_id}/gpx", files={"file": ("c.gpx", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")}, headers=headers
    ).status_code == 200
    assert client.post(
        f"/races/{race_id}/results", files={"file": ("r.csv", DEMO_RESULT_001.read_bytes(), "text/csv")}, headers=headers
    ).status_code == 200
    assert client.post(f"/races/{race_id}/publish", headers=headers).status_code == 200


# --- And in the write itself ----------------------------------------------------------------------


def test_the_write_refuses_on_its_own_without_the_handler():
    """This is the one that matters. The handler reads the race and then calls the write; a publish
    committing in between used to be enough for the write to land on a race that is now public."""
    from ingestion.records import result_records

    headers, race_id = _published_race()
    rows = result_records(DEMO_RESULT_001)
    with pytest.raises(db.RacePublished):
        db.replace_results(race_id, rows)
    with pytest.raises(db.RacePublished):
        db.attach_gpx(race_id, filename="c.gpx", content="<gpx/>", distance_km=10, elevation_gain_m=100)


def test_the_seed_script_may_still_write_to_what_it_published():
    from ingestion.records import result_records

    headers, race_id = _published_race()
    db.replace_results(race_id, result_records(DEMO_RESULT_001), allow_published=True)


# --- A refused file was never the leaderboard -------------------------------------------------------


def test_a_file_the_scorer_refuses_leaves_the_results_alone():
    """Scoring used to come after the write, so a file the scorer refused had already replaced the
    race's results and the 422 left them there."""
    headers = _organizer_auth_headers("refused@example.com")
    _, race_id = _create_event_and_race(headers)  # a 50 km with 2,000 m of climb
    good = {"file": ("r.csv", b"Rank,Time,Last name,First name,Gender\n1,5:10:00,Real,Ann,F\n", "text/csv")}
    assert client.post(f"/races/{race_id}/results", files=good, headers=headers).status_code == 200
    before = db.get_results(race_id)
    assert len(before) == 1

    # An hour for 50 km with 2,000 m of climb is not a time anybody has run.
    impossible = {"file": ("r.csv", b"Rank,Time,Last name,First name,Gender\n1,1:00:00,Faster,Than,M\n", "text/csv")}
    answer = client.post(f"/races/{race_id}/results", files=impossible, headers=headers)
    assert answer.status_code == 422 and "best run ever recorded" in answer.json()["detail"]

    after = db.get_results(race_id)
    assert len(after) == 1 and after[0].family_name == "Real", "the refused file replaced the results anyway"
