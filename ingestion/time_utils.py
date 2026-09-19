"""Small time-string helpers shared by validation and record parsing."""

from __future__ import annotations

import re

_FULL = re.compile(r"^(\d{1,3}):([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$")
_SHORT = re.compile(r"^(\d{1,3}):([0-5]\d)$")

# The other ways timing software writes a finish time.
_DAYS = re.compile(r"^(\d{1,2})\s*(?:d|j|day|days|jour|jours|tag|tage)?[\s.]\s*(\d{1,2}):([0-5]\d):([0-5]\d)(?:[.,]\d+)?$", re.IGNORECASE)
_MIN_UNIT = r"(?:m|mn|min|mins|minutes?|['′’])"
_SEC_UNIT = r"(?:s|sec|secs|seconds?|\"|''|″|”)"
# 12h34m56s, 12h34'56'', 12 h 34 min, 12h34 (a bare number after the hours is minutes)
_LETTERS = re.compile(
    rf"^(\d{{1,3}})\s*(?:h|hr|hrs|hours?|std)\.?\s*(?:(\d{{1,2}})\s*{_MIN_UNIT}?\.?\s*(?:(\d{{1,2}})(?:[.,]\d+)?\s*{_SEC_UNIT}?)?)?$",
    re.IGNORECASE,
)
# 45m12s, 45'12'' (no hours)
_MINUTES = re.compile(rf"^(\d{{1,3}})\s*{_MIN_UNIT}\.?\s*(\d{{1,2}})(?:[.,]\d+)?\s*{_SEC_UNIT}?$", re.IGNORECASE)
_ISO_DURATION = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$", re.IGNORECASE)
# What a spreadsheet keeps behind a time cell: a fraction of a day, with many decimals.
_DAY_FRACTION = re.compile(r"^\d?\.\d{4,}$")


def parse_hms_to_seconds(value: str) -> int | None:
    """Parse a finish time into whole seconds.

    Accepts 'H:MM:SS', 'HH:MM:SS', 'HHH:MM:SS', the same with fractional seconds
    ('1:02:03.45', rounded to the nearest second), and 'MM:SS' (no hours part, as
    short road results are often exported). Returns ``None`` if the value is empty or
    not well-formed, rather than raising, since callers use this in both validation
    (where malformed input is expected and reported) and record parsing (where input
    is already known-valid).
    """
    raw = value.strip().strip("-–—").strip()
    match = _FULL.match(raw)
    if match:
        hours, minutes, seconds, fraction = match.groups()
        total = int(hours) * 3600 + int(minutes) * 60 + int(seconds)
        if fraction and int(fraction.ljust(3, "0")) >= 500:
            total += 1
        return total
    match = _SHORT.match(raw)
    if match:
        minutes, seconds = match.groups()
        return int(minutes) * 60 + int(seconds)
    return None


def format_hms(seconds: int) -> str:
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def canonical_time(value: str) -> str:
    """A finish time rewritten as H:MM:SS when it is written another way that leaves no doubt:
    '12h34m56s', "12h34'56''", '12h34', '1d 02:03:04', '1.02:03:04', 'PT12H34M56S', or the fraction
    of a day a spreadsheet keeps behind a time cell (0.5236 = 12:33:59). Anything else, including a
    plain H:MM:SS and MM:SS, is returned as it came, for the validator to judge."""
    raw = value.strip().strip("-–—").strip()
    if not raw or _FULL.match(raw) or _SHORT.match(raw):
        return raw
    match = _DAYS.match(raw)
    if match:
        days, hours, minutes, seconds = (int(part) for part in match.groups())
        return format_hms(days * 86400 + hours * 3600 + minutes * 60 + seconds)
    match = _ISO_DURATION.match(raw)
    if match and any(match.groups()):
        hours, minutes, seconds = (int(part or 0) for part in match.groups())
        return format_hms(hours * 3600 + minutes * 60 + seconds)
    if re.search(r"[a-zA-Z'′’\"]", raw):
        match = _LETTERS.match(raw)
        if match:
            hours, minutes, seconds = (int(part or 0) for part in match.groups())
            if minutes < 60 and seconds < 60:
                return format_hms(hours * 3600 + minutes * 60 + seconds)
        match = _MINUTES.match(raw)
        if match and int(match.group(2)) < 60:
            return format_hms(int(match.group(1)) * 60 + int(match.group(2)))
        return raw
    if _DAY_FRACTION.match(raw):
        try:
            seconds = round(float(raw) * 86400)
        except ValueError:
            return raw
        return format_hms(seconds) if 60 <= seconds < 10 * 86400 else raw
    return raw
