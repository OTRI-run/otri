"""Unit tests for the Course Standard scoring models.

Run with: pytest tests/unit
"""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    CALIBRATED_CURVE,
    CURVED_CURVE,
    SCALE_MAX,
    SPEC_CURVE,
    performance_rate,
    score_for_time,
    score_race_course_standard,
    target_time_seconds,
)


def _race(distance_km=10.0, elevation_gain_m=0.0) -> RaceRecord:
    return RaceRecord(
        race_id="R1",
        race_name="Test Race",
        event_date=date(2026, 1, 1),
        course_name="Test Course",
        distance_km=distance_km,
        elevation_gain_m=elevation_gain_m,
    )


def _finisher(bib: str, finish_time_seconds: int) -> ResultRecord:
    return ResultRecord(
        rank=1,
        bib_number=bib,
        family_name="Runner",
        first_name=bib,
        gender="M",
        finish_time_seconds=finish_time_seconds,
    )


def test_k_constant_matches_spec_for_legacy_log_curves():
    import math

    for curve in [SPEC_CURVE, CALIBRATED_CURVE]:
        assert curve.k == pytest.approx(500.0 / math.log(curve.q_1000 / curve.q_500))


def test_curved_curve_is_the_default():
    assert score_for_time(10.0, 3600)["otri_score"] == score_for_time(
        10.0, 3600, curve=CURVED_CURVE
    )["otri_score"]


def test_performance_rate_is_demand_km_per_hour():
    # 10 equivalent km in 2 hours (7200s) = 5.0 demand-km/hour.
    assert performance_rate(10.0, 7200) == pytest.approx(5.0)


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE])
def test_legacy_anchor_q_500_scores_500(curve):
    seconds = 10.0 / curve.q_500 * 3600
    result = score_for_time(10.0, seconds, curve=curve)
    assert result["otri_score"] == 500


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE])
def test_legacy_anchor_q_1000_scores_1000(curve):
    seconds = 10.0 / curve.q_1000 * 3600
    result = score_for_time(10.0, seconds, curve=curve)
    assert result["otri_score"] == 1000


def test_curved_v03_anchor_q_values():
    for score, expected_q in [(200, 11.0), (500, 15.0), (1000, 30.0)]:
        q = CURVED_CURVE.required_q(score)
        assert q == pytest.approx(expected_q, rel=1e-12, abs=1e-12)


def test_curved_v03_has_increasing_q_requirements():
    scores = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    qs = [CURVED_CURVE.required_q(score) for score in scores]
    assert qs == sorted(qs)

    # The high end must become progressively more demanding.
    lower_half_gain = CURVED_CURVE.required_q(500) - CURVED_CURVE.required_q(200)
    upper_half_gain = CURVED_CURVE.required_q(1000) - CURVED_CURVE.required_q(500)
    assert upper_half_gain > lower_half_gain


def test_curved_v03_score_from_anchor_rates():
    # Use a 10 km course so Q maps directly to a simple finish time.
    for score, q in [(200, 11.0), (500, 15.0), (1000, 30.0)]:
        seconds = 10.0 / q * 3600.0
        result = score_for_time(10.0, seconds, curve=CURVED_CURVE)
        assert result["otri_score"] == score


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE])
def test_clipping_above_1000(curve):
    result = score_for_time(10.0, 10, curve=curve)
    assert result["otri_score"] == 1000
    assert result["otri_raw"] > 1000


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE])
def test_clipping_below_zero(curve):
    result = score_for_time(10.0, 1_000_000, curve=curve)
    assert result["otri_score"] == 0
    assert result["otri_raw"] < 0


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE])
def test_score_is_monotonic_in_finish_time(curve):
    times = [1000, 1600, 2000, 2400, 3000, 3600, 5000, 10000, 20000]
    scores = [score_for_time(10.0, t, curve=curve)["otri_score"] for t in times]
    assert scores == sorted(scores, reverse=True)


def test_calibrated_curve_gives_realistic_multi_hour_finishes_nonzero_scores():
    """Historical test for the pre-curved calibration retained for reproducibility."""
    demand_km = 17.481
    five_hour_score = score_for_time(
        demand_km, 5 * 3600, curve=CALIBRATED_CURVE
    )["otri_score"]
    assert five_hour_score > 0
    assert five_hour_score == pytest.approx(500, abs=5)

    assert score_for_time(
        demand_km, 5 * 3600, curve=SPEC_CURVE
    )["otri_score"] == 0


def test_score_race_does_not_depend_on_other_finishers():
    race = _race(distance_km=10.0)
    solo = score_race_course_standard(race, [_finisher("1", 3600)])[0].score.otri_score

    with_field = score_race_course_standard(
        race,
        [
            _finisher("1", 3600),
            _finisher("2", 1800),
            _finisher("3", 7200),
        ],
    )
    runner_one_score = next(
        score for score in with_field if score.bib_number == "1"
    ).score.otri_score

    assert solo == runner_one_score


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE])
def test_target_time_seconds_is_inverse_of_score_for_time(curve):
    for score in [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]:
        target = target_time_seconds(10.0, score, curve=curve)
        recovered = score_for_time(10.0, target, curve=curve)["otri_score"]
        assert recovered == pytest.approx(score, abs=1)


def test_target_time_rejects_out_of_range_score():
    with pytest.raises(ValueError):
        target_time_seconds(10.0, -1)
    with pytest.raises(ValueError):
        target_time_seconds(10.0, SCALE_MAX + 1)


def test_score_for_time_rejects_non_positive_inputs():
    with pytest.raises(ValueError):
        score_for_time(10.0, 0)
    with pytest.raises(ValueError):
        score_for_time(0.0, 3600)
    with pytest.raises(ValueError):
        score_for_time(-1.0, 3600)


def test_no_finishers_returns_empty_list():
    race = _race()
    dnf = ResultRecord(
        rank="DNF",
        bib_number="1",
        family_name="A",
        first_name="B",
        gender="M",
        finish_time_seconds=None,
    )
    assert score_race_course_standard(race, [dnf]) == []


def test_confidence_is_low_without_gpx_and_medium_with_gpx():
    race = _race(distance_km=10.0)
    without_gpx = score_race_course_standard(race, [_finisher("1", 3600)])
    assert without_gpx[0].score.confidence == "Low"

    from course.gpx import TrackPoint

    points = [
        TrackPoint(lat=0.0, lon=0.0, elevation_m=0.0, time=None),
        TrackPoint(lat=0.01, lon=0.0, elevation_m=0.0, time=None),
    ]
    with_gpx = score_race_course_standard(
        race,
        [_finisher("1", 3600)],
        gpx_points=points,
    )
    assert with_gpx[0].score.confidence == "Medium"


def test_scoring_version_is_stamped_on_every_score():
    race = _race()
    scores = score_race_course_standard(race, [_finisher("1", 3600)])
    assert scores[0].score.scoring_version == CURVED_CURVE.version


def test_scoring_version_reflects_chosen_curve():
    race = _race()
    scores = score_race_course_standard(
        race,
        [_finisher("1", 3600)],
        curve=SPEC_CURVE,
    )
    assert scores[0].score.scoring_version == SPEC_CURVE.version
