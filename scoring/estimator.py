"""Illustrative GPX -> score estimator.

This is **not** the calibrated GPX Target Performance Predictor described in
``HANDBOOK.md`` / ``docs/gpx-predictor.md``: "GPX alone is not enough to
calibrate performance. Real race results are required to learn the
relationship between course characteristics, finish times, and OTRI
outcomes." It exists so the prototype can demonstrate something interactive
while being explicit that it is not a calibrated prediction.
"""

from __future__ import annotations

from dataclasses import dataclass

from .model import SCALE_MAX, equivalent_distance_km

# Average winning pace (seconds per equivalent km) across OTRI's current
# synthetic demo races (see scripts/build_prototype_data.py) — NOT a
# calibrated real-world benchmark. Replace once real race results exist
# across enough courses to calibrate a genuine course-difficulty model.
REFERENCE_PACE_S_PER_KM = 232.3

DISCLAIMER = (
    "Illustrative only: compares your pace to the average winning pace across "
    "OTRI's synthetic demo races, not a calibrated cross-race model. "
    "See docs/gpx-predictor.md."
)


@dataclass(frozen=True)
class IllustrativeEstimate:
    equivalent_distance_km: float
    pace_seconds_per_km: float
    illustrative_score: int
    disclaimer: str

    def to_dict(self) -> dict:
        return {
            "equivalent_distance_km": self.equivalent_distance_km,
            "pace_seconds_per_km": self.pace_seconds_per_km,
            "illustrative_score": self.illustrative_score,
            "disclaimer": self.disclaimer,
        }


def estimate_illustrative_score(distance_km: float, elevation_gain_m: float, finish_time_seconds: int) -> IllustrativeEstimate:
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")

    equivalent_km = equivalent_distance_km(distance_km, elevation_gain_m)
    pace = finish_time_seconds / equivalent_km
    score = round(SCALE_MAX * (REFERENCE_PACE_S_PER_KM / pace))

    return IllustrativeEstimate(
        equivalent_distance_km=round(equivalent_km, 3),
        pace_seconds_per_km=round(pace, 1),
        illustrative_score=score,
        disclaimer=DISCLAIMER,
    )
