"""OTRI scoring engine: OTRI model 0.1.0 (`scoring.course_standard`), the single-time estimator
built on it, and the runner index. Every score names its `scoring_version`."""

from .course_standard import (
    ENDURANCE_REFERENCE,
    MODEL_CURVE,
    EnduranceReference,
    ScoreCurve,
    score_for_time,
    score_race_course_standard,
    target_time_seconds,
)
from .estimator import DISCLAIMER, EstimateBreakdown, ScoreEstimate, estimate_score
from .model import RunnerScore, ScoreBreakdown
from .registry import (
    DEFAULT_SCORING_VERSION,
    ScoringModelInfo,
    available_scoring_models,
    get_scoring_model_info,
    score_race,
)
from .terrain import TERRAIN_MODEL, TerrainModel

SCORING_VERSION = DEFAULT_SCORING_VERSION

__all__ = [
    "SCORING_VERSION",
    "DEFAULT_SCORING_VERSION",
    "MODEL_CURVE",
    "ENDURANCE_REFERENCE",
    "TERRAIN_MODEL",
    "RunnerScore",
    "ScoreBreakdown",
    "ScoreCurve",
    "EnduranceReference",
    "TerrainModel",
    "ScoringModelInfo",
    "ScoreEstimate",
    "EstimateBreakdown",
    "DISCLAIMER",
    "score_race",
    "score_race_course_standard",
    "score_for_time",
    "target_time_seconds",
    "estimate_score",
    "available_scoring_models",
    "get_scoring_model_info",
]
