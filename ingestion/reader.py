"""Format-agnostic row reading for organizer CSV/XLSX exports.

Exports differ in everything but their content: comma, semicolon or tab between the cells (a
spreadsheet in a European locale writes semicolons), UTF-8, UTF-16 or Windows-1252 text, a title
and a blank line above the header, times as text or as spreadsheet time cells. All of that is
absorbed here, so the rest of ingestion sees one thing: a header row and rows of stripped strings.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from pathlib import Path
from typing import Callable

from openpyxl import load_workbook


# A results file is a few thousand rows at most; a million-row sheet (or a zip bomb pretending to be
# one) is refused before it costs minutes of CPU.
MAX_ROWS = 50_000
# How far down the header row may sit under titles, logos and blank lines.
HEADER_SEARCH_ROWS = 30
TEXT_SUFFIXES = (".csv", ".txt", ".tsv")
SHEET_SUFFIXES = (".xlsx", ".xlsm")

HeaderScore = Callable[[list[str]], int]


def read_rows(path: Path, header_score: HeaderScore | None = None) -> list[dict[str, str]]:
    """Read a CSV or XLSX file into a list of row dicts keyed by the original header text.

    All cell values are returned as stripped strings, regardless of the underlying spreadsheet
    cell type, so callers never need to branch on file format. `header_score` says how much a row
    looks like the header (the number of cells it recognises); with it, title lines above the
    header are skipped. Without it the first row is the header.
    """
    headers, rows = read_table(path, header_score)
    return [dict(zip(headers, row + [""] * (len(headers) - len(row)))) for row in rows]


def read_table(path: Path, header_score: HeaderScore | None = None) -> tuple[list[str], list[list[str]]]:
    """The header cells and the data rows (lists of stripped strings, blank rows dropped)."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in TEXT_SUFFIXES:
        table = _read_text(path)
    elif suffix in SHEET_SUFFIXES:
        table = _read_xlsx(path)
    elif suffix == ".xls":
        raise ValueError("this is the old Excel format (.xls): open it and save it as .xlsx or CSV, then upload that")
    else:
        raise ValueError(f"Unsupported file type: {suffix!r} (upload a .csv or .xlsx file)")

    table = [row for row in table if any(cell for cell in row)]
    if not table:
        return [], []
    start = _header_index(table, header_score)
    headers = _unique(table[start])
    rows = table[start + 1 :]
    if len(rows) > MAX_ROWS:
        raise ValueError(f"the file has more than {MAX_ROWS} rows; split it per race distance")
    return headers, rows


def _header_index(table: list[list[str]], header_score: HeaderScore | None) -> int:
    if header_score is None:
        return 0
    best, best_score = 0, 0
    for index, row in enumerate(table[:HEADER_SEARCH_ROWS]):
        score = header_score(row)
        if score > best_score:  # the first of equally good rows: the header comes before the data
            best, best_score = index, score
    return best if best_score >= 2 else 0


def _unique(headers: list[str]) -> list[str]:
    """Header texts, with a repeated one numbered ("Time", "Time (2)") so no column hides another."""
    seen: dict[str, int] = {}
    result = []
    for header in headers:
        count = seen.get(header, 0) + 1
        seen[header] = count
        result.append(header if count == 1 or not header else f"{header} ({count})")
    return result


# ---------------------------------------------------------------------------- text files


def _decode(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")
    # "Unicode text" from a spreadsheet, without a byte-order mark: every other byte is zero.
    if len(data) >= 4 and data[1:2] == b"\x00" and data[3:4] == b"\x00":
        try:
            return data.decode("utf-16-le")
        except UnicodeDecodeError:
            pass
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")  # what Excel on Windows writes for "CSV"


def _delimiter(text: str) -> str:
    """The cell separator: the candidate that splits the first lines into the most cells, the same
    number of times on most lines. Quoted cells are respected."""
    lines = [line for line in text.splitlines()[:40] if line.strip()]
    best, best_score = ",", 0.0
    for candidate in (",", ";", "\t", "|"):
        counts = [len(row) for row in csv.reader(lines, delimiter=candidate)]
        wide = [count for count in counts if count > 1]
        if not wide:
            continue
        typical = max(set(wide), key=wide.count)
        score = wide.count(typical) * typical
        if score > best_score:
            best, best_score = candidate, score
    return best


def _read_text(path: Path) -> list[list[str]]:
    text = _decode(path.read_bytes())
    delimiter = "\t" if path.suffix.lower() == ".tsv" else _delimiter(text)
    table: list[list[str]] = []
    for row in csv.reader(io.StringIO(text, newline=""), delimiter=delimiter):
        if len(table) > MAX_ROWS + HEADER_SEARCH_ROWS:
            raise ValueError(f"the file has more than {MAX_ROWS} rows; split it per race distance")
        table.append([(cell or "").strip() for cell in row])
    return table


# ---------------------------------------------------------------------------- spreadsheets


def _read_xlsx(path: Path) -> list[list[str]]:
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as error:  # noqa: BLE001 - openpyxl raises a zoo of errors for non-spreadsheets
        raise ValueError(f"not a readable .xlsx file: {type(error).__name__}") from error
    rows = None
    try:
        sheet = workbook.active
        if sheet is None:
            return []
        rows = sheet.iter_rows(values_only=True)
        table: list[list[str]] = []
        for raw_row in rows:
            if all(cell is None for cell in raw_row):
                continue
            if len(table) > MAX_ROWS + HEADER_SEARCH_ROWS:
                raise ValueError(f"the file has more than {MAX_ROWS} rows; split it per race distance")
            table.append([_stringify(cell) for cell in raw_row])
        return table
    finally:
        # Read-only workbooks stream from the zip: close the row generator (its open stream) and the
        # archive, or the caller cannot delete the temp file on Windows.
        try:
            if rows is not None:
                rows.close()
        except Exception:  # noqa: BLE001
            pass
        workbook.close()


def _stringify(cell: object) -> str:
    """Normalize a spreadsheet cell (which may be a native date/time) to plain text."""
    if cell is None:
        return ""
    if isinstance(cell, dt.timedelta):  # a duration cell, e.g. a finish time beyond 24 hours
        seconds = round(cell.total_seconds())
        return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"
    if isinstance(cell, dt.datetime):
        # A time beyond 24 h typed into a time cell comes back as a date in January 1900.
        if cell.year <= 1900:
            days = (cell.date() - dt.date(1899, 12, 31)).days if cell.year == 1900 else 0
            seconds = max(days, 0) * 86400 + cell.hour * 3600 + cell.minute * 60 + cell.second
            return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"
        return cell.date().isoformat() if cell.time() == dt.time(0, 0) else cell.isoformat(sep=" ")
    if isinstance(cell, dt.date):
        return cell.isoformat()
    if isinstance(cell, dt.time):
        return cell.strftime("%H:%M:%S")
    if isinstance(cell, float) and cell.is_integer():
        return str(int(cell))  # a bib or a rank kept as a number: "12", not "12.0"
    return str(cell).strip()
