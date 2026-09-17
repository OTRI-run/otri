"""Unit tests for the V0.8 power curve: score = 1000 * f**0.85."""

from pathlib import Path

import pytest

from course.gpx import parse_track_points
from scoring.course_standard import (
    DEM_GATED_CURVE,
    ENDURANCE_REFERENCE,
    ENDURANCE_REFERENCED_Q_1000,
    POWER_CURVE,
    POWER_EXPONENT,
    SCALE_MAX,
    score_for_time,
    target_time_seconds,
)
from scoring.estimator import estimate_score

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GPX = REPO_ROOT / "data" / "demo" / "gpx"
REFERENCE_100MI, CM6, CM4 = DEMO_GPX / "alpine-100mi-reference.gpx", DEMO_GPX / "cm6-2026-cm6-i1.gpx", DEMO_GPX / "chiang-mai-2021-cm4.gpx"
needs_real_courses = pytest.mark.skipif(not (REFERENCE_100MI.exists() and CM6.exists() and CM4.exists()), reason="real demo GPX not present (see DATA_POLICY.md)")


def _points(path):
    return parse_track_points(path.read_text(encoding="utf-8"))


def test_curve_is_one_power_law_with_no_anchors():
    assert POWER_CURVE.curve_type == "power"
    assert POWER_CURVE.power_exponent == POWER_EXPONENT == 0.85
    assert POWER_CURVE.anchor_scores == () and POWER_CURVE.anchor_qs == ()
    assert POWER_CURVE.q_1000 == ENDURANCE_REFERENCED_Q_1000
    # Everything else is inherited from V0.7 unchanged.
    assert POWER_CURVE.terrain_adjustment is DEM_GATED_CURVE.terrain_adjustment
    assert POWER_CURVE.demand_scaling is DEM_GATED_CURVE.demand_scaling


@pytest.mark.parametrize("fraction", [0.05, 0.2, 0.5, 0.85, 1.0, 1.1])
def test_score_is_1000_times_fraction_to_the_exponent(fraction):
    q = fraction * POWER_CURVE.q_1000
    assert POWER_CURVE.raw_score(q) == pytest.approx(SCALE_MAX * fraction**POWER_EXPONENT, rel=1e-12)


def test_top_of_the_scale_is_unchanged_and_the_middle_is_lower():
    for f in (0.95, 1.0):
        q = f * POWER_CURVE.q_1000
        assert abs(POWER_CURVE.raw_score(q) - DEM_GATED_CURVE.raw_score(q)) <= 8.0
    for f in (0.2, 0.35, 0.5, 0.65):
        q = f * POWER_CURVE.q_1000
        assert POWER_CURVE.raw_score(q) < DEM_GATED_CURVE.raw_score(q) - 40


@pytest.mark.parametrize("demand_km", [3.0, 27.56, 100.0, 218.671, 700.0])
def test_inverse_round_trip(demand_km):
    for score in (50, 200, 400, 600, 800, 950, 1000):
        target = target_time_seconds(demand_km, score, curve=POWER_CURVE)
        assert score_for_time(demand_km, target, curve=POWER_CURVE)["otri_score"] == pytest.approx(score, abs=1)


@pytest.mark.parametrize("demand_km", [5.0, 27.56, 218.671])
def test_monotonic_in_finish_time(demand_km):
    times = [1800, 3600, 7200, 18000, 36000, 65789, 100000, 250000]
    raws = [score_for_time(demand_km, t, curve=POWER_CURVE)["otri_raw"] for t in times]
    assert raws == sorted(raws, reverse=True)


@pytest.mark.parametrize("fraction", [0.3, 0.55, 0.8, 0.95])
def test_equal_calibre_scores_the_same_at_every_course_size(fraction):
    scores = set()
    for demand_km in (5.0, 27.56, 100.0, 218.671, 700.0):
        seconds = demand_km / (ENDURANCE_REFERENCE.rate(demand_km) * fraction) * 3600.0
        scores.add(score_for_time(demand_km, seconds, curve=POWER_CURVE)["otri_score"])
    assert max(scores) - min(scores) <= 1


def test_world_bests_stay_at_the_top():
    for demand_km, seconds in ((5.0, 755.36), (42.195, 7235.0), (100.0, 21935.0), (160.934, 39099.0), (319.614, 86400.0)):
        assert score_for_time(demand_km, seconds, curve=POWER_CURVE)["otri_score"] >= 940


@needs_real_courses
def test_real_course_pins():
    """Uploaded-elevation pins (production measures from the DEM and differs by a few %)."""
    reference_ultra = estimate_score(65789, gpx_points=_points(REFERENCE_100MI), curve=POWER_CURVE).predicted_score
    cm6 = estimate_score(8430, gpx_points=_points(CM6), curve=POWER_CURVE).predicted_score
    cm4 = estimate_score(12 * 3600 + 33 * 60 + 43, gpx_points=_points(CM4), curve=POWER_CURVE).predicted_score
    assert reference_ultra == 958
    assert cm6 == 653
    # On the file's noise-inflated ascent; the DEM-measured production score is ~581.
    assert 640 <= cm4 <= 680
    # V0.7 remains reproducible.
    assert estimate_score(65789, gpx_points=_points(REFERENCE_100MI), curve=DEM_GATED_CURVE).predicted_score == 966
