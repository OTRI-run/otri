"""Typed, canonical records built on top of validated race/result files.

These are the only ingestion outputs the scoring engine should depend on —
``scoring/`` never touches raw CSV/XLSX parsing or header aliases directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re
from pathlib import Path

from .normalize import load_result_table
from .reader import read_rows
from .schema import RACE_FIELDS, FieldSpec, _normalize_header, clean_cell, normalize_gender, resolve_rank
from .time_utils import parse_hms_to_seconds
from .validate import validate_race_file, validate_result_table


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
    location: str | None = None
    country: str | None = None


@dataclass(frozen=True)
class ResultRecord:
    rank: int | str  # an int for finishers, or one of schema.NON_FINISHER_CODES
    finish_time_seconds: int | None
    family_name: str
    first_name: str
    gender: str
    bib_number: str | None
    # Optional, from the results file: only the year of birth is kept, never the full date.
    birth_year: int | None = None
    nationality: str | None = None
    # Set by the database once the result is attached to a runner; never read from a file.
    runner_id: str | None = None

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
            location=(row.get(mapping["location"], "").strip() or None) if "location" in mapping else None,
            country=(row.get(mapping["country"], "").strip().upper() or None) if "country" in mapping else None,
        )
        for row in rows
    ]


def result_records(path: str | Path) -> list[ResultRecord]:
    """Parse and validate a result file, returning one record per row.

    Raises ``InvalidFileError`` if the file does not pass validation. The file is read as
    ``ingestion/normalize.py`` understands it: whatever the export called its columns.
    """
    path = Path(path)
    table = load_result_table(path)
    report = validate_result_table(table, str(path))
    if not report.is_valid:
        raise InvalidFileError(f"{path} failed validation: {[issue.message for issue in report.errors]}")

    records: list[ResultRecord] = []
    for row in table.rows:
        rank = resolve_rank(row["rank"], row["status"])
        if rank is None:  # unreachable after validation, kept as a guard
            raise InvalidFileError(f"{path}: a row has neither a rank nor a non-finisher status")
        time_raw = clean_cell(row["finish_time"])
        nationality = clean_cell(row["nationality"])
        records.append(
            ResultRecord(
                rank=rank,
                finish_time_seconds=parse_hms_to_seconds(time_raw) if (time_raw and isinstance(rank, int)) else None,
                family_name=row["family_name"].strip(),
                first_name=row["first_name"].strip(),
                gender=normalize_gender(row["gender"]) or "X",
                bib_number=clean_cell(row["bib_number"]) or None,
                birth_year=int(row["birth_year"]) if re.fullmatch(r"(19|20)\d\d", row["birth_year"]) else None,
                nationality=nationality.upper() if re.fullmatch(r"[A-Za-z]{3}", nationality) else None,
            )
        )
    return records
