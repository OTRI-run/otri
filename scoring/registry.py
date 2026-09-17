"""Pluggable scoring-model registry.

OTRI supports multiple versioned scoring models so historical scores remain
reproducible. The current default is the official Course Standard V0.1
model (`0.1.0-course-standard-calibrated`): 50 m GPX course demand plus the
piecewise power-law score curve from
`docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import CALIBRATED_CURVE, OFFICIAL_CURVE, SPEC_CURVE
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = OFFICIAL_CURVE.version
COURSE_STANDARD_CALIBRATED_VERSION = CALIBRATED_CURVE.version
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
        name="Course Standard V0.1 (official)",
        description=(
            "Score depends only on the course (50 m Minetti gradient-cost course demand) and "
            "the runner's own finish time. Uses a piecewise power-law score curve calibrated "
            "from demo/test race anchors: 6:29:58=349, 3:05:04=544, 2:20:30=692 "
            "(docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md). No competitors are used."
        ),
        uses_competitors=False,
    ),
    COURSE_STANDARD_CALIBRATED_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_CALIBRATED_VERSION,
        name="Course Standard (legacy logarithmic calibrated)",
        description="Historical logarithmic calibration retained for reproducibility.",
        uses_competitors=False,
    ),
    COURSE_STANDARD_SPEC_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_SPEC_VERSION,
        name="Course Standard (legacy spec-literal logarithmic)",
        description="Historical logarithmic specification anchors retained for reproducibility.",
        uses_competitors=False,
    ),
    FIELD_RELATIVE_VERSION: ScoringModelInfo(
        version=FIELD_RELATIVE_VERSION,
        name="Field Relative (legacy)",
        description=(
            "Legacy field-relative model. The fastest finisher in a race scores 1000 and other "
            "scores depend on that field. Retained only for backwards compatibility."
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
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=OFFICIAL_CURVE)
    if model_version == COURSE_STANDARD_CALIBRATED_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=CALIBRATED_CURVE)
    if model_version == COURSE_STANDARD_SPEC_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
    if model_version == FIELD_RELATIVE_VERSION:
        return score_race_field_relative(race, results)
    raise ValueError(f"unknown scoring model version {model_version!r}")

