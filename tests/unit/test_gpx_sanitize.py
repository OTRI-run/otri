"""Uploaded GPX files are reduced to positions and elevations before they are stored or served
(course/sanitize.py): no author, device, timestamps, extensions or waypoints. What the file said
about its origin is kept with the race's private record, and the measurement does not change."""

import gzip
import importlib
from pathlib import Path

import pytest

from course.gpx import GpxParseError, parse_track_points
from course.measurement import measure_course
from course.sanitize import sanitize_gpx, source_metadata
from test_api import _organizer_auth_headers, client

pytestmark = pytest.mark.usefixtures("clean_state")

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "gpx"

LOADED = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="WatchCo Forerunner 965" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>Somchai's long run</name>
    <author><name>Somchai Jaidee</name><link href="https://example.com/somchai"/></author>
    <copyright author="Trail Events Co., Ltd."><year>2026</year><license>https://example.com/terms</license></copyright>
    <link href="https://example.com/route/123"><text>Route 123</text></link>
    <time>2026-09-12T22:00:00Z</time>
  </metadata>
  <wpt lat="7.9700" lon="98.3400"><name>Somchai's house</name></wpt>
  <trk>
    <name>Morning &amp; hills</name>
    <desc>private note</desc>
    <trkseg>
      <trkpt lat="7.968575" lon="98.340647"><ele>20.69</ele><time>2026-09-12T22:00:00.000Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>151</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="7.968412" lon="98.341255"><ele>20.89</ele><time>2026-09-12T22:00:50.856Z</time></trkpt>
      <trkpt lat="7.9683770000000001" lon="98.341644"><time>2026-09-12T22:01:20Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="7.968100" lon="98.342000"><ele>25.125</ele></trkpt>
      <trkpt lat="7.967900" lon="98.342400"><ele>27.5</ele></trkpt>
    </trkseg>
  </trk>
</gpx>
"""

# The API measures what it stores, and a measurement needs an elevation on every point.
MEASURABLE = LOADED.replace('lon="98.341644"><time>', 'lon="98.341644"><ele>21.5</ele><time>')

PERSONAL = ("Somchai", "WatchCo", "Trail Events", "example.com", "2026-09-12", "151", "private note", "house", "Morning", "<time>", "<wpt", "extensions")


def test_only_positions_and_elevations_survive():
    clean = sanitize_gpx(LOADED)
    for fragment in PERSONAL:
        assert fragment not in clean, fragment
    assert 'creator="OTRI"' in clean
    before, after = parse_track_points(LOADED), parse_track_points(clean)
    assert [(p.lat, p.lon, p.elevation_m, p.segment_id) for p in after] == [(p.lat, p.lon, p.elevation_m, p.segment_id) for p in before]
    assert all(p.time is None for p in after)
    assert sanitize_gpx(clean) == clean, "sanitizing is idempotent"


def test_a_name_given_by_otri_is_escaped():
    assert "<name>Doi &amp; Dale &lt;50K&gt;</name>" in sanitize_gpx(LOADED, name="Doi & Dale <50K>")


@pytest.mark.parametrize("fixture", sorted(p.name for p in FIXTURES.glob("*.gpx")))
def test_the_sanitized_file_measures_identically(fixture):
    text = (FIXTURES / fixture).read_text(encoding="utf-8")
    original, cleaned = measure_course(parse_track_points(text)), measure_course(parse_track_points(sanitize_gpx(text)))
    assert cleaned.geometry_hash == original.geometry_hash
    assert (cleaned.distance_m, cleaned.gain_m, cleaned.loss_m) == (original.distance_m, original.gain_m, original.loss_m)
    assert cleaned.to_dict()["profile_hash"] == original.to_dict()["profile_hash"]


def test_a_bad_file_is_still_refused():
    with pytest.raises(GpxParseError):
        sanitize_gpx("<gpx><trk></trk></gpx>")
    with pytest.raises(GpxParseError):
        sanitize_gpx('<!DOCTYPE x [<!ENTITY a "b">]><gpx/>')


def test_what_the_file_said_about_its_origin_is_kept_aside():
    assert source_metadata(LOADED) == {
        "creator": "WatchCo Forerunner 965",
        "name": "Somchai's long run",
        "author": "Somchai Jaidee",
        "copyright_holder": "Trail Events Co., Ltd.",
        "copyright_year": "2026",
        "license": "https://example.com/terms",
        "links": ["https://example.com/somchai", "https://example.com/route/123"],
    }
    assert source_metadata('<gpx version="1.0"><author>Old Tool User</author><trk><name>T</name><trkseg/></trk></gpx>') == {"name": "T", "author": "Old Tool User"}
    assert source_metadata("<gpx><trk><trkseg/></trk></gpx>") == {}


def test_a_race_course_is_stored_and_served_clean_with_its_origin_kept_private():
    from api import db

    headers = _organizer_auth_headers()
    event = client.post("/events", json={"event_name": "Clean Trail", "event_date": "2026-07-01"}, headers=headers).json()
    race = client.post(f"/events/{event['event_id']}/races", json={"course_name": "5K", "distance_km": 5, "elevation_gain_m": 10}, headers=headers).json()
    attached = client.post(f"/races/{race['race_id']}/gpx", files={"file": ("somchai.gpx", MEASURABLE.encode(), "application/gpx+xml")}, headers=headers)
    assert attached.status_code == 200, attached.text

    served = client.get(f"/races/{race['race_id']}/gpx", headers=headers).text
    for fragment in PERSONAL:
        assert fragment not in served, fragment
    assert "<name>Clean Trail 5K</name>" in served

    public = client.get(f"/races/{race['race_id']}/measurement", headers=headers).json()
    assert "source_metadata" not in public and "snapshot" not in public
    assert public["raw_sha256"] != public["stored_sha256"]
    assert db.get_measurement(race["race_id"])["source_metadata"]["copyright_holder"] == "Trail Events Co., Ltd."


def test_a_shared_course_is_stored_clean(tmp_path, monkeypatch):
    api_module = importlib.import_module("api.app")
    monkeypatch.setattr(api_module, "_SHARED_COURSE_DIR", tmp_path)
    shared = client.post("/gpx/share", files={"file": ("somchai.gpx", MEASURABLE.encode(), "application/gpx+xml")})
    assert shared.status_code == 200, shared.text
    share_id = shared.json()["share_id"]
    on_disk = gzip.decompress((tmp_path / f"{share_id}.gpx.gz").read_bytes()).decode()
    served = client.get(f"/gpx/shared/{share_id}").text
    for fragment in PERSONAL:
        assert fragment not in on_disk and fragment not in served, fragment
    assert len(parse_track_points(served)) == 5
    # The same upload still resolves to the same link.
    assert client.post("/gpx/share", files={"file": ("again.gpx", MEASURABLE.encode(), "application/gpx+xml")}).json()["share_id"] == share_id
