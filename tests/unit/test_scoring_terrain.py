"""Unit tests for the V0.5 terrain adjustment (scoring/terrain.py)."""

from pathlib import Path

import pytest

from course.gpx import parse_track_points
from scoring.course_standard import (
    ENDURANCE_REFERENCED_CURVE,
    TERRAIN_ADJUSTED_CURVE,
    adjusted_demand,
)
from scoring.estimator import estimate_score
from scoring.measured_demand import compute_measured_demand
from scoring.terrain import TERRAIN_MODEL, TerrainModel

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GPX = REPO_ROOT / "data" / "demo" / "gpx"
FIXTURE_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx"

UTMB = DEMO_GPX / "utmb_174km_universal.gpx"
CM6 = DEMO_GPX / "cm6-2026-cm6-i1.gpx"
ROAD_HALF = DEMO_GPX / "Sunday_Laguna_Half_Marathon.gpx"

UTMB_WINNER_SECONDS = 18 * 3600 + 16 * 60 + 29

# The demo GPX files are real organizer courses and are deliberately not committed —
# DATA_POLICY.md treats third-party course files as restricted. The pure-model tests below run
# everywhere; the ones that measure real courses skip cleanly when the files are absent, so a
# fresh clone and CI stay green without shipping someone else's course data.
needs_real_courses = pytest.mark.skipif(
    not (UTMB.exists() and CM6.exists() and ROAD_HALF.exists()),
    reason="real demo GPX courses not present (see DATA_POLICY.md)",
)


def _points(path: Path):
    return parse_track_points(path.read_text(encoding="utf-8"))


def _demand(path: Path):
    return compute_measured_demand(_points(path))


# --------------------------------------------------------------------------- the model itself


def test_flat_sea_level_course_is_never_adjusted():
    """A road course must come through a terrain-adjusted curve completely untouched."""
    assert TERRAIN_MODEL.factor(0.0, 0.0) == 1.0
    assert TERRAIN_MODEL.flags(0.0, 0.0) == ()


def test_factor_rises_with_both_inputs():
    base = TERRAIN_MODEL.factor(0.10, 0.0)
    assert TERRAIN_MODEL.factor(0.20, 0.0) > base
    assert TERRAIN_MODEL.factor(0.10, 500.0) > base


@pytest.mark.parametrize(
    "steep, altitude",
    [(-0.01, 0.0), (1.01, 0.0), (float("nan"), 0.0), (0.5, -1.0), (0.5, float("inf"))],
)
def test_invalid_terrain_inputs_are_rejected(steep, altitude):
    with pytest.raises(ValueError):
        TERRAIN_MODEL.factor(steep, altitude)


def test_altitude_coefficient_matches_published_aerobic_decrement():
    """1000 m above the threshold must cost the ~7%/1000 m the literature reports, so this
    half of the model stays traceable to physiology rather than to calibration."""
    assert TERRAIN_MODEL.factor(0.0, 1000.0) == pytest.approx(1.07)


# ------------------------------------------------------------------- measured off real courses


@needs_real_courses
def test_road_course_measures_zero_terrain():
    demand = _demand(ROAD_HALF)
    assert demand.steep_distance_fraction == 0.0
    assert demand.altitude_excess_m == 0.0


@needs_real_courses
def test_altitude_is_what_separates_an_alpine_course_from_a_merely_steep_one():
    """The honest limit of this model: GPX cannot tell technical footing apart, so UTMB and the
    V0.1 reference race look nearly identical on steepness. Altitude is the only measured
    feature that distinguishes them — documented here so the limitation stays visible."""
    utmb, cm6 = _demand(UTMB), _demand(CM6)
    assert utmb.steep_distance_fraction == pytest.approx(cm6.steep_distance_fraction, abs=0.02)
    assert utmb.altitude_excess_m > 200.0
    assert cm6.altitude_excess_m == 0.0


@needs_real_courses
def test_terrain_ordering_across_real_courses():
    factors = {
        name: TERRAIN_MODEL.factor(d.steep_distance_fraction, d.altitude_excess_m)
        for name, d in {
            "road": _demand(ROAD_HALF),
            "jungle_trail": _demand(FIXTURE_GPX / "phuket-trail-2026-pkt15.gpx"),
            "alpine": _demand(UTMB),
        }.items()
    }
    assert factors["road"] == 1.0
    assert factors["road"] < factors["jungle_trail"] < factors["alpine"]


# ----------------------------------------------------------------- end-to-end through scoring


@needs_real_courses
def test_road_course_scores_identically_under_v04_and_v05():
    points = _points(ROAD_HALF)
    v4 = estimate_score(4800, gpx_points=points, curve=ENDURANCE_REFERENCED_CURVE)
    v5 = estimate_score(4800, gpx_points=points, curve=TERRAIN_ADJUSTED_CURVE)
    assert v5.equivalent_distance_km == v4.equivalent_distance_km
    assert v5.predicted_score == v4.predicted_score


@needs_real_courses
def test_real_mountain_ultra_winner_reaches_the_calibration_target():
    """STEEP_COEFFICIENT is calibrated so this one real performance scores 970. If this moves,
    the calibration moved — which is a new model version, not an edit (V0.1 spec section 21)."""
    estimate = estimate_score(UTMB_WINNER_SECONDS, gpx_points=_points(UTMB), curve=TERRAIN_ADJUSTED_CURVE)
    assert estimate.predicted_score == 970


@needs_real_courses
def test_mountain_ultra_still_has_headroom_above_the_calibration_point():
    """The trap V0.3 documented and rejected: the top of the scale must keep separating
    performances better than the one it was calibrated on."""
    points = _points(UTMB)
    faster = estimate_score(UTMB_WINNER_SECONDS - 1800, gpx_points=points, curve=TERRAIN_ADJUSTED_CURVE)
    winner = estimate_score(UTMB_WINNER_SECONDS, gpx_points=points, curve=TERRAIN_ADJUSTED_CURVE)
    assert winner.predicted_score < faster.predicted_score <= 1000


@needs_real_courses
def test_adjustment_is_surfaced_as_a_quality_flag():
    estimate = estimate_score(UTMB_WINNER_SECONDS, gpx_points=_points(UTMB), curve=TERRAIN_ADJUSTED_CURVE)
    assert any(flag.startswith("terrain_adjustment_applied") for flag in estimate.quality_flags)


@needs_real_courses
def test_adjusted_demand_is_a_no_op_for_curves_without_a_terrain_model():
    demand = _demand(UTMB)
    km, flags = adjusted_demand(demand, ENDURANCE_REFERENCED_CURVE)
    assert km == demand.course_demand_km
    assert flags == tuple(demand.quality_flags)


@needs_real_courses
def test_disabling_either_term_lowers_the_mountain_score():
    """Both halves of the model must be load-bearing, so neither can be dropped silently."""
    demand = _demand(UTMB)
    full = TERRAIN_MODEL.factor(demand.steep_distance_fraction, demand.altitude_excess_m)
    no_altitude = TerrainModel(
        TERRAIN_MODEL.steep_grade_threshold, TERRAIN_MODEL.altitude_threshold_m,
        TERRAIN_MODEL.steep_coefficient, 0.0,
    ).factor(demand.steep_distance_fraction, demand.altitude_excess_m)
    no_steep = TerrainModel(
        TERRAIN_MODEL.steep_grade_threshold, TERRAIN_MODEL.altitude_threshold_m,
        0.0, TERRAIN_MODEL.altitude_coefficient,
    ).factor(demand.steep_distance_fraction, demand.altitude_excess_m)
    assert no_altitude < full
    assert no_steep < full
