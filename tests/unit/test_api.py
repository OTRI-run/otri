"""API tests: races, scored results, and the organizer submission workflow.

Run with: pytest tests/unit
"""

from pathlib import Path

from fastapi.testclient import TestClient

from api import app

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_RESULT_001 = REPO_ROOT / "data" / "demo" / "results" / "OTRI-DEMO-001.csv"
INVALID_RESULT = REPO_ROOT / "tests" / "fixtures" / "results" / "invalid-result.csv"

client = TestClient(app)


def test_root_reports_app_status():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["name"] == "OTRI API"


def test_list_races_returns_demo_races():
    response = client.get("/races")
    assert response.status_code == 200
    race_ids = {race["race_id"] for race in response.json()}
    assert race_ids == {
        "OTRI-DEMO-001",
        "OTRI-DEMO-002",
        "OTRI-DEMO-003",
        "OTRI-DEMO-004",
        "OTRI-DEMO-005",
        "OTRI-DEMO-006",
    }


def test_get_unknown_race_returns_404():
    response = client.get("/races/NOT-A-REAL-RACE")
    assert response.status_code == 404


def test_get_race_results_returns_scores_with_winner_at_scale_max():
    response = client.get("/races/OTRI-DEMO-001/results")
    assert response.status_code == 200
    scores = response.json()
    assert len(scores) == 12
    assert scores[0]["otri_score"] == 1000


def test_get_results_for_race_with_no_result_file_returns_404():
    response = client.get("/races/OTRI-DEMO-001/results".replace("OTRI-DEMO-001", "OTRI-DEMO-404"))
    assert response.status_code == 404


def test_submit_valid_results_returns_computed_scores():
    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            "/races/OTRI-DEMO-001/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert body["errors"] == []
    assert len(body["scores"]) == 12
    assert body["scores"][0]["otri_score"] == 1000


def test_submit_invalid_results_returns_errors_and_no_scores():
    with INVALID_RESULT.open("rb") as handle:
        response = client.post(
            "/races/OTRI-DEMO-001/results",
            files={"file": ("invalid-result.csv", handle, "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert len(body["errors"]) > 0
    assert body["scores"] == []


def test_submit_results_for_unknown_race_returns_404():
    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            "/races/NOT-A-REAL-RACE/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
        )

    assert response.status_code == 404
