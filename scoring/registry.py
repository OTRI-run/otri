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

from .course_standard import CALIBRATED_CURVE, OFFICIAL_CURVE, SPEC_CURVE, MEASURED_CURVE, DURATION_SCALED_CURVE
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = OFFICIAL_CURVE.version
COURSE_STANDARD_CALIBRATED_VERSION = CALIBRATED_CURVE.version
COURSE_STANDARD_SPEC_VERSION = SPEC_CURVE.version
DURATION_SCALED_VERSION = DURATION_SCALED_CURVE.version
DEFAULT_SCORING_VERSION = DURATION_SCALED_CURVE.version


@dataclass(frozen=True)
class ScoringModelInfo:
    version: str
    name: str
    description: str
    uses_competitors: bool


_MODEL_INFO: dict[str, ScoringModelInfo] = {
    DURATION_SCALED_VERSION: ScoringModelInfo(
        version=DURATION_SCALED_VERSION,
        name='Course Standard V0.3 (duration-scaled, provisional)',
        description=(
            'Same V0.1 course-demand engine and anchor table, plus a duration/course-demand '
            'scaling correction (Riegel exponent b=1.06) so extreme ultra-distance courses do not '
            "saturate at the top of the scale (see docs/methodology/v0.3/OTRI-DURATION-SCALED-CURVE.md). "
            'Provisional: calibrated from one real ultra-distance validation point.'
        ),
        uses_competitors=False,
    ),
    MEASURED_CURVE.version: ScoringModelInfo(
        version=MEASURED_CURVE.version,
        name='Course Standard V0.2 (measured)',
        description='Shared WGS84 distance and denoised elevation profile. Measurement remains provisional without field validation. Uses the V0.1 score curve.',
        uses_competitors=False,
    ),
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
    measurement=None,
) -> list[RunnerScore]:
    """Score a race with the selected model version."""
    if model_version == DURATION_SCALED_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=DURATION_SCALED_CURVE, measurement=measurement)
    if model_version == MEASURED_CURVE.version:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=MEASURED_CURVE, measurement=measurement)
    if model_version == COURSE_STANDARD_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=OFFICIAL_CURVE)
    if model_version == COURSE_STANDARD_CALIBRATED_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=CALIBRATED_CURVE)
    if model_version == COURSE_STANDARD_SPEC_VERSION:
        return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
    if model_version == FIELD_RELATIVE_VERSION:
        return score_race_field_relative(race, results)
    raise ValueError(f"unknown scoring model version {model_version!r}")

