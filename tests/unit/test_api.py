"""API tests: races, scored results, and the organizer submission workflow.

Run with: pytest tests/unit
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.auth as auth_module
from api import app

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_RESULT_001 = REPO_ROOT / "data" / "demo" / "results" / "OTRI-DEMO-001.csv"
INVALID_RESULT = REPO_ROOT / "tests" / "fixtures" / "results" / "invalid-result.csv"
RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
FLAT_LOOP_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx" / "flat-loop.gpx"

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_auth_db(tmp_path, monkeypatch):
    """Point the auth DB at a throwaway file so these tests never touch real data."""
    monkeypatch.setattr(auth_module, "DB_PATH", tmp_path / "organizers-test.db")
    yield


def _organizer_auth_headers(email: str = "organizer@example.com", password: str = "correct horse battery") -> dict:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
            headers=_organizer_auth_headers(),
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
            headers=_organizer_auth_headers(),
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
            headers=_organizer_auth_headers(),
        )

    assert response.status_code == 404


def test_submit_results_without_token_returns_401():
    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            "/races/OTRI-DEMO-001/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
        )

    assert response.status_code == 401


def test_create_race_then_appears_in_list():
    original = RACES_FILE.read_text(encoding="utf-8")
    try:
        response = client.post(
            "/races",
            json={
                "race_id": "OTRI-TEST-CREATE-001",
                "race_name": "Test Created Race",
                "event_date": "2026-07-01",
                "course_name": "Test Course",
                "distance_km": 15.0,
                "elevation_gain_m": 500.0,
            },
            headers=_organizer_auth_headers(),
        )
        assert response.status_code == 201
        assert response.json()["race_id"] == "OTRI-TEST-CREATE-001"

        listed = client.get("/races").json()
        assert "OTRI-TEST-CREATE-001" in {race["race_id"] for race in listed}
    finally:
        RACES_FILE.write_text(original, encoding="utf-8")


def test_create_race_without_token_returns_401():
    response = client.post(
        "/races",
        json={
            "race_id": "OTRI-TEST-NOAUTH-001",
            "race_name": "No Auth",
            "event_date": "2026-07-01",
            "course_name": "Test Course",
            "distance_km": 15.0,
            "elevation_gain_m": 500.0,
        },
    )
    assert response.status_code == 401


def test_create_race_with_duplicate_id_returns_409():
    response = client.post(
        "/races",
        json={
            "race_id": "OTRI-DEMO-001",
            "race_name": "Duplicate",
            "event_date": "2026-07-01",
            "course_name": "Test Course",
            "distance_km": 15.0,
            "elevation_gain_m": 500.0,
        },
        headers=_organizer_auth_headers(),
    )
    assert response.status_code == 409


def test_create_race_with_invalid_data_rolls_back():
    original = RACES_FILE.read_text(encoding="utf-8")
    try:
        response = client.post(
            "/races",
            json={
                "race_id": "OTRI-TEST-INVALID-001",
                "race_name": "Bad Race",
                "event_date": "2026-07-01",
                "course_name": "Test Course",
                "distance_km": -5.0,
                "elevation_gain_m": 500.0,
            },
            headers=_organizer_auth_headers(),
        )
        assert response.status_code == 422
        assert RACES_FILE.read_text(encoding="utf-8") == original
    finally:
        RACES_FILE.write_text(original, encoding="utf-8")


def test_analyze_gpx_returns_features():
    with FLAT_LOOP_GPX.open("rb") as handle:
        response = client.post("/gpx/analyze", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")})

    assert response.status_code == 200
    body = response.json()
    assert body["features"]["elevation_gain_m"] == 0.0
    assert body["estimate"] is None


def test_analyze_gpx_with_finish_time_returns_illustrative_estimate():
    with FLAT_LOOP_GPX.open("rb") as handle:
        response = client.post(
            "/gpx/analyze",
            files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")},
            data={"finish_time_seconds": "3600"},
        )

    assert response.status_code == 200
    estimate = response.json()["estimate"]
    assert estimate is not None
    assert "illustrative_score" in estimate
    assert "Illustrative only" in estimate["disclaimer"]


def test_analyze_invalid_gpx_returns_422():
    response = client.post(
        "/gpx/analyze",
        files={"file": ("not-gpx.txt", b"this is not xml", "text/plain")},
    )
    assert response.status_code == 422


def test_register_and_login_round_trip():
    register_response = client.post("/auth/register", json={"email": "roundtrip@example.com", "password": "correct horse battery"})
    assert register_response.status_code == 201
    assert register_response.json()["email"] == "roundtrip@example.com"

    login_response = client.post("/auth/login", json={"email": "roundtrip@example.com", "password": "correct horse battery"})
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


def test_login_with_wrong_password_returns_401():
    client.post("/auth/register", json={"email": "wrongpw@example.com", "password": "correct horse battery"})
    response = client.post("/auth/login", json={"email": "wrongpw@example.com", "password": "nope nope nope"})
    assert response.status_code == 401


def test_register_duplicate_email_returns_400():
    client.post("/auth/register", json={"email": "dupe@example.com", "password": "correct horse battery"})
    response = client.post("/auth/register", json={"email": "dupe@example.com", "password": "correct horse battery"})
    assert response.status_code == 400
