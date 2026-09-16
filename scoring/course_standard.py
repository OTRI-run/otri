"""Course Standard scoring models — course + finish time only, no competitors.

Combines the spec's course-demand engine (``scoring.course_demand``, the
Minetti gradient-cost integral) with a performance-rate-to-score
transformation (spec sections 16-20). A runner's score depends only on the
course and their own finish time — no other runner's result (the field's
winner, its size, or its strength) is read anywhere in this module. That is
the model's central principle (spec section 2's "explicit exclusions"), and
it is what the older ``scoring.model.score_race_field_relative`` could not
do.

Curve versions (spec section 32: score-curve constants are versioned;
historical scores must not silently change):

- ``2.0.0-course-standard`` (default): the spec's current published v0.3.0
  curve — a smooth exponential-quadratic ``Q(S) = exp(A + B*S + C*S^2)``
  anchored at score 200 -> Q=11.0, 500 -> Q=15.0, 1000 -> Q=30.0
  demand-km/h (spec sections 17-19, "OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md").
- ``1.1.0-course-standard``: an internal, pre-v0.3.0 recalibration
  (Q_500=3.5, Q_1000=10.5 demand-km/h) kept selectable only for continuity
  with any scores already stamped with this version — no longer the
  default now that the spec itself publishes anchors intended to spread
  realistic paces across the scale.
- ``1.0.0-course-standard``: the spec's original (v0.2.0) two-anchor
  logarithmic curve (Q_500=15.0, Q_1000=22.5). Kept selectable for spec
  fidelity/history only.

All anchors are explicit OTRI scale conventions (spec section 17: "not
population averages, records, ITRA values or UTMB values") and remain
subject to real-world validation (spec section 35).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import equivalent_flat_distance_from_totals, equivalent_flat_distance_km
from .model import RunnerScore, ScoreBreakdown

SCALE_MIN = 0.0
SCALE_MAX = 1000.0


@dataclass(frozen=True)
class ScoreCurve:
    """A versioned performance-rate <-> score transformation.

    ``q_for_score`` and ``score_for_q`` must be exact inverses of each other
    (spec section 21's required symmetry tests) — each curve constructor
    below builds a matching pair.
    """

    version: str
    q_for_score: Callable[[float], float]
    score_for_q: Callable[[float], float]

    def required_q(self, score: float) -> float:
        """Return the performance rate required for an exact continuous score."""
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")

def _validate_score(score: float) -> None:
    if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
        raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")


def _validate_q(q: float) -> None:
    if not math.isfinite(q) or q <= 0:
        raise ValueError("performance rate must be positive and finite")


def _log_curve(version: str, q_500: float, q_1000: float) -> ScoreCurve:
    """Two-anchor logarithmic curve — spec v0.2.0's original shape (sections 16-20 of that
    revision): the required performance rate grows exponentially with score, so
    doubling Q only adds a fixed amount to the score."""
    k = 500.0 / math.log(q_1000 / q_500)

    def q_for_score(score: float) -> float:
        _validate_score(score)
        return q_500 * math.exp((score - 500.0) / k)

    def score_for_q(q: float) -> float:
        _validate_q(q)
        return 500.0 + k * math.log(q / q_500)

    return ScoreCurve(version=version, q_for_score=q_for_score, score_for_q=score_for_q)


def _quadratic_curve(version: str, a: float, b: float, c: float) -> ScoreCurve:
    """Smooth exponential-quadratic curve — spec v0.3.0 section 18: ``Q(S) = exp(A + B*S +
    C*S^2)``, inverted per section 19 via the quadratic formula's positive root.

    Because this parabola (in S) has a minimum, ``Q(S)`` is only invertible for
    ``Q`` at or above that minimum (~6.9 demand-km/h for the published constants) —
    below it, the quadratic has no real root at all. That floor sits below
    ``Q(0)`` (~9.35), so any measured Q that low already represents a performance
    slower than what legitimately scores 0. Per the monotonicity invariant (spec
    section 22: slower time -> lower score) and the required clipping (section
    19), such cases are treated as clipping to score 0 rather than as a hard
    error — clamping the discriminant to 0 has exactly that effect, since the
    result then evaluates to the parabola's vertex, which is always very
    negative and clips to 0 below.
    """

    def q_for_score(score: float) -> float:
        _validate_score(score)
        return math.exp(a + b * score + c * score * score)

    def score_for_q(q: float) -> float:
        _validate_q(q)
        discriminant = max(0.0, b * b - 4.0 * c * (a - math.log(q)))
        return (-b + math.sqrt(discriminant)) / (2.0 * c)

    return ScoreCurve(version=version, q_for_score=q_for_score, score_for_q=score_for_q)


# Spec section 17's original (v0.2.0) literal reference points.
SPEC_CURVE = _log_curve("1.0.0-course-standard", q_500=15.0, q_1000=22.5)

# An internal, pre-v0.3.0 recalibration — retained only for continuity with any scores
# already stamped with this version. See module docstring.
CALIBRATED_CURVE = _log_curve("1.1.0-course-standard", q_500=3.5, q_1000=10.5)

# The spec's current published v0.3.0 curve (section 18), anchored at
# score 200 -> Q=11.0, 500 -> Q=15.0, 1000 -> Q=30.0 demand-km/h.
OFFICIAL_CURVE = _quadratic_curve(
    "2.0.0-course-standard",
    a=2.2351808956091976,
    b=0.0007254607359190918,
    c=0.0000004405557501338660,
)

DEFAULT_CURVE = OFFICIAL_CURVE
SCORING_VERSION = DEFAULT_CURVE.version


def _curve_for_version(version: str) -> ScoreCurve:
    for curve in (OFFICIAL_CURVE, CALIBRATED_CURVE, SPEC_CURVE):
        if version == curve.version:
            return curve
    raise ValueError(f"unknown course-standard curve version {version!r}")


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    """Q = course demand (km) / finish time (hours)."""
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    time_hours = finish_time_seconds / 3600.0
    return equivalent_km / time_hours


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = DEFAULT_CURVE) -> dict:
    """The public, clipped OTRI score plus its unclipped raw value and performance rate
    (spec sections 18-19). Shared by ``score_race_course_standard`` (real results) and
    ``scoring.estimator`` (pre-race GPX predictions) so both use the exact same formula.
    """
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.score_for_q(q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = DEFAULT_CURVE) -> float:
    """Inverse of ``score_for_time`` (spec section 20): the finish time that scores exactly
    `score` on a course with this equivalent distance. Symmetric with the forward direction,
    per spec section 21's required pre/post inverse tests."""
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    _validate_score(score)
    q_target = curve.q_for_score(score)
    time_hours = equivalent_km / q_target
    return time_hours * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    """Course-demand confidence is higher when a real GPX is available."""
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = DEFAULT_CURVE,
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
    """The spec's original (v0.2.0) literal Q_500=15.0/Q_1000=22.5 anchors — see module
    docstring."""
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)

