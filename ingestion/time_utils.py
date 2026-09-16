"""Small time-string helpers shared by validation and record parsing."""

from __future__ import annotations


def parse_hms_to_seconds(value: str) -> int | None:
    """Parse an 'H:MM:SS' / 'HH:MM:SS' / 'HHH:MM:SS' string into whole seconds.

    Returns ``None`` if the value is empty or not well-formed, rather than
    raising, since callers use this in both validation (where malformed input
    is expected and reported) and record parsing (where input is already
    known-valid).
    """
    parts = value.strip().split(":")
    if len(parts) != 3:
        return None
    try:
        hours, minutes, seconds = (int(part) for part in parts)
    except ValueError:
        return None
    return hours * 3600 + minutes * 60 + seconds
