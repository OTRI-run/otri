"""Course Standard scoring models — course + finish time only, no competitors.

The current default (``0.3.0-course-standard-curved``) implements the V0.3
specification: a 50 m GPX course-demand integral followed by a smooth,
progressively harder score curve.

The score remains a pure function of the course and the runner's own finish
time. No other runner's result is read by this module.

Older logarithmic curves remain selectable for reproducibility of historical
scores. They are not the current default.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import equivalent_flat_distance_from_totals, equivalent_flat_distance_km
from .model import RunnerScore, ScoreBreakdown

SCALE_MIN = 0.0
SCALE_MAX = 1000.0


@dataclass(frozen=True)
class ScoreCurve:
    """Immutable score-curve definition.

    Legacy curves use ``q_500``/``q_1000`` with a logarithmic mapping.
    V0.3 curved scoring uses ``a``/``b``/``c`` for:

        Q(S) = exp(a + b*S + c*S^2)
    """

    version: str
    q_500: float
    q_1000: float
    a: float | None = None
    b: float | None = None
    c: float | None = None

    @property
    def is_curved(self) -> bool:
        return self.a is not None and self.b is not None and self.c is not None

    @property
    def k(self) -> float:
        """Legacy logarithmic slope constant.

        Retained for backwards compatibility with the older curve tests/API.
        It is not used by the V0.3 curved curve.
        """
        return 500.0 / math.log(self.q_1000 / self.q_500)

    def required_q(self, score: float) -> float:
        """Return the performance rate required for an exact continuous score."""
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")

        if self.is_curved:
            return math.exp(self.a + self.b * score + self.c * score * score)  # type: ignore[operator]

        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        """Invert the curve and return an unclipped continuous score."""
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")

        if not self.is_curved:
            return 500.0 + self.k * math.log(q / self.q_500)

        # ln(q) = a + b*S + c*S^2
        discriminant = self.b * self.b - 4.0 * self.c * (self.a - math.log(q))  # type: ignore[operator]
        if discriminant < 0:
            raise ValueError("performance rate is outside the score-model domain")
        return (-self.b + math.sqrt(discriminant)) / (2.0 * self.c)  # type: ignore[operator]


# Retained historical/spec curve: the original literal 15 -> 22.5 anchors.
SPEC_CURVE = ScoreCurve(
    version="1.0.0-course-standard",
    q_500=15.0,
    q_1000=22.5,
)

# Retained historical calibration used before the curved scale was adopted.
CALIBRATED_CURVE = ScoreCurve(
    version="1.1.0-course-standard",
    q_500=3.5,
    q_1000=10.5,
)

# Current V0.3 curve.
# Anchors:
#   score 200  -> Q 11.0
#   score 500  -> Q 15.0
#   score 1000 -> Q 30.0
#
# The exponential-quadratic form is smooth, monotonic and progressively
# steeper toward the top of the scale. These constants are the published V0.3
# scale definition, not a population fit.
CURVED_CURVE = ScoreCurve(
    version="0.3.0-course-standard-curved",
    q_500=15.0,
    q_1000=30.0,
    a=2.2351808956091976,
    b=0.0007254607359190918,
    c=0.0000004405557501338660,
)

SCORING_VERSION = CURVED_CURVE.version


def _curve_for_version(version: str) -> ScoreCurve:
    if version == SPEC_CURVE.version:
        return SPEC_CURVE
    if version == CALIBRATED_CURVE.version:
        return CALIBRATED_CURVE
    if version == CURVED_CURVE.version:
        return CURVED_CURVE
    raise ValueError(f"unknown course-standard curve version {version!r}")


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    """Q = course demand (km) / finish time (hours)."""
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    time_hours = finish_time_seconds / 3600.0
    return equivalent_km / time_hours


def score_for_time(
    equivalent_km: float,
    finish_time_seconds: float,
    curve: ScoreCurve = CURVED_CURVE,
) -> dict:
    """Return the public OTRI score plus unclipped raw score and Q."""
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.raw_score(q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(
    equivalent_km: float,
    score: float,
    curve: ScoreCurve = CURVED_CURVE,
) -> float:
    """Return the finish time that produces exactly `score` before integer rounding."""
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    q = curve.required_q(score)
    time_hours = equivalent_km / q
    return time_hours * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    """Course-demand confidence is higher when a real GPX is available."""
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = CURVED_CURVE,
) -> list[RunnerScore]:
    """Score every finisher using only the course and that finisher's own time.

    Adding or removing other finishers cannot change a runner's score.
    """
    finishers = [
        result
        for result in results
        if result.is_finisher and result.finish_time_seconds is not None
    ]
    if not finishers:
        return []

    if gpx_points is not None:
        equivalent_km = equivalent_flat_distance_km(gpx_points)
    else:
        equivalent_km = equivalent_flat_distance_from_totals(
            race.distance_km,
            race.elevation_gain_m,
        )

    confidence = _confidence_for_course(gpx_points is not None)
    ordered = sorted(
        finishers,
        key=lambda result: (
            result.finish_time_seconds,
            result.bib_number or "",
            result.family_name,
            result.first_name,
        ),
    )

    scores = []
    for result in ordered:
        computed = score_for_time(
            equivalent_km,
            result.finish_time_seconds,
            curve=curve,
        )
        breakdown = ScoreBreakdown(
            otri_score=computed["otri_score"],
            base_performance=round(computed["otri_raw"], 2),
            course_adjustment=0.0,
            field_adjustment=0.0,
            environmental_factor=0.0,
            confidence=confidence,
            scoring_version=curve.version,
            performance_rate=round(computed["performance_rate"], 3),
        )
        scores.append(
            RunnerScore(
                rank=result.rank,
                bib_number=result.bib_number,
                family_name=result.family_name,
                first_name=result.first_name,
                score=breakdown,
            )
        )
    return scores


def score_race_course_standard_spec(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
) -> list[RunnerScore]:
    """Historical literal spec curve for reproducibility."""
    return score_race_course_standard(
        race,
        results,
        gpx_points=gpx_points,
        curve=SPEC_CURVE,
    )
