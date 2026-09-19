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
from xml.etree import ElementTree  # element types only; parsing goes through defusedxml
from defusedxml import ElementTree as SafeElementTree
from defusedxml import DefusedXmlException


class GpxParseError(ValueError):
    """Raised when a file cannot be read as GPX track data."""


@dataclass(frozen=True)
class TrackPoint:
    lat: float
    lon: float
    elevation_m: float | None
    time: datetime | None
    segment_id: int = 0


# Every message below is read by someone who uploaded a file and wants to know what to do next: it
# says what the file is or what is wrong with it, and how to get a file that works. No paths, no
# parser vocabulary.
_HOW_TO_GET_GPX = "Export the course as GPX (from the organizer's website, or a watch or route-planning app) and upload that."


def _decode_gpx(data: bytes) -> str:
    """The text of an uploaded course file, or a message naming what it is instead."""
    if not data.strip():
        raise GpxParseError("The file is empty.")
    if data[:2] == b"\x1f\x8b":
        raise GpxParseError("This is a compressed (.gz) file. Unpack it and upload the .gpx inside.")
    if data[:2] == b"PK":
        raise GpxParseError("This is a zip archive (a .zip or a Google Earth .kmz), not a GPX. Unpack it, or export the course as GPX, and upload that.")
    if data[8:12] == b".FIT":
        raise GpxParseError(f"This is a Garmin FIT file, not a GPX. {_HOW_TO_GET_GPX}")
    if data[:4] == b"%PDF":
        raise GpxParseError(f"This is a PDF, not a GPX. {_HOW_TO_GET_GPX}")
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeError:
            continue
    if b"<gpx" in data[:2000]:
        return data.decode("latin-1")
    raise GpxParseError(f"This does not look like a GPX file (it is not text). {_HOW_TO_GET_GPX}")


def read_track_points(path: str | Path) -> list[TrackPoint]:
    """Read every ``trkpt`` in file order from a GPX 1.0 or 1.1 track file."""
    path = Path(path)
    try:
        data = path.read_bytes()
    except OSError as error:
        raise GpxParseError("The course file could not be read. Try uploading it again.") from error
    return parse_track_points(_decode_gpx(data))


_OTHER_FORMATS = {
    "kml": "a Google Earth KML file",
    "trainingcenterdatabase": "a Garmin TCX file",
    "html": "a web page (the download may have saved the page instead of the file)",
}


def parse_track_points(gpx_text: str) -> list[TrackPoint]:
    """Read every ``trkpt`` in document order from raw GPX 1.0/1.1 XML text.

    Used for GPX already held in memory (e.g. a race's stored ``gpx_content``)
    without round-tripping through a temp file — see ``read_track_points`` for
    the file-based equivalent. A file that holds a route (``rtept``, what route planners export)
    and no track is read as the course too.
    """
    if len(gpx_text.encode('utf-8')) > 20_000_000:
        raise GpxParseError('The GPX is larger than 20 MB. Export it with fewer points (one every 5 to 10 m is plenty) and upload that.')
    if '<!DOCTYPE' in gpx_text.upper() or '<!ENTITY' in gpx_text.upper():
        raise GpxParseError('GPX must not contain DTD or entity declarations')
    try:
        root = SafeElementTree.fromstring(gpx_text)
    except (ElementTree.ParseError, DefusedXmlException) as error:  # malformed, or an entity/DTD trick
        if "<gpx" not in gpx_text[:5000].lower():
            raise GpxParseError(f"This does not look like a GPX file. {_HOW_TO_GET_GPX}") from error
        raise GpxParseError(f"The GPX is damaged or incomplete ({error}): the download or export may have been cut short. Export it again and upload that.") from error

    ns = _tag_namespace(root.tag)
    if root.tag != f'{ns}gpx':
        kind = _OTHER_FORMATS.get(root.tag.removeprefix(ns).lower(), "not a GPX")
        raise GpxParseError(f"This is {kind}, not a GPX. {_HOW_TO_GET_GPX}")
    tracks = list(root.findall(f'{ns}trk'))
    if len(tracks) > 1:
        names = [(track.findtext(f'{ns}name') or '').strip() for track in tracks]
        listed = ", ".join(f"“{name}”" for name in names[:5] if name)
        raise GpxParseError(f"This GPX holds {len(tracks)} tracks{f' ({listed})' if listed else ''}. Export the race course on its own, one track, and upload that.")
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
                    raise GpxParseError('The GPX has more than 100,000 points. Export it with fewer points (one every 5 to 10 m is plenty) and upload that.')
        if not points:
            # A route: what a route planner writes. One route is a course like any other; its points
            # are often far apart, which the measurement says in its own flags.
            routes = list(root.findall(f'{ns}rte'))
            if len(routes) > 1:
                raise GpxParseError(f"This GPX holds {len(routes)} routes and no track. Export the race course on its own and upload that.")
            for element in root.iter(f'{ns}rtept'):
                point = _parse_trkpt(element, ns)
                points.append(TrackPoint(point.lat, point.lon, point.elevation_m, point.time, 0))
                if len(points) > 100_000:
                    raise GpxParseError('The GPX has more than 100,000 points. Export it with fewer points (one every 5 to 10 m is plenty) and upload that.')
    except (ValueError, OverflowError) as error:
        if isinstance(error, GpxParseError):
            raise
        raise GpxParseError(f'The GPX has a point that cannot be read ({error}). Export the course again and upload that.') from error

    if not points:
        waypoints = len(list(root.iter(f'{ns}wpt')))
        what = f"only {waypoints} waypoint{'s' if waypoints != 1 else ''} (places, not a line)" if waypoints else "no track"
        raise GpxParseError(f"This GPX has {what}: there is no course in it to measure. Export the track of the race and upload that.")
    if len(points) < 2:
        raise GpxParseError("This GPX has a single point: there is no course in it to measure. Export the track of the race and upload that.")
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
        raise GpxParseError("a point has no latitude or longitude")

    ele_element = element.find(f"{ns}ele")
    elevation_m = float(ele_element.text) if ele_element is not None and ele_element.text else None

    time_element = element.find(f"{ns}time")
    time_value = _parse_time(time_element.text) if time_element is not None and time_element.text else None

    lat, lon = float(lat_raw), float(lon_raw)
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise GpxParseError('a point lies outside the Earth (latitude beyond 90 or longitude beyond 180)')
    if elevation_m is not None and not math.isfinite(elevation_m):
        raise GpxParseError('a point has an elevation that is not a number')
    return TrackPoint(lat=lat, lon=lon, elevation_m=elevation_m, time=time_value)


def _parse_time(value: str) -> datetime:
    # GPX timestamps are ISO 8601, typically with a trailing 'Z'.
    return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
