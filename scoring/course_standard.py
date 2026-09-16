"""Course Standard scoring model — no competitors, sealed below 1000.

Combines the Time Standard Curve architecture (research candidate 05, TSCI)
with the Minetti gradient-cost course-demand engine (candidates 01/02, GECI/
EFDI) — see ``docs/methodology/research-candidates/``. A runner's score
depends only on the course and their own finish time. No other runner's
result — the field's winner, its size, or its strength — is read anywhere in
this module. That is the entire point of this research direction (README.md
"the fundamental score should be determined from the course model and finish
time, not from... the competitors in that race"), and it is what the older
``scoring.model.score_race_field_relative`` could not do.

Sealed scale: score is a strictly increasing, strictly bounded function of
equivalent-flat speed that approaches ``SCALE_MAX`` (1000) as speed goes to
infinity but never reaches it for any finite speed — see
``_score_from_speed_kmh``. That models 1000 as a theoretical ceiling nobody
can actually reach, rather than "whoever happened to win this specific
race" (the field-relative model's definition of 1000).
"""

from __future__ import annotations

import math

from course.gpx import TrackPoint
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import equivalent_flat_distance_from_totals, equivalent_flat_distance_km
from .model import SCALE_MAX, RunnerScore, ScoreBreakdown

SCORING_VERSION = "1.0.0-course-standard"

# Provisional calibration constant (km/h). Chosen so that a flat-equivalent
# speed matching the men's marathon world-record pace (~20.5 km/h) scores
# ~950 — a very high but explicitly not-maximal score, leaving deliberate
# headroom below SCALE_MAX for "faster than any human has ever run."
#
# This is NOT derived from real OTRI race results (none exist yet) — it is a
# documented placeholder pending real calibration data, exactly like
# scoring.estimator's REFERENCE_PACE_S_PER_KM. Revisit per METHODOLOGY.md
# §10/§11 once validated race data is available.
REFERENCE_SPEED_SCALE_KMH = 6.84


def _score_from_speed_kmh(speed_kmh: float) -> float:
    """Score for a given flat-equivalent speed: strictly in [0, SCALE_MAX) for any finite,
    positive speed. No finite speed — however fast — ever reaches SCALE_MAX exactly.

    At extreme speeds, ``math.exp(-x)`` underflows to 0.0 in float64 and
    ``1 - 0.0`` becomes exactly ``1.0``, which would otherwise make this
    function return exactly SCALE_MAX for a large enough (if physically
    absurd) input. The tiny ``_FLOAT_EPSILON`` clamp keeps the "never exactly
    SCALE_MAX" guarantee true at the floating-point level too, not just after
    later rounding.
    """
    if speed_kmh <= 0:
        return 0.0
    raw = SCALE_MAX * (1 - math.exp(-speed_kmh / REFERENCE_SPEED_SCALE_KMH))
    return min(raw, SCALE_MAX - _FLOAT_EPSILON)


_FLOAT_EPSILON = 1e-9


# Rounding a value already close to SCALE_MAX (e.g. 999.998) can round *to*
# SCALE_MAX itself, which must never appear anywhere — as a display value or
# as the stored integer otri_score — since SCALE_MAX is a theoretical ceiling
# nobody can actually reach, not a value that just happens to be rare.
_MAX_DISPLAYED_SCORE = SCALE_MAX - 0.01
_MAX_DISPLAYED_OTRI_SCORE = SCALE_MAX - 1


def _sealed_base_performance(speed_kmh: float) -> float:
    return min(round(_score_from_speed_kmh(speed_kmh), 2), _MAX_DISPLAYED_SCORE)


def sealed_integer_score(base_performance: float) -> int:
    """Round `base_performance` to the nearest whole score without ever reaching SCALE_MAX —
    plain ``round()`` on a value already this close to SCALE_MAX (e.g. 999.996) would round
    *to* SCALE_MAX itself, which must never appear anywhere."""
    return min(round(base_performance), _MAX_DISPLAYED_OTRI_SCORE)


def speed_kmh_for_score(score: float) -> float:
    """Inverse of ``_score_from_speed_kmh``: the flat-equivalent speed that produces `score`.

    Raises ValueError for score <= 0 or score >= SCALE_MAX — SCALE_MAX is a
    theoretical ceiling, not an achievable target, so no finite speed maps to it.
    """
    if not 0 < score < SCALE_MAX:
        raise ValueError(f"score must be strictly between 0 and {SCALE_MAX} (exclusive)")
    return -REFERENCE_SPEED_SCALE_KMH * math.log(1 - score / SCALE_MAX)


def target_time_seconds(equivalent_km: float, score: float) -> float:
    """The finish time that would produce `score` on a course with this equivalent distance.

    Together with ``score_race_course_standard``, this makes pre-race and
    post-race calculations symmetric (METHODOLOGY.md §9) — the same curve
    both directions, per research candidate 05 (TSCI).
    """
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    speed_kmh = speed_kmh_for_score(score)
    return equivalent_km / speed_kmh * 3600


def score_for_time(equivalent_km: float, finish_time_seconds: int) -> float:
    """The sealed base-performance score for covering `equivalent_km` in `finish_time_seconds`.

    Shared by ``score_race_course_standard`` (real results) and
    ``scoring.estimator`` (pre-race GPX predictions) so both use the exact
    same formula — no separate "illustrative" math path.
    """
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")
    speed_kmh = (equivalent_km / finish_time_seconds) * 3600
    return _sealed_base_performance(speed_kmh)


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
        base_performance = _sealed_base_performance((equivalent_km / result.finish_time_seconds) * 3600)
        breakdown = ScoreBreakdown(
            otri_score=sealed_integer_score(base_performance),
            base_performance=base_performance,
            course_adjustment=0.0,
            field_adjustment=0.0,
            environmental_factor=0.0,
            confidence=confidence,
            scoring_version=SCORING_VERSION,
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
