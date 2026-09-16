"""GPX -> score predictor, powered by the Course Standard scoring model.

``scoring.course_standard`` has no competitor dependency — a runner's score
is a pure function of the course and their own finish time. That means a
pre-race prediction and the real post-race score use the exact same formula
(``course_standard.score_for_time``): given the same GPX (or the same
distance/elevation, if no GPX is available yet) and the same finish time,
this predictor and the real scorer agree exactly, not approximately. No
"assumed winner" guess is needed the way the retired field-relative model
would have required.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint

from .course_demand import equivalent_flat_distance_from_totals, equivalent_flat_distance_km
from .course_standard import SCORING_VERSION, score_for_time

DISCLAIMER = (
    "Uses the exact same Course Standard formula as the real post-race scorer — no competitor "
    "or 'assumed winner' guess involved. If this GPX matches the race's real course, this is "
    "the exact score this finish time will earn, not just an estimate. See docs/gpx-predictor.md."
)


@dataclass(frozen=True)
class ScoreEstimate:
    equivalent_distance_km: float
    performance_rate: float
    otri_raw: float
    predicted_score: int
    scoring_version: str
    disclaimer: str

    def to_dict(self) -> dict:
        return {
            "equivalent_distance_km": self.equivalent_distance_km,
            "performance_rate": self.performance_rate,
            "otri_raw": self.otri_raw,
            "predicted_score": self.predicted_score,
            "scoring_version": self.scoring_version,
            "disclaimer": self.disclaimer,
        }


def estimate_score(
    finish_time_seconds: int,
    *,
    gpx_points: list[TrackPoint] | None = None,
    distance_km: float | None = None,
    elevation_gain_m: float | None = None,
) -> ScoreEstimate:
    """Predict the Course Standard score for `finish_time_seconds` on this course.

    Prefer passing `gpx_points` (the real segment-by-segment Minetti course-demand
    integral) over `distance_km`/`elevation_gain_m` (a coarser constant-average-grade
    approximation) when a GPX is available — see ``scoring.course_demand``.
    """
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")

    if gpx_points is not None:
        equivalent_km = equivalent_flat_distance_km(gpx_points)
    elif distance_km is not None and elevation_gain_m is not None:
        equivalent_km = equivalent_flat_distance_from_totals(distance_km, elevation_gain_m)
    else:
        raise ValueError("either gpx_points or both distance_km and elevation_gain_m must be provided")

    computed = score_for_time(equivalent_km, finish_time_seconds)

    return ScoreEstimate(
        equivalent_distance_km=round(equivalent_km, 3),
        performance_rate=round(computed["performance_rate"], 3),
        otri_raw=round(computed["otri_raw"], 2),
        predicted_score=computed["otri_score"],
        scoring_version=SCORING_VERSION,
        disclaimer=DISCLAIMER,
    )
