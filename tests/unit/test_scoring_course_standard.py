"""Unit tests for the Course Standard scoring models."""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    CALIBRATED_CURVE,
    CURVED_CURVE,
    SCALE_MAX,
    SPEC_CURVE,
    V04_CURVE,
    performance_rate,
    score_for_time,
    score_race_course_standard,
    target_time_seconds,
)


def _race(distance_km=10.0, elevation_gain_m=0.0) -> RaceRecord:
    return RaceRecord(
        race_id="R1", race_name="Test Race", event_date=date(2026, 1, 1),
        course_name="Test Course", distance_km=distance_km, elevation_gain_m=elevation_gain_m,
    )


def _finisher(bib: str, finish_time_seconds: int) -> ResultRecord:
    return ResultRecord(
        rank=1, bib_number=bib, family_name="Runner", first_name=bib,
        gender="M", finish_time_seconds=finish_time_seconds,
    )


def test_k_constant_matches_spec_for_legacy_log_curves():
    import math
    for curve in [SPEC_CURVE, CALIBRATED_CURVE]:
        assert curve.k == pytest.approx(500.0 / math.log(curve.q_1000 / curve.q_500))


def test_v04_curve_is_the_default():
    assert score_for_time(10.0, 3600)["otri_score"] == score_for_time(
        10.0, 3600, curve=V04_CURVE
    )["otri_score"]


def test_performance_rate_is_demand_km_per_hour():
    assert performance_rate(10.0, 7200) == pytest.approx(5.0)


@pytest.mark.parametrize("score, expected_q", [
    (0, 5.0), (200, 5.512), (500, 8.2), (1000, 18.2)
])
def test_v04_required_q_anchors(score, expected_q):
    assert V04_CURVE.required_q(score) == pytest.approx(expected_q, rel=1e-12, abs=1e-12)


def test_v04_curve_has_progressively_larger_q_increments():
    scores = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    qs = [V04_CURVE.required_q(s) for s in scores]
    increments = [b-a for a,b in zip(qs, qs[1:])]
    assert qs == sorted(qs)
    assert increments == sorted(increments)


def test_v04_actual_cm6_reference_is_near_544():
    # Current CM6 GPX processing produced ~27.56 demand-km.
    # 03:05:04 gives Q ~8.935, which should land close to the reference score 544.
    result = score_for_time(27.560, 3*3600 + 5*60 + 4, curve=V04_CURVE)
    assert result["otri_score"] == pytest.approx(554, abs=15)


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE, V04_CURVE])
def test_clipping_above_1000(curve):
    result = score_for_time(10.0, 10, curve=curve)
    assert result["otri_score"] == 1000
    assert result["otri_raw"] > 1000


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE, V04_CURVE])
def test_score_is_monotonic_in_finish_time(curve):
    times = [1000, 1600, 2000, 2400, 3000, 3600, 5000, 10000, 20000]
    scores = [score_for_time(10.0, t, curve=curve)["otri_score"] for t in times]
    assert scores == sorted(scores, reverse=True)


def test_score_race_does_not_depend_on_other_finishers():
    race = _race(distance_km=10.0)
    solo = score_race_course_standard(race, [_finisher("1", 3600)])[0].score.otri_score
    with_field = score_race_course_standard(
        race,
        [_finisher("1", 3600), _finisher("2", 1800), _finisher("3", 7200)],
    )
    runner_one_score = next(x for x in with_field if x.bib_number == "1").score.otri_score
    assert solo == runner_one_score


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, CURVED_CURVE, V04_CURVE])
def test_target_time_inverse(curve):
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


def test_confidence_is_low_without_gpx_and_medium_with_gpx():
    race = _race(distance_km=10.0)
    assert score_race_course_standard(race, [_finisher("1", 3600)])[0].score.confidence == "Low"
    from course.gpx import TrackPoint
    points = [TrackPoint(lat=0.0, lon=0.0, elevation_m=0.0, time=None), TrackPoint(lat=0.01, lon=0.0, elevation_m=0.0, time=None)]
    assert score_race_course_standard(race, [_finisher("1", 3600)], gpx_points=points)[0].score.confidence == "Medium"


def test_scoring_version_is_v04():
    scores = score_race_course_standard(_race(), [_finisher("1", 3600)])
    assert scores[0].score.scoring_version == V04_CURVE.version


def test_scoring_version_reflects_chosen_curve():
    scores = score_race_course_standard(_race(), [_finisher("1", 3600)], curve=SPEC_CURVE)
    assert scores[0].score.scoring_version == SPEC_CURVE.version
