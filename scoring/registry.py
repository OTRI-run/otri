"""Pluggable scoring-model registry.

OTRI supports multiple versioned scoring models so historical scores remain
reproducible. The current default is Course Standard V0.4
(`0.4.0-course-standard-endurance-referenced`): the measured course-demand
pipeline plus an endurance-referenced score curve, so a score means the same
thing on a short race and on a multi-hour mountain ultra
(`docs/methodology/OTRI-MODEL-0.1.0.md`).
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_standard import (
    CALIBRATED_CURVE,
    DEM_GATED_CURVE,
    DURATION_SCALED_CURVE,
    ENDURANCE_REFERENCED_CURVE,
    MEASURED_CURVE,
    OFFICIAL_CURVE,
    POWER_CURVE,
    SMOOTHED_UPPER_CURVE,
    SPEC_CURVE,
    TERRAIN_ADJUSTED_CURVE,
)
from .course_standard import score_race_course_standard
from .model import RunnerScore
from .model import SCORING_VERSION as FIELD_RELATIVE_VERSION
from .model import score_race_field_relative

COURSE_STANDARD_VERSION = OFFICIAL_CURVE.version
COURSE_STANDARD_CALIBRATED_VERSION = CALIBRATED_CURVE.version
COURSE_STANDARD_SPEC_VERSION = SPEC_CURVE.version
DURATION_SCALED_VERSION = DURATION_SCALED_CURVE.version
ENDURANCE_REFERENCED_VERSION = ENDURANCE_REFERENCED_CURVE.version
TERRAIN_ADJUSTED_VERSION = TERRAIN_ADJUSTED_CURVE.version
SMOOTHED_UPPER_VERSION = SMOOTHED_UPPER_CURVE.version
DEM_GATED_VERSION = DEM_GATED_CURVE.version
POWER_VERSION = POWER_CURVE.version
DEFAULT_SCORING_VERSION = POWER_CURVE.version


@dataclass(frozen=True)
class ScoringModelInfo:
    version: str
    name: str
    description: str
    uses_competitors: bool


_MODEL_INFO: dict[str, ScoringModelInfo] = {
    POWER_VERSION: ScoringModelInfo(
        version=POWER_VERSION,
        name='Course Standard V0.8 (power curve)',
        description=(
            "V0.7's measurement, terrain adjustment, endurance reference and confidence gating, with "
            'the score curve reduced to one power law: score = 1000 x (fraction of the human-ceiling '
            'rate) ** 0.85. Retires the last V0.1 demo anchors; the top of the scale is unchanged and '
            'everything below it is lower, more so further down '
            '(docs/methodology/OTRI-MODEL-0.1.0.md: this build is OTRI model 0.1.0).'
        ),
        uses_competitors=False,
    ),
    DEM_GATED_VERSION: ScoringModelInfo(
        version=DEM_GATED_VERSION,
        name='Course Standard V0.7 (DEM-gated measurement)',
        description=(
            "V0.6's curve, scored from course-measurement-v2: elevation from a pinned terrain "
            'dataset when one is configured, and a median-point-spacing gate so tracks too sparse '
            'to measure the route are marked for review instead of scored short. Reports its own '
            'confidence - High only with DEM elevation on a dense track, Low with the reason '
            '(docs/methodology/OTRI-MODEL-0.1.0.md section 7).'
        ),
        uses_competitors=False,
    ),
    SMOOTHED_UPPER_VERSION: ScoringModelInfo(
        version=SMOOTHED_UPPER_VERSION,
        name='Course Standard V0.6 (smoothed upper curve)',
        description=(
            "V0.5's terrain-adjusted demand and endurance-referenced curve, with V0.1's 692 demo "
            'anchor dropped so one power law runs from the 544 anchor to the world-best 1000 '
            'anchor. Removes a kink that amplified every course-level correction in the 550-700 '
            'band; scores at or below 544 are unchanged '
            '(docs/methodology/OTRI-MODEL-0.1.0.md section 14).'
        ),
        uses_competitors=False,
    ),
    TERRAIN_ADJUSTED_VERSION: ScoringModelInfo(
        version=TERRAIN_ADJUSTED_VERSION,
        name='Course Standard V0.5 (terrain-adjusted)',
        description=(
            "V0.4's endurance-referenced curve, with course demand additionally adjusted for "
            'what the gradient-cost integral does not price: sustained steep mountain terrain '
            'and altitude, both measured from the course GPX. Road courses are unaffected '
            '(factor exactly 1.0); steep high-mountain courses are scored materially harder '
            '(docs/methodology/OTRI-MODEL-0.1.0.md section 4).'
        ),
        uses_competitors=False,
    ),
    ENDURANCE_REFERENCED_VERSION: ScoringModelInfo(
        version=ENDURANCE_REFERENCED_VERSION,
        name='Course Standard V0.4 (endurance-referenced)',
        description=(
            'Same V0.2 measured course-demand engine and V0.1 score anchors, with the score '
            'curve referenced to the human performance ceiling for a course of this size. A '
            'score therefore measures how close a runner came to the best performance possible '
            'on a course that big, so short and long races are scored on the same scale and '
            '1000 means world-best at every distance '
            '(docs/methodology/OTRI-MODEL-0.1.0.md section 5).'
        ),
        uses_competitors=False,
    ),
    DURATION_SCALED_VERSION: ScoringModelInfo(
        version=DURATION_SCALED_VERSION,
        name='Course Standard V0.3 (duration-scaled, provisional)',
        description=(
            'Superseded by V0.4. Same V0.1 course-demand engine and anchor table, plus a '
            'duration/course-demand scaling correction (Riegel exponent b=1.06). b=1.06 was '
            'derived from road racing under 4 hours and under-corrects badly beyond it, and '
            "V0.1's invented 1000-anchor still saturates on short courses "
            '(docs/methodology/OTRI-MODEL-0.1.0.md section 14). '
            'Retained so V0.3 scores stay reproducible.'
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
            "(docs/methodology/OTRI-MODEL-0.1.0.md section 14). No competitors are used."
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
    if model_version == POWER_VERSION:
        return score_race_course_standard(
            race, results, gpx_points=gpx_points, curve=POWER_CURVE, measurement=measurement
        )
    if model_version == DEM_GATED_VERSION:
        return score_race_course_standard(
            race, results, gpx_points=gpx_points, curve=DEM_GATED_CURVE, measurement=measurement
        )
    if model_version == SMOOTHED_UPPER_VERSION:
        return score_race_course_standard(
            race, results, gpx_points=gpx_points, curve=SMOOTHED_UPPER_CURVE, measurement=measurement
        )
    if model_version == TERRAIN_ADJUSTED_VERSION:
        return score_race_course_standard(
            race, results, gpx_points=gpx_points, curve=TERRAIN_ADJUSTED_CURVE, measurement=measurement
        )
    if model_version == ENDURANCE_REFERENCED_VERSION:
        return score_race_course_standard(
            race, results, gpx_points=gpx_points, curve=ENDURANCE_REFERENCED_CURVE, measurement=measurement
        )
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

