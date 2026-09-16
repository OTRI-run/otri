"""Deterministic validation of OTRI race and result files against ``schema.py``.

Validation never raises on bad data — it always returns a ``ValidationReport``
listing what is wrong, so a single organizer file can be checked in one pass.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .reader import read_rows
from .schema import NON_FINISHER_CODES, RACE_FIELDS, RESULT_FIELDS, FieldSpec, _normalize_header
from .time_utils import parse_hms_to_seconds


@dataclass(frozen=True)
class ValidationIssue:
    severity: str  # "error" | "warning"
    row: int | None  # 1-based data row number; None for file-level issues
    field: str | None
    message: str

    def to_dict(self) -> dict:
        return {"severity": self.severity, "row": self.row, "field": self.field, "message": self.message}


@dataclass(frozen=True)
class ValidationReport:
    source: str
    row_count: int
    issues: tuple[ValidationIssue, ...]

    @property
    def errors(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity == "error")

    @property
    def warnings(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity == "warning")

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "row_count": self.row_count,
            "is_valid": self.is_valid,
            "errors": [issue.to_dict() for issue in self.errors],
            "warnings": [issue.to_dict() for issue in self.warnings],
        }


def _sort_key(issue: ValidationIssue) -> tuple[int, str, str]:
    return (issue.row if issue.row is not None else -1, issue.field or "", issue.message)


def _match_columns(
    headers: list[str], fields: tuple[FieldSpec, ...]
) -> tuple[dict[str, str], list[ValidationIssue]]:
    """Map each canonical field name to the actual header text found in the file."""
    normalized_to_original = {_normalize_header(header): header for header in headers}
    mapping: dict[str, str] = {}
    issues: list[ValidationIssue] = []
    for spec in fields:
        found = next(
            (normalized_to_original[alias] for alias in spec.normalized_aliases if alias in normalized_to_original),
            None,
        )
        if found is not None:
            mapping[spec.canonical] = found
        elif spec.required:
            issues.append(
                ValidationIssue(
                    "error",
                    None,
                    spec.canonical,
                    f"missing required column (expected one of: {', '.join(spec.aliases)})",
                )
            )
    return mapping, issues


def _validate_rows(
    rows: list[dict[str, str]], fields: tuple[FieldSpec, ...], mapping: dict[str, str]
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for row_index, row in enumerate(rows, start=1):
        for spec in fields:
            header = mapping.get(spec.canonical)
            if header is None:
                continue  # already reported as a missing column
            value = row.get(header, "")
            for severity, message in spec.validate(value):
                issues.append(ValidationIssue(severity, row_index, spec.canonical, message))
    return issues


def validate_race_file(path: str | Path) -> ValidationReport:
    path = Path(path)
    rows = read_rows(path)
    headers = list(rows[0].keys()) if rows else []
    mapping, issues = _match_columns(headers, RACE_FIELDS)
    issues.extend(_validate_rows(rows, RACE_FIELDS, mapping))

    if "race_id" in mapping:
        seen: dict[str, int] = {}
        for row_index, row in enumerate(rows, start=1):
            race_id = row.get(mapping["race_id"], "").strip()
            if not race_id:
                continue
            if race_id in seen:
                issues.append(ValidationIssue("error", row_index, "race_id", f"duplicate race_id: {race_id!r}"))
            else:
                seen[race_id] = row_index

    issues.sort(key=_sort_key)
    return ValidationReport(str(path), len(rows), tuple(issues))


def validate_result_file(path: str | Path) -> ValidationReport:
    path = Path(path)
    rows = read_rows(path)
    headers = list(rows[0].keys()) if rows else []
    mapping, issues = _match_columns(headers, RESULT_FIELDS)
    issues.extend(_validate_rows(rows, RESULT_FIELDS, mapping))
    issues.extend(_validate_result_cross_field(rows, mapping))
    issues.sort(key=_sort_key)
    return ValidationReport(str(path), len(rows), tuple(issues))


def _validate_result_cross_field(rows: list[dict[str, str]], mapping: dict[str, str]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if "rank" in mapping and "finish_time" in mapping:
        for row_index, row in enumerate(rows, start=1):
            rank_raw = row.get(mapping["rank"], "").strip()
            if rank_raw.upper() in NON_FINISHER_CODES:
                continue  # DNF/DNS/DSQ rows are not expected to have a finish time
            try:
                int(rank_raw)
            except ValueError:
                continue  # already reported by the rank field validator
            if not row.get(mapping["finish_time"], "").strip():
                issues.append(
                    ValidationIssue("error", row_index, "finish_time", "value is required for finishers")
                )

    if "rank" in mapping:
        seen_ranks: dict[int, int] = {}
        previous_rank: int | None = None
        for row_index, row in enumerate(rows, start=1):
            raw = row.get(mapping["rank"], "").strip()
            try:
                rank = int(raw)
            except ValueError:
                continue  # already reported by the field validator
            if rank in seen_ranks:
                issues.append(ValidationIssue("error", row_index, "rank", f"duplicate rank: {rank}"))
            else:
                seen_ranks[rank] = row_index
            if previous_rank is not None and rank <= previous_rank:
                issues.append(
                    ValidationIssue("error", row_index, "rank", "rank must increase strictly from the previous row")
                )
            previous_rank = rank

    if "bib_number" in mapping:
        seen_bibs: dict[str, int] = {}
        for row_index, row in enumerate(rows, start=1):
            bib = row.get(mapping["bib_number"], "").strip()
            if not bib:
                continue
            if bib in seen_bibs:
                issues.append(ValidationIssue("error", row_index, "bib_number", f"duplicate bib_number: {bib}"))
            else:
                seen_bibs[bib] = row_index

    if "finish_time" in mapping:
        previous_seconds: int | None = None
        for row_index, row in enumerate(rows, start=1):
            seconds = parse_hms_to_seconds(row.get(mapping["finish_time"], ""))
            if seconds is None:
                continue  # already reported by the field validator
            if previous_seconds is not None and seconds < previous_seconds:
                issues.append(
                    ValidationIssue(
                        "error",
                        row_index,
                        "finish_time",
                        "finish_time must not decrease relative to the previous (ascending rank) row",
                    )
                )
            previous_seconds = seconds

    return issues
