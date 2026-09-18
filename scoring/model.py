"""OTRI legacy field-relative scoring model — kept selectable, no longer the default.

This is the **field-relative** model: the fastest finisher in a given race
always scores exactly ``SCALE_MAX``, and everyone else scores proportionally
off that field's own winner. That means the same finish time means a
different score in a different race, depending on who else showed up —
which is exactly what ``docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`` section 1.1's
"explicit exclusions" warn against ("the fundamental score should be
determined from the course model and finish time, not from... the identity,
number, or historical performance of the competitors in that race").

It is kept here, selectable via ``scoring.registry``, only for backwards
compatibility and reproducibility of historical scores computed under it
(``METHODOLOGY.md`` §11 — a methodology change must not silently rewrite
history). New races should use ``scoring.course_standard`` instead, which has
no competitor dependency at all.

Every score is a full breakdown (``ScoreBreakdown``), not a bare number, per
``HANDBOOK.md``'s "Auditability" section.
"""

from __future__ import annotations

from dataclasses import dataclass

from ingestion.records import RaceRecord, ResultRecord

SCORING_VERSION = "0.1.0-field-relative"

# How many "equivalent flat kilometers" 100 m of climbing counts as — a
# commonly used trail-running rule of thumb. Deliberately named and isolated
# so it can be replaced by the real course-difficulty model (docs/roadmap.md
# Phase 2) once calibration data exists, without touching the scoring math.
ELEVATION_KM_PER_100M = 1.0

# The fastest finisher in a race always scores exactly this value. Everyone
# else scores proportionally lower based on pace relative to the winner.
SCALE_MAX = 1000


@dataclass(frozen=True)
class ScoreBreakdown:
    # None when the course is outside what the model scores (course_standard.not_scored_reason):
    # the finish time stands, no score is given, and `quality_flags` carries the reason.
    otri_score: int | None
    base_performance: float
    course_adjustment: float
    field_adjustment: float
    environmental_factor: float
    confidence: str
    scoring_version: str
    # Q (demand-km/hour) — only meaningful for scoring.course_standard; the
    # legacy field-relative model below leaves this at its default.
    performance_rate: float = 0.0
    # Notices about the course (e.g. a segment steeper than the model's supported domain
    # that had to be clamped) — empty when the course demand had no issues to flag.
    quality_flags: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "otri_score": self.otri_score,
            "base_performance": self.base_performance,
            "course_adjustment": self.course_adjustment,
            "field_adjustment": self.field_adjustment,
            "environmental_factor": self.environmental_factor,
            "confidence": self.confidence,
            "scoring_version": self.scoring_version,
            "performance_rate": self.performance_rate,
            "quality_flags": list(self.quality_flags),
        }


@dataclass(frozen=True)
class RunnerScore:
    rank: int
    bib_number: str | None
    family_name: str
    first_name: str
    score: ScoreBreakdown

    def to_dict(self) -> dict:
        return {
            "rank": self.rank,
            "bib_number": self.bib_number,
            "family_name": self.family_name,
            "first_name": self.first_name,
            **self.score.to_dict(),
        }


def equivalent_distance_km(distance_km: float, elevation_gain_m: float) -> float:
    """Course distance adjusted for climbing, so pace is comparable across courses.

    Intentionally does not yet use elevation loss, gradient distribution, or
    terrain — see ``docs/roadmap.md`` Phase 2 for the future course-difficulty
    model that will eventually replace this constant-factor approximation.
    """
    return distance_km + (elevation_gain_m / 100.0) * ELEVATION_KM_PER_100M


def _confidence_for_field_size(field_size: int) -> str:
    """Confidence in this *single-race, relative* baseline score.

    This baseline has no cross-race calibration yet, so even "High" here only
    means "reliable relative to this race's own field" — not "reliable as an
    absolute, cross-race OTRI value" (METHODOLOGY.md §8).
    """
    if field_size < 5:
        return "Low"
    if field_size < 20:
        return "Medium"
    return "High"


def score_race_field_relative(race: RaceRecord, results: list[ResultRecord]) -> list[RunnerScore]:
    """Score every finisher in ``results`` against this race's own field.

    Non-finishers (DNF/DNS/DSQ) are excluded — there is no time to score.
    Sorting uses (finish_time_seconds, bib_number, family_name, first_name),
    so ties never depend on input row order, keeping the output deterministic.
    """
    finishers = [result for result in results if result.is_finisher and result.finish_time_seconds is not None]
    if not finishers:
        return []

    equivalent_km = equivalent_distance_km(race.distance_km, race.elevation_gain_m)
    ordered = sorted(
        finishers,
        key=lambda result: (result.finish_time_seconds, result.bib_number or "", result.family_name, result.first_name),
    )
    best_pace = ordered[0].finish_time_seconds / equivalent_km
    confidence = _confidence_for_field_size(len(ordered))

    scores = []
    for result in ordered:
        pace = result.finish_time_seconds / equivalent_km
        base_performance = round(SCALE_MAX * (best_pace / pace), 2)
        breakdown = ScoreBreakdown(
            otri_score=round(base_performance),
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
