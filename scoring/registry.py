"""Pluggable scoring-model registry.

OTRI intentionally supports more than one scoring algorithm at once instead
of forcing a single hard-coded formula — see ``docs/methodology/research-
candidates/`` for the research behind each one. Each race distance picks
which model scores its results (``Race.scoring_version`` in ``api/db.py``);
historical scores stay reproducible under whichever version was in effect
when they were computed (``METHODOLOGY.md`` §11 — a methodology change must
not silently rewrite history).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import CALIBRATED_CURVE, SPEC_CURVE
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = CALIBRATED_CURVE.version
COURSE_STANDARD_SPEC_VERSION = SPEC_CURVE.version

DEFAULT_SCORING_VERSION = COURSE_STANDARD_VERSION


@dataclass(frozen=True)
class ScoringModelInfo:
    version: str
    name: str
    description: str
    uses_competitors: bool


_MODEL_INFO: dict[str, ScoringModelInfo] = {
    COURSE_STANDARD_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_VERSION,
        name="Course Standard",
        description=(
            "Score depends only on the course (Minetti gradient-cost course demand) and your own "
            "finish time — never on who else ran the race. A logarithmic scale anchored at two "
            "reference points (500 at 3.5 demand-km/h, 1000 at 10.5 demand-km/h) chosen to spread "
            "realistic recreational-to-elite trail paces across 0-1000, clipped to that range."
        ),
        uses_competitors=False,
    ),
    COURSE_STANDARD_SPEC_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_SPEC_VERSION,
        name="Course Standard (spec-literal anchors)",
        description=(
            "Identical model to Course Standard, but using OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md's "
            "own literal reference points (500 at 15.0 demand-km/h, 1000 at 22.5 demand-km/h) — a "
            "punishingly fast absolute standard on real courses of any length. Kept selectable for "
            "spec fidelity and comparison, not recommended as a default."
        ),
        uses_competitors=False,
    ),
    FIELD_RELATIVE_VERSION: ScoringModelInfo(
        version=FIELD_RELATIVE_VERSION,
        name="Field Relative (legacy)",
        description=(
            "The fastest finisher in this specific race always scores exactly 1000; everyone else "
            "is scaled off that field's own winner. Kept selectable for backwards compatibility; "
            "the same finish time means a different score in a different race."
        ),
        uses_competitors=True,
    ),
}


def available_scoring_models() -> list[ScoringModelInfo]:
    return list(_MODEL_INFO.values())


def get_scoring_model_info(model_version: str) -> ScoringModelInfo:
    try:
        return _MODEL_INFO[model_version]
    except KeyError:
        raise ValueError(f"unknown scoring model version {model_version!r}") from None


def score_race(
    race: RaceRecord,
    results: list[ResultRecord],
    *,
    model_version: str = DEFAULT_SCORING_VERSION,
    gpx_points: list[TrackPoint] | None = None,
) -> list[RunnerScore]:
    """Score a race with whichever algorithm `model_version` selects.

    `gpx_points` is only used by models that support a real course-demand
    calculation (currently ``course_standard``) and is ignored otherwise.
    """
    if model_version == COURSE_STANDARD_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=CALIBRATED_CURVE)
    if model_version == COURSE_STANDARD_SPEC_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
    if model_version == FIELD_RELATIVE_VERSION:
        return score_race_field_relative(race, results)
    raise ValueError(f"unknown scoring model version {model_version!r}")
