"""OTRI scoring engine — pluggable, versioned scoring models.

More than one scoring algorithm is available at once (see ``scoring.registry``
and ``docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md``). ``score_race()``
here is the selectable entry point, defaulting to the Course Standard model
(no competitor dependency) — see ``scoring/README.md``.
"""

from .course_standard import SCORING_VERSION as COURSE_STANDARD_VERSION
from .course_standard import score_race_course_standard, score_for_time, target_time_seconds
from .estimator import DISCLAIMER, ScoreEstimate, estimate_score
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import RunnerScore, ScoreBreakdown, equivalent_distance_km, score_race_field_relative
from .registry import (
    DEFAULT_SCORING_VERSION,
    ScoringModelInfo,
    available_scoring_models,
    get_scoring_model_info,
    score_race,
)

# The currently-recommended default model's version — kept as a top-level
# alias since most callers only care about "the current default," not the
# full registry.
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
    "COURSE_STANDARD_VERSION",
    "FIELD_RELATIVE_VERSION",
    "DEFAULT_SCORING_VERSION",
    "ScoringModelInfo",
    "available_scoring_models",
    "get_scoring_model_info",
    "ScoreEstimate",
    "estimate_score",
    "DISCLAIMER",
]
