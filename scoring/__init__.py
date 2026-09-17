"""OTRI scoring engine — pluggable, versioned scoring models.

The current default is Course Standard V0.4
(`0.4.0-course-standard-endurance-referenced`, no competitor dependency).
Older scoring curves remain selectable for historical reproducibility.
"""

from .course_standard import (
    CALIBRATED_CURVE,
    DEM_GATED_CURVE,
    DURATION_SCALED_CURVE,
    ENDURANCE_REFERENCE,
    ENDURANCE_REFERENCED_CURVE,
    MEASURED_CURVE,
    OFFICIAL_CURVE,
    POWER_CURVE,
    SMOOTHED_UPPER_CURVE,
    SPEC_CURVE,
    TERRAIN_ADJUSTED_CURVE,
    EnduranceReference,
    RiegelScaling,
    ScoreCurve,
)
from .course_standard import score_race_course_standard, score_for_time, target_time_seconds
from .estimator import DISCLAIMER, EstimateBreakdown, ScoreEstimate, estimate_score
from .terrain import TERRAIN_MODEL, TerrainModel
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import RunnerScore, ScoreBreakdown, equivalent_distance_km, score_race_field_relative
from .registry import (
    COURSE_STANDARD_CALIBRATED_VERSION,
    COURSE_STANDARD_SPEC_VERSION,
    COURSE_STANDARD_VERSION,
    DURATION_SCALED_VERSION,
    ENDURANCE_REFERENCED_VERSION,
    TERRAIN_ADJUSTED_VERSION,
    SMOOTHED_UPPER_VERSION,
    DEM_GATED_VERSION,
    POWER_VERSION,
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
    "TERRAIN_ADJUSTED_VERSION",
    "TERRAIN_ADJUSTED_CURVE",
    "SMOOTHED_UPPER_VERSION",
    "SMOOTHED_UPPER_CURVE",
    "DEM_GATED_VERSION",
    "DEM_GATED_CURVE",
    "POWER_VERSION",
    "POWER_CURVE",
    "TERRAIN_MODEL",
    "TerrainModel",
    "EnduranceReference",
    "RiegelScaling",
    "MEASURED_CURVE",
    "FIELD_RELATIVE_VERSION",
    "DEFAULT_SCORING_VERSION",
    "ScoringModelInfo",
    "available_scoring_models",
    "get_scoring_model_info",
    "ScoreEstimate",
    "EstimateBreakdown",
    "estimate_score",
    "DISCLAIMER",
]
