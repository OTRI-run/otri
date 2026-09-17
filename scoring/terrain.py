"""Terrain adjustment — what the gradient-cost integral alone does not price.

The course-demand integral (`course_demand.py`) applies Minetti et al. 2002's metabolic-cost
polynomial to each 50 m segment's grade. That polynomial was measured on a **treadmill**, on
smooth firm ground, at sea level, in a single bout. Real mountain courses depart from those
conditions in two ways this module corrects for, both measured from the course itself:

1. **Sustained steep terrain.** Above roughly 20% grade a real mountain course is not "running
   up a steep treadmill" — it is power-hiking or scrambling on loose rock, roots and steps, with
   hands, poles and broken rhythm. The treadmill cost understates that, and understates it in
   proportion to how much of the course is that steep.

2. **Altitude.** Aerobic capacity declines above roughly 1500 m. This is the one feature that
   distinguishes a high-alpine course from a merely steep one, and it is read straight off the
   course's own elevation profile.

Both inputs come from the same denoised 50 m segment profile that produces course demand, so a
terrain factor is deterministic for a given GPX and measurement version, and needs no organizer
input or subjective difficulty rating (V0.1 spec section 2's exclusions still hold).

**What this deliberately does not model:** technical footing at sub-50 m scale — rock, roots,
mud, steps, exposure. That information is simply not in a GPX. Elevation is accurate to several
metres at best, the measurement pipeline denoises with a +/-10 m rolling median and mean, and
any undulation that survives at 50 m scale is *already* priced by the gradient integral, so
counting it again would be double-counting. `STEEP_COEFFICIENT` therefore absorbs the average
technicality of steep mountain terrain rather than measuring any particular course's footing.
See docs/methodology/v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md section 5.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# A 50 m segment at or above this absolute grade is counted as "sustained steep terrain".
# 20% is where real mountain courses stop being run and start being hiked/scrambled.
STEEP_GRADE_THRESHOLD = 0.20

# Altitude above which aerobic capacity measurably declines.
ALTITUDE_THRESHOLD_M = 1500.0

# Fractional cost added per 1000 m of distance-weighted altitude above the threshold.
# Grounded in the standard aerobic decrement of roughly 6-8% of VO2max per 1000 m above
# ~1500 m; 0.07 is the midpoint. Not fitted to OTRI data.
ALTITUDE_COEFFICIENT = 0.07

# Fractional cost added when the *entire* course is at or above STEEP_GRADE_THRESHOLD.
# Unlike ALTITUDE_COEFFICIENT this is a calibrated constant, not a published one: it is set so
# that an elite ride of the one real high-mountain 100-mile performance OTRI has scores 970.
# One calibration point, one coefficient — read section 5 of the methodology note before
# treating this as measured rather than chosen.
STEEP_COEFFICIENT = 0.5951


@dataclass(frozen=True)
class TerrainModel:
    """Multiplier on course demand for what the gradient integral alone does not price."""

    steep_grade_threshold: float
    altitude_threshold_m: float
    steep_coefficient: float
    altitude_coefficient: float

    def factor(self, steep_distance_fraction: float, altitude_excess_m: float) -> float:
        """Terrain multiplier for a course with these two measured properties.

        `steep_distance_fraction` is the share of course distance on segments at or above
        `steep_grade_threshold`; `altitude_excess_m` is the distance-weighted mean elevation
        above `altitude_threshold_m`. A flat sea-level road course has both at zero and a
        factor of exactly 1.0, so road courses are never touched.
        """
        if not math.isfinite(steep_distance_fraction) or not 0.0 <= steep_distance_fraction <= 1.0:
            raise ValueError("steep_distance_fraction must be between 0 and 1")
        if not math.isfinite(altitude_excess_m) or altitude_excess_m < 0.0:
            raise ValueError("altitude_excess_m must be non-negative and finite")
        return (
            1.0
            + self.steep_coefficient * steep_distance_fraction
            + self.altitude_coefficient * altitude_excess_m / 1000.0
        )

    def flags(self, steep_distance_fraction: float, altitude_excess_m: float) -> tuple[str, ...]:
        """Surface the adjustment whenever it is doing real work, so it is never invisible."""
        factor = self.factor(steep_distance_fraction, altitude_excess_m)
        if factor <= 1.0:
            return ()
        return (
            f"terrain_adjustment_applied: course demand scaled by {factor:.3f} "
            f"({100 * steep_distance_fraction:.1f}% of distance at or above "
            f"{100 * self.steep_grade_threshold:.0f}% grade, "
            f"{altitude_excess_m:.0f} m mean altitude above {self.altitude_threshold_m:.0f} m)",
        )


TERRAIN_MODEL = TerrainModel(
    steep_grade_threshold=STEEP_GRADE_THRESHOLD,
    altitude_threshold_m=ALTITUDE_THRESHOLD_M,
    steep_coefficient=STEEP_COEFFICIENT,
    altitude_coefficient=ALTITUDE_COEFFICIENT,
)
