"""Unit tests for the Course Standard scoring model (OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md).

Run with: pytest tests/unit
"""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    K,
    Q_500,
    Q_1000,
    SCALE_MAX,
    SCORING_VERSION,
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


def test_k_constant_matches_spec():
    import math

    assert K == pytest.approx(500.0 / math.log(Q_1000 / Q_500))


def test_performance_rate_is_demand_km_per_hour():
    # 10 equivalent km in 2 hours (7200s) = 5.0 demand-km/hour.
    assert performance_rate(10.0, 7200) == pytest.approx(5.0)


def test_anchor_q_500_scores_500():
    # T_hours = 10 / 15.0 = 0.6667h = 2400s.
    result = score_for_time(10.0, 2400)
    assert result["otri_score"] == 500


def test_anchor_q_1000_scores_1000():
    # T_hours = 10 / 22.5 = 0.4444h = 1600s.
    result = score_for_time(10.0, 1600)
    assert result["otri_score"] == 1000


def test_anchor_q_10_scores_0():
    # T_hours = 10 / 10.0 = 1h = 3600s.
    result = score_for_time(10.0, 3600)
    assert result["otri_score"] == 0


def test_clipping_above_q_1000_still_scores_exactly_1000():
    """Spec section 19: score = round(max(0, min(1000, otri_raw))) — clipped, not sealed.
    Unlike the retired asymptotic design, 1000 IS a reachable, legitimate score."""
    # An extremely fast time far beyond Q_1000.
    result = score_for_time(10.0, 100)
    assert result["otri_score"] == 1000
    assert result["otri_raw"] > 1000  # unclipped value retained for audit, per spec section 19


def test_clipping_below_zero_still_scores_exactly_0():
    result = score_for_time(10.0, 1_000_000)
    assert result["otri_score"] == 0
    assert result["otri_raw"] < 0


def test_score_is_monotonic_in_finish_time():
    times = [1000, 1600, 2000, 2400, 3000, 3600, 5000]
    scores = [score_for_time(10.0, t)["otri_score"] for t in times]
    assert scores == sorted(scores, reverse=True)


def test_score_race_does_not_depend_on_other_finishers():
    """The whole point of this model: a runner's score must not change depending on who
    else is in the results list — unlike the legacy field-relative model."""
    race = _race(distance_km=10.0)
    solo = score_race_course_standard(race, [_finisher("1", 3600)])[0].score.otri_score

    with_field = score_race_course_standard(
        race,
        [
            _finisher("1", 3600),
            _finisher("2", 1800),  # much faster
            _finisher("3", 7200),  # much slower
        ],
    )
    runner_one_score = next(score for score in with_field if score.bib_number == "1").score.otri_score

    assert solo == runner_one_score


def test_target_time_seconds_is_inverse_of_score_for_time():
    """Spec section 21's required pre/post inverse tests."""
    for score in [0, 250, 500, 750, 1000]:
        target = target_time_seconds(10.0, score)
        recovered = score_for_time(10.0, target)["otri_score"]
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
    dnf = ResultRecord(rank="DNF", bib_number="1", family_name="A", first_name="B", gender="M", finish_time_seconds=None)
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
    with_gpx = score_race_course_standard(race, [_finisher("1", 3600)], gpx_points=points)
    assert with_gpx[0].score.confidence == "Medium"


def test_scoring_version_is_stamped_on_every_score():
    race = _race()
    scores = score_race_course_standard(race, [_finisher("1", 3600)])
    assert scores[0].score.scoring_version == SCORING_VERSION
