"""Minimal, dependency-free GPX track reader.

Reads the ``trkpt`` points (lat/lon/elevation/time) needed for course-feature
extraction. This deliberately does not implement the full GPX schema
(routes, waypoints, extensions) — only what OTRI's course model needs. Kept
isolated in its own module so it can be swapped for a fuller library later
without touching ``features.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
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
    segment_id: int = 0


def read_track_points(path: str | Path) -> list[TrackPoint]:
    """Read every ``trkpt`` in file order from a GPX 1.0 or 1.1 track file."""
    path = Path(path)
    try:
        gpx_text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise GpxParseError(f"could not read {path}: {error}") from error
    try:
        return parse_track_points(gpx_text)
    except GpxParseError as error:
        raise GpxParseError(f"{path}: {error}") from error


def parse_track_points(gpx_text: str) -> list[TrackPoint]:
    """Read every ``trkpt`` in document order from raw GPX 1.0/1.1 XML text.

    Used for GPX already held in memory (e.g. a race's stored ``gpx_content``)
    without round-tripping through a temp file — see ``read_track_points`` for
    the file-based equivalent.
    """
    if len(gpx_text.encode('utf-8')) > 20_000_000:
        raise GpxParseError('GPX exceeds the 20 MB limit')
    if '<!DOCTYPE' in gpx_text.upper() or '<!ENTITY' in gpx_text.upper():
        raise GpxParseError('GPX must not contain DTD or entity declarations')
    try:
        root = ElementTree.fromstring(gpx_text)
    except ElementTree.ParseError as error:
        raise GpxParseError(f"not well-formed XML: {error}") from error

    ns = _tag_namespace(root.tag)
    if root.tag != f'{ns}gpx':
        raise GpxParseError('document root must be gpx')
    tracks = list(root.findall(f'{ns}trk'))
    if len(tracks) > 1:
        raise GpxParseError('select a single track before uploading')
    segments = list(root.iter(f'{ns}trkseg'))
    if not segments:
        segments = [root]
    points = []
    try:
        for segment_id, segment in enumerate(segments):
            for element in segment.iter(f'{ns}trkpt'):
                point = _parse_trkpt(element, ns)
                points.append(TrackPoint(point.lat, point.lon, point.elevation_m, point.time, segment_id))
                if len(points) > 100_000:
                    raise GpxParseError('GPX exceeds the 100,000 point limit')
    except (ValueError, OverflowError) as error:
        raise GpxParseError(f'invalid track point: {error}') from error

    if not points:
        raise GpxParseError("contains no <trkpt> points")
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

    lat, lon = float(lat_raw), float(lon_raw)
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise GpxParseError('latitude/longitude must be finite and in range')
    if elevation_m is not None and not math.isfinite(elevation_m):
        raise GpxParseError('elevation must be finite or omitted')
    return TrackPoint(lat=lat, lon=lon, elevation_m=elevation_m, time=time_value)


def _parse_time(value: str) -> datetime:
    # GPX timestamps are ISO 8601, typically with a trailing 'Z'.
    return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
