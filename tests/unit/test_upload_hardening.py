"""What anybody may upload without an account: a GPX and a results file.

The rule most of these are about: a value that came out of the file must never go back out in a
message at its own length. One `<time>` of nineteen million Z characters answered with a hundred
and fourteen megabytes, because the message carried the whole offending string and the replace
that normalises a trailing Z had run on every one of them.

The files here are small. Each one is the shape of the attack, not its size; the sizes that made
the point are in the commit that fixed them.
"""

from __future__ import annotations

import json
import zipfile

import pytest

from course.gpx import GpxParseError, parse_track_points
from course.measurement import measure_course
from ingestion.reader import read_table
from ingestion.validate import validate_result_file

MESSAGE_LIMIT = 400  # no message about a file may approach the size of the file


def _gpx(body: str) -> str:
    return '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>' + body + "</trkseg></trk></gpx>"


def _point(lat="46.0", lon="8.0", ele="500", time=None) -> str:
    inner = f"<ele>{ele}</ele>" if ele is not None else ""
    inner += f"<time>{time}</time>" if time is not None else ""
    return f'<trkpt lat="{lat}" lon="{lon}">{inner}</trkpt>'


def _real_course(points: int = 60) -> str:
    return _gpx("".join(_point(lat=f"{46.0 + i * 0.0005}", ele=str(500 + i), time=f"2026-01-01T10:00:{i % 60:02d}Z") for i in range(points)))


# --- Nothing comes back at the size it went in -------------------------------------------------


@pytest.mark.parametrize(
    "body,what",
    [
        (_point(time="Z" * 200_000), "a time of nothing but Z"),
        (_point(ele="A" * 200_000), "an elevation of letters"),
        (_point(lat="9" * 200_000), "a latitude of digits"),
    ],
    ids=["time", "elevation", "latitude"],  # the values themselves are 200,000 characters long
)
def test_a_bad_value_is_not_quoted_back_at_its_own_length(body, what):
    with pytest.raises(GpxParseError) as raised:
        parse_track_points(_gpx(body + _point(lat="46.1")))
    assert len(str(raised.value)) < MESSAGE_LIMIT, f"{what}: the message is {len(str(raised.value))} characters"


def test_a_trailing_z_is_still_read_as_utc():
    points = parse_track_points(_real_course())
    assert points[0].time is not None and points[0].time.utcoffset().total_seconds() == 0


# --- Numbers that are not numbers --------------------------------------------------------------


@pytest.mark.parametrize("lat", ["4_6.0", "٤٦", "0x1p6", "46,0", "", "  "])
def test_a_latitude_that_python_would_take_but_a_gpx_should_not(lat):
    """float() accepts underscores and Arabic-Indic digits, so a file could measure a course other
    than the one written in it without anybody being told."""
    with pytest.raises(GpxParseError):
        parse_track_points(_gpx(_point(lat=lat) + _point(lat="46.1")))


def test_an_ordinary_signed_decimal_is_still_read():
    points = parse_track_points(_gpx(_point(lat=" +46.0 ") + _point(lat="-46.1")))
    assert [round(p.lat, 1) for p in points] == [46.0, -46.1]


@pytest.mark.parametrize("ele", ["1e308", "-1e308", "1e300"])
def test_an_elevation_that_is_not_one_is_refused_before_it_becomes_nan(ele):
    """These overflowed inside the smoothing, came back as NaN, and NaN is not a number JSON can
    carry: the answer was a server error rather than a word about the file."""
    with pytest.raises(GpxParseError):
        measure_course(parse_track_points(_gpx(_point(ele=ele) + _point(lat="46.01", ele="-1e308"))))


def test_a_measurement_carries_only_real_numbers():
    measurement = measure_course(parse_track_points(_real_course()))
    payload = json.dumps(measurement.to_dict())  # the encoder refuses NaN and infinity
    assert measurement.distance_m > 0 and "NaN" not in payload and "Infinity" not in payload


def test_a_device_that_writes_no_reading_is_left_alone():
    """-32768 is what some devices write for "no elevation here". It is not plausible and not the
    thing being refused: the file is still measured, and the flags say what was wrong with it."""
    measurement = measure_course(parse_track_points(_gpx("".join(_point(lat=f"{46.0 + i * 0.001}", ele="-32768") for i in range(20)))))
    assert measurement.distance_m > 0


# --- The results file --------------------------------------------------------------------------


def test_a_file_of_enormous_headers_is_not_handed_back_in_the_answer(tmp_path):
    headers = ",".join("h" + "x" * 20_000 + str(i) for i in range(200))
    path = tmp_path / "fat-headers.csv"
    path.write_text(headers + "\n" + ",".join("1" for _ in range(200)) + "\n", encoding="utf-8")

    report = validate_result_file(path)
    assert not report.is_valid
    for issue in report.errors:
        assert len(issue.message) < 2_000, f"an error message is {len(issue.message)} characters"


def test_a_cell_is_kept_to_the_length_a_name_can_be(tmp_path):
    path = tmp_path / "long-cell.csv"
    path.write_text("Rank,Time,Last name,First name\n1,1:00:00," + "D" * 50_000 + ",Jo\n", encoding="utf-8")
    _, rows = read_table(path)
    assert max(len(cell) for row in rows for cell in row) <= 512


def test_a_control_character_never_reaches_a_row(tmp_path):
    """A NUL is not storable in a Postgres text column, so one in a name used to become an error
    at the end of a long upload rather than a word about the file."""
    path = tmp_path / "nul.csv"
    path.write_bytes(b"Rank,Time,Last name,First name\n1,1:00:00,Do\x00e,J\x1bo\n")
    _, rows = read_table(path)
    assert rows[0][2] == "Doe" and rows[0][3] == "Jo"


def test_a_spreadsheet_saved_as_unicode_text_is_read_either_way_round(tmp_path):
    for name, encoding in (("le.csv", "utf-16-le"), ("be.csv", "utf-16-be")):
        path = tmp_path / name
        path.write_bytes("Rank,Time,Last name,First name\n1,1:00:00,Doe,Jo\n".encode(encoding))
        headers, rows = read_table(path)
        assert headers[:2] == ["Rank", "Time"], f"{encoding} was not recognised"
        assert rows[0][2] == "Doe"


def test_the_shared_strings_cap_holds_wherever_the_part_is_named(tmp_path):
    """openpyxl does not look for xl/sharedStrings.xml. It reads [Content_Types].xml and takes
    whatever part carries the shared-strings content type, so a check on the name alone was
    bypassed by renaming the part."""
    strings = b'<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + b"<si><t>aa</t></si>" * 500_000 + b"</sst>"
    content_types = (
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Override PartName="/xl/somewhere-else.xml"'
        ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'
    )
    path = tmp_path / "renamed.xlsx"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("xl/somewhere-else.xml", strings)
        archive.writestr("xl/workbook.xml", '<?xml version="1.0"?><workbook/>')
    assert path.stat().st_size < 100_000, "the upload itself is tiny; what it declares is not"

    with pytest.raises(ValueError, match="larger inside"):
        read_table(path)
