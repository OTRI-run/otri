"""Course Standard scoring model(s) — course + finish time only, no competitors.

Combines the spec's course-demand engine (``scoring.course_demand``, the
Minetti gradient-cost integral) with a logarithmic performance-rate
transformation (spec sections 16-20). A runner's score depends only on the
course and their own finish time — no other runner's result (the field's
winner, its size, or its strength) is read anywhere in this module. That is
the model's central principle (spec section 2's "explicit exclusions"), and
it is what the older ``scoring.model.score_race_field_relative`` could not
do.

Two anchor calibrations are available (spec section 17's Q_500/Q_1000
reference points are explicitly "OTRI design choices" that "must be
validated" — section 34):

- ``1.0.0-course-standard``: the spec's own literal numbers (Q_500=15.0,
  Q_1000=22.5 demand-km/h). Kept selectable for spec fidelity, but these
  translate to punishingly fast absolute times on real courses regardless of
  length (e.g. ~70 minutes for 500 points on a ~17.5 demand-km course) —
  real-world testing showed ordinary, legitimate trail finish times (several
  hours) score 0 under these anchors.
- ``1.1.0-course-standard`` (default): recalibrated anchors (Q_500=3.5,
  Q_1000=10.5 demand-km/h) chosen so realistic recreational-to-elite trail
  paces spread meaningfully across the 0-1000 scale instead of clustering at
  0. Still an explicit, undata-validated OTRI design choice, not derived
  from real race results — a future, real calibration (per spec section 29)
  should supersede this with its own new version.

The transformation itself is logarithmic and **clipped**, not asymptotic: a
performance at or above ``q_1000`` legitimately scores exactly 1000 (spec
sections 17-19) — 1000 is a defined, reachable reference point, not an
unreachable theoretical limit.
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
    version: str
    q_500: float
    q_1000: float

    @property
    def k(self) -> float:
        return 500.0 / math.log(self.q_1000 / self.q_500)


# Spec section 17's literal reference points.
SPEC_CURVE = ScoreCurve(version="1.0.0-course-standard", q_500=15.0, q_1000=22.5)

# Recalibrated so realistic trail finish times (minutes to many hours,
# depending on course demand) spread meaningfully across 0-1000 instead of
# almost everything clipping to 0 — see module docstring.
CALIBRATED_CURVE = ScoreCurve(version="1.1.0-course-standard", q_500=3.5, q_1000=10.5)

SCORING_VERSION = CALIBRATED_CURVE.version


def _curve_for_version(version: str) -> ScoreCurve:
    if version == SPEC_CURVE.version:
        return SPEC_CURVE
    if version == CALIBRATED_CURVE.version:
        return CALIBRATED_CURVE
    raise ValueError(f"unknown course-standard curve version {version!r}")


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    """Q = course demand (km) / finish time (hours) — spec section 16."""
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    time_hours = finish_time_seconds / 3600.0
    return equivalent_km / time_hours


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = CALIBRATED_CURVE) -> dict:
    """The public, clipped OTRI score plus its unclipped raw value and performance rate
    (spec sections 18-19). Shared by ``score_race_course_standard`` (real results) and
    ``scoring.estimator`` (pre-race GPX predictions) so both use the exact same formula.
    """
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = 500.0 + curve.k * math.log(q / curve.q_500)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = CALIBRATED_CURVE) -> float:
    """Inverse of ``score_for_time`` (spec section 20): the finish time that scores exactly
    `score` on a course with this equivalent distance. Symmetric with the forward direction,
    per spec section 21's required pre/post inverse tests."""
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    if not math.isfinite(score) or not 0 <= score <= SCALE_MAX:
        raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
    q = curve.q_500 * math.exp((score - 500.0) / curve.k)
    time_hours = equivalent_km / q
    return time_hours * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    """This model's course-demand engine is far more reliable with a real GPX (a full
    segment-by-segment gradient integral) than the distance+elevation-only fallback
    approximation used when no GPX has been attached yet."""
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = CALIBRATED_CURVE,
) -> list[RunnerScore]:
    """Score every finisher in ``results`` purely from the course and their own finish time.

    Non-finishers (DNF/DNS/DSQ) are excluded — there is no time to score.
    Sorting uses (finish_time_seconds, bib_number, family_name, first_name),
    so ties never depend on input row order, keeping the output deterministic.
    Crucially, each runner's score does not depend on who else is in
    ``results`` — removing or adding other finishers never changes it.
    """
    finishers = [result for result in results if result.is_finisher and result.finish_time_seconds is not None]
    if not finishers:
        return []

    if gpx_points is not None:
        equivalent_km = equivalent_flat_distance_km(gpx_points)
    else:
        equivalent_km = equivalent_flat_distance_from_totals(race.distance_km, race.elevation_gain_m)

    confidence = _confidence_for_course(gpx_points is not None)
    ordered = sorted(
        finishers,
        key=lambda result: (result.finish_time_seconds, result.bib_number or "", result.family_name, result.first_name),
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
    race: RaceRecord, results: list[ResultRecord], gpx_points: list[TrackPoint] | None = None
) -> list[RunnerScore]:
    """The spec's own literal Q_500=15.0/Q_1000=22.5 anchors — see module docstring."""
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
