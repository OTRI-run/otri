"""Course Standard scoring models — course + finish time only, no competitors.

Current candidate V0.5 keeps the 50 m GPX course-demand integral and uses a
transparent piecewise power score curve calibrated from real trail-score
anchors on the CM6 course. The score remains course + own finish time only.
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
    anchor_scores: tuple[float, ...] = ()
    anchor_qs: tuple[float, ...] = ()

    @property
    def is_curved(self) -> bool:
        return self.curve_type != "logarithmic"

    @property
    def k(self) -> float:
        return 500.0 / math.log(self.q_1000 / self.q_500)

    def _piecewise_power_q(self, score: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if not scores or not qs or len(scores) != len(qs) or len(scores) < 2:
            raise ValueError("piecewise_power curve requires matching score/Q anchors")
        if score == scores[0]:
            return qs[0]

        first_s, first_q = scores[1], qs[1]
        if score < first_s:
            exponent = math.log(first_q / qs[0]) / math.log(first_s)
            return qs[0] * score ** exponent

        for left_s, right_s, left_q, right_q in zip(scores[1:], scores[2:], qs[1:], qs[2:]):
            if score <= right_s:
                exponent = math.log(right_q / left_q) / math.log(right_s / left_s)
                return left_q * (score / left_s) ** exponent

        left_s, right_s = scores[-2:]
        left_q, right_q = qs[-2:]
        exponent = math.log(right_q / left_q) / math.log(right_s / left_s)
        return left_q * (score / left_s) ** exponent

    def _piecewise_power_score(self, q: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if not scores or not qs or len(scores) != len(qs) or len(scores) < 2:
            raise ValueError("piecewise_power curve requires matching score/Q anchors")
        if q <= qs[0]:
            return SCALE_MIN

        first_s, first_q = scores[1], qs[1]
        if q < first_q:
            exponent = math.log(first_q / qs[0]) / math.log(first_s)
            return q ** (1.0 / exponent)

        for left_s, right_s, left_q, right_q in zip(scores[1:], scores[2:], qs[1:], qs[2:]):
            if q <= right_q:
                exponent = math.log(right_q / left_q) / math.log(right_s / left_s)
                return left_s * (q / left_q) ** (1.0 / exponent)

        left_s, right_s = scores[-2:]
        left_q, right_q = qs[-2:]
        exponent = math.log(right_q / left_q) / math.log(right_s / left_s)
        return left_s * (q / left_q) ** (1.0 / exponent)

    def required_q(self, score: float) -> float:
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
        if self.curve_type == "piecewise_power":
            return self._piecewise_power_q(score)
        if self.curve_type == "quadratic_shifted_power":
            q0 = self.a  # type: ignore[assignment]
            amplitude = self.b  # type: ignore[assignment]
            exponent = self.c  # type: ignore[assignment]
            return q0 + amplitude * (score / 500.0) ** exponent
        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        if self.curve_type == "piecewise_power":
            return self._piecewise_power_score(q)
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

# V0.4 retained for historical reproducibility.
V04_CURVE = ScoreCurve(
    version="0.4.0-course-standard-curved",
    q_500=8.2,
    q_1000=18.2,
    a=5.0,
    b=3.2,
    c=2.0,
    curve_type="quadratic_shifted_power",
)

# V0.5 calibration uses real CM6 trail-score anchors supplied for the same
# course-demand calculation (~27.560 demand-km):
#   6:29:58 -> 349
#   3:05:04 -> 544
#   2:20:30 -> 692
#
# Each anchor is converted to the corresponding performance rate Q. Between
# anchors OTRI uses log-log (power-law) interpolation. Above 692, the final
# segment is extrapolated with the same power exponent; this gives Q~17.94 at
# 1000. Below the first anchor, Q values from 1.0 to 4.24 map continuously
# from score 0 to 349.
V05_CURVE = ScoreCurve(
    version="0.5.0-course-standard-calibrated",
    q_500=7.904,
    q_1000=17.940,
    curve_type="piecewise_power",
    anchor_scores=(0.0, 349.0, 544.0, 692.0, 1000.0),
    anchor_qs=(1.0, 4.240362424138815, 8.935158501440922, 11.769395017793594, 17.93986234619293),
)

SCORING_VERSION = V05_CURVE.version


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    return equivalent_km / (finish_time_seconds / 3600.0)


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = V05_CURVE) -> dict:
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.raw_score(q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = V05_CURVE) -> float:
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
    curve: ScoreCurve = V05_CURVE,
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
