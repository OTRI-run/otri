"""Small time-string helpers shared by validation and record parsing."""

from __future__ import annotations

import re

_FULL = re.compile(r"^(\d{1,3}):([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$")
_SHORT = re.compile(r"^(\d{1,3}):([0-5]\d)$")


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
