"""Tests for V0.9 (domain-gated), the totals clamp and the vertical-race label.

V0.9 never changes a score. It changes what a score claims where the model runs out of evidence -
ground steeper than the 45% gradient domain, efforts shorter than the ceiling is validated for -
and gives no score at all to uphill-only courses, which the steep-terrain term over-scores
(OEP-002).
"""

from dataclasses import replace
from datetime import date

import pytest
from geographiclib.geodesic import Geodesic

from course.discipline import is_vertical
from course.gpx import TrackPoint
from course.measurement import measure_course
from ingestion.records import RaceRecord, ResultRecord
from scoring.course_demand import MAX_GRADE, demand_from_totals, equivalent_flat_distance_from_totals, gradient_ratio
from scoring.course_standard import (
    MODEL_CURVE,
    MAX_CLAMPED_DEMAND_FRACTION,
    MAX_SCORED_STEEP_FRACTION,
    MIN_VALIDATED_DEMAND_KM,
    CourseNotScoredError,
    confidence_for,
    not_scored_reason,
)
from scoring.estimator import estimate_score
from scoring.measured_demand import compute_measured_demand
from scoring.registry import score_race
from scoring.terrain import TERRAIN_MODEL


def profile(*sections: tuple[float, float], spacing_m: float = 10.0) -> list[TrackPoint]:
    """A straight northbound track made of (length_m, grade) sections."""
    points, elevation, i = [], 500.0, 0
    for length_m, grade in sections:
        for _ in range(int(length_m / spacing_m)):
            position = Geodesic.WGS84.Direct(46.0, 7.0, 0, i * spacing_m)
            points.append(TrackPoint(position["lat2"], position["lon2"], elevation, None, 0))
            elevation += spacing_m * grade
            i += 1
    return points


def climb(length_m: float, grade: float) -> list[TrackPoint]:
    return profile((length_m, grade))


# Mostly runnable, with one wall beyond the gradient domain: scored, but most of its demand is clamped.
WALL_COURSE = ((3000, 0.0), (600, 0.52), (400, 0.0))


def on_terrain_model(measurement):
    """The same measurement as if its elevation had come from a pinned terrain dataset."""
    return replace(measurement, source={"dataset": "synthetic-test-dem"})


def reasons_for(points):
    measurement = on_terrain_model(measure_course(points))
    demand = compute_measured_demand(measurement=measurement)
    return confidence_for(measurement, demand, demand.course_demand_km)


# ------------------------------------------------------------------ the gradient domain


def test_clamped_demand_fraction_is_measured():
    assert compute_measured_demand(measurement=measure_course(climb(3000, 0.26))).clamped_demand_fraction == 0.0
    assert compute_measured_demand(measurement=measure_course(climb(2000, 0.52))).clamped_demand_fraction > 0.9


def test_a_normal_vertical_kilometre_keeps_high():
    """3.8 km at 26% is steep but inside the measured domain: nothing to report."""
    assert reasons_for(climb(3800, 0.26)) == ("High", ())


def test_a_course_mostly_beyond_the_domain_is_low_with_the_reason():
    label, reasons = reasons_for(climb(1920, 0.52))
    assert label == "Low"
    assert [r for r in reasons if r.startswith("gradient_domain_exceeded")]
    # V0.8 said nothing about it, and still does: its scores replay with their published label.


def test_a_few_steep_pitches_do_not_block_high():
    """The clamp notice alone leaves High reachable (model section 7.2) - only the share matters."""
    measurement = on_terrain_model(measure_course(climb(3800, 0.26)))
    demand = compute_measured_demand(measurement=measurement)
    at_threshold = replace(demand, clamped_demand_fraction=MAX_CLAMPED_DEMAND_FRACTION)
    assert confidence_for(measurement, at_threshold, demand.course_demand_km) == ("High", ())
    above = replace(demand, clamped_demand_fraction=MAX_CLAMPED_DEMAND_FRACTION + 0.01)
    assert confidence_for(measurement, above, demand.course_demand_km)[0] == "Low"


# ------------------------------------------------------------------ the validated range


def test_a_course_shorter_than_the_validated_range_is_low_with_the_reason():
    label, reasons = reasons_for(climb(1000, 0.0))
    assert label == "Low"
    assert [r for r in reasons if r.startswith("course_below_validated_range")]


def test_the_validated_range_starts_at_the_1500_m_record():
    measurement = on_terrain_model(measure_course(climb(3000, 0.0)))
    demand = compute_measured_demand(measurement=measurement)
    assert confidence_for(measurement, demand, MIN_VALIDATED_DEMAND_KM) == ("High", ())
    assert confidence_for(measurement, demand, MIN_VALIDATED_DEMAND_KM - 0.001)[0] == "Low"


def test_estimate_carries_the_new_reasons():
    estimate = estimate_score(1733, gpx_points=profile(*WALL_COURSE))
    assert estimate.scoring_version == MODEL_CURVE.version
    assert estimate.confidence == "Low"
    assert any(flag.startswith("gradient_domain_exceeded") for flag in estimate.quality_flags)


# ------------------------------------------------------------------ vertical races are not scored


def _race(distance_km=3.8, gain_m=1000.0) -> RaceRecord:
    return RaceRecord(race_id="VK", race_name="VK", event_date=date(2026, 9, 1), course_name="VK", distance_km=distance_km, elevation_gain_m=gain_m)


def _finishers(*seconds) -> list[ResultRecord]:
    return [ResultRecord(rank=i + 1, bib_number=str(i + 1), family_name="Runner", first_name=str(i + 1), gender="F", finish_time_seconds=t) for i, t in enumerate(seconds)]


def test_why_a_vertical_kilometre_is_not_scored():
    """The defect being fenced off: an uphill-only course is ~100% steep, so the terrain term, calibrated
    on courses at most a quarter that steep, multiplies its demand by more than half again and a mid-pack
    50-minute vertical kilometre would score like a world best."""
    demand = compute_measured_demand(measurement=measure_course(climb(3800, 0.26)))
    assert demand.steep_distance_fraction > 0.9
    assert TERRAIN_MODEL.factor(demand.steep_distance_fraction, demand.altitude_excess_m) > 1.55

def test_a_vertical_race_lists_every_finisher_without_a_score():
    points = climb(3800, 0.26)
    scores = score_race(_race(), _finishers(1800, 3000, 4200), gpx_points=points, measurement=measure_course(points))
    assert [s.rank for s in scores] == [1, 2, 3]
    for row in scores:
        assert row.score.otri_score is None
        assert row.score.confidence == "n/a"
        assert len(row.score.quality_flags) == 1 and row.score.quality_flags[0].startswith("course_not_scored: vertical races are not scored yet")


def test_the_trigger_is_the_measured_steep_share():
    half_steep = compute_measured_demand(measurement=measure_course(profile((2000, 0.05), (2000, 0.26))))
    assert half_steep.steep_distance_fraction <= MAX_SCORED_STEEP_FRACTION
    assert not_scored_reason(half_steep) is None
    assert not_scored_reason(replace(half_steep, steep_distance_fraction=MAX_SCORED_STEEP_FRACTION + 0.01)) is not None


def test_without_a_course_file_the_vertical_label_decides():
    assert score_race(_race(3.8, 1000.0), _finishers(1800))[0].score.otri_score is None
    assert score_race(_race(50.0, 2000.0), _finishers(18000))[0].score.otri_score is not None


def test_the_calculator_gets_the_reason_instead_of_a_number():
    with pytest.raises(CourseNotScoredError, match="vertical races are not scored yet"):
        estimate_score(1800, gpx_points=climb(3800, 0.26))
    with pytest.raises(CourseNotScoredError):
        estimate_score(1800, distance_km=3.8, elevation_gain_m=1000.0)


# ------------------------------------------------------------------ official figures only


def test_totals_beyond_the_domain_are_clamped_and_flagged_not_refused():
    """1.92 km with 1,000 m of climb averages 52%: it used to be unscorable without a course file."""
    demand_km, flags = demand_from_totals(1.92, 1000.0)
    assert demand_km == pytest.approx(1.92 * gradient_ratio(MAX_GRADE), abs=1e-3)
    assert len(flags) == 1 and flags[0].startswith("gradient_out_of_supported_domain")
    assert equivalent_flat_distance_from_totals(1.92, 1000.0) == demand_km


def test_totals_inside_the_domain_are_unchanged_and_unflagged():
    assert demand_from_totals(10.0, 0.0) == (10.0, ())
    assert demand_from_totals(3.8, 1000.0) == (round(3.8 * gradient_ratio(1000.0 / 3800.0), 3), ())


# ------------------------------------------------------------------ the vertical label


@pytest.mark.parametrize(
    "distance_km, gain_m, loss_m, expected",
    [
        (3.8, 1000.0, 20.0, True),      # a vertical kilometre
        (1.92, 1000.0, 0.0, True),      # the steepest kind
        (12.2, 1400.0, 30.0, True),     # an uphill mountain race to a summit
        (21.0, 2380.0, 250.0, False),   # more descent than a tenth of the climb
        (10.0, 300.0, 0.0, False),      # a road that only rises: not steep enough to be one
        (22.0, 2500.0, 2500.0, False),  # a skyrace loop
        (10.0, 0.0, 0.0, False),
    ],
)
def test_vertical_label_with_a_measured_course(distance_km, gain_m, loss_m, expected):
    assert is_vertical(distance_km, gain_m, loss_m) is expected


def test_vertical_label_from_official_figures_needs_a_vertical_kilometre_grade():
    assert is_vertical(3.8, 1000.0) is True
    assert is_vertical(5.0, 1000.0) is True
    assert is_vertical(12.2, 1400.0) is False, "descent unknown: 11% could as well be a loop"
    assert is_vertical(0.0, 1000.0) is False
