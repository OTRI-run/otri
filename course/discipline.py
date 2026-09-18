"""Course discipline labels. Descriptive only: a label never enters a score.

A *vertical* race is uphill-only: a vertical kilometre, or an uphill mountain race that finishes
on the summit. It is scored like any other course; the label exists so runners can find these
races and so a result earned without any descending is recognisable as such.
"""

from __future__ import annotations

# Ascent at least ten times descent is the usual definition of a vertical race. The average-grade
# floor keeps a gently rising road course (3% and no descent passes the ratio) out of the label.
VERTICAL_GAIN_TO_LOSS = 10.0
VERTICAL_MIN_AVERAGE_GRADE = 0.10
# Without a measured course the descent is unknown, so only the average grade can speak: 1,000 m
# in under 5 km is the skyrunning definition of a vertical kilometre, and no loop averages 20%
# ascent over its whole length (it would have to climb and descend at 40%).
VERTICAL_MIN_AVERAGE_GRADE_WITHOUT_LOSS = 0.20


def is_vertical(distance_km: float, elevation_gain_m: float, elevation_loss_m: float | None = None) -> bool:
    if not distance_km or distance_km <= 0 or not elevation_gain_m or elevation_gain_m <= 0:
        return False
    average_grade = elevation_gain_m / (distance_km * 1000.0)
    if elevation_loss_m is None:
        return average_grade >= VERTICAL_MIN_AVERAGE_GRADE_WITHOUT_LOSS
    return elevation_gain_m >= VERTICAL_GAIN_TO_LOSS * elevation_loss_m and average_grade >= VERTICAL_MIN_AVERAGE_GRADE
