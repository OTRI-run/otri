"""PostgreSQL persistence layer for the OTRI API.

Schema is created on first connection (``init_db()``), no separate migration
tool: the schema is small and stable enough that a migration framework would
be premature (HANDBOOK.md "start small").

Data model: an **event** (e.g. "Phuket Mountain Trail 2026") owned by an
organizer can have multiple **race distances** under it (e.g. "50K", "30K"),
each with its own course data and, optionally, an attached GPX file.

Connection string via ``DATABASE_URL``, e.g.:
    postgresql://postgres:otri_dev_password@localhost:5432/otri
"""

from __future__ import annotations

import os
import secrets
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from ingestion.records import RaceRecord, ResultRecord

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:otri_dev_password@localhost:5432/otri")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS organizers (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token TEXT PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_date DATE NOT NULL,
    organizer_id INTEGER REFERENCES organizers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS races (
    race_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    elevation_gain_m DOUBLE PRECISION NOT NULL,
    gpx_filename TEXT,
    gpx_content TEXT,
    scoring_version TEXT NOT NULL DEFAULT '1.0.0-course-standard',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    rank TEXT NOT NULL,
    finish_time_seconds INTEGER,
    family_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    bib_number TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


class NotFoundError(Exception):
    """Raised when looking up an event/race that doesn't exist."""


@dataclass(frozen=True)
class Event:
    event_id: str
    event_name: str
    event_date: date
    organizer_id: int | None


@dataclass(frozen=True)
class Race:
    race_id: str
    event_id: str
    course_name: str
    distance_km: float
    elevation_gain_m: float
    has_gpx: bool
    scoring_version: str
    event_name: str | None = None
    event_date: date | None = None
    organizer_id: int | None = None

    def to_race_record(self) -> RaceRecord:
        """Adapt to the shape ``scoring.score_race()`` expects."""
        return RaceRecord(
            race_id=self.race_id,
            race_name=self.event_name or self.course_name,
            event_date=self.event_date or date.today(),
            course_name=self.course_name,
            distance_km=self.distance_km,
            elevation_gain_m=self.elevation_gain_m,
        )


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    """Yield a connection with dict-style row access, committing on success."""
    connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Create all tables if they don't already exist. Safe to call on every startup."""
    with get_connection() as connection:
        connection.execute(_SCHEMA)


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4)}"


# --- Events --------------------------------------------------------------


def list_events() -> list[Event]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT event_id, event_name, event_date, organizer_id FROM events ORDER BY event_date"
        ).fetchall()
    return [Event(**row) for row in rows]


def find_event(event_id: str) -> Event | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT event_id, event_name, event_date, organizer_id FROM events WHERE event_id = %s", (event_id,)
        ).fetchone()
    return Event(**row) if row else None


def create_event(event_name: str, event_date_: date, organizer_id: int | None, event_id: str | None = None) -> Event:
    event_id = event_id or _new_id("evt")
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO events (event_id, event_name, event_date, organizer_id) VALUES (%s, %s, %s, %s)",
            (event_id, event_name, event_date_, organizer_id),
        )
    return Event(event_id=event_id, event_name=event_name, event_date=event_date_, organizer_id=organizer_id)


def update_event(event_id: str, *, event_name: str | None = None, event_date_: date | None = None) -> Event:
    with get_connection() as connection:
        row = connection.execute(
            "UPDATE events SET event_name = COALESCE(%s, event_name), event_date = COALESCE(%s, event_date), "
            "updated_at = now() WHERE event_id = %s "
            "RETURNING event_id, event_name, event_date, organizer_id",
            (event_name, event_date_, event_id),
        ).fetchone()
        if row is None:
            raise NotFoundError(f"event {event_id!r} not found")
    return Event(**row)


def delete_event(event_id: str) -> None:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM events WHERE event_id = %s", (event_id,))
        if cursor.rowcount == 0:
            raise NotFoundError(f"event {event_id!r} not found")


# --- Races (distances under an event) ------------------------------------

_RACE_JOIN_SELECT = """
    SELECT r.race_id, r.event_id, r.course_name, r.distance_km, r.elevation_gain_m,
           (r.gpx_content IS NOT NULL) AS has_gpx, r.scoring_version,
           e.event_name, e.event_date, e.organizer_id
    FROM races r JOIN events e ON e.event_id = r.event_id
"""


def list_races() -> list[Race]:
    with get_connection() as connection:
        rows = connection.execute(_RACE_JOIN_SELECT + " ORDER BY e.event_date").fetchall()
    return [Race(**row) for row in rows]


def list_races_for_event(event_id: str) -> list[Race]:
    with get_connection() as connection:
        rows = connection.execute(
            _RACE_JOIN_SELECT + " WHERE r.event_id = %s ORDER BY r.distance_km", (event_id,)
        ).fetchall()
    return [Race(**row) for row in rows]


def find_race(race_id: str) -> Race | None:
    with get_connection() as connection:
        row = connection.execute(_RACE_JOIN_SELECT + " WHERE r.race_id = %s", (race_id,)).fetchone()
    return Race(**row) if row else None


def create_race(
    event_id: str,
    course_name: str,
    distance_km: float,
    elevation_gain_m: float,
    race_id: str | None = None,
    scoring_version: str | None = None,
) -> Race:
    race_id = race_id or _new_id("race")
    with get_connection() as connection:
        if scoring_version is None:
            connection.execute(
                "INSERT INTO races (race_id, event_id, course_name, distance_km, elevation_gain_m) "
                "VALUES (%s, %s, %s, %s, %s)",
                (race_id, event_id, course_name, distance_km, elevation_gain_m),
            )
        else:
            connection.execute(
                "INSERT INTO races (race_id, event_id, course_name, distance_km, elevation_gain_m, scoring_version) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (race_id, event_id, course_name, distance_km, elevation_gain_m, scoring_version),
            )
    race = find_race(race_id)
    assert race is not None
    return race


def update_race(
    race_id: str,
    *,
    course_name: str | None = None,
    distance_km: float | None = None,
    elevation_gain_m: float | None = None,
    scoring_version: str | None = None,
) -> Race:
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET course_name = COALESCE(%s, course_name), "
            "distance_km = COALESCE(%s, distance_km), "
            "elevation_gain_m = COALESCE(%s, elevation_gain_m), "
            "scoring_version = COALESCE(%s, scoring_version), "
            "updated_at = now() WHERE race_id = %s",
            (course_name, distance_km, elevation_gain_m, scoring_version, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def delete_race(race_id: str) -> None:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM races WHERE race_id = %s", (race_id,))
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")


def attach_gpx(race_id: str, filename: str, content: str, distance_km: float, elevation_gain_m: float) -> Race:
    """Store a GPX file for a race and refresh its course stats from the real parsed data."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET gpx_filename = %s, gpx_content = %s, distance_km = %s, elevation_gain_m = %s, "
            "updated_at = now() WHERE race_id = %s",
            (filename, content, distance_km, elevation_gain_m, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def get_gpx_content(race_id: str) -> tuple[str, str] | None:
    """Returns (filename, content) or None if no GPX is attached."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT gpx_filename, gpx_content FROM races WHERE race_id = %s AND gpx_content IS NOT NULL", (race_id,)
        ).fetchone()
    return (row["gpx_filename"], row["gpx_content"]) if row else None


# --- Results -------------------------------------------------------------


def _rank_to_db(rank: int | str) -> str:
    return str(rank)


def _rank_from_db(rank: str) -> int | str:
    return int(rank) if rank.isdigit() else rank


def get_results(race_id: str) -> list[ResultRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT rank, finish_time_seconds, family_name, first_name, gender, bib_number "
            "FROM results WHERE race_id = %s ORDER BY id",
            (race_id,),
        ).fetchall()
    return [
        ResultRecord(
            rank=_rank_from_db(row["rank"]),
            finish_time_seconds=row["finish_time_seconds"],
            family_name=row["family_name"],
            first_name=row["first_name"],
            gender=row["gender"],
            bib_number=row["bib_number"],
        )
        for row in rows
    ]


def has_results(race_id: str) -> bool:
    with get_connection() as connection:
        row = connection.execute("SELECT 1 FROM results WHERE race_id = %s LIMIT 1", (race_id,)).fetchone()
    return row is not None


def replace_results(race_id: str, results: list[ResultRecord]) -> None:
    """Overwrite all results for a race in one transaction (re-submission replaces prior data)."""
    with get_connection() as connection:
        connection.execute("DELETE FROM results WHERE race_id = %s", (race_id,))
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO results (race_id, rank, finish_time_seconds, family_name, first_name, gender, bib_number) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                [
                    (
                        race_id,
                        _rank_to_db(result.rank),
                        result.finish_time_seconds,
                        result.family_name,
                        result.first_name,
                        result.gender,
                        result.bib_number,
                    )
                    for result in results
                ],
            )
