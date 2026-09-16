"""OTRI course model: GPX parsing and deterministic course-feature extraction.

See ``course/README.md`` for scope and known limitations.
"""

from .features import CourseFeatures, extract_features, haversine_m
from .gpx import GpxParseError, TrackPoint, parse_track_points, read_track_points

__all__ = [
    "CourseFeatures",
    "extract_features",
    "haversine_m",
    "GpxParseError",
    "TrackPoint",
    "parse_track_points",
    "read_track_points",
]
