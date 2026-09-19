"""The scoring registry: one model, named on every score, and nothing else accepted."""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring import DEFAULT_SCORING_VERSION, MODEL_CURVE, available_scoring_models, get_scoring_model_info, score_race

RETIRED = ["0.8.0-course-standard-power", "0.1.0-course-standard-calibrated", "1.0.0-course-standard", "0.1.0-field-relative", "not-a-real-version"]


def _race() -> RaceRecord:
    return RaceRecord(race_id="R1", race_name="Test Race", event_date=date(2026, 1, 1), course_name="Test Course", distance_km=10.0, elevation_gain_m=0.0)


def _finisher(bib: str, finish_time_seconds: int) -> ResultRecord:
    return ResultRecord(rank=1, bib_number=bib, family_name="Runner", first_name=bib, gender="M", finish_time_seconds=finish_time_seconds)


def test_there_is_one_model_and_it_uses_no_competitors():
    models = available_scoring_models()
    assert [model.version for model in models] == [DEFAULT_SCORING_VERSION] == [MODEL_CURVE.version]
    assert models[0].uses_competitors is False and models[0].name == "OTRI model 0.1.0"
    assert get_scoring_model_info(DEFAULT_SCORING_VERSION) is models[0]


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
