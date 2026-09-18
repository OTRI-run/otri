"""Format-agnostic row reading for organizer CSV/XLSX exports."""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path

from openpyxl import load_workbook


# A results file is a few thousand rows at most; a million-row sheet (or a zip bomb pretending to be
# one) is refused before it costs minutes of CPU.
MAX_ROWS = 50_000


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
        result: list[dict[str, str]] = []
        for row in reader:
            if len(result) >= MAX_ROWS:
                raise ValueError(f"the file has more than {MAX_ROWS} rows; split it per race distance")
            result.append({(key or "").strip(): (value or "").strip() for key, value in row.items()})
        return result


def _read_xlsx(path: Path) -> list[dict[str, str]]:
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as error:  # noqa: BLE001 - openpyxl raises a zoo of errors for non-spreadsheets
        raise ValueError(f"not a readable .xlsx file: {type(error).__name__}") from error
    try:
        sheet = workbook.active
        if sheet is None:
            return []
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
            if len(result) >= MAX_ROWS:
                raise ValueError(f"the file has more than {MAX_ROWS} rows; split it per race distance")
            values = [_stringify(cell) for cell in raw_row]
            result.append(dict(zip(headers, values)))
        return result
    finally:
        # Read-only workbooks stream from the zip: close the row generator (its open stream) and the
        # archive, or the caller cannot delete the temp file on Windows.
        try:
            rows.close()  # type: ignore[possibly-undefined]
        except Exception:  # noqa: BLE001
            pass
        workbook.close()


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
