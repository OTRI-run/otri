"""Typed, canonical records built on top of validated race/result files.

These are the only ingestion outputs the scoring engine should depend on —
``scoring/`` never touches raw CSV/XLSX parsing or header aliases directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .reader import read_rows
from .schema import NON_FINISHER_CODES, RACE_FIELDS, RESULT_FIELDS, FieldSpec, _normalize_header
from .time_utils import parse_hms_to_seconds
from .validate import validate_race_file, validate_result_file


class InvalidFileError(ValueError):
    """Raised when a file fails validation and cannot be turned into records."""


@dataclass(frozen=True)
class RaceRecord:
    race_id: str
    race_name: str
    event_date: date
    course_name: str
    distance_km: float
    elevation_gain_m: float


@dataclass(frozen=True)
class ResultRecord:
    rank: int | str  # an int for finishers, or one of schema.NON_FINISHER_CODES
    finish_time_seconds: int | None
    family_name: str
    first_name: str
    gender: str
    bib_number: str | None

    @property
    def is_finisher(self) -> bool:
        return isinstance(self.rank, int)


def _column_map(headers: list[str], fields: tuple[FieldSpec, ...]) -> dict[str, str]:
    normalized_to_original = {_normalize_header(header): header for header in headers}
    mapping: dict[str, str] = {}
    for spec in fields:
        for alias in spec.normalized_aliases:
            if alias in normalized_to_original:
                mapping[spec.canonical] = normalized_to_original[alias]
                break
    return mapping


def race_records(path: str | Path) -> list[RaceRecord]:
    """Parse and validate a race file, returning one record per row.

    Raises ``InvalidFileError`` if the file does not pass ``validate_race_file``.
    """
    path = Path(path)
    report = validate_race_file(path)
    if not report.is_valid:
        raise InvalidFileError(f"{path} failed validation: {[issue.message for issue in report.errors]}")

    rows = read_rows(path)
    mapping = _column_map(list(rows[0].keys()) if rows else [], RACE_FIELDS)
    return [
        RaceRecord(
            race_id=row[mapping["race_id"]].strip(),
            race_name=row[mapping["race_name"]].strip(),
            event_date=date.fromisoformat(row[mapping["event_date"]].strip()),
            course_name=row[mapping["course_name"]].strip(),
            distance_km=float(row[mapping["distance_km"]]),
            elevation_gain_m=float(row[mapping["elevation_gain_m"]]),
        )
        for row in rows
    ]


def result_records(path: str | Path) -> list[ResultRecord]:
    """Parse and validate a result file, returning one record per row.

    Raises ``InvalidFileError`` if the file does not pass ``validate_result_file``.
    """
    path = Path(path)
    report = validate_result_file(path)
    if not report.is_valid:
        raise InvalidFileError(f"{path} failed validation: {[issue.message for issue in report.errors]}")

    rows = read_rows(path)
    mapping = _column_map(list(rows[0].keys()) if rows else [], RESULT_FIELDS)

    records: list[ResultRecord] = []
    for row in rows:
        rank_raw = row[mapping["rank"]].strip()
        rank: int | str = rank_raw.upper() if rank_raw.upper() in NON_FINISHER_CODES else int(rank_raw)

        time_header = mapping.get("finish_time")
        time_raw = row.get(time_header, "").strip() if time_header else ""
        finish_time_seconds = parse_hms_to_seconds(time_raw) if time_raw else None

        bib_header = mapping.get("bib_number")
        bib_raw = row.get(bib_header, "").strip() if bib_header else ""

        records.append(
            ResultRecord(
                rank=rank,
                finish_time_seconds=finish_time_seconds,
                family_name=row[mapping["family_name"]].strip(),
                first_name=row[mapping["first_name"]].strip(),
                gender=row[mapping["gender"]].strip().upper(),
                bib_number=bib_raw or None,
            )
        )
    return records
