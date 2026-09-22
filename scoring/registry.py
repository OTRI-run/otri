"""The scoring model a race is scored with.

There is one model in the code (`scoring/course_standard.py`). Every score names its
`scoring_version`, so a future model can sit beside this one without old scores changing; until
then the registry has a single entry, and a race stored under a retired development build is moved
to it by `api/db.py`'s migration.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import MODEL_CURVE, score_race_course_standard
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
        name='OTRI model 0.1.0',
        description=(
            "A runner's fraction of the human-ceiling rate for a course of this size, on one power law "
            '(score = 1000 x fraction ** 0.85). Course demand is measured from the GPX (gradient cost, '
            'sustained steep ground, altitude); the score depends only on the course and the runner\'s own '
            'time. Confidence is High only with terrain-verified elevation on a reproducible track and '
            'inside the model\'s evidenced range, and uphill-only courses are listed without a score '
            '(docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md).'
        ),
        uses_competitors=False,
    ),
}


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
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=MODEL_CURVE, measurement=measurement)
