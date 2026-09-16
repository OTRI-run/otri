"""Format-agnostic row reading for organizer CSV/XLSX exports."""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path

from openpyxl import load_workbook


def read_rows(path: Path) -> list[dict[str, str]]:
    """Read a CSV or XLSX file into a list of row dicts keyed by the original header text.

    All cell values are returned as stripped strings, regardless of the
    underlying spreadsheet cell type, so callers never need to branch on
    file format.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _read_csv(path)
    if suffix in (".xlsx", ".xlsm"):
        return _read_xlsx(path)
    raise ValueError(f"Unsupported file type: {suffix!r}")


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        return [
            {(key or "").strip(): (value or "").strip() for key, value in row.items()}
            for row in reader
        ]


def _read_xlsx(path: Path) -> list[dict[str, str]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    rows = sheet.iter_rows(values_only=True)
    try:
        header_cells = next(rows)
    except StopIteration:
        return []
    headers = [_stringify(cell) for cell in header_cells]

    result: list[dict[str, str]] = []
    for raw_row in rows:
        if all(cell is None for cell in raw_row):
            continue
        values = [_stringify(cell) for cell in raw_row]
        result.append(dict(zip(headers, values)))
    return result


def _stringify(cell: object) -> str:
    """Normalize a spreadsheet cell (which may be a native date/time) to plain text."""
    if cell is None:
        return ""
    if isinstance(cell, dt.datetime):
        return cell.date().isoformat() if cell.time() == dt.time(0, 0) else cell.isoformat(sep=" ")
    if isinstance(cell, dt.date):
        return cell.isoformat()
    if isinstance(cell, dt.time):
        return cell.strftime("%H:%M:%S")
    return str(cell).strip()
