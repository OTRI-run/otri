"""GPX -> score predictor, powered by the current Course Standard scoring model.

Pre-race prediction and real post-race scoring use the exact same course-demand
and score functions. No competitor or 'assumed winner' value is involved.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint

from .course_demand import compute_course_demand, equivalent_flat_distance_from_totals
from .course_standard import OFFICIAL_CURVE, MEASURED_CURVE, ScoreCurve, score_for_time

DISCLAIMER = (
    "Provisional course estimate. Scores match only when the race uses the same course measurement "
    "and scoring version. Uploaded elevations are not independently verified terrain measurements."
)


@dataclass(frozen=True)
class ScoreEstimate:
    equivalent_distance_km: float
    performance_rate: float
    otri_raw: float
    predicted_score: int
    scoring_version: str
    disclaimer: str
    quality_flags: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "equivalent_distance_km": self.equivalent_distance_km,
            "performance_rate": self.performance_rate,
            "otri_raw": self.otri_raw,
            "predicted_score": self.predicted_score,
            "scoring_version": self.scoring_version,
            "disclaimer": self.disclaimer,
            "quality_flags": list(self.quality_flags),
        }


def estimate_score(
    finish_time_seconds: int,
    *,
    gpx_points: list[TrackPoint] | None = None,
    distance_km: float | None = None,
    elevation_gain_m: float | None = None,
    curve: ScoreCurve = MEASURED_CURVE,
    measurement=None,
) -> ScoreEstimate:
    """Predict the Course Standard score for `finish_time_seconds` on this course.

    Prefer passing `gpx_points` (the 50 m segment-by-segment Minetti course-demand
    integral) over `distance_km`/`elevation_gain_m` (a coarser constant-average-grade
    approximation) when a GPX is available.
    """
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")

    if gpx_points is not None:
        if curve.version == MEASURED_CURVE.version:
            from .measured_demand import compute_measured_demand
            demand = compute_measured_demand(gpx_points, measurement=measurement)
        else:
            demand = compute_course_demand(gpx_points)
        equivalent_km = demand.course_demand_km
        quality_flags = demand.quality_flags
    elif distance_km is not None and elevation_gain_m is not None:
        equivalent_km = equivalent_flat_distance_from_totals(distance_km, elevation_gain_m)
        quality_flags = ()
    else:
        raise ValueError("either gpx_points or both distance_km and elevation_gain_m must be provided")

    computed = score_for_time(equivalent_km, finish_time_seconds, curve=curve)

    return ScoreEstimate(
        equivalent_distance_km=round(equivalent_km, 3),
        performance_rate=round(computed["performance_rate"], 3),
        otri_raw=round(computed["otri_raw"], 2),
        predicted_score=computed["otri_score"],
        scoring_version=curve.version,
        disclaimer=DISCLAIMER,
        quality_flags=quality_flags,
    )
