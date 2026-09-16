"""Course Standard scoring models — course + finish time only, no competitors.

The official model (`OFFICIAL_CURVE`, `2.0.0-course-standard`) implements
`docs/methodology/OTRI-SCORE-SCALE-FINAL-V0.md` exactly: the 50 m GPX
course-demand integral plus its curved `exp(A + B*S + C*S^2)` score-to-Q
curve. The score remains course + own finish time only. Legacy logarithmic
curves (`SPEC_CURVE`, `CALIBRATED_CURVE`) remain selectable for historical
reproducibility.
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
        """`Q(S)` — the performance rate required to reach `score` (doc section 6/8)."""
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
        if self.curve_type == "exponential_quadratic":
            return math.exp(self.a + self.b * score + self.c * score * score)  # type: ignore[operator]
        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        """Inverse of `required_q` — the (unclipped) score for performance rate `q`."""
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        if self.curve_type == "exponential_quadratic":
            discriminant = self.b**2 - 4.0 * self.c * (self.a - math.log(q))  # type: ignore[operator]
            if discriminant < 0:
                raise ValueError("performance rate outside model domain")
            return (-self.b + math.sqrt(discriminant)) / (2.0 * self.c)  # type: ignore[operator]
        return 500.0 + self.k * math.log(q / self.q_500)


SPEC_CURVE = ScoreCurve(version="1.0.0-course-standard", q_500=15.0, q_1000=22.5)
CALIBRATED_CURVE = ScoreCurve(version="1.1.0-course-standard", q_500=3.5, q_1000=10.5)

# Official model — docs/methodology/OTRI-SCORE-SCALE-FINAL-V0.md section 6/20.
# Anchored at OTRI 200/500/1000 -> Q 11.0/15.0/30.0 demand-km/h.
OFFICIAL_CURVE = ScoreCurve(
    version="2.0.0-course-standard",
    q_500=15.0,
    q_1000=30.0,
    a=2.2351808956091976,
    b=0.0007254607359190918,
    c=0.0000004405557501338660,
    curve_type="exponential_quadratic",
)

SCORING_VERSION = OFFICIAL_CURVE.version


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    return equivalent_km / (finish_time_seconds / 3600.0)


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = OFFICIAL_CURVE) -> dict:
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.raw_score(q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = OFFICIAL_CURVE) -> float:
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    q = curve.required_q(score)
    if q <= 0:
        return math.inf
    return equivalent_km / q * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = OFFICIAL_CURVE,
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
    """The spec's original (v0.2.0) literal Q_500=15.0/Q_1000=22.5 anchors — see module
docstring."""
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
