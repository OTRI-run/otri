"""OTRI data-ingestion layer: reads organizer race/result files and validates them.

See ``ingestion/README.md`` for scope and ``data/schemas/`` for the published,
versioned schema contracts this module implements.
"""

from .records import InvalidFileError, RaceRecord, ResultRecord, race_records, result_records
from .validate import ValidationIssue, ValidationReport, validate_race_file, validate_result_file

__all__ = [
    "ValidationIssue",
    "ValidationReport",
    "validate_race_file",
    "validate_result_file",
    "InvalidFileError",
    "RaceRecord",
    "ResultRecord",
    "race_records",
    "result_records",
]
