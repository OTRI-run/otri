"""Course Standard scoring models — course + finish time only, no competitors.

Current candidate V0.4 keeps the 50 m GPX course-demand integral and uses a
simple shifted quadratic score curve. The shape is intentionally closer to
familiar trail-score behaviour: usable middle scores, increasingly demanding
upper scores, and no field-relative adjustment.
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
    """Immutable score-curve definition."""

    version: str
    q_500: float
    q_1000: float
    a: float | None = None
    b: float | None = None
    c: float | None = None
    curve_type: str = "logarithmic"

    @property
    def is_curved(self) -> bool:
        return self.curve_type != "logarithmic"

    @property
    def k(self) -> float:
        return 500.0 / math.log(self.q_1000 / self.q_500)

    def required_q(self, score: float) -> float:
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
        if self.curve_type == "quadratic_shifted_power":
            q0 = self.a  # type: ignore[assignment]
            amplitude = self.b  # type: ignore[assignment]
            exponent = self.c  # type: ignore[assignment]
            return q0 + amplitude * (score / 500.0) ** exponent
        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        if self.curve_type == "quadratic_shifted_power":
            q0 = self.a  # type: ignore[assignment]
            amplitude = self.b  # type: ignore[assignment]
            exponent = self.c  # type: ignore[assignment]
            normalized = (q - q0) / amplitude
            if normalized <= 0:
                return SCALE_MIN - 1.0
            return 500.0 * normalized ** (1.0 / exponent)
        return 500.0 + self.k * math.log(q / self.q_500)


SPEC_CURVE = ScoreCurve(version="1.0.0-course-standard", q_500=15.0, q_1000=22.5)
CALIBRATED_CURVE = ScoreCurve(version="1.1.0-course-standard", q_500=3.5, q_1000=10.5)

# V0.3 retained for historical reproducibility.
CURVED_CURVE = ScoreCurve(
    version="0.3.0-course-standard-curved",
    q_500=15.0,
    q_1000=30.0,
    a=2.2351808956091976,
    b=0.0007254607359190918,
    c=0.0000004405557501338660,
    curve_type="exponential_quadratic",
)

# V0.4 candidate calibrated against real trail-score behaviour while keeping
# the OTRI principle that scores remain course + own finish time only.
#
# Q(S) = 5.0 + 3.2 * (S / 500)^2
#
# Reference points:
#   0    -> 5.00
#   200  -> 5.512
#   500  -> 8.20
#   1000 -> 18.20
#
# This deliberately makes the upper half progressively harder while leaving
# realistic multi-hour trail performances well inside the scoring range.
V04_CURVE = ScoreCurve(
    version="0.4.0-course-standard-curved",
    q_500=8.2,
    q_1000=18.2,
    a=5.0,
    b=3.2,
    c=2.0,
    curve_type="quadratic_shifted_power",
)

SCORING_VERSION = V04_CURVE.version


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    return equivalent_km / (finish_time_seconds / 3600.0)


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = V04_CURVE) -> dict:
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.raw_score(q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = V04_CURVE) -> float:
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    q = curve.required_q(score)
    return equivalent_km / q * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = V04_CURVE,
) -> list[RunnerScore]:
    finishers = [
        result for result in results
        if result.is_finisher and result.finish_time_seconds is not None
    ]
    if not finishers:
        return []

    if gpx_points is not None:
        equivalent_km = equivalent_flat_distance_km(gpx_points)
    else:
        equivalent_km = equivalent_flat_distance_from_totals(race.distance_km, race.elevation_gain_m)

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
        computed = score_for_time(equivalent_km, result.finish_time_seconds, curve=curve)
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
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
