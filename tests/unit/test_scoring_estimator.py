"""Unit tests for the Course Standard GPX -> score predictor.

Run with: pytest tests/unit
"""

from datetime import date
from pathlib import Path

import pytest

from course import read_track_points
from scoring import DEFAULT_SCORING_VERSION, estimate_score

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "gpx"


def test_estimate_from_totals_matches_totals_based_equivalent_distance():
    estimate = estimate_score(3600, distance_km=10, elevation_gain_m=0)
    assert estimate.equivalent_distance_km == 10.0
    assert estimate.scoring_version == DEFAULT_SCORING_VERSION


def test_estimate_score_clips_at_1000_for_extremely_fast_times():
    # Per the spec, 1000 is a reachable, clipped ceiling (Q >= 22.5 demand-km/h) — not
    # a theoretical, unreachable limit.
    estimate = estimate_score(1, distance_km=10, elevation_gain_m=0)
    assert estimate.predicted_score == 1000
    assert estimate.otri_raw > 1000


def test_estimate_score_is_monotonic_in_finish_time():
    faster = estimate_score(3000, distance_km=10, elevation_gain_m=0)
    slower = estimate_score(4000, distance_km=10, elevation_gain_m=0)
    assert faster.predicted_score > slower.predicted_score


def test_estimate_rejects_non_positive_time():
    with pytest.raises(ValueError):
        estimate_score(0, distance_km=10, elevation_gain_m=0)


def test_estimate_requires_course_input():
    with pytest.raises(ValueError):
        estimate_score(3600)


def test_estimate_from_gpx_points_uses_the_real_segment_integral():
    points = read_track_points(FIXTURES / "single-climb.gpx")
    estimate = estimate_score(3600, gpx_points=points)
    assert estimate.equivalent_distance_km > 0


def test_estimate_matches_real_score_race_formula():
    """The whole point of the Course Standard model: the pre-race predictor and the real
    post-race scorer share one formula, so they always agree exactly for the same input —
    no 'assumed winner' guess required, unlike the retired field-relative approach."""
    from ingestion.records import RaceRecord, ResultRecord
    from scoring import score_race

    race = RaceRecord(
        race_id="R1",
        race_name="Test Race",
        event_date=date(2026, 1, 1),
        course_name="Test Course",
        distance_km=10,
        elevation_gain_m=0,
    )
    finish_time = 3600
    results = [ResultRecord(rank=1, bib_number="1", family_name="You", first_name="A", gender="M", finish_time_seconds=finish_time)]
    real_score = score_race(race, results)[0].score.otri_score

    estimate = estimate_score(finish_time, distance_km=10, elevation_gain_m=0)
    assert estimate.predicted_score == real_score


# ---------------------------------------------------------------------------------- breakdown


def test_breakdown_is_internally_consistent_on_the_totals_path():
    """No GPX means no segment profile, so the terrain factor must be exactly 1 and every
    intermediate must reproduce the headline numbers."""
    estimate = estimate_score(3600, distance_km=10, elevation_gain_m=0)
    b = estimate.breakdown
    assert b is not None
    assert b.physical_distance_km == 10.0
    assert b.terrain_factor == 1.0
    assert b.steep_distance_fraction == 0.0 and b.altitude_excess_m == 0.0
    assert b.course_demand_km == b.adjusted_demand_km == estimate.equivalent_distance_km
    assert b.performance_rate == estimate.performance_rate
    # Each field is rounded independently (3 dp), so recomputing one from two others carries
    # rounding of its own: compare at the rounding resolution, not tighter.
    assert b.fraction_of_ceiling == pytest.approx(b.performance_rate / b.reference_rate, abs=1e-4)
    assert b.lookup_rate == pytest.approx(b.performance_rate * b.reference_factor, abs=1e-3)


def test_breakdown_world_best_time_scores_exactly_1000():
    estimate = estimate_score(3600, distance_km=10, elevation_gain_m=0)
    world_best = estimate_score(int(round(estimate.breakdown.world_best_time_seconds)), distance_km=10, elevation_gain_m=0)
    assert world_best.predicted_score == 1000


def test_breakdown_from_gpx_reports_terrain_inputs_and_adjusted_demand():
    points = read_track_points(FIXTURES / "phuket-trail-2026-pkt15.gpx")
    estimate = estimate_score(7200, gpx_points=points)
    b = estimate.breakdown
    assert b.terrain_factor > 1.0
    assert 0.0 < b.steep_distance_fraction < 1.0
    assert b.adjusted_demand_km == pytest.approx(b.course_demand_km * b.terrain_factor, abs=0.002)
    assert b.adjusted_demand_km == estimate.equivalent_distance_km
    assert 0.0 < b.fraction_of_ceiling < 1.5


def test_breakdown_is_serialised_alongside_the_estimate():
    payload = estimate_score(3600, distance_km=10, elevation_gain_m=0).to_dict()
    assert set(payload["breakdown"]) >= {
        "physical_distance_km", "course_demand_km", "terrain_factor", "adjusted_demand_km",
        "performance_rate", "reference_rate", "fraction_of_ceiling", "world_best_time_seconds",
    }
