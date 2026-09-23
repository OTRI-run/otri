"""Deterministic course-feature extraction from GPX track points.

These features feed directly into scoring, so per OTRI's transparency
principle they live in reviewable, documented OTRI code — not hidden inside a
third-party library (HANDBOOK.md, "Scoring philosophy").
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .gpx import TrackPoint

_EARTH_RADIUS_M = 6_371_000.0

# A single-segment elevation change smaller than this is treated as GPS/
# barometric/DEM noise and excluded from max_grade / steep-climb / steep-descent.
# For elevation_gain_m/elevation_loss_m, this threshold is applied with
# hysteresis instead (see _commit_run below): consecutive same-direction
# deltas are accumulated into one "run" and only counted once that run's net
# change clears the threshold, so small jitter *within* a sustained climb
# doesn't get discarded as if the climb never happened. This is closer to how
# other GPS platforms (Strava, Garmin, Mapbox) smooth elevation.
#
# 8 m (not 1 m) because real device/DEM-derived elevation is noisier per point
# than a synthetic fixture: tuned against a real 14.6 km course file where a
# 1 m threshold produced ~780/782 m gain/loss, but Garmin/Coros/Mapbox agreed
# on ~626-640 m for the same course — 8 m landed within a few meters of that
# (see course/README.md).
ELEVATION_NOISE_THRESHOLD_M = 8.0

# A segment's grade at or above this is counted towards the steep-climb /
# steep-descent distance metrics.
STEEP_GRADE_THRESHOLD = 0.15  # 15%


@dataclass(frozen=True)
class CourseFeatures:
    distance_km: float
    elevation_gain_m: float
    elevation_loss_m: float
    steep_climb_distance_km: float
    steep_descent_distance_km: float
    max_climb_grade: float | None
    max_descent_grade: float | None
    min_elevation_m: float | None
    max_elevation_m: float | None

    def to_dict(self) -> dict:
        return {
            "distance_km": self.distance_km,
            "elevation_gain_m": self.elevation_gain_m,
            "elevation_loss_m": self.elevation_loss_m,
            "steep_climb_distance_km": self.steep_climb_distance_km,
            "steep_descent_distance_km": self.steep_descent_distance_km,
            "max_climb_grade": self.max_climb_grade,
            "max_descent_grade": self.max_descent_grade,
            "min_elevation_m": self.min_elevation_m,
            "max_elevation_m": self.max_elevation_m,
        }


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def extract_features_legacy(points: list[TrackPoint]) -> CourseFeatures:
    """Compute deterministic course-difficulty features from an ordered list of track points."""
    if len(points) < 2:
        raise ValueError("at least 2 track points are required to compute course features")

    distance_m = 0.0
    steep_climb_m = 0.0
    steep_descent_m = 0.0
    elevations = [point.elevation_m for point in points if point.elevation_m is not None]

    # Elevation gain/loss/grade via a "prominence" state machine: track the
    # running extreme (peak while climbing, valley while descending) and only
    # commit it as a confirmed climb/descent once elevation reverses from that
    # extreme by at least ELEVATION_NOISE_THRESHOLD_M. Crucially, every
    # elevation reading eventually ends up in gain or loss — nothing is ever
    # silently discarded — so gain - loss always equals the net elevation
    # change end-to-end. A naive "discard any sub-threshold run" filter (the
    # previous approach here) breaks that identity a little on every discarded
    # run, and those small biases can add up to tens of meters of gain/loss
    # drift on a real course, even a loop where start and finish elevation
    # are the same (see course/README.md).
    #
    # max_climb_grade / max_descent_grade are each run's net elevation change
    # divided by the distance covered *during that run* (not a single noisy
    # segment) — a steepest-sustained-grade figure, not a steepest-single-point
    # spike, which is what other pacing/course tools (e.g. ultraPacer) show.
    elevation_gain_m = 0.0
    elevation_loss_m = 0.0
    max_climb_grade = 0.0
    max_descent_grade = 0.0
    last_committed = elevations[0] if elevations else None
    extreme = last_committed
    direction = 0  # 0 = undetermined yet, 1 = climbing, -1 = descending
    distance_since_committed = 0.0  # path distance from last_committed's point to the current point
    distance_at_extreme = 0.0  # path distance from last_committed's point to the extreme's point

    for previous, current in zip(points, points[1:]):
        segment_m = haversine_m(previous.lat, previous.lon, current.lat, current.lon)
        distance_m += segment_m

        if previous.elevation_m is None or current.elevation_m is None or segment_m == 0:
            continue

        delta = current.elevation_m - previous.elevation_m
        if abs(delta) >= ELEVATION_NOISE_THRESHOLD_M:
            grade = abs(delta) / segment_m
            if grade >= STEEP_GRADE_THRESHOLD:
                if delta > 0:
                    steep_climb_m += segment_m
                else:
                    steep_descent_m += segment_m

        elevation = current.elevation_m
        distance_since_committed += segment_m

        if direction == 0:
            if elevation > extreme:
                direction, extreme, distance_at_extreme = 1, elevation, distance_since_committed
            elif elevation < extreme:
                direction, extreme, distance_at_extreme = -1, elevation, distance_since_committed
        elif direction == 1:
            if elevation >= extreme:
                extreme, distance_at_extreme = elevation, distance_since_committed
            elif extreme - elevation >= ELEVATION_NOISE_THRESHOLD_M:
                elevation_gain_m += extreme - last_committed
                if distance_at_extreme > 0:
                    max_climb_grade = max(max_climb_grade, (extreme - last_committed) / distance_at_extreme)
                leftover = distance_since_committed - distance_at_extreme
                last_committed, direction, extreme = extreme, -1, elevation
                distance_since_committed = distance_at_extreme = leftover
        else:
            if elevation <= extreme:
                extreme, distance_at_extreme = elevation, distance_since_committed
            elif elevation - extreme >= ELEVATION_NOISE_THRESHOLD_M:
                elevation_loss_m += last_committed - extreme
                if distance_at_extreme > 0:
                    max_descent_grade = max(max_descent_grade, (last_committed - extreme) / distance_at_extreme)
                leftover = distance_since_committed - distance_at_extreme
                last_committed, direction, extreme = extreme, 1, elevation
                distance_since_committed = distance_at_extreme = leftover

    if direction == 1:
        elevation_gain_m += extreme - last_committed
        if distance_at_extreme > 0:
            max_climb_grade = max(max_climb_grade, (extreme - last_committed) / distance_at_extreme)
    elif direction == -1:
        elevation_loss_m += last_committed - extreme
        if distance_at_extreme > 0:
            max_descent_grade = max(max_descent_grade, (last_committed - extreme) / distance_at_extreme)

    return CourseFeatures(
        distance_km=round(distance_m / 1000.0, 3),
        elevation_gain_m=round(elevation_gain_m, 1),
        elevation_loss_m=round(elevation_loss_m, 1),
        steep_climb_distance_km=round(steep_climb_m / 1000.0, 3),
        steep_descent_distance_km=round(steep_descent_m / 1000.0, 3),
        max_climb_grade=round(max_climb_grade, 4),
        max_descent_grade=round(max_descent_grade, 4),
        min_elevation_m=round(min(elevations), 1) if elevations else None,
        max_elevation_m=round(max(elevations), 1) if elevations else None,
    )


def features_from_measurement(measurement) -> CourseFeatures:
    m = measurement
    return CourseFeatures(
        distance_km=round(m.distance_m / 1000, 3),
        elevation_gain_m=round(m.gain_m, 1), elevation_loss_m=round(m.loss_m, 1),
        steep_climb_distance_km=round(m.steep_climb_m / 1000, 3),
        steep_descent_distance_km=round(m.steep_descent_m / 1000, 3),
        max_climb_grade=round(m.max_climb_grade, 4) if m.max_climb_grade is not None else None,
        max_descent_grade=round(m.max_descent_grade, 4) if m.max_descent_grade is not None else None,
        min_elevation_m=round(m.min_elevation_m, 1), max_elevation_m=round(m.max_elevation_m, 1),
    )


def extract_features(points: list[TrackPoint]) -> CourseFeatures:
    from .measurement import measure_course
    from .elevation import configured_provider
    return features_from_measurement(measure_course(points, configured_provider()))
