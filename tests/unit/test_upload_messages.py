"""What someone is told when their file cannot be measured or scored.

Every message is read by a person who uploaded a file and wants to know what to do next: it names
what the file is or what is wrong with it, says how to get one that works, and never shows a server
path or a parser's vocabulary.
"""

import gzip
import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from course import GpxParseError, parse_track_points, read_track_points

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)

EXAMPLES = Path(__file__).resolve().parents[2] / "public" / "examples"
GOOD_GPX = (EXAMPLES / "otri-example-course.gpx").read_bytes()
GOOD_RESULTS = (EXAMPLES / "otri-example-results.csv").read_bytes()


def _track(points):
    return ("<gpx version='1.1'><trk><trkseg>" + "".join(points) + "</trkseg></trk></gpx>").encode()


BAD_COURSES = {
    "empty": (b"", "The file is empty."),
    "prose": (b"hello, this is my course", "does not look like a GPX file"),
    "kml": (b"<?xml version='1.0'?><kml><Document/></kml>", "Google Earth KML file, not a GPX"),
    "tcx": (b"<?xml version='1.0'?><TrainingCenterDatabase/>", "Garmin TCX file, not a GPX"),
    "fit": (b"\x0e\x10\x00\x00\x00\x00\x00\x00.FIT" + bytes(100), "Garmin FIT file, not a GPX"),
    "gz": (gzip.compress(GOOD_GPX), "compressed (.gz) file"),
    "zip": (b"PK\x03\x04" + bytes(100), "zip archive"),
    "pdf": (b"%PDF-1.4 course map", "This is a PDF"),
    "waypoints only": (b"<gpx version='1.1'><wpt lat='18' lon='98'/><wpt lat='18.1' lon='98'/></gpx>", "only 2 waypoints (places, not a line)"),
    "one point": (_track(["<trkpt lat='18.72' lon='98.89'><ele>300</ele></trkpt>"]), "a single point"),
    "cut short": (GOOD_GPX[: len(GOOD_GPX) // 2], "damaged or incomplete"),
    "two tracks": (b"<gpx version='1.1'><trk><name>50K</name></trk><trk><name>25K</name></trk></gpx>", "holds 2 tracks (“50K”, “25K”)"),
    "start area only": (_track([f"<trkpt lat='{18.72 + i / 100000}' lon='98.89'><ele>300</ele></trkpt>" for i in range(20)]), "is only 21 m long"),
    "no elevation": (_track([f"<trkpt lat='{13.6 + i / 5000}' lon='100.48'/>" for i in range(400)]), "has no elevation"),
}


@pytest.mark.parametrize("name", BAD_COURSES)
def test_a_course_file_that_cannot_be_measured_says_what_it_is_and_what_to_do(name):
    data, expected = BAD_COURSES[name]
    answer = client.post("/gpx/analyze", files={"file": ("course.gpx", data, "application/gpx+xml")}, data={"finish_time_seconds": "9000"})
    assert answer.status_code == 422, answer.text
    detail = answer.json()["detail"]
    assert expected in detail, detail
    assert "\\" not in detail and "/tmp" not in detail and ".gpx:" not in detail, "no server path in a message"
    assert "trkpt" not in detail and "codec" not in detail and "root" not in detail, "no parser vocabulary"


def test_a_route_is_a_course_too():
    """Route planners write <rte>, not <trk>: refused before, measured now."""
    route = "<gpx version='1.1'><rte>" + "".join(f"<rtept lat='{18.7 + i / 1000}' lon='98.89'><ele>{300 + i}</ele></rtept>" for i in range(200)) + "</rte></gpx>"
    assert len(parse_track_points(route)) == 200
    answer = client.post("/gpx/analyze", files={"file": ("route.gpx", route.encode(), "application/gpx+xml")}, data={"finish_time_seconds": "9000"})
    assert answer.status_code == 200 and answer.json()["features"]["distance_km"] > 20
    with pytest.raises(GpxParseError, match="holds 2 routes and no track"):
        parse_track_points("<gpx version='1.1'><rte/><rte/></gpx>")


def test_a_course_saved_in_another_encoding_is_read(tmp_path):
    path = tmp_path / "utf16.gpx"
    path.write_bytes(GOOD_GPX.decode("utf-8").replace("UTF-8", "UTF-16").encode("utf-16"))
    assert len(read_track_points(path)) > 1000


def test_score_my_race_names_the_file_a_message_is_about():
    files = {"results": ("r.csv", GOOD_RESULTS, "text/csv"), "gpx": ("c.gpx", b"<kml/>", "application/gpx+xml")}
    assert client.post("/score", files=files).json()["detail"].startswith("course file: This is a Google Earth KML file")
    files = {"results": ("r.xlsx", b"Rank,Time\n1,4:00:00\n", "text/csv"), "gpx": ("c.gpx", GOOD_GPX, "application/gpx+xml")}
    detail = client.post("/score", files=files).json()["detail"]
    assert detail.startswith("results file: this file is named .xlsx but is not an Excel workbook")


def test_a_missing_column_is_said_once_not_once_per_row(tmp_path):
    from ingestion import validate_result_file

    path = tmp_path / "r.csv"
    path.write_text("Rank,Club\n1,Trail Club\n2,Hill Harriers\n", encoding="utf-8")
    messages = [error.message for error in validate_result_file(path).errors]
    assert len(messages) == 2 and messages[0].startswith("no name column found") and messages[1].startswith("no finish time column found")
