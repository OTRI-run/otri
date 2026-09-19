"""Deterministic validation of OTRI race and result files against ``schema.py``.

Validation never raises on bad data — it always returns a ``ValidationReport``
listing what is wrong, so a single organizer file can be checked in one pass.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .normalize import ResultTable, load_result_table
from .reader import read_rows
from .schema import RACE_FIELDS, RESULT_FIELDS, FieldSpec, _normalize_header, clean_cell, rank_position, resolve_rank
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
    # Results files only: which header each field was read from, and the headers nothing was read
    # from. Shown to the organizer so they can see how their file was understood.
    columns: dict[str, str] = field(default_factory=dict)
    ignored_columns: tuple[str, ...] = ()

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
            "columns": dict(self.columns),
            "ignored_columns": list(self.ignored_columns),
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


# So that one slip repeated on every row does not bury the rest of the report.
_MAX_SAME_MESSAGE = 15


def validate_result_file(path: str | Path) -> ValidationReport:
    """Check a results file as `ingestion/normalize.py` understood it."""
    path = Path(path)
    table = load_result_table(path)
    return validate_result_table(table, str(path))


def validate_result_table(table: ResultTable, source: str = "") -> ValidationReport:
    issues = [ValidationIssue(*note) for note in table.notes]
    found = ", ".join(f"“{header}”" for header in table.headers if header) or "none"
    if not table.headers:
        issues.append(ValidationIssue("error", None, None, "the file is empty"))
    else:
        if "finish_time" not in table.columns:
            issues.append(ValidationIssue("error", None, "finish_time", f"no finish time column found (looked for Time, Finish time, Chip time, Temps, Zeit, …). Columns in the file: {found}"))
        if not ({"family_name", "full_name"} & set(table.columns)):
            issues.append(ValidationIssue("error", None, "family_name", f"no name column found (looked for Last name and First name, or one Name / Runner column). Columns in the file: {found}"))
        if table.headers and not table.rows and not issues:
            issues.append(ValidationIssue("error", None, None, "the file has a header but no result rows"))

    canonical = {spec.canonical: spec.canonical for spec in RESULT_FIELDS}
    issues.extend(_validate_rows(table.rows, RESULT_FIELDS, canonical))
    for row_index, row in enumerate(table.rows, start=1):
        if not ({"family_name", "full_name"} & set(table.columns)):
            break  # the missing name column was said once, above
        if not row["family_name"].strip() and not row["first_name"].strip():
            issues.append(ValidationIssue("error", row_index, "family_name", "the runner has no name"))
    issues.extend(_validate_result_cross_field(table.rows, canonical, has_time_column="finish_time" in table.columns))
    issues.sort(key=_sort_key)
    return ValidationReport(source, len(table.rows), tuple(_capped(issues)), columns=dict(table.columns), ignored_columns=tuple(table.ignored))


def _capped(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    """The first of each repeated row message, then one line saying how many more there are."""
    counts: dict[tuple[str, str | None, str], int] = {}
    kept: list[ValidationIssue] = []
    for issue in issues:
        key = (issue.severity, issue.field, issue.message)
        counts[key] = counts.get(key, 0) + 1
        if issue.row is None or counts[key] <= _MAX_SAME_MESSAGE:
            kept.append(issue)
    for (severity, field_name, message), count in counts.items():
        if count > _MAX_SAME_MESSAGE:
            kept.append(ValidationIssue(severity, None, field_name, f"{message}: {count - _MAX_SAME_MESSAGE} more rows with the same problem"))
    return kept


def _validate_result_cross_field(rows: list[dict[str, str]], mapping: dict[str, str], has_time_column: bool = True) -> list[ValidationIssue]:
    """Checks across rows. The finish time is what a score is made from, so a missing one is an
    error; an oddity in the ranking or the bibs is the organizer's to judge, and is a warning."""
    issues: list[ValidationIssue] = []
    rank_header = mapping.get("rank")
    status_header = mapping.get("status")
    time_header = mapping.get("finish_time")

    if rank_header:
        finishers: list[tuple[int, int, int | None]] = []  # position, row number, seconds
        for row_index, row in enumerate(rows, start=1):
            rank_raw = row.get(rank_header, "")
            status_raw = row.get(status_header, "") if status_header else ""
            resolved = resolve_rank(rank_raw, status_raw)
            if resolved is None:
                if not clean_cell(rank_raw):
                    issues.append(ValidationIssue("error", row_index, "rank", "value is required"))
                continue  # a malformed rank was already reported by the field validator
            if isinstance(resolved, str):
                continue  # DNF/DNS/DSQ rows: no finish time, no place in the ranking order
            if time_header and has_time_column and not clean_cell(row.get(time_header, "")):
                issues.append(ValidationIssue("error", row_index, "finish_time", "value is required for finishers"))
            finishers.append((resolved, row_index, parse_hms_to_seconds(row.get(time_header, "")) if time_header else None))

        # In ranking order, whatever order the file lists its rows in (by bib, by category, …).
        finishers.sort(key=lambda item: (item[0], item[2] if item[2] is not None else 0))
        previous: tuple[int, int, int | None] | None = None
        for position, row_index, seconds in finishers:
            if previous is not None:
                if position == previous[0] and seconds != previous[2]:
                    issues.append(ValidationIssue("warning", row_index, "rank", f"position {position} is given to two runners with different times"))
                elif seconds is not None and previous[2] is not None and position > previous[0] and seconds < previous[2]:
                    issues.append(ValidationIssue("warning", row_index, "finish_time", f"faster than position {previous[0]} but ranked behind it; the score uses the time"))
            previous = (position, row_index, seconds)

    if "bib_number" in mapping:
        seen_bibs: dict[str, int] = {}
        for row_index, row in enumerate(rows, start=1):
            bib = clean_cell(row.get(mapping["bib_number"], ""))
            if not bib:
                continue
            if bib in seen_bibs:
                issues.append(ValidationIssue("warning", row_index, "bib_number", f"bib {bib} is also on row {seen_bibs[bib]}: the same runner listed twice?"))
            else:
                seen_bibs[bib] = row_index

    # One file per race distance: a combined export (50K and 30K in one sheet) would rank the
    # short race's finishers against the long course. Refuse it with the values found.
    if "race" in mapping:
        values = sorted({_normalize_header(row.get(mapping["race"], "")) for row in rows if row.get(mapping["race"], "").strip()})
        if len(values) > 1:
            listed = ", ".join(values[:6]) + (", …" if len(values) > 6 else "")
            issues.append(
                ValidationIssue(
                    "error",
                    None,
                    "race",
                    f"this file mixes {len(values)} races ({listed}); upload one file per race distance",
                )
            )

    return issues
