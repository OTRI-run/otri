"""Illustrative GPX -> score estimator.

This is **not** the calibrated GPX Target Performance Predictor described in
``HANDBOOK.md`` / ``docs/gpx-predictor.md``: "GPX alone is not enough to
calibrate performance. Real race results are required to learn the
relationship between course characteristics, finish times, and OTRI
outcomes." It exists so the prototype can demonstrate something interactive
while being explicit that it is not a calibrated prediction.

It uses the exact same formula as the real post-race scorer
(``scoring.model.score_race``): ``score = SCALE_MAX * (winner_pace / your_pace)``
over the ITRA-style equivalent distance (``equivalent_distance_km``). The only
unknown before a race is who the actual winner will be and how fast — so this
estimator takes that as an explicit, adjustable assumption
(``winner_finish_time_seconds``) rather than hiding it in a constant. If that
assumption turns out correct, the estimate here and the real score computed
once results are uploaded are identical, not just close.
"""

from __future__ import annotations

from dataclasses import dataclass

from .model import SCALE_MAX, equivalent_distance_km

# Default assumed winning pace (seconds per equivalent km) when the caller
# doesn't supply their own `winner_finish_time_seconds` — averaged across
# OTRI's current synthetic demo races (see scripts/build_prototype_data.py).
# NOT a calibrated real-world benchmark; callers who know (or can guess) the
# likely winning time for their specific race should pass it in instead.
REFERENCE_PACE_S_PER_KM = 232.3

DISCLAIMER = (
    "Assumes a winning pace (edit it if you have a better guess for this race) and applies "
    "the same formula as the real post-race scorer. If your assumed winning time turns out "
    "correct, this matches your real OTRI score exactly. See docs/gpx-predictor.md."
)


@dataclass(frozen=True)
class IllustrativeEstimate:
    equivalent_distance_km: float
    pace_seconds_per_km: float
    winner_finish_time_seconds: int
    illustrative_score: int
    disclaimer: str

    def to_dict(self) -> dict:
        return {
            "equivalent_distance_km": self.equivalent_distance_km,
            "pace_seconds_per_km": self.pace_seconds_per_km,
            "winner_finish_time_seconds": self.winner_finish_time_seconds,
            "illustrative_score": self.illustrative_score,
            "disclaimer": self.disclaimer,
        }


def estimate_illustrative_score(
    distance_km: float,
    elevation_gain_m: float,
    finish_time_seconds: int,
    winner_finish_time_seconds: int | None = None,
) -> IllustrativeEstimate:
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")
    if winner_finish_time_seconds is not None and winner_finish_time_seconds <= 0:
        raise ValueError("winner_finish_time_seconds must be greater than 0")

    equivalent_km = equivalent_distance_km(distance_km, elevation_gain_m)
    pace = finish_time_seconds / equivalent_km

    if winner_finish_time_seconds is None:
        winner_finish_time_seconds = round(REFERENCE_PACE_S_PER_KM * equivalent_km)
    winner_pace = winner_finish_time_seconds / equivalent_km

    score = round(SCALE_MAX * (winner_pace / pace))

    return IllustrativeEstimate(
        equivalent_distance_km=round(equivalent_km, 3),
        pace_seconds_per_km=round(pace, 1),
        winner_finish_time_seconds=winner_finish_time_seconds,
        illustrative_score=score,
        disclaimer=DISCLAIMER,
    )
