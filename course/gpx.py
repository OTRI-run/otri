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
import re
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


def decode_gpx(data: bytes) -> str:
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
    return parse_track_points(decode_gpx(data))


_OTHER_FORMATS = {
    "kml": "a Google Earth KML file",
    "trainingcenterdatabase": "a Garmin TCX file",
    "html": "a web page (the download may have saved the page instead of the file)",
}


MAX_TAGS = 3_000_000


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
    # Parsing costs by the tag, not by the point, and anyone may upload: 19 MB of empty elements
    # around two points took three seconds to read. Counting "<" takes a millisecond. The fullest
    # real file, 100,000 points each with elevation, time and a watch's heart rate, cadence and
    # temperature, has under two million.
    if max(gpx_text.count('<trkpt'), gpx_text.count('<rtept')) > 100_000:  # said before the file is parsed, not after
        raise GpxParseError('The GPX has more than 100,000 points. Export it with fewer points (one every 5 to 10 m is plenty) and upload that.')
    if gpx_text.count('<') > MAX_TAGS:
        raise GpxParseError('The GPX holds far more markup than a course of 100,000 points needs. Export the course again, as a plain GPX track, and upload that.')
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
    # Every element is looked at once. A segment's points are its own children, as the GPX schema
    # has them. This used to take every `trkseg` at any depth and walk the whole subtree of each:
    # with segments nested inside each other (which no program writes and the schema forbids) a
    # point was read once per segment around it, so 400 KB with two points in it cost two seconds,
    # the cost grew with the square of the file, and the two points came back as 48,000.
    segments = [segment for track in tracks for segment in track.findall(f'{ns}trkseg')]
    if sum(1 for _ in root.iter(f'{ns}trkseg')) != len(segments):
        raise GpxParseError("This GPX has track segments in the wrong place (inside each other, or outside the track): it was not written by a program that exports courses. Export the course again and upload that.")
    points = []
    try:
        # No segments at all: some exporters put the points straight into the track. One walk.
        for segment_id, children in enumerate([segment.findall(f'{ns}trkpt') for segment in segments] or [root.iter(f'{ns}trkpt')]):
            for element in children:
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
        raise GpxParseError(f'The GPX has a point that cannot be read ({_short(str(error), 120)}). Export the course again and upload that.') from error

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


# Elevation on Earth runs from about -430 m to 8,849 m. Files carry worse than that (-32768 is
# what some devices write for "no reading"), and those are left alone to be flagged further down.
# What is refused is a number that is not an elevation at all: past this the arithmetic that
# smooths the profile overflows to infinity and comes back as NaN, which is not a number JSON can
# carry, so the answer became a 500.
MAX_ABS_ELEVATION_M = 100_000

# What a number in a GPX may look like. `float()` on its own also takes "4_6.0", " +46.0 " and
# Arabic-Indic digits, each of which measures a different course than the one in the file.
_NUMBER = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\Z", re.ASCII)


def _short(value: str, limit: int = 60) -> str:
    """A value from the file, cut to a length that is safe to put in a message back to whoever
    sent it. Without this the message is as long as the file, and the answer six times longer."""
    value = " ".join(str(value).split())
    return value if len(value) <= limit else value[:limit] + "..."


def _number(raw: str, what: str) -> float:
    if not _NUMBER.match(raw.strip()):
        raise GpxParseError(f'a point has {what} that is not a plain number ("{_short(raw)}")')
    return float(raw)


def _parse_trkpt(element: ElementTree.Element, ns: str) -> TrackPoint:
    lat_raw = element.get("lat")
    lon_raw = element.get("lon")
    if lat_raw is None or lon_raw is None:
        raise GpxParseError("a point has no latitude or longitude")

    ele_element = element.find(f"{ns}ele")
    elevation_m = _number(ele_element.text, "an elevation") if ele_element is not None and ele_element.text else None

    time_element = element.find(f"{ns}time")
    time_value = _parse_time(time_element.text) if time_element is not None and time_element.text else None

    lat, lon = _number(lat_raw, "a latitude"), _number(lon_raw, "a longitude")
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise GpxParseError('a point lies outside the Earth (latitude beyond 90 or longitude beyond 180)')
    if elevation_m is not None and (not math.isfinite(elevation_m) or abs(elevation_m) > MAX_ABS_ELEVATION_M):
        raise GpxParseError(f'a point has an elevation that is not one ({_short(str(elevation_m))} m)')
    return TrackPoint(lat=lat, lon=lon, elevation_m=elevation_m, time=time_value)


def _parse_time(value: str) -> datetime:
    # GPX timestamps are ISO 8601, typically with a trailing 'Z'. Only a trailing one: replacing
    # every Z in the string made a value of Zs six times longer than itself, and the message that
    # reported it carried the whole of that back to the sender.
    value = value.strip()
    if value.endswith(("Z", "z")):
        value = value[:-1] + "+00:00"
    if len(value) > 64:
        raise GpxParseError(f'a point has a time that cannot be read ("{_short(value)}")')
    return datetime.fromisoformat(value)
