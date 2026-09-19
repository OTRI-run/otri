"""Course demand: the gradient-cost model of docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md section 3.

A course becomes one "course demand" figure (a modeled demand-equivalent distance, not a literal
energy measurement) by integrating a published gradient-dependent running-cost polynomial over
50 m segments of the measured course. The integration itself lives in `scoring/measured_demand.py`,
on top of the shared course measurement (`course/measurement.py`); this module holds the cost
polynomial, the `CourseDemand` result, and the coarse fallback for a race scored from its official
distance and climb before a course file is attached (`demand_from_totals`). It never reads a finish
time, a result, or another runner's data.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Minetti et al. 2002's fifth-order polynomial for the metabolic cost of
# running at a given gradient, in J/kg/m — measured over slopes from
# approximately -45% to +45%. `g` is a decimal grade (0.10 == +10%).
# Source: Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. "Energy cost of
# walking and running at extreme uphill and downhill slopes." Journal of
# Applied Physiology. 2002;93(3):1039-1046.
MIN_GRADE = -0.45
MAX_GRADE = 0.45


class UnsupportedGradientError(ValueError):
    """A segment's grade falls outside the Minetti polynomial's evidenced domain.

    Raised by `gradient_cost`/`gradient_ratio` themselves so direct callers still fail
    explicitly. `compute_course_demand` catches this per-segment, clamps that segment's
    grade to +/-45% to keep producing a course demand and score, and records a
    `quality_flags` entry rather than aborting the whole course (spec section 9.1's
    "quality_flag" concept) — never silently, always surfaced for review.
    """


def gradient_cost(g: float) -> float:
    """Metabolic cost of running at grade `g` (decimal, e.g. 0.10 for +10%), in J/kg/m."""
    if not math.isfinite(g):
        raise ValueError("grade must be finite")
    if g < MIN_GRADE or g > MAX_GRADE:
        raise UnsupportedGradientError(f"grade {g!r} outside the supported domain [{MIN_GRADE}, {MAX_GRADE}]")
    return 155.4 * g**5 - 30.4 * g**4 - 43.3 * g**3 + 46.3 * g**2 + 19.5 * g + 3.6


# gradient_cost(0.0) — spelled out per spec section 12 ("R(g) = C(g) / 3.6").
_FLAT_COST = 3.6


def gradient_ratio(g: float) -> float:
    """Cost of running at grade `g` relative to flat ground (1.0 == flat)."""
    return gradient_cost(g) / _FLAT_COST


@dataclass(frozen=True)
class CourseDemand:
    physical_distance_km: float
    course_demand_km: float
    elevation_gain_m: float
    elevation_loss_m: float
    segment_count: int
    minimum_grade: float
    maximum_grade: float
    # Segments whose grade fell outside the Minetti polynomial's evidenced +/-45% domain and
    # had to be clamped to compute a demand contribution (spec section 9.1's "quality_flag").
    # Non-empty means this course's demand/score is a best-effort approximation for those
    # segments, not a hard rejection — surfaced so organizers/runners can review the course.
    quality_flags: tuple[str, ...] = ()
    # Terrain inputs (see scoring/terrain.py). Zero for a flat sea-level course, and zero on
    # the V0.1 pipeline, which does not measure them — so V0.1/V0.2 demand is unaffected.
    steep_distance_fraction: float = 0.0
    altitude_excess_m: float = 0.0
    # Share of `course_demand_km` that came from segments clamped to the +/-45% domain. Measured
    # by the V0.2+ pipeline only (zero on V0.1); V0.9 grades confidence on it.
    clamped_demand_fraction: float = 0.0

    def to_dict(self) -> dict:
        return {
            "physical_distance_km": self.physical_distance_km,
            "course_demand_km": self.course_demand_km,
            "elevation_gain_m": self.elevation_gain_m,
            "elevation_loss_m": self.elevation_loss_m,
            "segment_count": self.segment_count,
            "minimum_grade": self.minimum_grade,
            "maximum_grade": self.maximum_grade,
            "quality_flags": list(self.quality_flags),
            "steep_distance_fraction": self.steep_distance_fraction,
            "altitude_excess_m": self.altitude_excess_m,
            "clamped_demand_fraction": self.clamped_demand_fraction,
        }


def demand_from_totals(distance_km: float, elevation_gain_m: float) -> tuple[float, tuple[str, ...]]:
    """Non-spec fallback for a race with no GPX attached yet (see module docstring):
    approximates the whole course as one constant average grade. Materially less accurate
    than ``equivalent_flat_distance_km`` — no segment structure, no descent data.

    An average grade beyond the Minetti domain (a vertical kilometre steeper than 45%) is
    clamped and flagged like any GPX segment, rather than leaving the race unscorable."""
    if distance_km <= 0:
        raise ValueError("distance_km must be greater than 0")
    average_grade = (elevation_gain_m / 1000.0) / distance_km
    if not math.isfinite(average_grade):
        raise ValueError("grade must be finite")
    clamped_grade = max(MIN_GRADE, min(MAX_GRADE, average_grade))
    flags: tuple[str, ...] = ()
    if clamped_grade != average_grade:
        flags = (
            f"gradient_out_of_supported_domain: average grade {average_grade:+.0%} from the official "
            f"figures, clamped to {clamped_grade:+.0%} for scoring",
        )
    return round(distance_km * gradient_ratio(clamped_grade), 3), flags


def equivalent_flat_distance_from_totals(distance_km: float, elevation_gain_m: float) -> float:
    """The demand figure of ``demand_from_totals`` alone."""
    return demand_from_totals(distance_km, elevation_gain_m)[0]
