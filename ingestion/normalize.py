"""From an organizer's results export to OTRI's result fields.

Timing systems and federations export the same facts under different headers and in different
shapes. An organizer should be able to upload the file they already have: the ITRA or UTMB results
sheet, a RaceResult / my.raceresult export, a LiveTrail or chronotrack download, their own
spreadsheet. This module absorbs the differences that leave no doubt about what is meant:

- one "Name" / "Runner" column instead of two ("WALMSLEY Jim", "Walmsley, Jim", "Jim Walmsley");
- gender inside a category column ("SEH", "V1F", "M40-44", "F 35-39", "Women 40+");
- nationality as "FR", "France", "GER" or "ประเทศไทย" instead of "FRA";
- finish times as "12h34m56s", "1d 02:03:04" or a spreadsheet's day fraction;
- "DNF" / "Abandon" written in the time column;
- a birth date in any layout (only the year is kept anyway);
- no rank column at all, or one that turns out to be a category ranking;
- blank lines and sub-total rows.

Everything it changes is said: `ResultTable.columns` records which header each field came from,
and `notes` carries a warning for anything a reader of the file might not expect. What is unclear
is left as it is, for validation to report.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .countries import ALPHA2, NAMES, SPORT_CODES
from .reader import read_table
from .schema import EXTRA_RESULT_ALIASES, RESULT_FIELDS, _normalize_header, clean_cell, non_finisher_code, normalize_gender, rank_position
from .time_utils import canonical_time, format_hms, parse_hms_to_seconds

Note = tuple[str, int | None, str | None, str]  # severity, data row (1-based) or None, field, message


@dataclass
class ResultTable:
    rows: list[dict[str, str]]  # canonical field name -> text
    columns: dict[str, str]  # canonical field name -> the header it was read from
    ignored: list[str]  # headers nothing was read from
    notes: list[Note] = field(default_factory=list)
    headers: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------- headers


def _header_key(header: str) -> str:
    """A header without its unit or hint in brackets: "Time (hh:mm:ss)" -> "time"."""
    stripped = re.sub(r"[\(\[].*?[\)\]]", " ", header)
    return _normalize_header(stripped) or _normalize_header(header)


def _all_aliases() -> set[str]:
    known = {alias for spec in RESULT_FIELDS for alias in spec.normalized_aliases}
    for aliases in EXTRA_RESULT_ALIASES.values():
        known.update(_normalize_header(alias) for alias in aliases)
    return known


_KNOWN_HEADERS = _all_aliases()


def header_score(row: list[str]) -> int:
    """How many cells of a row are column names OTRI knows: the header row has several, a title
    line or a data row has none or one."""
    return sum(1 for cell in row if cell and len(cell) <= 40 and _header_key(cell) in _KNOWN_HEADERS)


def match_columns(headers: list[str]) -> dict[str, str]:
    by_key: dict[str, str] = {}
    for header in headers:
        by_key.setdefault(_header_key(header), header)
    mapping: dict[str, str] = {}
    for spec in RESULT_FIELDS:
        for alias in spec.normalized_aliases:
            if alias in by_key and by_key[alias] not in mapping.values():
                mapping[spec.canonical] = by_key[alias]
                break
    for canonical, aliases in EXTRA_RESULT_ALIASES.items():
        for alias in aliases:
            key = _normalize_header(alias)
            if key in by_key and by_key[key] not in mapping.values():
                mapping[canonical] = by_key[key]
                break
    return mapping


# ---------------------------------------------------------------------------- names

# How many words of one name cell are looked at. A results file is public and anonymous at
# /score, so the cost of one cell has to be bounded by something other than good faith.
MAX_NAME_WORDS = 24
_PARTICLES = {"de", "del", "della", "di", "da", "dos", "das", "du", "la", "le", "van", "von", "der", "den", "ter", "ten", "bin", "binti", "al", "el", "st", "mc", "na"}


def _is_upper_word(word: str) -> bool:
    letters = [ch for ch in word if ch.isalpha()]
    return len(letters) >= 2 and all(ch.isupper() for ch in letters)


def split_name(text: str, family_first: bool = False) -> tuple[str, str]:
    """(family name, first name) from one cell.

    "Walmsley, Jim" and "WALMSLEY Jim" / "Jim WALMSLEY" say which is which. Otherwise the last
    word is the family name ("Jim Walmsley"), with its particles ("Ludovic de la Tour"), unless
    the column itself says family name first ("Nom Prénom"). A single word is a family name.
    """
    text = re.sub(r"\s+", " ", text).strip().strip(",")
    if not text:
        return "", ""
    if "," in text:
        family, _, first = text.partition(",")
        return family.strip(), first.strip()
    # Nobody is named in more than a handful of words. The cap matters because everything below
    # walks the list: a cell of thousands of particles ("de de de ... SMITH Jim") is not a name,
    # and one 24 KB cell used to cost the scorer a fifth of a second all by itself.
    words = text.split(" ", MAX_NAME_WORDS)[:MAX_NAME_WORDS]
    if len(words) == 1:
        return words[0], ""
    upper = [_is_upper_word(word) for word in words]
    if any(upper) and not all(upper):
        # `any(upper)` is true throughout this branch. It used to be tested again for every word,
        # which walked the list once per word: the cost grew with the square of the word count.
        family = " ".join(word for word, is_upper in zip(words, upper) if is_upper or word.lower() in _PARTICLES)
        first = " ".join(word for word, is_upper in zip(words, upper) if not is_upper and word.lower() not in _PARTICLES)
        if family and first:
            return family, first
    if family_first:
        return words[0], " ".join(words[1:])
    split = len(words) - 1
    while split > 1 and words[split - 1].lower() in _PARTICLES:
        split -= 1
    return " ".join(words[split:]), " ".join(words[:split])


# ---------------------------------------------------------------------------- gender in a category

_GENDER_WORDS = {
    "M": ("male", "men", "man", "mens", "homme", "hommes", "masculin", "masculino", "hombres", "herren", "manner", "maenner", "uomini", "maschile", "heren", "ชาย"),
    "F": ("female", "women", "woman", "womens", "ladies", "lady", "femme", "femmes", "feminin", "femenino", "mujeres", "damen", "frauen", "donne", "femminile", "dames", "หญิง"),
}
# French federation categories: espoir, senior, master/vétéran ... followed by H or F.
_FRENCH_CATEGORY = re.compile(r"^(?:ca|ju|es|se|ma|m\d{1,2}|v\d)\s?([hfm])$")
_LETTER_THEN_AGE = re.compile(r"^([mfwhd])\s?(?:\d|u\d|sen|senior|vet|open|elite|pro|hk|jun|master|overall)")
_AGE_THEN_LETTER = re.compile(r"(?:\d|\+|sen|senior|vet|open|elite|master)\s?([mfwh])$")
_LETTER = {"m": "M", "h": "M", "f": "F", "w": "F", "d": "F"}


def gender_from_category(category: str) -> str | None:
    """'M' or 'F' when an age-group or category label carries it, else None."""
    key = _normalize_header(category)
    if not key:
        return None
    words = key.split(" ")
    for code, names in _GENDER_WORDS.items():
        if any(word in names for word in words):
            return code
    compact = key.replace(" ", "")
    match = _FRENCH_CATEGORY.match(compact) or _LETTER_THEN_AGE.match(compact) or _AGE_THEN_LETTER.search(compact)
    if match:
        return _LETTER[match.group(1)]
    return _LETTER.get(compact) if compact in ("m", "f", "w", "h") else None


# ---------------------------------------------------------------------------- nationality


def country_code(value: str) -> str | None:
    """ISO alpha-3 for "FRA", "FR", "France", "GER" or "Frankreich"; None when it is not a country."""
    raw = clean_cell(value)
    raw = re.sub(r"[\U0001F1E6-\U0001F1FF]", "", raw).strip().strip("()[]").strip()  # flag emoji, brackets
    if not raw:
        return None
    upper = raw.upper()
    if upper in SPORT_CODES:
        return SPORT_CODES[upper]
    if len(upper) == 3 and upper.isalpha() and upper in _ALPHA3:
        return upper
    if len(upper) == 2 and upper in ALPHA2:
        return ALPHA2[upper]
    return NAMES.get(_normalize_header(raw))


_ALPHA3 = set(ALPHA2.values())


# ---------------------------------------------------------------------------- the table

_YEAR = re.compile(r"(?<!\d)(19[2-9]\d|20[0-2]\d)(?!\d)")
_LEADING_POSITION = re.compile(r"^#?\s*(\d+)\s*(?:/|of|sur|von)\s*\d+$", re.IGNORECASE)
_MAX_ROW_NOTES = 12


def load_result_table(path: str | Path) -> ResultTable:
    headers, raw_rows = read_table(Path(path), header_score)
    mapping = match_columns(headers)
    notes: list[Note] = []

    # "Nom" alone, with no first-name column beside it, holds the whole name.
    if "full_name" not in mapping and "family_name" in mapping and "first_name" not in mapping:
        mapping["full_name"] = mapping.pop("family_name")
    family_first = "full_name" in mapping and bool(re.match(r"^(nom|last|family|surname|apellido|cognome|nachname)", _header_key(mapping["full_name"])))

    index = {header: position for position, header in enumerate(headers)}

    def cell(row: list[str], canonical: str) -> str:
        header = mapping.get(canonical)
        if header is None:
            return ""
        position = index[header]
        return row[position].strip() if position < len(row) else ""

    rows: list[dict[str, str]] = []
    gender_from_cat = 0
    for raw in raw_rows:
        family, first = cell(raw, "family_name"), cell(raw, "first_name")
        if "full_name" in mapping and not (family and first):
            split_family, split_first = split_name(cell(raw, "full_name"), family_first)
            family, first = family or split_family, first or split_first
        time_raw, status, rank_raw = cell(raw, "finish_time"), cell(raw, "status"), cell(raw, "rank")
        if not (family or first) and not clean_cell(time_raw) and not clean_cell(rank_raw):
            continue  # a blank line, a sub-total, a footer

        # "DNF" or "Abandon" written where the time would be.
        if non_finisher_code(time_raw):
            status, time_raw = status or time_raw, ""
        position = _LEADING_POSITION.match(clean_cell(rank_raw))
        if position:
            rank_raw = position.group(1)

        gender = normalize_gender(cell(raw, "gender"))
        if gender is None and "category" in mapping:
            gender = gender_from_category(cell(raw, "category"))
            gender_from_cat += gender is not None

        nationality_raw = cell(raw, "nationality")
        birth = clean_cell(cell(raw, "birthdate")) or clean_cell(cell(raw, "birth_year"))
        year = _YEAR.search(birth)
        rows.append(
            {
                "rank": rank_raw,
                "finish_time": canonical_time(time_raw),
                "family_name": family,
                "first_name": first,
                "gender": gender or cell(raw, "gender"),
                "status": status,
                "birthdate": "",
                "birth_year": year.group(1) if year else "",
                "nationality": country_code(nationality_raw) or nationality_raw,
                "bib_number": cell(raw, "bib_number"),
                "city": cell(raw, "city"),
                "team": cell(raw, "team"),
                "race": cell(raw, "race"),
            }
        )

    if "full_name" in mapping:
        notes.append(("warning", None, "family_name", f"names were split from the single column “{mapping['full_name']}”; check a few rows of the result"))
    if gender_from_cat and "gender" not in mapping:
        notes.append(("warning", None, "gender", f"gender was read from the category column “{mapping['category']}”"))
    unknown_gender = [number for number, row in enumerate(rows, start=1) if normalize_gender(row["gender"]) is None and not clean_cell(row["gender"])]
    if unknown_gender:
        for row_number in unknown_gender:
            rows[row_number - 1]["gender"] = "X"
        where = "the file has no gender column" if "gender" not in mapping and "category" not in mapping else f"{len(unknown_gender)} row{'s' if len(unknown_gender) != 1 else ''} without a gender"
        notes.append(("warning", None, "gender", f"{where}: those runners are scored, but left out of the women's and men's rankings"))

    _settle_ranks(rows, "rank" in mapping, mapping.get("rank"), notes)

    columns = {canonical: header for canonical, header in mapping.items()}
    used = set(mapping.values())
    ignored = [header for header in headers if header and header not in used]
    return ResultTable(rows=rows, columns=columns, ignored=ignored, notes=notes, headers=headers)


def _settle_ranks(rows: list[dict[str, str]], has_rank_column: bool, rank_header: str | None, notes: list[Note]) -> None:
    """Make sure every row says where it finished or that it did not.

    A row with no time and no position is a DNF. With no rank column, or one that is evidently not
    an overall ranking (positions repeat with different times: a category ranking), positions are
    worked out from the finish times, equal times sharing a position. The organizer's own ranking
    is otherwise kept as it is, including where it departs from the order of the times (a penalty,
    gun against chip time): that is theirs to decide, and validation only points it out.
    """
    finishers: list[int] = []
    assumed_dnf: list[int] = []
    for number, row in enumerate(rows):
        code = non_finisher_code(row["rank"]) or non_finisher_code(row["status"])
        if code:
            if not non_finisher_code(row["rank"]):
                row["rank"] = code
            continue
        if parse_hms_to_seconds(row["finish_time"]) is None and not clean_cell(row["finish_time"]):
            if rank_position(row["rank"]) is None:
                row["rank"] = "DNF"
                assumed_dnf.append(number + 1)
            continue
        finishers.append(number)
    if assumed_dnf:
        listed = ", ".join(str(number) for number in assumed_dnf[:_MAX_ROW_NOTES]) + (", …" if len(assumed_dnf) > _MAX_ROW_NOTES else "")
        notes.append(("warning", None, "rank", f"{len(assumed_dnf)} row{'s' if len(assumed_dnf) != 1 else ''} with no time and no position counted as DNF (row {listed})"))

    timed = [number for number in finishers if parse_hms_to_seconds(rows[number]["finish_time"]) is not None]
    reason = None
    if not has_rank_column:
        reason = "the file has no rank column"
    else:
        missing = [number for number in timed if rank_position(rows[number]["rank"]) is None and not clean_cell(rows[number]["rank"])]
        by_position: dict[int, set[int]] = {}
        for number in timed:
            position = rank_position(rows[number]["rank"])
            if position is not None:
                by_position.setdefault(position, set()).add(parse_hms_to_seconds(rows[number]["finish_time"]) or 0)
        repeated = sum(1 for times in by_position.values() if len(times) > 1)
        if missing and len(missing) == len(timed):
            reason = f"the column “{rank_header}” is empty"
        elif repeated > max(2, len(by_position) // 20):
            reason = f"the column “{rank_header}” repeats positions with different times, so it is not an overall ranking"
        elif missing:
            reason = f"{len(missing)} finisher{'s' if len(missing) != 1 else ''} had no position in “{rank_header}”"
    if reason and timed:
        ordered = sorted(timed, key=lambda number: parse_hms_to_seconds(rows[number]["finish_time"]) or 0)
        previous_seconds, position = None, 0
        for place, number in enumerate(ordered, start=1):
            seconds = parse_hms_to_seconds(rows[number]["finish_time"])
            if seconds != previous_seconds:
                position, previous_seconds = place, seconds
            rows[number]["rank"] = str(position)
        notes.append(("warning", None, "rank", f"{reason}: positions were worked out from the finish times"))


__all__ = ["ResultTable", "load_result_table", "split_name", "gender_from_category", "country_code", "header_score", "format_hms"]
