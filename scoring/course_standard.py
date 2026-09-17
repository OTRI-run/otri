"""Course Standard scoring models — course + finish time only, no competitors.

The official model (`OFFICIAL_CURVE`, `0.1.0-course-standard-calibrated`)
implements `docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md` exactly:
the 50 m GPX course-demand integral plus its piecewise power-law score-to-Q
curve, calibrated from demo/test race anchors. The score remains
course + own finish time only. Legacy logarithmic curves (`SPEC_CURVE`,
`CALIBRATED_CURVE`) remain selectable for historical reproducibility.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import compute_course_demand, equivalent_flat_distance_from_totals
from .model import RunnerScore, ScoreBreakdown

SCALE_MIN = 0.0
SCALE_MAX = 1000.0


@dataclass(frozen=True)
class ScoreCurve:
    """Immutable score-curve definition."""

    version: str
    q_500: float
    q_1000: float
    curve_type: str = "logarithmic"
    anchor_scores: tuple[float, ...] = ()
    anchor_qs: tuple[float, ...] = ()

    @property
    def is_curved(self) -> bool:
        return self.curve_type != "logarithmic"

    @property
    def k(self) -> float:
        return 500.0 / math.log(self.q_1000 / self.q_500)

    def _piecewise_required_q(self, score: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if score == 0.0:
            return qs[0]
        if score <= scores[1]:
            p = math.log(qs[1] / qs[0]) / math.log(scores[1])
            return qs[0] * score**p
        for i in range(1, len(scores) - 1):
            s1, s2 = scores[i], scores[i + 1]
            q1, q2 = qs[i], qs[i + 1]
            if score <= s2:
                p = math.log(q2 / q1) / math.log(s2 / s1)
                return q1 * (score / s1) ** p
        raise AssertionError("unreachable")

    def _piecewise_raw_score(self, q: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if q <= qs[0]:
            return SCALE_MIN
        if q < qs[1]:
            p = math.log(qs[1] / qs[0]) / math.log(scores[1])
            return q ** (1.0 / p)
        for i in range(1, len(qs) - 1):
            q1, q2 = qs[i], qs[i + 1]
            s1, s2 = scores[i], scores[i + 1]
            if q <= q2:
                p = math.log(q2 / q1) / math.log(s2 / s1)
                return s1 * (q / q1) ** (1.0 / p)
        s1, s2 = scores[-2:]
        q1, q2 = qs[-2:]
        p = math.log(q2 / q1) / math.log(s2 / s1)
        return s1 * (q / q1) ** (1.0 / p)

    def required_q(self, score: float) -> float:
        """`Q(S)` — the performance rate required to reach `score` (spec section 13)."""
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
        if self.curve_type == "piecewise_power":
            return self._piecewise_required_q(score)
        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        """Inverse of `required_q` — the (unclipped) score for performance rate `q` (spec section 14)."""
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        if self.curve_type == "piecewise_power":
            return self._piecewise_raw_score(q)
        return 500.0 + self.k * math.log(q / self.q_500)


SPEC_CURVE = ScoreCurve(version="1.0.0-course-standard", q_500=15.0, q_1000=22.5)
CALIBRATED_CURVE = ScoreCurve(version="1.1.0-course-standard", q_500=3.5, q_1000=10.5)

# Official V0.1 model — docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md section 13.
# Piecewise power law through demo/test race reference anchors:
#   6:29:58 -> 349, 3:05:04 -> 544, 2:20:30 -> 692 (course demand ~27.560 demand-km).
# The final segment continues the same exponent up to Q~17.94 at score 1000.
OFFICIAL_CURVE = ScoreCurve(
    version="0.1.0-course-standard-calibrated",
    q_500=7.755256,
    q_1000=17.93986234619293,
    curve_type="piecewise_power",
    anchor_scores=(0.0, 349.0, 544.0, 692.0, 1000.0),
    anchor_qs=(1.0, 4.240362424138815, 8.935158501440922, 11.769395017793594, 17.93986234619293),
)

SCORING_VERSION = OFFICIAL_CURVE.version
MEASURED_CURVE = replace(OFFICIAL_CURVE, version='0.2.0-course-standard-measured')


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
    measurement=None,
) -> list[RunnerScore]:
    finishers = [
        result for result in results
        if result.is_finisher and result.finish_time_seconds is not None
    ]
    if not finishers:
        return []

    if gpx_points is not None:
        if curve.version == MEASURED_CURVE.version:
            from .measured_demand import compute_measured_demand
            demand = compute_measured_demand(gpx_points, measurement=measurement)
        else:
            demand = compute_course_demand(gpx_points)
        equivalent_km = demand.course_demand_km
        quality_flags = demand.quality_flags
    else:
        equivalent_km = equivalent_flat_distance_from_totals(race.distance_km, race.elevation_gain_m)
        quality_flags = ()

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
            quality_flags=quality_flags,
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
