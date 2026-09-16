"""Course Standard scoring model — implements OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md exactly.

Combines the spec's course-demand engine (``scoring.course_demand``, the
Minetti gradient-cost integral) with its logarithmic performance-rate
transformation. A runner's score depends only on the course and their own
finish time — no other runner's result (the field's winner, its size, or its
strength) is read anywhere in this module. That is the model's central
principle (spec section 2's "explicit exclusions"), and it is what the older
``scoring.model.score_race_field_relative`` could not do.

Score scale: two explicit, published reference points anchor the curve —
``Q_500`` (500 points) and ``Q_1000`` (1000 points), both in demand-km/hour.
The transformation is logarithmic and **clipped**, not asymptotic: a
performance at or above ``Q_1000`` legitimately scores exactly 1000 (spec
sections 17-19) — 1000 is a defined, reachable elite reference point, not an
unreachable theoretical limit.
"""

from __future__ import annotations

import math

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import equivalent_flat_distance_from_totals, equivalent_flat_distance_km
from .model import RunnerScore, ScoreBreakdown

SCORING_VERSION = "1.0.0-course-standard"

# Explicit OTRI scale conventions (spec section 17) — not population
# averages, records, or another organization's values.
Q_500 = 15.0
Q_1000 = 22.5
K = 500.0 / math.log(Q_1000 / Q_500)

SCALE_MIN = 0.0
SCALE_MAX = 1000.0


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    """Q = course demand (km) / finish time (hours) — spec section 16."""
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    time_hours = finish_time_seconds / 3600.0
    return equivalent_km / time_hours


def score_for_time(equivalent_km: float, finish_time_seconds: float) -> dict:
    """The public, clipped OTRI score plus its unclipped raw value and performance rate
    (spec sections 18-19). Shared by ``score_race_course_standard`` (real results) and
    ``scoring.estimator`` (pre-race GPX predictions) so both use the exact same formula.
    """
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = 500.0 + K * math.log(q / Q_500)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {"performance_rate": q, "otri_raw": raw, "otri_score": public}


def target_time_seconds(equivalent_km: float, score: float) -> float:
    """Inverse of ``score_for_time`` (spec section 20): the finish time that scores exactly
    `score` on a course with this equivalent distance. Symmetric with the forward direction,
    per spec section 21's required pre/post inverse tests."""
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    if not math.isfinite(score) or not 0 <= score <= SCALE_MAX:
        raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
    q = Q_500 * math.exp((score - 500.0) / K)
    time_hours = equivalent_km / q
    return time_hours * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    """This model's course-demand engine is far more reliable with a real GPX (a full
    segment-by-segment gradient integral) than the distance+elevation-only fallback
    approximation used when no GPX has been attached yet."""
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord, results: list[ResultRecord], gpx_points: list[TrackPoint] | None = None
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
        computed = score_for_time(equivalent_km, result.finish_time_seconds)
        breakdown = ScoreBreakdown(
            otri_score=computed["otri_score"],
            base_performance=round(computed["otri_raw"], 2),
            course_adjustment=0.0,
            field_adjustment=0.0,
            environmental_factor=0.0,
            confidence=confidence,
            scoring_version=SCORING_VERSION,
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
