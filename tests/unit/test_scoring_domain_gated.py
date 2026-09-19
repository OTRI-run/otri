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
    MIN_VALIDATED_DEMAND_KM,
    CourseNotScoredError,
    confidence_for,
    not_scored_reason,
)
from scoring.estimator import estimate_score
from scoring.measured_demand import compute_measured_demand
from scoring.registry import score_race
from scoring.terrain import STEEP_COEFFICIENT, TERRAIN_MODEL, VERTICAL_STEEP_COEFFICIENT, VERTICAL_STEEP_FRACTION


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


def test_a_normal_vertical_kilometre_is_inside_the_gradient_domain():
    """3.8 km at 26% is steep but inside the measured gradient domain: the only thing to report is that
    uphill-only courses are scored on a provisional calibration."""
    label, reasons = reasons_for(climb(3800, 0.26))
    assert label == "Low" and [r.split(":")[0] for r in reasons] == ["vertical_calibration_provisional"]


def test_a_course_mostly_beyond_the_domain_is_low_with_the_reason():
    label, reasons = reasons_for(climb(1920, 0.52))
    assert label == "Low"
    assert [r for r in reasons if r.startswith("gradient_domain_exceeded")]
    # V0.8 said nothing about it, and still does: its scores replay with their published label.


def test_a_few_steep_pitches_do_not_block_high():
    """The clamp notice alone leaves High reachable (model section 7.2) - only the share matters."""
    measurement = on_terrain_model(measure_course(climb(3800, 0.26)))
    # The clamp rule on its own: the same demand on a course that goes up and down (a fifth of it steep).
    demand = replace(compute_measured_demand(measurement=measurement), steep_distance_fraction=0.2)
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


def test_why_a_vertical_kilometre_has_its_own_coefficient():
    """The mountain coefficient stands mostly for descending and broken rhythm, which an uphill-only course
    does not have: applied to one, it would add more than half again to the demand and a mid-pack 50-minute
    vertical kilometre would score like a world best."""
    demand = compute_measured_demand(measurement=measure_course(climb(3800, 0.26)))
    assert demand.steep_distance_fraction > 0.9
    assert 1.0 + STEEP_COEFFICIENT * demand.steep_distance_fraction > 1.55
    assert TERRAIN_MODEL.factor(demand.steep_distance_fraction, demand.altitude_excess_m) < 1.15


def test_a_vertical_race_is_scored_and_says_its_calibration_is_provisional():
    points = climb(3800, 0.26)
    scores = score_race(_race(), _finishers(1800, 3000, 4200), gpx_points=points, measurement=on_terrain_model(measure_course(points)))
    assert [s.rank for s in scores] == [1, 2, 3]
    assert scores[0].score.otri_score > scores[1].score.otri_score > scores[2].score.otri_score > 0
    assert scores[1].score.otri_score < 1000, "a mid-pack 50 minutes is not a world best any more"
    for row in scores:
        assert row.score.confidence == "Low"
        assert any(flag.startswith("vertical_calibration_provisional") for flag in row.score.quality_flags)
        assert any("uphill-only course, vertical coefficient" in flag for flag in row.score.quality_flags)


def test_the_vertical_rule_starts_above_half_the_distance_steep_and_touches_nothing_below():
    half_steep = compute_measured_demand(measurement=measure_course(profile((2000, 0.05), (2000, 0.26))))
    assert half_steep.steep_distance_fraction <= VERTICAL_STEEP_FRACTION
    assert not TERRAIN_MODEL.is_vertical(half_steep.steep_distance_fraction)
    for share in (0.0, 0.1, 0.184, 0.25, 0.5):
        assert TERRAIN_MODEL.factor(share, 0.0) == pytest.approx(1.0 + STEEP_COEFFICIENT * share, rel=1e-12)
    for share in (0.51, 0.678, 1.0):
        assert TERRAIN_MODEL.factor(share, 0.0) == pytest.approx(1.0 + VERTICAL_STEEP_COEFFICIENT * share, rel=1e-12)
    assert not_scored_reason(half_steep) is None
    assert not_scored_reason(replace(half_steep, steep_distance_fraction=1.0)) is None, "a measured course is always scored"


def test_without_a_course_file_a_vertical_race_is_not_scored():
    row = score_race(_race(3.8, 1000.0), _finishers(1800))[0].score
    assert row.otri_score is None and row.quality_flags[0].startswith("course_not_scored: a vertical race needs its course file")
    assert score_race(_race(50.0, 2000.0), _finishers(18000))[0].score.otri_score is not None


def test_the_calculator_scores_a_measured_vertical_and_refuses_official_figures():
    assert estimate_score(1800, gpx_points=climb(3800, 0.26)).predicted_score > 0
    with pytest.raises(CourseNotScoredError, match="needs its course file"):
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
