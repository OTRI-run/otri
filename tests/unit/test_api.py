"""API tests: events, race distances, scored results, and the organizer workflow.

Run with: pytest tests/unit
"""

from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from api import app
from api import db

pytestmark = pytest.mark.usefixtures("clean_state")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_RESULT_001 = REPO_ROOT / "data" / "demo" / "results" / "OTRI-DEMO-001.csv"
INVALID_RESULT = REPO_ROOT / "tests" / "fixtures" / "results" / "invalid-result.csv"
FLAT_LOOP_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx" / "flat-loop.gpx"
SINGLE_CLIMB_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx" / "single-climb.gpx"
STEEP_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx" / "impossibly-steep.gpx"

client = TestClient(app)


def _register_and_verify(email: str, password: str) -> None:
    """Register an organizer and mark them verified directly via the DB (tests can't click email links)."""
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))


def _organizer_auth_headers(email: str = "organizer@example.com", password: str = "correct horse battery") -> dict:
    _register_and_verify(email, password)
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_event_and_race(headers: dict, scoring_version: str | None = None) -> tuple[str, str]:
    """Creates a fresh event + one race distance owned by whoever `headers` authenticates as."""
    event_response = client.post(
        "/events", json={"event_name": "Test Event", "event_date": "2026-07-01"}, headers=headers
    )
    assert event_response.status_code == 201, event_response.text
    event_id = event_response.json()["event_id"]

    payload = {"course_name": "50K", "distance_km": 50.0, "elevation_gain_m": 2000.0}
    if scoring_version is not None:
        payload["scoring_version"] = scoring_version
    race_response = client.post(
        f"/events/{event_id}/races",
        json=payload,
        headers=headers,
    )
    assert race_response.status_code == 201, race_response.text
    return event_id, race_response.json()["race_id"]


def test_root_reports_app_status():
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "OTRI API"
    assert body["started_at"]


def test_list_scoring_models_includes_all_options():
    response = client.get("/scoring/models")
    assert response.status_code == 200
    versions = {model["version"] for model in response.json()}
    assert versions == {
        "0.8.0-course-standard-power",
        "0.7.0-course-standard-dem-gated",
        "0.6.0-course-standard-smoothed-upper",
        "0.5.0-course-standard-terrain-adjusted",
        "0.4.0-course-standard-endurance-referenced",
        "0.3.0-course-standard-duration-scaled",
        "0.1.0-course-standard-calibrated",
        "0.2.0-course-standard-measured",
        "1.1.0-course-standard",
        "1.0.0-course-standard",
        "0.1.0-field-relative",
    }


def test_new_race_defaults_to_course_standard_scoring():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)
    response = client.get(f"/races/{race_id}")
    assert response.json()["scoring_version"] == "0.8.0-course-standard-power"


def test_race_can_be_created_with_explicit_scoring_version():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers, scoring_version="0.1.0-field-relative")
    response = client.get(f"/races/{race_id}")
    assert response.json()["scoring_version"] == "0.1.0-field-relative"


def test_race_creation_rejects_unknown_scoring_version():
    headers = _organizer_auth_headers()
    event_response = client.post("/events", json={"event_name": "Test Event", "event_date": "2026-07-01"}, headers=headers)
    event_id = event_response.json()["event_id"]

    response = client.post(
        f"/events/{event_id}/races",
        json={"course_name": "50K", "distance_km": 50.0, "elevation_gain_m": 2000.0, "scoring_version": "not-a-real-version"},
        headers=headers,
    )
    assert response.status_code == 422


def test_edit_race_can_change_scoring_version():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    response = client.patch(f"/races/{race_id}", json={"scoring_version": "0.1.0-field-relative"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["scoring_version"] == "0.1.0-field-relative"


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


def test_get_race_results_returns_scores_not_automatically_1000():
    """Default scoring model (course-standard) has no competitor dependency, so unlike the old
    field-relative model, the last-place finisher does not get bumped up merely for finishing —
    scores are spread out based on each individual's own pace against the fixed anchors, not
    forced onto a 0-1000 range by whoever happens to be in the field."""
    response = client.get("/races/OTRI-DEMO-001/results")
    assert response.status_code == 200
    scores = response.json()
    assert len(scores) == 12
    assert scores[0]["otri_score"] == max(score["otri_score"] for score in scores)
    assert scores[-1]["otri_score"] < scores[0]["otri_score"]


def test_get_results_for_race_with_no_result_file_returns_404():
    response = client.get("/races/OTRI-DEMO-001/results".replace("OTRI-DEMO-001", "OTRI-DEMO-404"))
    assert response.status_code == 404


def test_submit_valid_results_returns_computed_scores():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert body["errors"] == []
    assert len(body["scores"]) == 12
    # default model has no competitor dependency: scores spread by individual pace, not rank
    assert body["scores"][-1]["otri_score"] < body["scores"][0]["otri_score"]


def test_submit_results_using_field_relative_model_scores_winner_at_1000():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers, scoring_version="0.1.0-field-relative")

    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["scores"][0]["otri_score"] == 1000
    assert body["scores"][0]["scoring_version"] == "0.1.0-field-relative"


def test_submit_invalid_results_returns_errors_and_no_scores():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    with INVALID_RESULT.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/results",
            files={"file": ("invalid-result.csv", handle, "text/csv")},
            headers=headers,
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


def test_submit_results_for_race_you_do_not_own_returns_403():
    """Demo races aren't owned by any organizer via the API — nobody can submit results for them."""
    headers = _organizer_auth_headers()
    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            "/races/OTRI-DEMO-001/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
            headers=headers,
        )
    assert response.status_code == 403


def test_submit_results_for_race_with_out_of_domain_gradient_gpx_still_scores_with_a_notice():
    """Spec section 9.1's "quality_flag" concept: an out-of-domain segment is clamped and
    flagged rather than aborting the whole course's scoring."""
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)
    with STEEP_GPX.open("rb") as handle:
        client.post(
            f"/races/{race_id}/gpx",
            files={"file": ("steep.gpx", handle, "application/gpx+xml")},
            headers=headers,
        )

    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/results",
            files={"file": ("OTRI-DEMO-001.csv", handle, "text/csv")},
            headers=headers,
        )
    assert response.status_code == 200
    scores = response.json()["scores"]
    assert scores
    assert any("gradient_out_of_supported_domain" in flag for flag in scores[0]["quality_flags"])


# --- Events ------------------------------------------------------------------


def test_create_event_then_appears_in_list():
    headers = _organizer_auth_headers()
    response = client.post("/events", json={"event_name": "My Race Weekend", "event_date": "2026-08-01"}, headers=headers)
    assert response.status_code == 201
    event_id = response.json()["event_id"]

    listed = client.get("/events").json()
    assert event_id in {event["event_id"] for event in listed}


def test_create_event_without_token_returns_401():
    response = client.post("/events", json={"event_name": "No Auth", "event_date": "2026-07-01"})
    assert response.status_code == 401


def test_list_events_mine_filters_to_own_events():
    headers_a = _organizer_auth_headers("mine-a@example.com")
    headers_b = _organizer_auth_headers("mine-b@example.com")
    event_a, _ = _create_event_and_race(headers_a)
    event_b, _ = _create_event_and_race(headers_b)

    mine_a = {event["event_id"] for event in client.get("/events?mine=true", headers=headers_a).json()}
    assert event_a in mine_a
    assert event_b not in mine_a


def test_list_events_mine_without_token_returns_401():
    assert client.get("/events?mine=true").status_code == 401


def test_get_event_includes_its_races():
    headers = _organizer_auth_headers()
    event_id, race_id = _create_event_and_race(headers)

    response = client.get(f"/events/{event_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["race_count"] == 1
    assert body["races"][0]["race_id"] == race_id


def test_get_unknown_event_returns_404():
    assert client.get("/events/NOT-A-REAL-EVENT").status_code == 404


def test_edit_event_updates_name_and_date():
    headers = _organizer_auth_headers()
    event_id, _ = _create_event_and_race(headers)

    response = client.patch(f"/events/{event_id}", json={"event_name": "Renamed Event"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["event_name"] == "Renamed Event"


def test_edit_event_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("owner-a@example.com")
    headers_b = _organizer_auth_headers("owner-b@example.com")
    event_id, _ = _create_event_and_race(headers_a)

    response = client.patch(f"/events/{event_id}", json={"event_name": "Hijacked"}, headers=headers_b)
    assert response.status_code == 403


def test_delete_event_cascades_to_races():
    headers = _organizer_auth_headers()
    event_id, race_id = _create_event_and_race(headers)

    response = client.delete(f"/events/{event_id}", headers=headers)
    assert response.status_code == 204
    assert client.get(f"/events/{event_id}").status_code == 404
    assert client.get(f"/races/{race_id}").status_code == 404


def test_delete_event_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("delowner-a@example.com")
    headers_b = _organizer_auth_headers("delowner-b@example.com")
    event_id, _ = _create_event_and_race(headers_a)

    assert client.delete(f"/events/{event_id}", headers=headers_b).status_code == 403


# --- Races (distances) ---------------------------------------------------------


def test_add_race_to_event_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("raceowner-a@example.com")
    headers_b = _organizer_auth_headers("raceowner-b@example.com")
    event_id, _ = _create_event_and_race(headers_a)

    response = client.post(
        f"/events/{event_id}/races",
        json={"course_name": "10K", "distance_km": 10.0, "elevation_gain_m": 100.0},
        headers=headers_b,
    )
    assert response.status_code == 403


def test_add_second_distance_to_same_event():
    headers = _organizer_auth_headers()
    event_id, _ = _create_event_and_race(headers)

    response = client.post(
        f"/events/{event_id}/races",
        json={"course_name": "25K", "distance_km": 25.0, "elevation_gain_m": 800.0},
        headers=headers,
    )
    assert response.status_code == 201

    event = client.get(f"/events/{event_id}").json()
    assert event["race_count"] == 2


def test_add_race_with_invalid_distance_returns_422():
    headers = _organizer_auth_headers()
    event_id, _ = _create_event_and_race(headers)

    response = client.post(
        f"/events/{event_id}/races",
        json={"course_name": "Bad", "distance_km": -5.0, "elevation_gain_m": 100.0},
        headers=headers,
    )
    assert response.status_code == 422


def test_edit_race_updates_fields():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    response = client.patch(f"/races/{race_id}", json={"distance_km": 55.0}, headers=headers)
    assert response.status_code == 200
    assert response.json()["distance_km"] == 55.0


def test_edit_race_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("editrace-a@example.com")
    headers_b = _organizer_auth_headers("editrace-b@example.com")
    _, race_id = _create_event_and_race(headers_a)

    assert client.patch(f"/races/{race_id}", json={"distance_km": 1.0}, headers=headers_b).status_code == 403


def test_delete_race():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    response = client.delete(f"/races/{race_id}", headers=headers)
    assert response.status_code == 204
    assert client.get(f"/races/{race_id}").status_code == 404


def test_delete_race_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("delrace-a@example.com")
    headers_b = _organizer_auth_headers("delrace-b@example.com")
    _, race_id = _create_event_and_race(headers_a)

    assert client.delete(f"/races/{race_id}", headers=headers_b).status_code == 403


# --- GPX attach ----------------------------------------------------------------


def test_attach_gpx_updates_course_stats_and_flags_has_gpx():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)

    with SINGLE_CLIMB_GPX.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/gpx",
            files={"file": ("single-climb.gpx", handle, "application/gpx+xml")},
            headers=headers,
        )
    assert response.status_code == 200
    body = response.json()
    assert body["has_gpx"] is True
    assert body["distance_km"] > 0

    gpx_response = client.get(f"/races/{race_id}/gpx")
    assert gpx_response.status_code == 200
    assert b"<gpx" in gpx_response.content


def test_get_gpx_for_race_without_one_returns_404():
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)
    assert client.get(f"/races/{race_id}/gpx").status_code == 404


def test_attach_gpx_you_do_not_own_returns_403():
    headers_a = _organizer_auth_headers("gpxowner-a@example.com")
    headers_b = _organizer_auth_headers("gpxowner-b@example.com")
    _, race_id = _create_event_and_race(headers_a)

    with SINGLE_CLIMB_GPX.open("rb") as handle:
        response = client.post(
            f"/races/{race_id}/gpx",
            files={"file": ("single-climb.gpx", handle, "application/gpx+xml")},
            headers=headers_b,
        )
    assert response.status_code == 403


def test_analyze_gpx_returns_features():
    with FLAT_LOOP_GPX.open("rb") as handle:
        response = client.post("/gpx/analyze", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")})

    assert response.status_code == 200
    body = response.json()
    assert body["features"]["elevation_gain_m"] == 0.0
    assert body["estimate"] is None
    assert body['measurement']['version'] == 'course-measurement-v3'
    assert body['measurement']['profile'][-1]['distanceKm'] == pytest.approx(body['features']['distance_km'], abs=.0005)
    assert body['measurement']['source']['dataset'] == 'uploaded-gpx'
    assert len(body['measurement']['raw_sha256']) == 64


def test_attached_measurement_is_persisted_and_totals_cannot_diverge(monkeypatch):
    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)
    with FLAT_LOOP_GPX.open('rb') as handle:
        attached = client.post(f'/races/{race_id}/gpx', files={'file': ('flat.gpx', handle, 'application/gpx+xml')}, headers=headers)
    assert attached.status_code == 200
    assert attached.json()['measurement_version'] == 'course-measurement-v3'
    saved = client.get(f'/races/{race_id}/measurement')
    assert saved.status_code == 200
    assert 'snapshot' not in saved.json()
    assert saved.json()['profile']
    assert client.patch(f'/races/{race_id}', json={'elevation_gain_m': 999}, headers=headers).status_code == 422
    def unavailable_provider():
        raise AssertionError('saved measurement must not request current terrain')
    monkeypatch.setattr('course.elevation.configured_provider', unavailable_provider)
    csv = 'Ranking,Time,Family name,First Name,Gender\n1,01:00:00,Runner,Test,M\n'
    submitted = client.post(f'/races/{race_id}/results', files={'file': ('results.csv', csv.encode(), 'text/csv')}, headers=headers)
    assert submitted.status_code == 200
    replay = client.get(f'/races/{race_id}/results')
    assert replay.status_code == 200
    assert replay.json() == submitted.json()['scores']


@pytest.mark.parametrize('xml', [
    '<gpx><trk><trkseg><trkpt lat="nan" lon="98"/><trkpt lat="8" lon="98"/></trkseg></trk></gpx>',
    '<gpx><trk><trkseg><trkpt lat="8" lon="98"/><trkpt lat="8.01" lon="98"/></trkseg></trk></gpx>',
])
def test_gpx_invalid_or_missing_elevation_is_actionable_422(xml):
    response = client.post('/gpx/analyze', files={'file': ('bad.gpx', xml.encode(), 'application/gpx+xml')})
    assert response.status_code == 422
    assert response.json()['detail']


def test_analyze_gpx_with_finish_time_returns_predicted_score():
    with FLAT_LOOP_GPX.open("rb") as handle:
        response = client.post(
            "/gpx/analyze",
            files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")},
            data={"finish_time_seconds": "3600"},
        )

    assert response.status_code == 200
    estimate = response.json()["estimate"]
    assert estimate is not None
    assert "predicted_score" in estimate
    assert estimate["predicted_score"] < 1000
    assert estimate["scoring_version"] == "0.8.0-course-standard-power"
    # The explanation the prototype renders comes from the API, not from client-side maths.
    # No DEM manifest in the test environment, so V0.7 must say Low and say why.
    assert estimate["confidence"] == "Low"
    assert any(flag.startswith("elevation_not_dem_sourced") for flag in estimate["quality_flags"])
    breakdown = estimate["breakdown"]
    assert breakdown["adjusted_demand_km"] == estimate["equivalent_distance_km"]
    assert breakdown["terrain_factor"] >= 1.0
    assert 0.0 < breakdown["fraction_of_ceiling"] < 1.5
    assert breakdown["world_best_time_seconds"] > 0


def test_analyze_gpx_prediction_matches_real_score_for_same_course_and_time():
    """The predictor and the real scorer must agree exactly for the same GPX and time."""
    with FLAT_LOOP_GPX.open("rb") as handle:
        response = client.post(
            "/gpx/analyze",
            files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")},
            data={"finish_time_seconds": "3600"},
        )
    predicted = response.json()["estimate"]["predicted_score"]

    headers = _organizer_auth_headers()
    _, race_id = _create_event_and_race(headers)
    with FLAT_LOOP_GPX.open("rb") as handle:
        client.post(f"/races/{race_id}/gpx", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")}, headers=headers)

    import io

    csv_content = "Ranking,Time,Family name,First Name,Gender\n1,01:00:00,Runner,Test,M\n"
    files = {"file": ("results.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    submit_response = client.post(f"/races/{race_id}/results", files=files, headers=headers)

    assert submit_response.json()["scores"][0]["otri_score"] == predicted


def test_analyze_invalid_gpx_returns_422():
    response = client.post(
        "/gpx/analyze",
        files={"file": ("not-gpx.txt", b"this is not xml", "text/plain")},
    )
    assert response.status_code == 422


def test_analyze_gpx_with_out_of_domain_gradient_still_estimates_with_a_notice():
    """Spec section 9.1: grades beyond +/-45% are clamped for that segment and flagged,
    rather than blocking the whole estimate."""
    with STEEP_GPX.open("rb") as handle:
        response = client.post(
            "/gpx/analyze",
            files={"file": ("steep.gpx", handle, "application/gpx+xml")},
            data={"finish_time_seconds": "3600"},
        )
    assert response.status_code == 200
    estimate = response.json()["estimate"]
    assert any("gradient_out_of_supported_domain" in flag for flag in estimate["quality_flags"])


# --- Auth ------------------------------------------------------------------


def test_register_returns_message_not_a_token():
    response = client.post(
        "/auth/register", json={"email": "roundtrip@example.com", "password": "correct horse battery"}
    )
    assert response.status_code == 201
    assert "access_token" not in response.json()
    assert "verify" in response.json()["message"].lower()


def test_login_before_verification_returns_403():
    client.post("/auth/register", json={"email": "unverified@example.com", "password": "correct horse battery"})
    response = client.post("/auth/login", json={"email": "unverified@example.com", "password": "correct horse battery"})
    assert response.status_code == 403


def test_login_after_verification_succeeds():
    headers = _organizer_auth_headers("verified@example.com", "correct horse battery")
    assert "Authorization" in headers


def test_resend_verification_returns_generic_message_either_way():
    known = client.post("/auth/resend-verification", json={"email": "roundtrip2@example.com"})
    unknown = client.post("/auth/resend-verification", json={"email": "nobody-at-all@example.com"})
    assert known.status_code == 200
    assert unknown.status_code == 200
    assert known.json() == unknown.json()


def test_login_with_wrong_password_returns_401():
    _register_and_verify("wrongpw@example.com", "correct horse battery")
    response = client.post("/auth/login", json={"email": "wrongpw@example.com", "password": "nope nope nope"})
    assert response.status_code == 401


def test_register_duplicate_email_returns_400():
    client.post("/auth/register", json={"email": "dupe@example.com", "password": "correct horse battery"})
    response = client.post("/auth/register", json={"email": "dupe@example.com", "password": "correct horse battery"})
    assert response.status_code == 400


def test_analyze_gpx_reuses_the_cached_measurement_for_the_same_file(tmp_path, monkeypatch):
    """The prototype re-sends the same file for every target time; the expensive measurement
    must be done once and reused, and the reuse must be exact."""
    import importlib
    api_module = importlib.import_module("api.app")  # the module, not the FastAPI instance
    monkeypatch.setattr(api_module, "_MEASUREMENT_CACHE_DIR", tmp_path / "measurements")
    with FLAT_LOOP_GPX.open("rb") as handle:
        first = client.post("/gpx/analyze", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")}, data={"finish_time_seconds": "600"})
    assert first.status_code == 200
    cached_files = list((tmp_path / "measurements").glob("*.json"))
    assert len(cached_files) == 1

    calls = []
    real = api_module.measure_course
    monkeypatch.setattr(api_module, "measure_course", lambda *a, **k: calls.append(1) or real(*a, **k))
    with FLAT_LOOP_GPX.open("rb") as handle:
        second = client.post("/gpx/analyze", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")}, data={"finish_time_seconds": "900"})
    assert second.status_code == 200
    assert calls == [], "second analysis of the same file must not re-measure the course"
    assert second.json()["measurement"]["profile_hash"] == first.json()["measurement"]["profile_hash"]
    assert second.json()["estimate"]["predicted_score"] != first.json()["estimate"]["predicted_score"]


def test_share_gpx_stores_the_file_under_a_content_id_and_serves_it_back(tmp_path, monkeypatch):
    """A calculator share link must reopen the exact file; the same file always gets the same id."""
    import importlib
    api_module = importlib.import_module("api.app")
    monkeypatch.setattr(api_module, "_SHARED_COURSE_DIR", tmp_path / "shared")
    with FLAT_LOOP_GPX.open("rb") as handle:
        first = client.post("/gpx/share", files={"file": ("flat-loop.gpx", handle, "application/gpx+xml")}, data={"name": "Flat loop"})
    assert first.status_code == 200
    body = first.json()
    assert len(body["share_id"]) == 16 and body["created"] is True and body["name"] == "Flat loop"

    with FLAT_LOOP_GPX.open("rb") as handle:
        again = client.post("/gpx/share", files={"file": ("renamed.gpx", handle, "application/gpx+xml")})
    assert again.json()["share_id"] == body["share_id"]
    assert again.json()["created"] is False
    assert again.json()["name"] == "Flat loop", "the first uploader's name is kept"

    served = client.get(f"/gpx/shared/{body['share_id']}")
    assert served.status_code == 200
    assert served.content == FLAT_LOOP_GPX.read_bytes()
    assert served.headers["content-type"].startswith("application/gpx+xml")


def test_share_gpx_rejects_invalid_files_and_unknown_ids(tmp_path, monkeypatch):
    import importlib
    api_module = importlib.import_module("api.app")
    monkeypatch.setattr(api_module, "_SHARED_COURSE_DIR", tmp_path / "shared")
    response = client.post("/gpx/share", files={"file": ("bad.gpx", b"<not gpx>", "application/gpx+xml")})
    assert response.status_code == 422
    assert not (tmp_path / "shared").exists()
    assert client.get("/gpx/shared/0123456789abcdef").status_code == 404
    assert client.get("/gpx/shared/../../etc/passwd").status_code == 404
    assert client.get("/gpx/shared/not-hex!").status_code == 404
