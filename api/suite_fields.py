"""Field cleaning for the race suite: what is typed becomes what is stored, and the correction is
said out loud.

Every organizer's entry list arrives in a different shape: names in capitals, "Male" in one row
and "m" in the next, a date of birth where a year was asked for, "Thailand" where a code goes,
"007" and "7" on two rows. Each cleaner takes the raw value and returns ``(value, note)``: the
value to store, and a short note when it differs from what was typed in a way worth telling
("re-cased", "read as 1990", "Thailand → THA"), or None when it was fine as it was. The notes
add up to the import's "what was corrected" summary, so nothing is changed silently.

Rules are deliberately conservative: a mixed-case name is somebody's own spelling and is kept;
only all-capitals and all-lower-case names are re-cased. Nothing is guessed from two-digit years.
"""

from __future__ import annotations

import re
from datetime import date

from ingestion.normalize import country_code
from ingestion.schema import normalize_gender

_WS = re.compile(r"\s+")
_YEAR = re.compile(r"(?<!\d)(18\d{2}|19\d{2}|20\d{2})(?!\d)")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Particles that stay lower-case inside a re-cased name: "van der Berg", "de la Cruz".
_PARTICLES = {"van", "der", "den", "de", "la", "le", "du", "des", "von", "zu", "da", "di", "del", "della", "dos", "das", "y", "e", "bin", "binti", "al", "el"}
_MC = re.compile(r"^(mc|mac|o')([a-z])")


def squeeze(value: str | None) -> str:
    return _WS.sub(" ", (value or "").strip())


def _title_word(word: str, first: bool) -> str:
    if not word:
        return word
    if not first and word.lower() in _PARTICLES:
        return word.lower()
    parts = word.lower().split("'")
    parts = [p[:1].upper() + p[1:] for p in parts]
    out = "'".join(parts)
    match = _MC.match(word.lower())
    if match and len(word) > len(match.group(1)) + 1:
        prefix = match.group(1)
        out = prefix[:1].upper() + prefix[1:] + word[len(prefix) :].lower()
        out = out[: len(prefix)] + out[len(prefix)].upper() + out[len(prefix) + 1 :]
    return out


def clean_name(value: str | None) -> tuple[str, str | None]:
    """Whitespace squeezed; ALL CAPS or all lower re-cased word by word, hyphens and particles kept."""
    raw = squeeze(value)
    if not raw:
        return "", None
    letters = [c for c in raw if c.isalpha()]
    if not letters or not (all(c.isupper() for c in letters) or all(c.islower() for c in letters)):
        return raw, None
    words = []
    for index, word in enumerate(raw.split(" ")):
        words.append("-".join(_title_word(part, index == 0 and i == 0) for i, part in enumerate(word.split("-"))))
    cased = " ".join(words)
    return cased, (f"re-cased from “{raw}”" if cased != raw else None)


def clean_gender(value: str | None) -> tuple[str, str | None]:
    """M, F or X from the usual words in several languages; X with a note when nothing fits."""
    raw = squeeze(value)
    if not raw:
        return "X", None
    upper = raw.upper()
    if upper in ("M", "F", "X"):
        return upper, None
    if upper in ("W", "D", "H"):
        code = {"W": "F", "D": "X", "H": "M"}[upper]
        return code, f"“{raw}” read as {code}"
    code = normalize_gender(raw)
    if code in ("M", "F", "X"):
        return code, f"“{raw}” read as {code}"
    if upper.startswith(("MA", "MÄ", "HO", "UO", "MAS", "MÊ")):
        return "M", f"“{raw}” read as M"
    if upper.startswith(("FE", "WO", "WE", "FR", "MU", "DO", "VR", "NA")):
        return "F", f"“{raw}” read as F"
    if upper in ("NB", "NON-BINARY", "NONBINARY", "DIVERS", "DIVERSE", "OTHER", "PREFER NOT TO SAY"):
        return "X", None
    return "X", f"“{raw}” is not a gender OTRI knows: stored as X"


def clean_birth_year(value: str | int | None, *, today: date | None = None) -> tuple[int | None, str | None]:
    """A four-digit year, also from a full date; none for anything else, and none for an
    implausible age (younger than 5 or older than 110)."""
    if value is None:
        return None, None
    raw = squeeze(str(value))
    if not raw:
        return None, None
    today = today or date.today()
    match = _YEAR.search(raw)
    if not match:
        return None, f"“{raw}” has no year in it: left empty"
    year = int(match.group(1))
    if not (today.year - 110 <= year <= today.year - 5):
        return None, f"{year} is not a plausible year of birth: left empty"
    note = None if raw == str(year) else f"“{raw}” read as {year}"
    return year, note


def clean_nationality(value: str | None) -> tuple[str | None, str | None]:
    raw = squeeze(value)
    if not raw:
        return None, None
    code = country_code(raw)
    if code is None:
        return None, f"“{raw}” is not a country OTRI knows: left empty"
    return code, (None if code == raw.upper() else f"“{raw}” → {code}")


def clean_bib(value: str | int | None) -> tuple[str | None, str | None]:
    """Upper-case, no spaces, no leading zeros on a number ("007" and "7" are one bib)."""
    if value is None:
        return None, None
    raw = re.sub(r"\s+", "", str(value)).upper().lstrip("#")
    if not raw:
        return None, None
    if raw.isdigit():
        stripped = raw.lstrip("0") or "0"
        return stripped, (f"“{raw}” stored as {stripped}" if stripped != raw else None)
    return raw[:12], None


def clean_phone_text(value: str | None) -> tuple[str | None, str | None]:
    """An emergency contact as typed, with whitespace squeezed and a phone number kept readable."""
    raw = squeeze(value)
    if not raw:
        return None, None
    return raw, None


def clean_email(value: str | None) -> tuple[str | None, str | None]:
    raw = squeeze(value).lower()
    if not raw:
        return None, None
    if not _EMAIL.match(raw):
        return None, f"“{raw}” is not an email address: left empty"
    return raw, None


def clean_text(value: str | None, limit: int = 500) -> tuple[str | None, str | None]:
    raw = squeeze(value)[:limit]
    return (raw or None), None


def clean_participant(values: dict, *, today: date | None = None) -> tuple[dict, list[str]]:
    """Every participant field through its cleaner. Returns the cleaned dict (only the keys given)
    and the notes, each prefixed with the field's label."""
    out: dict = {}
    notes: list[str] = []

    def take(key: str, label: str, result: tuple) -> None:
        value, note = result
        out[key] = value
        if note:
            notes.append(f"{label}: {note}")

    if "family_name" in values:
        take("family_name", "last name", clean_name(values["family_name"]))
    if "first_name" in values:
        take("first_name", "first name", clean_name(values["first_name"]))
    if "gender" in values:
        take("gender", "gender", clean_gender(values["gender"]))
    if "birth_year" in values:
        take("birth_year", "year of birth", clean_birth_year(values["birth_year"], today=today))
    if "nationality" in values:
        take("nationality", "nationality", clean_nationality(values["nationality"]))
    if "bib" in values:
        take("bib", "bib", clean_bib(values["bib"]))
    if "club" in values:
        take("club", "club", clean_text(values["club"], 120))
    if "emergency_contact" in values:
        take("emergency_contact", "emergency contact", clean_phone_text(values["emergency_contact"]))
    if "email" in values:
        take("email", "email", clean_email(values["email"]))
    if "notes" in values:
        take("notes", "notes", clean_text(values["notes"], 500))
    for key in ("status", "payment_status", "payment_reference", "registered_via"):
        if key in values:
            out[key] = values[key]
    return out, notes


# ---------------------------------------------------------------------------- checkpoints

_CUTOFF = re.compile(r"^\s*(?:(\d{1,3})\s*[h:]\s*(\d{1,2})?\s*(?:m|min)?|(\d{1,4})\s*(?:m|min|minutes?)?)\s*$", re.IGNORECASE)


def parse_minutes(value: str | int | float | None) -> tuple[int | None, str | None]:
    """Minutes from "240", "4h", "4h00", "4:30", "90 min"; None when empty or unreadable."""
    if value is None:
        return None, None
    if isinstance(value, (int, float)):
        return int(value), None
    raw = squeeze(str(value)).lower()
    if not raw:
        return None, None
    match = _CUTOFF.match(raw)
    if not match:
        return None, f"“{raw}” is not a time OTRI can read: use minutes, or 4h30"
    if match.group(1) is not None:
        minutes = int(match.group(1)) * 60 + int(match.group(2) or 0)
    else:
        minutes = int(match.group(3))
    return minutes, (None if raw == str(minutes) else f"“{raw}” read as {minutes} minutes")


def parse_km(value: str | int | float | None) -> tuple[float | None, str | None]:
    """Kilometres from "18.5", "18,5", "18.5 km", "18500 m"."""
    if value is None:
        return None, None
    if isinstance(value, (int, float)):
        return float(value), None
    original = squeeze(str(value))
    raw = original.lower().replace(",", ".")
    if not raw:
        return None, None
    match = re.match(r"^([\d.]+)\s*(km|k|m)?$", raw)
    if not match:
        return None, f"“{original}” is not a distance OTRI can read"
    number = float(match.group(1))
    if match.group(2) == "m":
        number = number / 1000
    number = round(number, 2)
    same = original in (str(number), f"{number:g}")
    return number, (None if same else f"“{original}” read as {number:g} km")


def clean_checkpoint_name(value: str | None) -> tuple[str, str | None]:
    raw = squeeze(value)
    if raw and raw.islower():
        cased = raw[:1].upper() + raw[1:]
        return cased, f"re-cased from “{raw}”"
    return raw, None
