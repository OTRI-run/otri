"""Unit tests for the illustrative GPX -> score estimator.

Run with: pytest tests/unit
"""

from scoring import REFERENCE_PACE_S_PER_KM, estimate_illustrative_score


def test_matching_reference_pace_scores_1000():
    finish_time_seconds = round(REFERENCE_PACE_S_PER_KM * 10)  # 10 km flat course
    estimate = estimate_illustrative_score(distance_km=10, elevation_gain_m=0, finish_time_seconds=finish_time_seconds)

    assert estimate.equivalent_distance_km == 10.0
    assert estimate.illustrative_score == 1000


def test_double_reference_time_scores_half():
    finish_time_seconds = round(REFERENCE_PACE_S_PER_KM * 10 * 2)
    estimate = estimate_illustrative_score(distance_km=10, elevation_gain_m=0, finish_time_seconds=finish_time_seconds)

    assert estimate.illustrative_score == 500


def test_rejects_non_positive_time():
    try:
        estimate_illustrative_score(distance_km=10, elevation_gain_m=0, finish_time_seconds=0)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_custom_winner_time_matches_your_own_time_scores_1000():
    estimate = estimate_illustrative_score(
        distance_km=10, elevation_gain_m=0, finish_time_seconds=3600, winner_finish_time_seconds=3600
    )
    assert estimate.illustrative_score == 1000
    assert estimate.winner_finish_time_seconds == 3600


def test_custom_winner_time_overrides_reference_pace():
    default_estimate = estimate_illustrative_score(distance_km=10, elevation_gain_m=0, finish_time_seconds=3600)
    custom_estimate = estimate_illustrative_score(
        distance_km=10, elevation_gain_m=0, finish_time_seconds=3600, winner_finish_time_seconds=3000
    )
    assert custom_estimate.winner_finish_time_seconds == 3000
    assert custom_estimate.illustrative_score != default_estimate.illustrative_score


def test_estimate_matches_real_score_race_formula_when_winner_assumption_holds():
    """The whole point of the adjustable winner time: if it matches the real eventual
    winner, the illustrative estimate equals what score_race() computes for real."""
    from ingestion.records import RaceRecord, ResultRecord
    from scoring import score_race
    from datetime import date

    race = RaceRecord(
        race_id="R1",
        race_name="Test Race",
        event_date=date(2026, 1, 1),
        course_name="Test Course",
        distance_km=10,
        elevation_gain_m=0,
    )
    winner_time = 3000
    your_time = 3600
    results = [
        ResultRecord(rank=1, bib_number="1", family_name="Winner", first_name="A", gender="M", finish_time_seconds=winner_time),
        ResultRecord(rank=2, bib_number="2", family_name="You", first_name="B", gender="M", finish_time_seconds=your_time),
    ]
    real_scores = {score.bib_number: score.score.otri_score for score in score_race(race, results)}

    estimate = estimate_illustrative_score(
        distance_km=10, elevation_gain_m=0, finish_time_seconds=your_time, winner_finish_time_seconds=winner_time
    )
    assert estimate.illustrative_score == real_scores["2"]


def test_rejects_non_positive_winner_time():
    try:
        estimate_illustrative_score(distance_km=10, elevation_gain_m=0, finish_time_seconds=3600, winner_finish_time_seconds=0)
        assert False, "expected ValueError"
    except ValueError:
        pass
