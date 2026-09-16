"""Minimal, dependency-free GPX track reader.

Reads the ``trkpt`` points (lat/lon/elevation/time) needed for course-feature
extraction. This deliberately does not implement the full GPX schema
(routes, waypoints, extensions) — only what OTRI's course model needs. Kept
isolated in its own module so it can be swapped for a fuller library later
without touching ``features.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree


class GpxParseError(ValueError):
    """Raised when a file cannot be read as GPX track data."""


@dataclass(frozen=True)
class TrackPoint:
    lat: float
    lon: float
    elevation_m: float | None
    time: datetime | None


def read_track_points(path: str | Path) -> list[TrackPoint]:
    """Read every ``trkpt`` in file order from a GPX 1.0 or 1.1 track file."""
    path = Path(path)
    try:
        root = ElementTree.parse(path).getroot()
    except ElementTree.ParseError as error:
        raise GpxParseError(f"{path} is not well-formed XML: {error}") from error

    ns = _tag_namespace(root.tag)
    points = [_parse_trkpt(trkpt, ns) for trkpt in root.iter(f"{ns}trkpt")]

    if not points:
        raise GpxParseError(f"{path} contains no <trkpt> points")
    return points


def _tag_namespace(tag: str) -> str:
    """Return the '{namespace}' prefix (including braces) used by this document, or ''."""
    if tag.startswith("{"):
        return tag[: tag.index("}") + 1]
    return ""


def _parse_trkpt(element: ElementTree.Element, ns: str) -> TrackPoint:
    lat_raw = element.get("lat")
    lon_raw = element.get("lon")
    if lat_raw is None or lon_raw is None:
        raise GpxParseError("<trkpt> is missing a lat/lon attribute")

    ele_element = element.find(f"{ns}ele")
    elevation_m = float(ele_element.text) if ele_element is not None and ele_element.text else None

    time_element = element.find(f"{ns}time")
    time_value = _parse_time(time_element.text) if time_element is not None and time_element.text else None

    return TrackPoint(lat=float(lat_raw), lon=float(lon_raw), elevation_m=elevation_m, time=time_value)


def _parse_time(value: str) -> datetime:
    # GPX timestamps are ISO 8601, typically with a trailing 'Z'.
    return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
