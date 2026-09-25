"""The scoring registry: model 0.1.1 by default, 0.1.0 for the races published under it, every score named, nothing else accepted."""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring import DEFAULT_SCORING_VERSION, MODEL_0_1_0_CURVE, MODEL_CURVE, available_scoring_models, get_scoring_model_info, score_race

RETIRED = ["0.8.0-course-standard-power", "0.1.0-course-standard-calibrated", "1.0.0-course-standard", "0.1.0-field-relative", "not-a-real-version"]


def _race() -> RaceRecord:
    return RaceRecord(race_id="R1", race_name="Test Race", event_date=date(2026, 1, 1), course_name="Test Course", distance_km=10.0, elevation_gain_m=0.0)


def _finisher(bib: str, finish_time_seconds: int) -> ResultRecord:
    return ResultRecord(rank=1, bib_number=bib, family_name="Runner", first_name=bib, gender="M", finish_time_seconds=finish_time_seconds)


def test_two_models_the_default_first_and_neither_uses_competitors():
    models = available_scoring_models()
    assert [model.version for model in models] == [DEFAULT_SCORING_VERSION, MODEL_0_1_0_CURVE.version]
    assert DEFAULT_SCORING_VERSION == MODEL_CURVE.version == "0.11.0-course-standard-model-0.1.1"
    assert [model.name for model in models] == ["OTRI model 0.1.1", "OTRI model 0.1.0"]
    assert all(model.uses_competitors is False for model in models)
    assert get_scoring_model_info(DEFAULT_SCORING_VERSION) is models[0]


def test_a_race_under_0_1_0_is_scored_with_the_0_1_0_curve():
    """The one difference is the exponent: 0.85 for 0.1.0, 0.692 for 0.1.1. Same course, same time."""
    new = score_race(_race(), [_finisher("1", 3600)])[0].score
    old = score_race(_race(), [_finisher("1", 3600)], model_version=MODEL_0_1_0_CURVE.version)[0].score
    assert old.scoring_version == MODEL_0_1_0_CURVE.version and new.scoring_version == DEFAULT_SCORING_VERSION
    assert old.performance_rate == new.performance_rate
    assert new.base_performance == pytest.approx(1000 * (old.base_performance / 1000) ** (0.692 / 0.85), abs=0.02)
    assert new.otri_score > old.otri_score


def test_every_score_names_the_model_it_came_from():
    default = score_race(_race(), [_finisher("1", 3600)])
    named = score_race(_race(), [_finisher("1", 3600)], model_version=DEFAULT_SCORING_VERSION)
    assert default == named and default[0].score.scoring_version == DEFAULT_SCORING_VERSION


@pytest.mark.parametrize("version", RETIRED)
def test_retired_and_unknown_versions_are_refused_not_silently_rescored(version):
    with pytest.raises(ValueError):
        get_scoring_model_info(version)
    with pytest.raises(ValueError):
        score_race(_race(), [_finisher("1", 3600)], model_version=version)
