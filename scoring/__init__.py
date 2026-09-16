"""OTRI baseline scoring engine (v0.1) — intentionally simple, versioned, and explainable.

See ``scoring/README.md`` for what this model does and does not do yet.
"""

from .model import SCORING_VERSION, RunnerScore, ScoreBreakdown, equivalent_distance_km, score_race

__all__ = [
    "SCORING_VERSION",
    "RunnerScore",
    "ScoreBreakdown",
    "equivalent_distance_km",
    "score_race",
]
