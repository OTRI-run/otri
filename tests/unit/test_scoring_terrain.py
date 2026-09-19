"""Unit tests for the V0.5 terrain adjustment (scoring/terrain.py)."""

from pathlib import Path

import pytest

from course.gpx import parse_track_points
from scoring.course_standard import MODEL_CURVE, adjusted_demand
from scoring.estimator import estimate_score
from scoring.measured_demand import compute_measured_demand
from scoring.terrain import TERRAIN_MODEL, TerrainModel

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GPX = REPO_ROOT / "data" / "demo" / "gpx"
FIXTURE_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx"

REFERENCE_100MI = DEMO_GPX / "alpine-100mi-reference.gpx"
CM6 = DEMO_GPX / "cm6-2026-cm6-i1.gpx"
ROAD_HALF = DEMO_GPX / "Sunday_Laguna_Half_Marathon.gpx"

REFERENCE_WIN_SECONDS = 18 * 3600 + 16 * 60 + 29

# The demo GPX files are real organizer courses and are deliberately not committed —
# DATA_POLICY.md treats third-party course files as restricted. The pure-model tests below run
# everywhere; the ones that measure real courses skip cleanly when the files are absent, so a
# fresh clone and CI stay green without shipping someone else's course data.
needs_real_courses = pytest.mark.skipif(
    not (REFERENCE_100MI.exists() and CM6.exists() and ROAD_HALF.exists()),
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
    """The honest limit of this model: GPX cannot tell technical footing apart, so REFERENCE_100MI and the
    V0.1 reference race look nearly identical on steepness. Altitude is the only measured
    feature that distinguishes them — documented here so the limitation stays visible."""
    reference_ultra, cm6 = _demand(REFERENCE_100MI), _demand(CM6)
    assert reference_ultra.steep_distance_fraction == pytest.approx(cm6.steep_distance_fraction, abs=0.02)
    assert reference_ultra.altitude_excess_m > 200.0
    assert cm6.altitude_excess_m == 0.0


@needs_real_courses
def test_terrain_ordering_across_real_courses():
    factors = {
        name: TERRAIN_MODEL.factor(d.steep_distance_fraction, d.altitude_excess_m)
        for name, d in {
            "road": _demand(ROAD_HALF),
            "jungle_trail": _demand(FIXTURE_GPX / "phuket-trail-2026-pkt15.gpx"),
            "alpine": _demand(REFERENCE_100MI),
        }.items()
    }
    assert factors["road"] == 1.0
    assert factors["road"] < factors["jungle_trail"] < factors["alpine"]


# ----------------------------------------------------------------- end-to-end through scoring


@needs_real_courses
def test_a_road_course_is_scored_on_its_gradient_demand_alone():
    demand = _demand(ROAD_HALF)
    km, flags = adjusted_demand(demand, MODEL_CURVE)
    assert km == demand.course_demand_km and flags == tuple(demand.quality_flags)
    assert estimate_score(4800, gpx_points=_points(ROAD_HALF)).breakdown.terrain_factor == 1.0


@needs_real_courses
def test_real_course_pins():
    """One real performance per course, from uploaded elevations (production measures from the DEM
    and differs by a few percent). STEEP_COEFFICIENT was calibrated on the mountain 100-miler; if
    these move, the model moved, which is a new version and not an edit."""
    assert estimate_score(REFERENCE_WIN_SECONDS, gpx_points=_points(REFERENCE_100MI)).predicted_score == 958
    assert estimate_score(8430, gpx_points=_points(CM6)).predicted_score == 653


@needs_real_courses
def test_mountain_ultra_still_has_headroom_above_the_calibration_point():
    """The top of the scale must keep separating performances better than the one it was calibrated on."""
    points = _points(REFERENCE_100MI)
    faster = estimate_score(REFERENCE_WIN_SECONDS - 1800, gpx_points=points)
    winner = estimate_score(REFERENCE_WIN_SECONDS, gpx_points=points)
    assert winner.predicted_score < faster.predicted_score <= 1000


@needs_real_courses
def test_adjustment_is_surfaced_as_a_quality_flag():
    estimate = estimate_score(REFERENCE_WIN_SECONDS, gpx_points=_points(REFERENCE_100MI))
    assert any(flag.startswith("terrain_adjustment_applied") for flag in estimate.quality_flags)


@needs_real_courses
def test_disabling_either_term_lowers_the_mountain_score():
    """Both halves of the model must be load-bearing, so neither can be dropped silently."""
    demand = _demand(REFERENCE_100MI)
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
