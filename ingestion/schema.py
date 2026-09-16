"""Declarative field specifications for OTRI race and result files.

Each ``FieldSpec`` documents the canonical field name, the organizer header
aliases it recognizes, whether it is required, and how a single cell value
is validated. This module is the Python-side mirror of the published
contracts in ``data/schemas/*.json`` — keep both in sync when a field changes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Callable

Severity = str  # "error" | "warning"
FieldIssue = tuple[Severity, str]
FieldValidator = Callable[[str], list[FieldIssue]]


def _normalize_header(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.strip().lower()).strip()


@dataclass(frozen=True)
class FieldSpec:
    canonical: str
    aliases: tuple[str, ...]
    required: bool
    validate: FieldValidator

    @property
    def normalized_aliases(self) -> tuple[str, ...]:
        return tuple(_normalize_header(alias) for alias in self.aliases)


def _required_nonempty(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    return []


def _optional(_value: str) -> list[FieldIssue]:
    return []


def _iso_date_required(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        date.fromisoformat(value.strip())
    except ValueError:
        return [("error", "must be an ISO 8601 date (YYYY-MM-DD)")]
    return []


def _iso_date_optional(value: str) -> list[FieldIssue]:
    if not value.strip():
        return []
    try:
        date.fromisoformat(value.strip())
    except ValueError:
        return [("warning", "must be an ISO 8601 date (YYYY-MM-DD)")]
    return []


def _positive_float(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        parsed = float(value)
    except ValueError:
        return [("error", "must be a number")]
    if parsed <= 0:
        return [("error", "must be greater than 0")]
    return []


def _nonnegative_float(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        parsed = float(value)
    except ValueError:
        return [("error", "must be a number")]
    if parsed < 0:
        return [("error", "must be 0 or greater")]
    return []


def _positive_int(value: str, *, required: bool = True) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")] if required else []
    try:
        parsed = int(value)
    except ValueError:
        return [("error", "must be a whole number")]
    if parsed <= 0:
        return [("error", "must be greater than 0")]
    return []


def _optional_positive_int(value: str) -> list[FieldIssue]:
    return _positive_int(value, required=False)


_TIME_PATTERN = re.compile(r"^\d{1,3}:[0-5]\d:[0-5]\d$")


def _finish_time(value: str) -> list[FieldIssue]:
    if not value.strip():
        return []  # requiredness for finishers is enforced in cross-field validation
    if not _TIME_PATTERN.match(value.strip()):
        return [("error", "must be a finish time in HH:MM:SS format")]
    return []


NON_FINISHER_CODES = {"DNF", "DNS", "DSQ"}


def _rank(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    if value.strip().upper() in NON_FINISHER_CODES:
        return []
    return _positive_int(value)


_GENDER_VALUES = {"M", "F", "X"}


def _gender(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    if value.strip().upper() not in _GENDER_VALUES:
        return [("warning", "expected one of M, F, X")]
    return []


_NATIONALITY_PATTERN = re.compile(r"^[A-Za-z]{3}$")


def _nationality(value: str) -> list[FieldIssue]:
    if not value.strip():
        return []
    if not _NATIONALITY_PATTERN.match(value.strip()):
        return [("warning", "expected a 3-letter country code (ISO 3166-1 alpha-3)")]
    return []


RACE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("race_id", ("race id",), True, _required_nonempty),
    FieldSpec("race_name", ("race name", "name"), True, _required_nonempty),
    FieldSpec("event_date", ("event date", "date"), True, _iso_date_required),
    FieldSpec("course_name", ("course name", "course"), True, _required_nonempty),
    FieldSpec("distance_km", ("distance km", "distance"), True, _positive_float),
    FieldSpec("elevation_gain_m", ("elevation gain m", "elevation gain"), True, _nonnegative_float),
)

RESULT_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("rank", ("ranking", "rank", "position"), True, _rank),
    FieldSpec("finish_time", ("time", "finish time", "finish", "chip time"), True, _finish_time),
    FieldSpec("family_name", ("family name", "last name", "surname"), True, _required_nonempty),
    FieldSpec("first_name", ("first name", "given name"), True, _required_nonempty),
    FieldSpec("gender", ("gender", "sex"), True, _gender),
    FieldSpec("birthdate", ("birthdate", "date of birth", "dob", "birth date"), False, _iso_date_optional),
    FieldSpec("nationality", ("nationality", "country", "nat"), False, _nationality),
    FieldSpec("bib_number", ("bib number", "bib", "bib no"), False, _optional_positive_int),
    FieldSpec("city", ("city", "town"), False, _optional),
    FieldSpec("team", ("team", "club"), False, _optional),
)
