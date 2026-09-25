"""The scoring model a race is scored with.

Two models are in the code (`scoring/course_standard.py`): OTRI model 0.1.1, the default for every
new race and estimate, and 0.1.0, which differs in the curve exponent alone and stays so that a race
published under it keeps the scores it was published with. Every score names its `scoring_version`.
A race stored under a retired development build was moved to the model by `api/migrations.py`;
unpublished races moved from 0.1.0 to 0.1.1 the same way (OEP-004).
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import MODEL_0_1_0_CURVE, MODEL_CURVE, ScoreCurve, score_race_course_standard
from .model import RunnerScore

DEFAULT_SCORING_VERSION = MODEL_CURVE.version


@dataclass(frozen=True)
class ScoringModelInfo:
    version: str
    name: str
    description: str
    uses_competitors: bool


_MODEL_INFO: dict[str, ScoringModelInfo] = {
    DEFAULT_SCORING_VERSION: ScoringModelInfo(
        version=DEFAULT_SCORING_VERSION,
        name='OTRI model 0.1.1',
        description=(
            "A runner's fraction of the human-ceiling rate for a course of this size, on one power law "
            '(score = 1000 x fraction ** 0.692). Course demand is measured from the GPX (gradient cost, '
            'sustained steep ground, altitude); the score depends only on the course and the runner\'s own '
            'time. Confidence is High only with terrain-verified elevation on a reproducible track and '
            'inside the model\'s evidenced range. The same model as 0.1.0 but for the exponent '
            '(docs/methodology/0.1.1/OTRI-MODEL-0.1.1.md, OEP-004).'
        ),
        uses_competitors=False,
    ),
    MODEL_0_1_0_CURVE.version: ScoringModelInfo(
        version=MODEL_0_1_0_CURVE.version,
        name='OTRI model 0.1.0',
        description=(
            'The model before 0.1.1: the same course demand, terrain factor and ceiling, with the curve '
            'exponent 0.85 (score = 1000 x fraction ** 0.85). Not used for new races; kept so that a race '
            'published under it keeps its scores and they can be reproduced '
            '(docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md).'
        ),
        uses_competitors=False,
    ),
}

_CURVES: dict[str, ScoreCurve] = {MODEL_CURVE.version: MODEL_CURVE, MODEL_0_1_0_CURVE.version: MODEL_0_1_0_CURVE}


def available_scoring_models() -> list[ScoringModelInfo]:
    return list(_MODEL_INFO.values())


class UnknownScoringModel(ValueError):
    """A race is stored under a model this build no longer carries.

    A ValueError still, so every caller that already handles one keeps working; named so that a
    reader of a published race can tell this apart from a file it cannot score and answer with the
    times instead of failing the page.
    """


def get_scoring_model_info(model_version: str) -> ScoringModelInfo:
    try:
        return _MODEL_INFO[model_version]
    except KeyError:
        raise UnknownScoringModel(f"unknown scoring model version {model_version!r}") from None


def score_race(
    race: RaceRecord,
    results: list[ResultRecord],
    *,
    model_version: str = DEFAULT_SCORING_VERSION,
    gpx_points: list[TrackPoint] | None = None,
    measurement=None,
) -> list[RunnerScore]:
    """Score a race with the selected model version."""
    get_scoring_model_info(model_version)
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=_CURVES[model_version], measurement=measurement)
