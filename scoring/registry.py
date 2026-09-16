"""Pluggable scoring-model registry.

OTRI supports more than one scoring algorithm at once so historical scores
remain reproducible. The current default is the deterministic Course Standard
V0.3 curved model; the older logarithmic curves remain selectable for
backwards compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import CALIBRATED_CURVE, CURVED_CURVE, SPEC_CURVE
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = CURVED_CURVE.version
COURSE_STANDARD_SPEC_VERSION = SPEC_CURVE.version
COURSE_STANDARD_LEGACY_CALIBRATED_VERSION = CALIBRATED_CURVE.version

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
        name="Course Standard V0.3 Curved",
        description=(
            "Score depends only on the course (50 m Minetti gradient-cost course demand) and "
            "your own finish time — never on who else ran the race. The curved scale anchors "
            "200 at 11.0 demand-km/h, 500 at 15.0, and 1000 at 30.0, making the upper score "
            "range progressively harder to reach."
        ),
        uses_competitors=False,
    ),
    COURSE_STANDARD_LEGACY_CALIBRATED_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_LEGACY_CALIBRATED_VERSION,
        name="Course Standard (legacy logarithmic calibrated)",
        description=(
            "Historical Course Standard logarithmic scale with anchors 500 at 3.5 demand-km/h "
            "and 1000 at 10.5 demand-km/h. Kept selectable for reproducibility; not the current default."
        ),
        uses_competitors=False,
    ),
    COURSE_STANDARD_SPEC_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_SPEC_VERSION,
        name="Course Standard (legacy spec-literal logarithmic)",
        description=(
            "Historical logarithmic model using the original literal reference points 500 at "
            "15.0 demand-km/h and 1000 at 22.5 demand-km/h. Kept selectable for reproducibility."
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
    """Score a race with the selected model version."""
    if model_version == COURSE_STANDARD_VERSION:
        return score_race_course_standard(
            race,
            results,
            gpx_points=gpx_points,
            curve=CURVED_CURVE,
        )
    if model_version == COURSE_STANDARD_LEGACY_CALIBRATED_VERSION:
        return score_race_course_standard(
            race,
            results,
            gpx_points=gpx_points,
            curve=CALIBRATED_CURVE,
        )
    if model_version == COURSE_STANDARD_SPEC_VERSION:
        return score_race_course_standard(
            race,
            results,
            gpx_points=gpx_points,
            curve=SPEC_CURVE,
        )
    if model_version == FIELD_RELATIVE_VERSION:
        return score_race_field_relative(race, results)
    raise ValueError(f"unknown scoring model version {model_version!r}")
