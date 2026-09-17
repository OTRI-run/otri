"""Unit tests for the V0.6 smoothed upper curve (692 demo anchor dropped)."""

import math
from pathlib import Path

import pytest

from course.gpx import parse_track_points
from scoring.course_standard import (
    ENDURANCE_REFERENCED_Q_1000,
    OFFICIAL_CURVE,
    REFERENCE_DEMAND_KM,
    SMOOTHED_UPPER_CURVE,
    TERRAIN_ADJUSTED_CURVE,
    score_for_time,
    target_time_seconds,
)
from scoring.estimator import estimate_score

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GPX = REPO_ROOT / "data" / "demo" / "gpx"
FIXTURE_GPX = REPO_ROOT / "tests" / "fixtures" / "gpx"
REFERENCE_100MI = DEMO_GPX / "alpine-100mi-reference.gpx"
CM6 = DEMO_GPX / "cm6-2026-cm6-i1.gpx"
ROAD_HALF = DEMO_GPX / "Sunday_Laguna_Half_Marathon.gpx"

# Real organizer course files are deliberately not committed (DATA_POLICY.md); see
# test_scoring_terrain.py for the same arrangement.
needs_real_courses = pytest.mark.skipif(
    not (REFERENCE_100MI.exists() and CM6.exists() and ROAD_HALF.exists()),
    reason="real demo GPX courses not present (see DATA_POLICY.md)",
)

REFERENCE_WIN_SECONDS = 18 * 3600 + 16 * 60 + 29


def _points(path: Path):
    return parse_track_points(path.read_text(encoding="utf-8"))


# ----------------------------------------------------------------------------- the shape itself


def test_only_the_692_demo_anchor_was_dropped():
    assert SMOOTHED_UPPER_CURVE.anchor_scores == (0.0, 349.0, 544.0, 1000.0)
    assert SMOOTHED_UPPER_CURVE.anchor_qs[:3] == OFFICIAL_CURVE.anchor_qs[:3]
    assert SMOOTHED_UPPER_CURVE.anchor_qs[-1] == ENDURANCE_REFERENCED_Q_1000
    # Demand-side model is inherited from V0.5 unchanged.
    assert SMOOTHED_UPPER_CURVE.terrain_adjustment is TERRAIN_ADJUSTED_CURVE.terrain_adjustment
    assert SMOOTHED_UPPER_CURVE.demand_scaling is TERRAIN_ADJUSTED_CURVE.demand_scaling


def test_scores_at_or_below_544_are_identical_to_v05():
    for score in (0, 100, 200, 349, 450, 544):
        v5 = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=TERRAIN_ADJUSTED_CURVE)
        v6 = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=SMOOTHED_UPPER_CURVE)
        assert v6 == pytest.approx(v5, rel=1e-12)


def test_upper_curve_is_a_single_power_law():
    """From the 544 anchor to the 1000 anchor there is exactly one exponent — no kink."""
    q544, q1000 = SMOOTHED_UPPER_CURVE.anchor_qs[2], SMOOTHED_UPPER_CURVE.anchor_qs[3]
    exponent = math.log(q1000 / q544) / math.log(1000.0 / 544.0)
    for q in (9.0, 10.0, 11.769395017793594, 14.0, 17.0, 20.0, 21.5):
        expected = 544.0 * (q / q544) ** (1.0 / exponent)
        assert SMOOTHED_UPPER_CURVE.raw_score(q) == pytest.approx(expected, rel=1e-12)


def test_the_kink_is_gone_uniform_boost_no_longer_favours_the_middle():
    """The defect V0.6 fixes: under V0.5 a uniform +10% Q boost paid more points at ~620 than at
    ~850. With one exponent above 544 the gain must rise monotonically with score, and be the
    same *proportion* of the score everywhere above 544."""
    def gain(curve, score):
        q = curve.required_q(score)
        return curve.raw_score(q * 1.10) - score

    # V0.5 has the bump; pin it so the comparison stays meaningful.
    assert gain(TERRAIN_ADJUSTED_CURVE, 620) > gain(TERRAIN_ADJUSTED_CURVE, 850)

    gains = [gain(SMOOTHED_UPPER_CURVE, s) for s in (560, 620, 700, 800, 850, 950)]
    assert gains == sorted(gains)
    proportions = [g / s for g, s in zip(gains, (560, 620, 700, 800, 850, 950))]
    assert max(proportions) - min(proportions) < 1e-9


def test_old_692_anchor_performance_now_scores_lower():
    """V0.1's 2:20:30 reference finisher was pinned to 692 by construction; on the smoothed curve
    the same performance rate lands at ~658 at the reference course size."""
    assert SMOOTHED_UPPER_CURVE.raw_score(OFFICIAL_CURVE.anchor_qs[3]) == pytest.approx(658.3, abs=0.5)


@pytest.mark.parametrize("demand_km", [3.0, 5.0, REFERENCE_DEMAND_KM, 50.0, 218.671, 700.0])
def test_inverse_round_trip(demand_km):
    for score in (100, 349, 544, 600, 800, 950, 1000):
        target = target_time_seconds(demand_km, score, curve=SMOOTHED_UPPER_CURVE)
        recovered = score_for_time(demand_km, target, curve=SMOOTHED_UPPER_CURVE)["otri_score"]
        assert recovered == pytest.approx(score, abs=1)


@pytest.mark.parametrize("demand_km", [5.0, REFERENCE_DEMAND_KM, 218.671])
def test_monotonic_in_finish_time(demand_km):
    times = [1800, 3600, 7200, 18000, 36000, 65789, 100000, 250000]
    raws = [score_for_time(demand_km, t, curve=SMOOTHED_UPPER_CURVE)["otri_raw"] for t in times]
    assert raws == sorted(raws, reverse=True)


def test_world_bests_still_sit_at_the_top():
    for demand_km, seconds in ((5.0, 755.36), (42.195, 7235.0), (100.0, 21935.0), (160.934, 39099.0), (319.614, 86400.0)):
        assert score_for_time(demand_km, seconds, curve=SMOOTHED_UPPER_CURVE)["otri_score"] >= 940


# ---------------------------------------------------------------------------- real course pins


@needs_real_courses
def test_mid_pack_lift_on_the_reference_race_is_halved_and_the_back_is_untouched():
    """V0.4 -> V0.5 lifted CM6's 2:40 finisher by 63 points and its winner by 50 — the middle got
    more than the top. V0.6 must bring the 2:40 lift down without touching anyone at or below 544."""
    points = _points(CM6)
    def s(curve, seconds):
        return estimate_score(seconds, gpx_points=points, curve=curve).predicted_score
    winner, two_forty, three_thirty, last = 2 * 3600 + 20 * 60 + 30, 2 * 3600 + 40 * 60, 3 * 3600 + 30 * 60, 6 * 3600 + 29 * 60 + 58
    assert s(TERRAIN_ADJUSTED_CURVE, two_forty) == 676 and s(SMOOTHED_UPPER_CURVE, two_forty) == 646
    assert s(TERRAIN_ADJUSTED_CURVE, winner) == 737 and s(SMOOTHED_UPPER_CURVE, winner) == 707
    assert s(SMOOTHED_UPPER_CURVE, three_thirty) == s(TERRAIN_ADJUSTED_CURVE, three_thirty) == 537
    assert s(SMOOTHED_UPPER_CURVE, last) == s(TERRAIN_ADJUSTED_CURVE, last) == 371


@needs_real_courses
def test_mountain_ultra_winner_stays_near_the_top():
    assert estimate_score(REFERENCE_WIN_SECONDS, gpx_points=_points(REFERENCE_100MI), curve=SMOOTHED_UPPER_CURVE).predicted_score == 966


@needs_real_courses
def test_road_runners_in_the_former_kink_band_come_down_and_the_rest_do_not():
    """Documented side effect: the shape is universal, so road runners who sat in the inflated
    544-692 band drop too, while road scores at or below 544 are unchanged."""
    points = _points(ROAD_HALF)
    def s(curve, seconds):
        return estimate_score(seconds, gpx_points=points, curve=curve).predicted_score
    assert s(TERRAIN_ADJUSTED_CURVE, 105 * 60) == 700 and s(SMOOTHED_UPPER_CURVE, 105 * 60) == 667
    assert s(SMOOTHED_UPPER_CURVE, 165 * 60) == s(TERRAIN_ADJUSTED_CURVE, 165 * 60) == 496


@needs_real_courses
def test_v05_remains_reproducible():
    assert estimate_score(REFERENCE_WIN_SECONDS, gpx_points=_points(REFERENCE_100MI), curve=TERRAIN_ADJUSTED_CURVE).predicted_score == 970
