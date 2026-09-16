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

    assert (2, "gender", "expected one of M, F, X") in warnings
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
