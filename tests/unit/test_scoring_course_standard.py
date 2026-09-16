"""Unit tests for the sealed, no-competitor Course Standard scoring model.

Run with: pytest tests/unit
"""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    SCORING_VERSION,
    _score_from_speed_kmh,
    score_race_course_standard,
    speed_kmh_for_score,
    target_time_seconds,
)
from scoring.model import SCALE_MAX


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


def test_score_never_reaches_scale_max_even_at_absurd_speed():
    for speed_kmh in [10, 100, 1_000, 1_000_000, 10**12]:
        assert _score_from_speed_kmh(speed_kmh) < SCALE_MAX


def test_score_race_never_returns_scale_max_even_for_a_one_second_finish():
    race = _race(distance_km=10.0)
    # 10 km in 1 second: physically impossible, but must still be sealed below SCALE_MAX.
    results = [_finisher("1", 1)]
    scores = score_race_course_standard(race, results)
    assert scores[0].score.otri_score < SCALE_MAX
    assert scores[0].score.base_performance < SCALE_MAX


def test_score_is_zero_at_zero_speed():
    assert _score_from_speed_kmh(0) == 0.0
    assert _score_from_speed_kmh(-5) == 0.0


def test_score_is_monotonic_in_speed():
    speeds = [1, 5, 10, 15, 20, 30, 50]
    scores = [_score_from_speed_kmh(speed) for speed in speeds]
    assert scores == sorted(scores)


def test_faster_finish_time_never_scores_lower():
    race = _race(distance_km=10.0)
    fast = score_race_course_standard(race, [_finisher("1", 3000)])[0].score.otri_score
    slow = score_race_course_standard(race, [_finisher("1", 4000)])[0].score.otri_score
    assert fast > slow


def test_score_does_not_depend_on_other_finishers():
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


def test_speed_and_score_round_trip():
    for score in [1, 100, 500, 900, 950, 999]:
        speed = speed_kmh_for_score(score)
        recovered = _score_from_speed_kmh(speed)
        assert recovered == pytest.approx(score, abs=0.01)


def test_speed_for_score_rejects_scale_max_and_zero():
    with pytest.raises(ValueError):
        speed_kmh_for_score(SCALE_MAX)
    with pytest.raises(ValueError):
        speed_kmh_for_score(0)


def test_target_time_seconds_is_consistent_with_score_race():
    """Pre-race and post-race calculations use the same curve (research candidate 05, TSCI)."""
    race = _race(distance_km=10.0)
    target = target_time_seconds(equivalent_km=10.0, score=700)

    scores = score_race_course_standard(race, [_finisher("1", round(target))])
    assert scores[0].score.otri_score == pytest.approx(700, abs=1)


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
