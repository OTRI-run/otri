"""OTRI scoring engine — pluggable, versioned scoring models.

The current default is Course Standard V0.4
(`0.4.0-course-standard-endurance-referenced`, no competitor dependency).
Older scoring curves remain selectable for historical reproducibility.
"""

from .course_standard import (
    CALIBRATED_CURVE,
    DURATION_SCALED_CURVE,
    ENDURANCE_REFERENCE,
    ENDURANCE_REFERENCED_CURVE,
    MEASURED_CURVE,
    OFFICIAL_CURVE,
    SPEC_CURVE,
    EnduranceReference,
    RiegelScaling,
    ScoreCurve,
)
from .course_standard import score_race_course_standard, score_for_time, target_time_seconds
from .estimator import DISCLAIMER, ScoreEstimate, estimate_score
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import RunnerScore, ScoreBreakdown, equivalent_distance_km, score_race_field_relative
from .registry import (
    COURSE_STANDARD_CALIBRATED_VERSION,
    COURSE_STANDARD_SPEC_VERSION,
    COURSE_STANDARD_VERSION,
    DURATION_SCALED_VERSION,
    ENDURANCE_REFERENCED_VERSION,
    DEFAULT_SCORING_VERSION,
    ScoringModelInfo,
    available_scoring_models,
    get_scoring_model_info,
    score_race,
)

SCORING_VERSION = DEFAULT_SCORING_VERSION

__all__ = [
    "SCORING_VERSION",
    "RunnerScore",
    "ScoreBreakdown",
    "equivalent_distance_km",
    "score_race",
    "score_race_course_standard",
    "score_race_field_relative",
    "score_for_time",
    "target_time_seconds",
    "ScoreCurve",
    "CALIBRATED_CURVE",
    "SPEC_CURVE",
    "OFFICIAL_CURVE",
    "COURSE_STANDARD_VERSION",
    "COURSE_STANDARD_CALIBRATED_VERSION",
    "COURSE_STANDARD_SPEC_VERSION",
    "DURATION_SCALED_VERSION",
    "DURATION_SCALED_CURVE",
    "ENDURANCE_REFERENCED_VERSION",
    "ENDURANCE_REFERENCED_CURVE",
    "ENDURANCE_REFERENCE",
    "EnduranceReference",
    "RiegelScaling",
    "MEASURED_CURVE",
    "FIELD_RELATIVE_VERSION",
    "DEFAULT_SCORING_VERSION",
    "ScoringModelInfo",
    "available_scoring_models",
    "get_scoring_model_info",
    "ScoreEstimate",
    "estimate_score",
    "DISCLAIMER",
]
