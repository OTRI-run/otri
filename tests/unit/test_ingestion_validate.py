"""Unit tests proving the ingestion validator produces deterministic output.

Run with: pytest tests/unit
"""

from pathlib import Path

from ingestion import validate_race_file, validate_result_file

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_RACES = REPO_ROOT / "data" / "demo" / "races.csv"
DEMO_RESULT = REPO_ROOT / "data" / "demo" / "results" / "OTRI-DEMO-001.csv"
FIXTURES = REPO_ROOT / "tests" / "fixtures"


def test_demo_races_file_is_valid():
    report = validate_race_file(DEMO_RACES)
    assert report.is_valid
    assert report.errors == ()
    assert report.row_count == 6


def test_demo_result_file_is_valid():
    report = validate_result_file(DEMO_RESULT)
    assert report.is_valid
    assert report.errors == ()
    assert report.row_count == 12


def test_validation_is_deterministic_across_runs():
    first = validate_result_file(DEMO_RESULT).to_dict()
    second = validate_result_file(DEMO_RESULT).to_dict()
    assert first == second


def test_invalid_race_file_reports_expected_errors():
    report = validate_race_file(FIXTURES / "races" / "invalid-race.csv")
    messages = [(issue.row, issue.field, issue.message) for issue in report.errors]

    assert not report.is_valid
    assert (2, "race_id", "duplicate race_id: 'OTRI-DEMO-001'") in messages
    assert (2, "event_date", "must be an ISO 8601 date (YYYY-MM-DD)") in messages
    assert (2, "course_name", "value is required") in messages
    assert (2, "distance_km", "must be greater than 0") in messages
    assert (2, "elevation_gain_m", "must be 0 or greater") in messages


def test_invalid_result_file_reports_expected_errors_and_warnings():
    report = validate_result_file(FIXTURES / "results" / "invalid-result.csv")
    errors = [(issue.row, issue.field, issue.message) for issue in report.errors]
    warnings = [(issue.row, issue.field, issue.message) for issue in report.warnings]

    assert not report.is_valid
    assert (2, "finish_time", "finish_time must not decrease relative to the previous (ascending rank) row") in errors
    assert (3, "rank", "duplicate rank: 2") in errors
    assert (3, "rank", "rank must increase strictly from the previous row") in errors
    assert (3, "family_name", "value is required") in errors
    assert (3, "bib_number", "duplicate bib_number: 102") in errors

    assert (2, "gender", "expected one of M, F, X (or Male / Female)") in warnings
    assert (2, "birthdate", "must be an ISO 8601 date (YYYY-MM-DD)") in warnings
    assert (2, "nationality", "expected a 3-letter country code (ISO 3166-1 alpha-3)") in warnings


def test_xlsx_result_file_reads_and_validates():
    report = validate_result_file(FIXTURES / "results" / "valid-result.xlsx")
    assert report.is_valid
    assert report.row_count == 2


def test_dnf_row_does_not_require_a_finish_time():
    report = validate_result_file(REPO_ROOT / "data" / "demo" / "results" / "OTRI-DEMO-003.csv")
    assert report.is_valid
    assert report.errors == ()


# --------------------------------------------------------------- timing-export compatibility

from ingestion import result_records  # noqa: E402
from ingestion.time_utils import parse_hms_to_seconds  # noqa: E402


def test_timing_export_with_alias_headers_status_column_and_loose_values_is_accepted():
    """Pos / Net Time / Lastname / Sex / Status / BIB / Nat / DOB / YOB, ordinal ranks, fractional
    seconds, Male/Female, a dash for an empty rank: all common in real exports, all accepted."""
    report = validate_result_file(FIXTURES / "results" / "alias-export.csv")
    assert report.errors == (), [issue.message for issue in report.errors]
    assert report.is_valid

    records = result_records(FIXTURES / "results" / "alias-export.csv")
    assert [r.rank for r in records] == [1, 2, 3, "DNF", "DNS"]
    assert [r.gender for r in records] == ["F", "M", "F", "M", "M"]
    assert records[0].finish_time_seconds == 4 * 3600 + 12 * 60 + 33  # .4 s rounds down
    assert records[0].bib_number == "F-101", "bibs may carry letters"
    assert records[3].finish_time_seconds is None and not records[3].is_finisher


def test_short_times_are_read_as_minutes_and_seconds_with_a_warning(tmp_path):
    path = tmp_path / "short.csv"
    path.write_text("Rank,Time,Last name,First name,Gender\n1,45:12,A,B,M\n2,1:02:03.6,C,D,F\n", encoding="utf-8")
    report = validate_result_file(path)
    assert report.is_valid
    assert [(w.row, w.message) for w in report.warnings] == [(1, "time has no hours part and is read as MM:SS")]
    assert [r.finish_time_seconds for r in result_records(path)] == [45 * 60 + 12, 3600 + 2 * 60 + 4]
    assert parse_hms_to_seconds("100:00:00") == 360000


def test_a_file_that_mixes_race_distances_is_rejected(tmp_path):
    path = tmp_path / "combined.csv"
    path.write_text(
        "Rank,Time,Last name,First name,Gender,Distance\n1,4:00:00,A,B,M,50K\n2,4:10:00,C,D,F,50K\n3,2:00:00,E,F,M,30K\n",
        encoding="utf-8",
    )
    report = validate_result_file(path)
    assert not report.is_valid
    assert "this file mixes 2 races (30k, 50k); upload one file per race distance" in [e.message for e in report.errors]
    same = tmp_path / "same.csv"
    same.write_text("Rank,Time,Last name,First name,Gender,Distance\n1,4:00:00,A,B,M,50K\n2,4:10:00,C,D,F,50K\n", encoding="utf-8")
    assert validate_result_file(same).is_valid


def test_empty_rank_without_a_status_is_still_an_error(tmp_path):
    path = tmp_path / "norank.csv"
    path.write_text("Rank,Time,Last name,First name,Gender\n1,4:00:00,A,B,M\n,,C,D,F\n", encoding="utf-8")
    report = validate_result_file(path)
    assert [(e.row, e.field, e.message) for e in report.errors] == [(2, "rank", "value is required")]
