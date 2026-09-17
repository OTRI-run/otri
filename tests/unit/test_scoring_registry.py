"""Unit tests for the pluggable scoring-model registry.

Run with: pytest tests/unit
"""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring import (
    COURSE_STANDARD_CALIBRATED_VERSION,
    COURSE_STANDARD_SPEC_VERSION,
    COURSE_STANDARD_VERSION,
    DURATION_SCALED_VERSION,
    ENDURANCE_REFERENCED_VERSION,
    TERRAIN_ADJUSTED_VERSION,
    FIELD_RELATIVE_VERSION,
)
from scoring.course_standard import MEASURED_CURVE
from scoring.registry import DEFAULT_SCORING_VERSION
from scoring.registry import available_scoring_models, get_scoring_model_info, score_race


def _race() -> RaceRecord:
    return RaceRecord(
        race_id="R1",
        race_name="Test Race",
        event_date=date(2026, 1, 1),
        course_name="Test Course",
        distance_km=10.0,
        elevation_gain_m=0.0,
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


def test_available_scoring_models_includes_all_models():
    versions = {model.version for model in available_scoring_models()}
    assert versions == {
        DEFAULT_SCORING_VERSION,
        TERRAIN_ADJUSTED_VERSION,
        ENDURANCE_REFERENCED_VERSION,
        DURATION_SCALED_VERSION,
        MEASURED_CURVE.version,
        COURSE_STANDARD_VERSION,
        COURSE_STANDARD_CALIBRATED_VERSION,
        COURSE_STANDARD_SPEC_VERSION,
        FIELD_RELATIVE_VERSION,
    }


def test_course_standard_is_flagged_as_not_using_competitors():
    info = get_scoring_model_info(COURSE_STANDARD_VERSION)
    assert info.uses_competitors is False


def test_field_relative_is_flagged_as_using_competitors():
    info = get_scoring_model_info(FIELD_RELATIVE_VERSION)
    assert info.uses_competitors is True


def test_get_scoring_model_info_rejects_unknown_version():
    with pytest.raises(ValueError):
        get_scoring_model_info("not-a-real-version")


def test_score_race_dispatches_to_current_curved_course_standard():
    scores = score_race(
        _race(),
        [_finisher("1", 3600)],
        model_version=COURSE_STANDARD_VERSION,
    )
    assert scores[0].score.scoring_version == COURSE_STANDARD_VERSION


def test_score_race_dispatches_to_course_standard_spec_curve():
    scores = score_race(
        _race(),
        [_finisher("1", 3600)],
        model_version=COURSE_STANDARD_SPEC_VERSION,
    )
    assert scores[0].score.scoring_version == COURSE_STANDARD_SPEC_VERSION


def test_score_race_dispatches_to_course_standard_calibrated_curve():
    scores = score_race(_race(), [_finisher("1", 3600)], model_version=COURSE_STANDARD_CALIBRATED_VERSION)
    assert scores[0].score.scoring_version == COURSE_STANDARD_CALIBRATED_VERSION


def test_score_race_dispatches_to_field_relative():
    scores = score_race(
        _race(),
        [_finisher("1", 3600)],
        model_version=FIELD_RELATIVE_VERSION,
    )
    assert scores[0].score.scoring_version == FIELD_RELATIVE_VERSION
    assert scores[0].score.otri_score == 1000  # only finisher = the field's winner


def test_score_race_defaults_to_current_curved_course_standard():
    scores = score_race(_race(), [_finisher("1", 3600)])
    assert scores[0].score.scoring_version == DEFAULT_SCORING_VERSION


def test_score_race_rejects_unknown_model_version():
    with pytest.raises(ValueError):
        score_race(_race(), [_finisher("1", 3600)], model_version="not-a-real-version")
