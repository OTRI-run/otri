"""Unit tests for the spec-compliant course-demand engine (OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md).

Run with: pytest tests/unit
"""

import pytest

from course.gpx import TrackPoint
from scoring.course_demand import (
    MAX_GRADE,
    MIN_GRADE,
    UnsupportedGradientError,
    compute_course_demand,
    equivalent_flat_distance_from_totals,
    equivalent_flat_distance_km,
    gradient_cost,
    gradient_ratio,
)


def _flat_track(num_points: int = 20, spacing_deg: float = 0.0002) -> list[TrackPoint]:
    """A perfectly flat, straight track (grade 0 everywhere)."""
    return [TrackPoint(lat=i * spacing_deg, lon=0.0, elevation_m=100.0, time=None) for i in range(num_points)]


def _steep_track() -> list[TrackPoint]:
    """A track with a flat approach, then a huge elevation step over a short span, then flat
    again — steep enough to survive the elevation-denoising pipeline and still exceed the
    supported +/-45% domain."""
    points = [TrackPoint(lat=i * 0.00005, lon=0.0, elevation_m=0.0, time=None) for i in range(15)]
    points.append(TrackPoint(lat=15 * 0.00005 + 0.00018, lon=0.0, elevation_m=500.0, time=None))
    points += [
        TrackPoint(lat=16 * 0.00005 + 0.00018 + i * 0.00005, lon=0.0, elevation_m=500.0, time=None) for i in range(15)
    ]
    return points


def test_gradient_cost_at_flat_matches_published_constant():
    assert gradient_cost(0.0) == pytest.approx(3.6)


def test_gradient_ratio_is_one_on_flat_ground():
    assert gradient_ratio(0.0) == pytest.approx(1.0)


def test_uphill_costs_more_than_flat():
    assert gradient_ratio(0.10) > 1.0
    assert gradient_ratio(0.20) > gradient_ratio(0.10)


def test_gentle_downhill_costs_less_than_flat():
    assert gradient_ratio(-0.10) < 1.0


def test_positive_and_negative_grades_are_not_collapsed_to_absolute_value():
    """Spec section 22: gradient asymmetry must be preserved."""
    assert gradient_ratio(0.10) != gradient_ratio(-0.10)


def test_gradient_cost_rejects_out_of_domain_grade():
    """Spec section 13: V0 must fail explicitly, not silently clamp or extrapolate."""
    with pytest.raises(UnsupportedGradientError):
        gradient_cost(MAX_GRADE + 0.01)
    with pytest.raises(UnsupportedGradientError):
        gradient_cost(MIN_GRADE - 0.01)


def test_gradient_cost_rejects_non_finite_grade():
    with pytest.raises(ValueError):
        gradient_cost(float("nan"))


def test_boundary_grades_are_accepted():
    # +/-0.45 exactly must NOT raise (only strictly outside the domain does).
    gradient_cost(MAX_GRADE)
    gradient_cost(MIN_GRADE)


def test_flat_course_identity():
    """Spec section 22: flat GPX -> course_demand_km == physical_distance_km."""
    demand = compute_course_demand(_flat_track())
    assert demand.course_demand_km == pytest.approx(demand.physical_distance_km, rel=0.01)
    assert demand.elevation_gain_m == 0.0
    assert demand.elevation_loss_m == 0.0


def test_steep_course_raises_unsupported_gradient_error():
    with pytest.raises(UnsupportedGradientError):
        compute_course_demand(_steep_track())


def test_compute_course_demand_requires_at_least_two_points():
    with pytest.raises(ValueError):
        compute_course_demand([])
    with pytest.raises(ValueError):
        compute_course_demand([TrackPoint(lat=0.0, lon=0.0, elevation_m=0.0, time=None)])


def test_invalid_coordinates_are_removed():
    points = [
        TrackPoint(lat=0.0, lon=0.0, elevation_m=100.0, time=None),
        TrackPoint(lat=999.0, lon=0.0, elevation_m=100.0, time=None),  # invalid latitude
        TrackPoint(lat=0.0002, lon=0.0, elevation_m=100.0, time=None),
    ]
    demand = compute_course_demand(points)
    assert demand.segment_count >= 1


def test_consecutive_duplicate_points_are_removed():
    points = [
        TrackPoint(lat=0.0, lon=0.0, elevation_m=100.0, time=None),
        TrackPoint(lat=0.0, lon=0.0, elevation_m=100.0, time=None),  # exact duplicate
        TrackPoint(lat=0.0002, lon=0.0, elevation_m=100.0, time=None),
    ]
    demand = compute_course_demand(points)
    assert demand.physical_distance_km > 0


def test_deterministic_across_runs():
    track = _flat_track()
    first = compute_course_demand(track)
    second = compute_course_demand(track)
    assert first == second


def test_equivalent_flat_distance_km_matches_compute_course_demand():
    track = _flat_track()
    assert equivalent_flat_distance_km(track) == compute_course_demand(track).course_demand_km


def test_totals_fallback_matches_distance_when_no_elevation():
    assert equivalent_flat_distance_from_totals(10.0, 0.0) == pytest.approx(10.0)


def test_totals_fallback_exceeds_distance_with_gain():
    assert equivalent_flat_distance_from_totals(10.0, 500.0) > 10.0


def test_totals_fallback_rejects_non_positive_distance():
    with pytest.raises(ValueError):
        equivalent_flat_distance_from_totals(0.0, 100.0)
