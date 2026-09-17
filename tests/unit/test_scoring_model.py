"""Unit tests proving the legacy field-relative scoring model is deterministic and auditable.

This model is no longer the default (see scoring.registry / scoring.course_standard)
but stays selectable and must keep behaving exactly as before.

Run with: pytest tests/unit
"""

from pathlib import Path

from ingestion import race_records, result_records
from scoring.model import SCORING_VERSION, score_race_field_relative as score_race

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_RACES = REPO_ROOT / "data" / "demo" / "races.csv"
DEMO_RESULTS = REPO_ROOT / "data" / "demo" / "results"
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "scoring"


def _demo_race(race_id: str):
    return next(race for race in race_records(DEMO_RACES) if race.race_id == race_id)


def test_two_runner_fixture_produces_hand_verified_scores():
    """10 km / 0 m course: pace ratio math is exact, so the expected output can be hand-checked."""
    race = race_records(FIXTURES / "two-runner-race.csv")[0]
    results = result_records(FIXTURES / "two-runner-result.csv")

    scores = [score.to_dict() for score in score_race(race, results)]

    assert scores == [
        {
            "rank": 1,
            "bib_number": "1",
            "family_name": "Fast",
            "first_name": "Runner",
            "otri_score": 1000,
            "base_performance": 1000.0,
            "course_adjustment": 0.0,
            "field_adjustment": 0.0,
            "environmental_factor": 0.0,
            "confidence": "Low",
            "scoring_version": SCORING_VERSION,
            "performance_rate": 0.0,
            "quality_flags": [],
        },
        {
            "rank": 2,
            "bib_number": "2",
            "family_name": "Slow",
            "first_name": "Runner",
            "otri_score": 500,
            "base_performance": 500.0,
            "course_adjustment": 0.0,
            "field_adjustment": 0.0,
            "environmental_factor": 0.0,
            "confidence": "Low",
            "scoring_version": SCORING_VERSION,
            "performance_rate": 0.0,
            "quality_flags": [],
        },
    ]


def test_winner_always_scores_scale_max_on_demo_data():
    race = _demo_race("OTRI-DEMO-001")
    results = result_records(DEMO_RESULTS / "OTRI-DEMO-001.csv")

    scores = score_race(race, results)

    assert scores[0].score.otri_score == 1000
    assert scores[0].score.confidence == "Medium"  # 12 finishers: >=5 and <20
    assert len(scores) == 12  # no DNF/DNS/DSQ rows in this file


def test_non_finishers_are_excluded_from_scoring():
    race = _demo_race("OTRI-DEMO-003")
    results = result_records(DEMO_RESULTS / "OTRI-DEMO-003.csv")

    scores = score_race(race, results)

    assert len(scores) == 11  # one DNF row excluded out of 12
    assert scores[0].score.otri_score == 1000


def test_scoring_is_deterministic_across_runs():
    race = _demo_race("OTRI-DEMO-002")
    results = result_records(DEMO_RESULTS / "OTRI-DEMO-002.csv")

    first = [score.to_dict() for score in score_race(race, results)]
    second = [score.to_dict() for score in score_race(race, results)]

    assert first == second
