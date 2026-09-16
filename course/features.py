"""Deterministic course-feature extraction from GPX track points.

These features feed directly into scoring, so per OTRI's transparency
principle they live in reviewable, documented OTRI code — not hidden inside a
third-party library (docs/roadmap.md Phase 2, METHODOLOGY.md §3).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .gpx import TrackPoint

_EARTH_RADIUS_M = 6_371_000.0

# An elevation change between two consecutive points smaller than this is
# treated as GPS/barometric noise rather than a real climb/descent, and is
# excluded from elevation_gain_m/elevation_loss_m. This is a simple per-segment
# filter, not an accumulating one — a known limitation to revisit once real
# GPX data is available to tune it (see course/README.md).
ELEVATION_NOISE_THRESHOLD_M = 1.0

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
    max_grade: float
    min_elevation_m: float | None
    max_elevation_m: float | None

    def to_dict(self) -> dict:
        return {
            "distance_km": self.distance_km,
            "elevation_gain_m": self.elevation_gain_m,
            "elevation_loss_m": self.elevation_loss_m,
            "steep_climb_distance_km": self.steep_climb_distance_km,
            "steep_descent_distance_km": self.steep_descent_distance_km,
            "max_grade": self.max_grade,
            "min_elevation_m": self.min_elevation_m,
            "max_elevation_m": self.max_elevation_m,
        }


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def extract_features(points: list[TrackPoint]) -> CourseFeatures:
    """Compute deterministic course-difficulty features from an ordered list of track points."""
    if len(points) < 2:
        raise ValueError("at least 2 track points are required to compute course features")

    distance_m = 0.0
    elevation_gain_m = 0.0
    elevation_loss_m = 0.0
    steep_climb_m = 0.0
    steep_descent_m = 0.0
    max_grade = 0.0
    elevations = [point.elevation_m for point in points if point.elevation_m is not None]

    for previous, current in zip(points, points[1:]):
        segment_m = _haversine_m(previous.lat, previous.lon, current.lat, current.lon)
        distance_m += segment_m

        if previous.elevation_m is None or current.elevation_m is None or segment_m == 0:
            continue

        delta = current.elevation_m - previous.elevation_m
        if abs(delta) < ELEVATION_NOISE_THRESHOLD_M:
            continue  # treat as GPS/barometric noise, not a real climb/descent

        grade = abs(delta) / segment_m
        max_grade = max(max_grade, grade)

        if delta > 0:
            elevation_gain_m += delta
            if grade >= STEEP_GRADE_THRESHOLD:
                steep_climb_m += segment_m
        else:
            elevation_loss_m += -delta
            if grade >= STEEP_GRADE_THRESHOLD:
                steep_descent_m += segment_m

    return CourseFeatures(
        distance_km=round(distance_m / 1000.0, 3),
        elevation_gain_m=round(elevation_gain_m, 1),
        elevation_loss_m=round(elevation_loss_m, 1),
        steep_climb_distance_km=round(steep_climb_m / 1000.0, 3),
        steep_descent_distance_km=round(steep_descent_m / 1000.0, 3),
        max_grade=round(max_grade, 4),
        min_elevation_m=round(min(elevations), 1) if elevations else None,
        max_elevation_m=round(max(elevations), 1) if elevations else None,
    )
