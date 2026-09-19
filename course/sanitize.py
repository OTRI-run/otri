"""Reduce an uploaded GPX to what OTRI uses before it is stored or served.

An uploaded file carries far more than a course: the recording device, the author's name and
links, timestamps (when somebody was where), heart rate and other extensions, waypoints, notes.
None of it enters a measurement, and some of it is personal data, so none of it is kept in the
file OTRI stores and hands out: the stored file is rebuilt from the parsed track points alone -
latitude, longitude, elevation, segment by segment.

Two things this is *not*:

- It is not a licence. Removing a notice from a file does not change who may publish the course;
  that is for the organizer who uploads it to answer (DATA_POLICY.md). Whatever the file said about
  its origin (creator, author, copyright, licence, links) is therefore *moved*, not destroyed:
  ``source_metadata`` returns it so the API can keep it with the race's private record, where a
  licence's attribution terms or a later dispute can be answered from.
- It does not change a measurement. Coordinates and elevations are written with ``repr``, which
  round-trips every float exactly, so the sanitized file measures bit-identically to the upload.
"""

from __future__ import annotations

from itertools import groupby
from xml.sax.saxutils import escape

from defusedxml import ElementTree as SafeElementTree

from .gpx import TrackPoint, _tag_namespace, parse_track_points

_HEADER = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<gpx version="1.1" creator="OTRI" xmlns="http://www.topografix.com/GPX/1/1">\n'
)


# What a file written by `sanitized_gpx` starts with: how a stored file is known to be one.
SANITIZED_HEADER = _HEADER


def sanitized_gpx(points: list[TrackPoint], name: str | None = None) -> str:
    """A minimal GPX 1.1 document holding only these points' positions and elevations."""
    lines = [_HEADER, "  <trk>\n"]
    if name:
        lines.append(f"    <name>{escape(name[:200])}</name>\n")
    for _, segment in groupby(points, key=lambda point: point.segment_id):
        lines.append("    <trkseg>\n")
        for point in segment:
            if point.elevation_m is None:
                lines.append(f'      <trkpt lat="{point.lat!r}" lon="{point.lon!r}"/>\n')
            else:
                lines.append(f'      <trkpt lat="{point.lat!r}" lon="{point.lon!r}"><ele>{point.elevation_m!r}</ele></trkpt>\n')
        lines.append("    </trkseg>\n")
    lines.append("  </trk>\n</gpx>\n")
    return "".join(lines)


def sanitize_gpx(gpx_text: str, name: str | None = None) -> str:
    """Parse (with every check ``parse_track_points`` applies) and rebuild. Raises GpxParseError."""
    return sanitized_gpx(parse_track_points(gpx_text), name)


def _text(element, path: str) -> str | None:
    found = element.find(path) if element is not None else None
    value = (found.text or "").strip() if found is not None else ""
    return value[:300] or None


def source_metadata(gpx_text: str) -> dict:
    """What the uploaded file said about where it came from. Kept privately with the race; never
    served. Call after the text has parsed once (it is assumed well-formed here)."""
    root = SafeElementTree.fromstring(gpx_text)
    ns = _tag_namespace(root.tag)
    metadata = root.find(f"{ns}metadata")
    # GPX 1.0 keeps these directly under <gpx>.
    holder = metadata if metadata is not None else root
    copyright_element = holder.find(f"{ns}copyright")
    found = {
        "creator": (root.get("creator") or "").strip()[:300] or None,
        "name": _text(holder, f"{ns}name") or _text(root, f"{ns}trk/{ns}name"),
        "author": _text(holder, f"{ns}author/{ns}name") or _text(holder, f"{ns}author"),  # 1.1 nests the name; 1.0 is plain text
        "copyright_holder": (copyright_element.get("author") or "").strip()[:300] or None if copyright_element is not None else None,
        "copyright_year": _text(copyright_element, f"{ns}year"),
        "license": _text(copyright_element, f"{ns}license"),
        "links": [link.get("href", "")[:500] for link in root.iter(f"{ns}link") if link.get("href")][:10] or None,
    }
    return {key: value for key, value in found.items() if value}
