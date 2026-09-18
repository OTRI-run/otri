"""iCalendar (RFC 5545) output for the race calendar.

One all-day VEVENT per event (an edition, e.g. "Doi Trail 2027"), its distances in the
description, linking back to the race page. Used for a single "add to calendar" download and
for the subscribable feed of upcoming races; a calendar app that subscribes re-reads the feed,
so a date corrected on OTRI corrects itself in the runner's calendar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone


@dataclass(frozen=True)
class CalendarRace:
    race_id: str
    course_name: str
    distance_km: float
    elevation_gain_m: float


@dataclass
class CalendarEvent:
    event_id: str
    name: str
    day: date
    location: str | None = None
    country: str | None = None
    website: str | None = None
    races: list[CalendarRace] = field(default_factory=list)


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "")


def _fold(line: str) -> str:
    """Lines longer than 75 octets continue on the next line after one space (RFC 5545 section 3.1)."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, limit = [], 75
    while raw:
        cut = min(limit, len(raw))
        while cut < len(raw) and (raw[cut] & 0xC0) == 0x80:  # never split a multi-byte character
            cut -= 1
        parts.append(raw[:cut].decode("utf-8"))
        raw, limit = raw[cut:], 74
    return "\r\n ".join(parts)


def _event_lines(event: CalendarEvent, site_url: str, stamp: str) -> list[str]:
    races = sorted(event.races, key=lambda race: race.distance_km)
    page = f"{site_url}/#races/{races[0].race_id}" if races else f"{site_url}/#races"
    distances = [f"{race.course_name}: {race.distance_km:g} km, +{race.elevation_gain_m:,.0f} m" for race in races]
    description = "\n".join([*distances, "", f"Course, target times and scores: {page}", *([f"Official website: {event.website}"] if event.website else [])])
    place = ", ".join(part for part in (event.location, event.country) if part)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{event.event_id}@otri.run",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{event.day:%Y%m%d}",
        f"DTEND;VALUE=DATE:{event.day + timedelta(days=1):%Y%m%d}",
        f"SUMMARY:{_escape(event.name)}",
        f"DESCRIPTION:{_escape(description)}",
        f"URL:{page}",
        "TRANSP:TRANSPARENT",
    ]
    if place:
        lines.insert(6, f"LOCATION:{_escape(place)}")
    return [*lines, "END:VEVENT"]


def build_calendar(events: list[CalendarEvent], site_url: str, name: str = "OTRI trail race calendar", now: datetime | None = None) -> str:
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OTRI//Race calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(name)}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
        "X-PUBLISHED-TTL:PT12H",
    ]
    for event in sorted(events, key=lambda e: (e.day, e.name)):
        lines += _event_lines(event, site_url.rstrip("/"), stamp)
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
