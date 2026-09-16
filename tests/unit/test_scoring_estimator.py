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
