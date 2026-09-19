"""What a score is made of.

Every score is a full breakdown (``ScoreBreakdown``), not a bare number, per ``HANDBOOK.md``'s
"Auditability" section. The model that fills it in is ``scoring.course_standard``.
"""

from __future__ import annotations

from dataclasses import dataclass


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
