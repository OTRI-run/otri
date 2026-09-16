"""PostgreSQL persistence layer for the OTRI API.

Replaces the prototype-era CSV-append/discard behavior documented in
api/README.md's former "Known gaps" — organizer accounts, races, and
submitted results now survive a server restart. Schema is created on first
connection (``init_db()``), no separate migration tool: the schema is small
and stable enough that a migration framework would be premature (HANDBOOK.md
"start small").

Connection string via ``DATABASE_URL``, e.g.:
    postgresql://postgres:otri_dev_password@localhost:5432/otri
"""

from __future__ import annotations

import os
from contextlib import contextmanager
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

CREATE TABLE IF NOT EXISTS races (
    race_id TEXT PRIMARY KEY,
    race_name TEXT NOT NULL,
    event_date DATE NOT NULL,
    course_name TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    elevation_gain_m DOUBLE PRECISION NOT NULL,
    organizer_id INTEGER REFERENCES organizers(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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


# --- Races -------------------------------------------------------------


def list_races() -> list[RaceRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT race_id, race_name, event_date, course_name, distance_km, elevation_gain_m "
            "FROM races ORDER BY event_date"
        ).fetchall()
    return [RaceRecord(**row) for row in rows]


def find_race(race_id: str) -> RaceRecord | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT race_id, race_name, event_date, course_name, distance_km, elevation_gain_m "
            "FROM races WHERE race_id = %s",
            (race_id,),
        ).fetchone()
    return RaceRecord(**row) if row else None


def insert_race(race: RaceRecord, organizer_id: int | None = None) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO races (race_id, race_name, event_date, course_name, distance_km, elevation_gain_m, organizer_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                race.race_id,
                race.race_name,
                race.event_date,
                race.course_name,
                race.distance_km,
                race.elevation_gain_m,
                organizer_id,
            ),
        )


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
