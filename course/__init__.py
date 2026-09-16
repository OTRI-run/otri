"""OTRI course model: GPX parsing and deterministic course-feature extraction.

See ``course/README.md`` for scope and known limitations.
"""

from .features import CourseFeatures, extract_features
from .gpx import GpxParseError, TrackPoint, read_track_points

__all__ = [
    "CourseFeatures",
    "extract_features",
    "GpxParseError",
    "TrackPoint",
    "read_track_points",
]
