"""POST /score: a race validates and scores its results without an account, and nothing is kept
(docs/product/open-scoring-tool.md)."""

import csv
import io

import pytest

from api import db
from test_api import DEMO_RESULT_001, SINGLE_CLIMB_GPX, client

pytestmark = pytest.mark.usefixtures("clean_state")


def _files(gpx=True, results=DEMO_RESULT_001):
    files = {"results": (results.name, results.read_bytes(), "text/csv")}
    if gpx:
        files["gpx"] = (SINGLE_CLIMB_GPX.name, SINGLE_CLIMB_GPX.read_bytes(), "application/gpx+xml")
    return files


def test_a_course_file_and_a_results_file_come_back_scored_and_nothing_is_stored():
    before = (len(db.list_events()), len(db.list_races()), len(db.list_runners()) if hasattr(db, "list_runners") else 0)
    response = client.post("/score", files=_files(), data={"race_name": "My Trail 30K"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stored"] is False and body["is_valid"] is True and body["errors"] == []
    assert body["course"]["source"] == "gpx" and body["course"]["name"] == "My Trail 30K" and body["course"]["distance_km"] > 0
    assert body["course"]["confidence"] in ("High", "Low") and body["measurement"]["version"]
    finishers = [row for row in body["scores"] if row["status"] == "finisher"]
    assert finishers and all(row["otri_score"] is not None and row["runner_id"] is None for row in finishers)
    assert body["summary"]["finishers"] == len(finishers) and body["summary"]["best_score"] == max(row["otri_score"] for row in finishers)
    # A faster finisher never scores lower on the same course.
    ordered = sorted(finishers, key=lambda row: row["finish_time_seconds"])
    assert [row["otri_score"] for row in ordered] == sorted((row["otri_score"] for row in ordered), reverse=True)
    assert (len(db.list_events()), len(db.list_races()), len(db.list_runners()) if hasattr(db, "list_runners") else 0) == before


def test_official_figures_stand_in_for_a_course_file():
    response = client.post("/score", files=_files(gpx=False), data={"distance_km": "50", "elevation_gain_m": "2600"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["course"] == {**body["course"], "source": "official", "distance_km": 50.0, "elevation_gain_m": 2600.0, "confidence": "Low"}
    assert body["measurement"] is None and body["summary"]["finishers"] > 0

    assert client.post("/score", files=_files(gpx=False)).status_code == 422
    assert client.post("/score", files=_files(gpx=False), data={"distance_km": "0", "elevation_gain_m": "10"}).status_code == 422
    assert client.post("/score", files=_files(gpx=False), data={"distance_km": "50", "elevation_gain_m": "2600", "scoring_version": "no-such-model"}).status_code == 422


def test_an_invalid_results_file_answers_with_its_issues_and_no_scores(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("rank,finish_time,family_name,first_name,gender\n1,05:00:00,A,B,M\n1,04:00:00,C,D,F\n", encoding="utf-8")
    body = client.post("/score", files=_files(gpx=False, results=bad), data={"distance_km": "50", "elevation_gain_m": "2600"}).json()
    assert body["is_valid"] is False and body["scores"] == [] and body["errors"]
    assert all({"severity", "row", "field", "message"} <= issue.keys() for issue in body["errors"])

    notes = tmp_path / "notes.txt"
    notes.write_text("not a results file", encoding="utf-8")
    assert client.post("/score", files=_files(gpx=False, results=notes), data={"distance_km": "50", "elevation_gain_m": "2600"}).status_code == 422
    broken = {"results": _files()["results"], "gpx": ("course.gpx", b"<gpx>not a course", "application/gpx+xml")}
    assert client.post("/score", files=broken).status_code == 422


def test_the_scored_list_downloads_as_a_csv_that_a_spreadsheet_will_not_execute(tmp_path):
    hostile = tmp_path / "r.csv"
    hostile.write_text('rank,finish_time,family_name,first_name,gender\n1,04:00:00,"=HYPERLINK(""http://x"")",Ann,F\n2,05:00:00,Lee,Bo,M\nDNF,,Ray,Cy,M\n', encoding="utf-8")
    response = client.post("/score?format=csv", files=_files(gpx=False, results=hostile), data={"distance_km": "50", "elevation_gain_m": "2600"})
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert [row["rank"] for row in rows] == ["1", "2", "DNF"]
    assert rows[0]["family_name"].startswith("'=") and rows[0]["finish_time"] == "04:00:00" and int(rows[0]["otri_score"]) > int(rows[1]["otri_score"])
    assert rows[2]["otri_score"] == "" and rows[2]["status"] == "DNF"
    assert client.post("/score?format=xml", files=_files(gpx=False), data={"distance_km": "50", "elevation_gain_m": "2600"}).status_code == 422


def test_any_website_may_call_the_tool_endpoints_but_not_the_rest():
    elsewhere = {"Origin": "https://timing.example"}
    preflight = client.options("/score", headers={**elsewhere, "Access-Control-Request-Method": "POST"})
    assert preflight.status_code == 204 and preflight.headers["access-control-allow-origin"] == "*"
    scored = client.post("/score", files=_files(gpx=False), data={"distance_km": "50", "elevation_gain_m": "2600"}, headers=elsewhere)
    assert scored.headers["access-control-allow-origin"] == "*" and "access-control-allow-credentials" not in scored.headers
    assert client.get("/scoring/models", headers=elsewhere).headers["access-control-allow-origin"] == "*"
    # Everything with a session behind it stays closed to other origins ...
    assert "access-control-allow-origin" not in client.get("/races", headers=elsewhere).headers
    assert "access-control-allow-origin" not in client.post("/auth/login", json={"email": "a@b.c", "password": "x"}, headers=elsewhere).headers
    # ... and OTRI's own pages keep their credentialed answer.
    own = client.get("/scoring/models", headers={"Origin": "http://localhost:5173"})
    assert own.headers["access-control-allow-origin"] == "http://localhost:5173" and own.headers["access-control-allow-credentials"] == "true"
