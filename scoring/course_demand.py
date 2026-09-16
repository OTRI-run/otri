"""Course-demand engine — implements OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md exactly.

Converts a GPX course into a single "course demand" coordinate (an OTRI
modeled demand-equivalent distance, not a literal energy measurement — see
the spec's section 4) by integrating a published gradient-dependent
running-cost polynomial over fixed-length course segments. This module is
pure course processing: it never reads a finish time, a result, or another
runner's data (spec section 2's "explicit exclusions").

Deviation from the spec, clearly scoped: the spec treats "missing GPX" as a
hard input-validation failure (section 23). This codebase additionally lets
an organizer create a race distance *before* attaching a GPX (see
`api/db.py`'s GPX-attach-after-creation workflow) — for that bridging case
only, `equivalent_flat_distance_from_totals` provides a coarser,
non-spec fallback so such a race can still be scored provisionally.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

from course.features import haversine_m
from course.gpx import TrackPoint

# Minetti et al. 2002's fifth-order polynomial for the metabolic cost of
# running at a given gradient, in J/kg/m — measured over slopes from
# approximately -45% to +45%. `g` is a decimal grade (0.10 == +10%).
# Source: Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. "Energy cost of
# walking and running at extreme uphill and downhill slopes." Journal of
# Applied Physiology. 2002;93(3):1039-1046.
MIN_GRADE = -0.45
MAX_GRADE = 0.45

# Fixed target segment length (spec section 9: "During research, compare
# 10 m, 20 m, and 50 m for stability before selecting a standard"). 50 m
# chosen over the spec's own 20 m suggestion: at 20 m, short (~20-30 m) but
# genuinely real technical trail descents (e.g. rocky jungle sections) can
# average out to just past the Minetti polynomial's evidenced +/-45% domain
# on real GPX data, even after correct elevation denoising — 50 m keeps the
# segment integral responsive to real course structure while smoothing over
# single short pitches that shouldn't individually decide a hard failure.
SEGMENT_LENGTH_M = 50.0

# Elevation-denoising pipeline parameters (spec section 8: "remove non-finite
# values -> remove obvious isolated spikes -> rolling median -> rolling
# mean"). Fixed model parameters, recorded here and never tuned per race.
#
# The rolling median/mean windows are defined in physical distance (metres),
# not point count: real GPX tracks are often very unevenly sampled (dense on
# curves, sparse on straights — gaps from ~1 m to 100+ m are common even
# within a single file), so a fixed-point-count window would average
# together readings spanning wildly different physical distances and could
# distort the elevation profile rather than denoise it.
SPIKE_THRESHOLD_M = 50.0
ELEVATION_SMOOTHING_RADIUS_M = 10.0


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
        }


def _remove_invalid_coordinates(points: list[TrackPoint]) -> list[TrackPoint]:
    return [point for point in points if -90.0 <= point.lat <= 90.0 and -180.0 <= point.lon <= 180.0]


def _remove_consecutive_duplicates(points: list[TrackPoint]) -> list[TrackPoint]:
    if not points:
        return points
    cleaned = [points[0]]
    for point in points[1:]:
        previous = cleaned[-1]
        if point.lat == previous.lat and point.lon == previous.lon:
            continue
        cleaned.append(point)
    return cleaned


def _interpolate_missing(values: list[float | None]) -> list[float]:
    """Fill None/non-finite gaps by interpolating between the nearest known values."""
    known_indices = [i for i, v in enumerate(values) if v is not None and math.isfinite(v)]
    if not known_indices:
        return [0.0] * len(values)

    result: list[float] = list(values)  # type: ignore[assignment]
    for i, value in enumerate(values):
        if value is not None and math.isfinite(value):
            continue
        before = max((k for k in known_indices if k < i), default=None)
        after = min((k for k in known_indices if k > i), default=None)
        if before is None:
            result[i] = values[after]
        elif after is None:
            result[i] = values[before]
        else:
            fraction = (i - before) / (after - before)
            result[i] = values[before] + fraction * (values[after] - values[before])
    return result


def _remove_isolated_spikes(values: list[float]) -> list[float]:
    """A point differing from BOTH immediate neighbours by more than SPIKE_THRESHOLD_M is
    replaced with their average — a single obviously-bad elevation reading, not real terrain."""
    despiked = list(values)
    for i in range(1, len(values) - 1):
        left, mid, right = values[i - 1], values[i], values[i + 1]
        if abs(mid - left) > SPIKE_THRESHOLD_M and abs(mid - right) > SPIKE_THRESHOLD_M:
            despiked[i] = (left + right) / 2.0
    return despiked


def _rolling_median(cumulative_m: list[float], values: list[float], radius_m: float) -> list[float]:
    """Rolling median over a +/-radius_m physical-distance window (not a fixed point count) --
    real GPX track points are often very unevenly spaced (dense on curves, sparse on straights),
    so an index-based window would mix together readings from wildly different physical
    distances and distort the result."""
    n = len(values)
    smoothed = []
    lo = hi = 0
    for i in range(n):
        while lo < i and cumulative_m[i] - cumulative_m[lo] > radius_m:
            lo += 1
        if hi < i:
            hi = i
        while hi < n - 1 and cumulative_m[hi + 1] - cumulative_m[i] <= radius_m:
            hi += 1
        smoothed.append(statistics.median(values[lo : hi + 1]))
    return smoothed


def _rolling_mean(cumulative_m: list[float], values: list[float], radius_m: float) -> list[float]:
    """Rolling mean over a +/-radius_m physical-distance window — see `_rolling_median`."""
    n = len(values)
    smoothed = []
    lo = hi = 0
    for i in range(n):
        while lo < i and cumulative_m[i] - cumulative_m[lo] > radius_m:
            lo += 1
        if hi < i:
            hi = i
        while hi < n - 1 and cumulative_m[hi + 1] - cumulative_m[i] <= radius_m:
            hi += 1
        windowed = values[lo : hi + 1]
        smoothed.append(sum(windowed) / len(windowed))
    return smoothed


def _clean_elevations(cumulative_m: list[float], raw_elevations: list[float | None]) -> list[float]:
    """Spec section 8's fixed denoising pipeline, applied in order."""
    values = _interpolate_missing(raw_elevations)
    values = _remove_isolated_spikes(values)
    values = _rolling_median(cumulative_m, values, ELEVATION_SMOOTHING_RADIUS_M)
    values = _rolling_mean(cumulative_m, values, ELEVATION_SMOOTHING_RADIUS_M)
    return values


def _interpolate_at(cumulative_m: list[float], values: list[float], target_m: float) -> float:
    """Linear interpolation of `values` at `target_m` along the cumulative-distance polyline."""
    if target_m <= cumulative_m[0]:
        return values[0]
    if target_m >= cumulative_m[-1]:
        return values[-1]

    lo, hi = 0, len(cumulative_m) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if cumulative_m[mid] <= target_m:
            lo = mid
        else:
            hi = mid

    span = cumulative_m[hi] - cumulative_m[lo]
    if span <= 0:
        return values[lo]
    fraction = (target_m - cumulative_m[lo]) / span
    return values[lo] + fraction * (values[hi] - values[lo])


def _segment_boundaries(total_m: float) -> list[float]:
    """Fixed SEGMENT_LENGTH_M segments, retaining the final remainder rather than dropping or
    stretching it to fit evenly (spec section 9)."""
    boundaries = []
    distance = 0.0
    while distance < total_m:
        boundaries.append(distance)
        distance += SEGMENT_LENGTH_M
    boundaries.append(total_m)
    return boundaries


def compute_course_demand(points: list[TrackPoint]) -> CourseDemand:
    """Deterministic GPX -> course-demand pipeline (spec section 6)."""
    points = _remove_invalid_coordinates(points)
    points = _remove_consecutive_duplicates(points)
    if len(points) < 2:
        raise ValueError("at least 2 valid track points are required")

    cumulative_m = [0.0]
    for previous, current in zip(points, points[1:]):
        cumulative_m.append(cumulative_m[-1] + haversine_m(previous.lat, previous.lon, current.lat, current.lon))

    physical_distance_km = cumulative_m[-1] / 1000.0
    if physical_distance_km <= 0:
        raise ValueError("course has zero physical distance")

    raw_elevations = [point.elevation_m for point in points]
    cleaned_elevations = _clean_elevations(cumulative_m, raw_elevations)

    boundaries = _segment_boundaries(cumulative_m[-1])
    demand_km = 0.0
    elevation_gain_m = 0.0
    elevation_loss_m = 0.0
    minimum_grade = math.inf
    maximum_grade = -math.inf
    segment_count = 0
    quality_flags: list[str] = []

    for start_m, end_m in zip(boundaries, boundaries[1:]):
        segment_distance_m = end_m - start_m
        if segment_distance_m <= 0:
            continue
        elevation_start = _interpolate_at(cumulative_m, cleaned_elevations, start_m)
        elevation_end = _interpolate_at(cumulative_m, cleaned_elevations, end_m)
        elevation_change_m = elevation_end - elevation_start
        grade = elevation_change_m / segment_distance_m

        try:
            ratio = gradient_ratio(grade)
        except UnsupportedGradientError:
            clamped_grade = max(MIN_GRADE, min(MAX_GRADE, grade))
            ratio = gradient_ratio(clamped_grade)
            quality_flags.append(
                f"gradient_out_of_supported_domain: segment {start_m / 1000:.2f}-{end_m / 1000:.2f} km "
                f"(grade {grade:+.0%}, clamped to {clamped_grade:+.0%} for scoring)"
            )

        demand_km += (segment_distance_m / 1000.0) * ratio
        if elevation_change_m > 0:
            elevation_gain_m += elevation_change_m
        else:
            elevation_loss_m += -elevation_change_m
        minimum_grade = min(minimum_grade, grade)
        maximum_grade = max(maximum_grade, grade)
        segment_count += 1

    if segment_count == 0:
        raise ValueError("course has zero course demand")

    return CourseDemand(
        physical_distance_km=round(physical_distance_km, 3),
        course_demand_km=round(demand_km, 3),
        elevation_gain_m=round(elevation_gain_m, 1),
        elevation_loss_m=round(elevation_loss_m, 1),
        segment_count=segment_count,
        minimum_grade=round(minimum_grade, 4),
        maximum_grade=round(maximum_grade, 4),
        quality_flags=tuple(quality_flags),
    )


def equivalent_flat_distance_km(points: list[TrackPoint]) -> float:
    """The course-demand coordinate in kilometres — the primary entry point used by
    ``scoring.course_standard``. See ``compute_course_demand`` for full diagnostics."""
    return compute_course_demand(points).course_demand_km


def equivalent_flat_distance_from_totals(distance_km: float, elevation_gain_m: float) -> float:
    """Non-spec fallback for a race with no GPX attached yet (see module docstring):
    approximates the whole course as one constant average grade. Materially less accurate
    than ``equivalent_flat_distance_km`` — no segment structure, no descent data."""
    if distance_km <= 0:
        raise ValueError("distance_km must be greater than 0")
    average_grade = (elevation_gain_m / 1000.0) / distance_km
    return round(distance_km * gradient_ratio(average_grade), 3)
