"""Minetti gradient-cost course-demand engine.

Implements the core calculation shared by research candidates 01 (Gradient
Energy Cost Index) and 02 (Equivalent Flat Distance Index) — see
``docs/methodology/research-candidates/``. A course is reduced to a single
number: the flat-ground distance a runner would need to cover to expend the
same modeled metabolic cost as the real course. This is the "course-demand
engine" half of ``scoring.course_standard``'s Time Standard Curve; it has no
opinion about finish times, competitors, or scores — only about the course.

Deliberately course-only: this module never reads a result, a finish time, or
another runner's data.
"""

from __future__ import annotations

from course.gpx import TrackPoint
from course.features import haversine_m

# Minetti et al. 2002 fifth-order polynomial for the metabolic cost of
# running at a given gradient, in J/kg/m — measured over slopes from
# approximately -45% to +45%. `g` is a decimal grade (0.10 == +10%).
#
#   C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6
#
# Source: Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. "Energy cost of
# walking and running at extreme uphill and downhill slopes." Journal of
# Applied Physiology. 2002;93(3):1039-1046.
_MINETTI_COEFFICIENTS_HIGH_TO_LOW = (155.4, -30.4, -43.3, 46.3, 19.5, 3.6)

# The polynomial is only evidenced over roughly this gradient range; grades
# beyond it are clamped rather than extrapolated (docs/methodology/
# research-candidates/01-gradient-energy-cost-index.md "Major limitation").
_MINETTI_SUPPORTED_GRADE = 0.45

# Target resampled segment length for the gradient-cost integral. The GECI
# paper recommends testing 10/20/50 m for stability before standardizing;
# 20 m is its suggested starting point, smoothing raw GPS/elevation noise
# that would otherwise dominate a per-point integral.
SEGMENT_LENGTH_M = 20.0


def minetti_cost(grade: float) -> float:
    """Metabolic cost of running at `grade` (decimal, e.g. 0.10 for +10%), in J/kg/m.

    Clamped to the polynomial's evidenced range (+/-45%) rather than
    extrapolated beyond it.
    """
    g = max(-_MINETTI_SUPPORTED_GRADE, min(_MINETTI_SUPPORTED_GRADE, grade))
    c5, c4, c3, c2, c1, c0 = _MINETTI_COEFFICIENTS_HIGH_TO_LOW
    return c5 * g**5 + c4 * g**4 + c3 * g**3 + c2 * g**2 + c1 * g + c0


_FLAT_COST = minetti_cost(0.0)


def grade_cost_ratio(grade: float) -> float:
    """Cost of running at `grade` relative to flat ground (1.0 == flat)."""
    return minetti_cost(grade) / _FLAT_COST


def equivalent_flat_distance_km(points: list[TrackPoint]) -> float:
    """GECI/EFDI course demand: integrate the gradient-cost ratio over the whole course.

    The raw point-to-point polyline is resampled to fixed-length segments
    (``SEGMENT_LENGTH_M``) first, so a single noisy GPS/elevation reading
    can't dominate the integral the way it could from a naive per-point
    calculation — matching the GECI paper's recommended approach.
    """
    if len(points) < 2:
        raise ValueError("at least 2 track points are required")

    cumulative_m = [0.0]
    for previous, current in zip(points, points[1:]):
        cumulative_m.append(cumulative_m[-1] + haversine_m(previous.lat, previous.lon, current.lat, current.lon))
    elevations = [point.elevation_m if point.elevation_m is not None else 0.0 for point in points]

    total_m = cumulative_m[-1]
    if total_m <= 0:
        return 0.0

    segment_count = max(1, round(total_m / SEGMENT_LENGTH_M))
    step_m = total_m / segment_count

    equivalent_m = 0.0
    for i in range(segment_count):
        start_elevation = _interpolate_elevation(cumulative_m, elevations, i * step_m)
        end_elevation = _interpolate_elevation(cumulative_m, elevations, (i + 1) * step_m)
        grade = (end_elevation - start_elevation) / step_m
        equivalent_m += step_m * grade_cost_ratio(grade)

    return round(equivalent_m / 1000.0, 3)


def _interpolate_elevation(cumulative_m: list[float], elevations: list[float], target_m: float) -> float:
    """Linearly interpolate elevation at `target_m` along the cumulative-distance polyline."""
    if target_m <= cumulative_m[0]:
        return elevations[0]
    if target_m >= cumulative_m[-1]:
        return elevations[-1]

    lo, hi = 0, len(cumulative_m) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if cumulative_m[mid] <= target_m:
            lo = mid
        else:
            hi = mid

    span = cumulative_m[hi] - cumulative_m[lo]
    if span <= 0:
        return elevations[lo]
    fraction = (target_m - cumulative_m[lo]) / span
    return elevations[lo] + fraction * (elevations[hi] - elevations[lo])


def equivalent_flat_distance_from_totals(distance_km: float, elevation_gain_m: float) -> float:
    """Fallback course demand for races with no attached GPX.

    Approximates the whole course as one constant average grade (the total
    gain spread evenly over the total distance) — materially less accurate
    than ``equivalent_flat_distance_km`` since it has no segment structure
    and no descent data. Used only until a GPX is attached to the race.
    """
    if distance_km <= 0:
        raise ValueError("distance_km must be greater than 0")
    average_grade = (elevation_gain_m / 1000.0) / distance_km
    return round(distance_km * grade_cost_ratio(average_grade), 3)
