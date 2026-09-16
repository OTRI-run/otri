"""Unit tests for the Minetti gradient-cost course-demand engine.

Run with: pytest tests/unit
"""

from pathlib import Path

import pytest

from course import haversine_m, read_track_points
from scoring.course_demand import (
    equivalent_flat_distance_from_totals,
    equivalent_flat_distance_km,
    grade_cost_ratio,
    minetti_cost,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "gpx"


def test_minetti_cost_at_flat_matches_published_constant():
    # Minetti et al. 2002's polynomial evaluates to 3.6 J/kg/m at g=0.
    assert minetti_cost(0.0) == pytest.approx(3.6)


def test_grade_cost_ratio_is_one_on_flat_ground():
    assert grade_cost_ratio(0.0) == pytest.approx(1.0)


def test_uphill_costs_more_than_flat():
    assert grade_cost_ratio(0.10) > 1.0
    assert grade_cost_ratio(0.20) > grade_cost_ratio(0.10)


def test_gentle_downhill_costs_less_than_flat():
    assert grade_cost_ratio(-0.10) < 1.0


def test_extreme_downhill_costs_more_than_gentle_downhill():
    # Minetti's curve rises again at very steep negative grades (braking cost).
    assert grade_cost_ratio(-0.45) > grade_cost_ratio(-0.10)


def test_grade_is_clamped_beyond_supported_range():
    # Nothing should blow up or extrapolate past +/-45%; clamped cost stays constant beyond it.
    assert minetti_cost(0.9) == minetti_cost(0.45)
    assert minetti_cost(-0.9) == minetti_cost(-0.45)


def test_equivalent_flat_distance_matches_raw_distance_on_flat_course():
    points = read_track_points(FIXTURES / "flat-loop.gpx")
    equivalent_km = equivalent_flat_distance_km(points)

    # A perfectly flat course has grade 0 everywhere, so the cost ratio is 1.0 throughout.
    raw_distance_km = sum(haversine_m(a.lat, a.lon, b.lat, b.lon) for a, b in zip(points, points[1:])) / 1000.0
    assert equivalent_km == pytest.approx(raw_distance_km, rel=0.01)


def test_equivalent_flat_distance_exceeds_raw_distance_with_climbing():
    points = read_track_points(FIXTURES / "single-climb.gpx")
    equivalent_km = equivalent_flat_distance_km(points)

    raw_distance_km = sum(haversine_m(a.lat, a.lon, b.lat, b.lon) for a, b in zip(points, points[1:])) / 1000.0
    assert equivalent_km > raw_distance_km


def test_equivalent_flat_distance_requires_at_least_two_points():
    with pytest.raises(ValueError):
        equivalent_flat_distance_km([])


def test_totals_fallback_matches_distance_when_no_elevation():
    assert equivalent_flat_distance_from_totals(10.0, 0.0) == pytest.approx(10.0)


def test_totals_fallback_exceeds_distance_with_gain():
    assert equivalent_flat_distance_from_totals(10.0, 500.0) > 10.0


def test_totals_fallback_rejects_non_positive_distance():
    with pytest.raises(ValueError):
        equivalent_flat_distance_from_totals(0.0, 100.0)
