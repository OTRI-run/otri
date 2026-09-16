"""Pluggable scoring-model registry.

OTRI supports multiple versioned scoring models so historical scores remain
reproducible. The current default is the deterministic Course Standard V0.4
candidate: 50 m GPX course demand plus a shifted quadratic score curve.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import CALIBRATED_CURVE, CURVED_CURVE, SPEC_CURVE, V04_CURVE
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = V04_CURVE.version
COURSE_STANDARD_V03_VERSION = CURVED_CURVE.version
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
        name="Course Standard V0.4 Curved",
        description=(
            "Score depends only on the course (50 m Minetti gradient-cost course demand) and "
            "the runner's own finish time. The V0.4 candidate uses Q(S)=5.0+3.2*(S/500)^2: "
            "200≈5.51, 500=8.20, 1000=18.20 demand-km/h. The upper scale becomes progressively "
            "harder to reach while realistic multi-hour trail performances remain within the scale."
        ),
        uses_competitors=False,
    ),
    COURSE_STANDARD_V03_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_V03_VERSION,
        name="Course Standard V0.3 Curved (legacy)",
        description="Historical V0.3 exponential-quadratic curve retained for reproducibility.",
        uses_competitors=False,
    ),
    COURSE_STANDARD_LEGACY_CALIBRATED_VERSION: ScoringModelInfo(
        version=COURSE_STANDARD_LEGACY_CALIBRATED_VERSION,
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
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=V04_CURVE)
    if model_version == COURSE_STANDARD_V03_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=CURVED_CURVE)
    if model_version == COURSE_STANDARD_LEGACY_CALIBRATED_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=CALIBRATED_CURVE)
    if model_version == COURSE_STANDARD_SPEC_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
    if model_version == FIELD_RELATIVE_VERSION:
        return score_race_field_relative(race, results)
    raise ValueError(f"unknown scoring model version {model_version!r}")
