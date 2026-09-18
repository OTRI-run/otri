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
from psycopg.types.json import Jsonb
import secrets
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime
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
ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT;

CREATE TABLE IF NOT EXISTS races (
    race_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    elevation_gain_m DOUBLE PRECISION NOT NULL,
    gpx_filename TEXT,
    gpx_content TEXT,
    scoring_version TEXT NOT NULL DEFAULT '0.1.0-course-standard-calibrated',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE races ADD COLUMN IF NOT EXISTS measurement JSONB;
ALTER TABLE races ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS totp_secret_pending TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS two_factor_method TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS email_code_hash TEXT;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS email_code_expires_at TIMESTAMPTZ;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS recovery_codes (
    id SERIAL PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_challenges (
    token TEXT PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    code_hash TEXT,
    remember BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runners (
    runner_id TEXT PRIMARY KEY,
    family_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    birth_year INTEGER,
    nationality TEXT,
    name_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runners_name_key_idx ON runners (name_key);

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
ALTER TABLE results ADD COLUMN IF NOT EXISTS birth_year INTEGER;
ALTER TABLE results ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE results ADD COLUMN IF NOT EXISTS runner_id TEXT REFERENCES runners(runner_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS results_runner_id_idx ON results (runner_id);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_label TEXT,
    reason TEXT,
    message TEXT NOT NULL,
    reporter_email TEXT,
    page_url TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution TEXT
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
    organizer_email: str | None = None
    location: str | None = None
    country: str | None = None


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
    measurement_version: str | None = None
    measurement_status: str | None = None
    published_at: datetime | None = None
    is_demo: bool = False
    created_at: datetime | None = None
    event_location: str | None = None
    event_country: str | None = None
    organizer_display: str | None = None
    organizer_website: str | None = None

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


def init_db() -> list[str]:
    """Apply the idempotent baseline, then every pending numbered migration (api/migrations.py).
    Safe to call on every startup. Returns the names of the migrations applied this time."""
    from . import migrations

    with get_connection() as connection:
        connection.execute(_SCHEMA)
        applied = migrations.apply_pending(connection)
    assign_missing_runners()
    return applied


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4)}"


# --- Events --------------------------------------------------------------


def list_events() -> list[Event]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT e.event_id, e.event_name, e.event_date, e.organizer_id, o.email AS organizer_email, e.location, e.country "
            "FROM events e LEFT JOIN organizers o ON o.id = e.organizer_id ORDER BY e.event_date"
        ).fetchall()
    return [Event(**row) for row in rows]


def find_event(event_id: str) -> Event | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT e.event_id, e.event_name, e.event_date, e.organizer_id, o.email AS organizer_email, e.location, e.country "
            "FROM events e LEFT JOIN organizers o ON o.id = e.organizer_id WHERE e.event_id = %s",
            (event_id,),
        ).fetchone()
    return Event(**row) if row else None


def create_event(
    event_name: str,
    event_date_: date,
    organizer_id: int | None,
    event_id: str | None = None,
    *,
    location: str | None = None,
    country: str | None = None,
) -> Event:
    event_id = event_id or _new_id("evt")
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO events (event_id, event_name, event_date, organizer_id, location, country) VALUES (%s, %s, %s, %s, %s, %s)",
            (event_id, event_name, event_date_, organizer_id, location, country),
        )
    return Event(event_id=event_id, event_name=event_name, event_date=event_date_, organizer_id=organizer_id, location=location, country=country)


def update_event(
    event_id: str,
    *,
    event_name: str | None = None,
    event_date_: date | None = None,
    location: str | None = None,
    country: str | None = None,
) -> Event:
    with get_connection() as connection:
        row = connection.execute(
            "UPDATE events SET event_name = COALESCE(%s, event_name), event_date = COALESCE(%s, event_date), "
            "location = COALESCE(%s, location), country = COALESCE(%s, country), "
            "updated_at = now() WHERE event_id = %s "
            "RETURNING event_id, event_name, event_date, organizer_id, location, country",
            (event_name, event_date_, location, country, event_id),
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
           r.measurement->>'version' AS measurement_version,
           r.measurement->>'status' AS measurement_status,
           r.published_at, COALESCE(o.is_demo, FALSE) AS is_demo, r.created_at,
           e.event_name, e.event_date, e.organizer_id, e.location AS event_location, e.country AS event_country,
           COALESCE(NULLIF(o.organization, ''), NULLIF(o.display_name, '')) AS organizer_display, NULLIF(o.website, '') AS organizer_website
    FROM races r JOIN events e ON e.event_id = r.event_id
    LEFT JOIN organizers o ON o.id = e.organizer_id
"""


def list_races(published_only: bool = False) -> list[Race]:
    where = " WHERE r.published_at IS NOT NULL" if published_only else ""
    with get_connection() as connection:
        rows = connection.execute(_RACE_JOIN_SELECT + where + " ORDER BY e.event_date DESC, r.distance_km").fetchall()
    return [Race(**row) for row in rows]


def set_race_published(race_id: str, published: bool) -> Race:
    """Publishing makes a race's results, course and measurement public; unpublishing hides them again."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET published_at = CASE WHEN %s THEN COALESCE(published_at, now()) ELSE NULL END, "
            "updated_at = now() WHERE race_id = %s",
            (published, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def count_races_by_event() -> dict[str, int]:
    with get_connection() as connection:
        rows = connection.execute("SELECT event_id, COUNT(*) AS n FROM races GROUP BY event_id").fetchall()
    return {row["event_id"]: int(row["n"]) for row in rows}


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
    # Pass the version explicitly rather than relying on the column's SQL DEFAULT — `CREATE
    # TABLE IF NOT EXISTS` never updates an already-existing column's default, so an older
    # deployed schema could otherwise keep minting races on a stale/removed model version.
    from scoring import DEFAULT_SCORING_VERSION

    race_id = race_id or _new_id("race")
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO races (race_id, event_id, course_name, distance_km, elevation_gain_m, scoring_version) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (race_id, event_id, course_name, distance_km, elevation_gain_m, scoring_version or DEFAULT_SCORING_VERSION),
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


def attach_gpx(race_id: str, filename: str, content: str, distance_km: float, elevation_gain_m: float, measurement: dict | None = None) -> Race:
    """Store a GPX file for a race and refresh its course stats from the real parsed data."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET gpx_filename = %s, gpx_content = %s, distance_km = %s, elevation_gain_m = %s, "
            "measurement = %s, updated_at = now() WHERE race_id = %s",
            (filename, content, distance_km, elevation_gain_m, Jsonb(measurement) if measurement else None, race_id),
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
            "SELECT rank, finish_time_seconds, family_name, first_name, gender, bib_number, birth_year, nationality, runner_id "
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
            birth_year=row["birth_year"],
            nationality=row["nationality"],
            runner_id=row["runner_id"],
        )
        for row in rows
    ]


def count_results_by_race() -> dict[str, int]:
    with get_connection() as connection:
        rows = connection.execute("SELECT race_id, COUNT(*) AS n FROM results WHERE finish_time_seconds IS NOT NULL GROUP BY race_id").fetchall()
    return {row["race_id"]: int(row["n"]) for row in rows}


def has_results(race_id: str) -> bool:
    with get_connection() as connection:
        row = connection.execute("SELECT 1 FROM results WHERE race_id = %s LIMIT 1", (race_id,)).fetchone()
    return row is not None


def replace_results(race_id: str, results: list[ResultRecord]) -> None:
    """Overwrite all results for a race in one transaction (re-submission replaces prior data).

    Each result is attached to a runner (matched or created) as it is inserted, so runner
    profiles are consistent the moment a submission lands."""
    with get_connection() as connection:
        connection.execute("DELETE FROM results WHERE race_id = %s", (race_id,))
        with connection.cursor() as cursor:
            for result in results:
                runner_id = _match_runner(connection, result)
                cursor.execute(
                    "INSERT INTO results (race_id, rank, finish_time_seconds, family_name, first_name, gender, bib_number, "
                    "birth_year, nationality, runner_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        race_id,
                        _rank_to_db(result.rank),
                        result.finish_time_seconds,
                        result.family_name,
                        result.first_name,
                        result.gender,
                        result.bib_number,
                        result.birth_year,
                        result.nationality,
                        runner_id,
                    ),
                )


# --- Runners (identity across races) ------------------------------------------
#
# See docs/methodology/RUNNER-INDEX-v1.md §3 for the matching rule. Only the year of birth is
# ever stored, never the full date; nationality is a 3-letter code or NULL.


def runner_name_key(family_name: str, first_name: str, gender: str) -> str:
    def norm(text: str) -> str:
        import unicodedata

        folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        return " ".join(folded.lower().split())

    return f"{norm(family_name)}|{norm(first_name)}|{(gender or '').strip().upper()[:1]}"


@dataclass(frozen=True)
class Runner:
    runner_id: str
    family_name: str
    first_name: str
    gender: str
    birth_year: int | None
    nationality: str | None
    result_count: int = 0
    last_race_date: date | None = None


def _match_runner(connection, result: ResultRecord) -> str:
    """The runner_id for a result, matching an existing runner or creating one (see the note)."""
    key = runner_name_key(result.family_name, result.first_name, result.gender)
    candidates = connection.execute(
        "SELECT runner_id, birth_year, nationality FROM runners WHERE name_key = %s ORDER BY created_at, runner_id",
        (key,),
    ).fetchall()
    nat = result.nationality

    def compatible_nationality(row) -> bool:
        return row["nationality"] is None or nat is None or row["nationality"] == nat

    chosen = None
    if result.birth_year is not None:
        exact = [row for row in candidates if row["birth_year"] == result.birth_year]
        if exact:
            chosen = exact[0]["runner_id"]
        else:
            unknown = [row for row in candidates if row["birth_year"] is None and compatible_nationality(row)]
            if len(unknown) == 1:
                chosen = unknown[0]["runner_id"]
                connection.execute("UPDATE runners SET birth_year = %s WHERE runner_id = %s", (result.birth_year, chosen))
    else:
        pool = [row for row in candidates if compatible_nationality(row)]
        if len(pool) == 1:
            chosen = pool[0]["runner_id"]
    if chosen is not None:
        if nat is not None:
            connection.execute(
                "UPDATE runners SET nationality = COALESCE(nationality, %s) WHERE runner_id = %s", (nat, chosen)
            )
        return chosen

    runner_id = _new_id("run")
    connection.execute(
        "INSERT INTO runners (runner_id, family_name, first_name, gender, birth_year, nationality, name_key) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (runner_id, result.family_name.strip(), result.first_name.strip(), (result.gender or "").strip().upper()[:1] or "X", result.birth_year, nat, key),
    )
    return runner_id


def assign_missing_runners() -> int:
    """Attach results that predate the runners table. Idempotent; returns how many were attached."""
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, family_name, first_name, gender, bib_number, birth_year, nationality FROM results "
            "WHERE runner_id IS NULL ORDER BY id"
        ).fetchall()
        for row in rows:
            record = ResultRecord(
                rank=1,
                finish_time_seconds=None,
                family_name=row["family_name"],
                first_name=row["first_name"],
                gender=row["gender"],
                bib_number=row["bib_number"],
                birth_year=row["birth_year"],
                nationality=row["nationality"],
            )
            connection.execute("UPDATE results SET runner_id = %s WHERE id = %s", (_match_runner(connection, record), row["id"]))
    return len(rows)


_RUNNER_SELECT = """
    SELECT ru.runner_id, ru.family_name, ru.first_name, ru.gender, ru.birth_year, ru.nationality,
           COUNT(res.id) AS result_count, MAX(e.event_date) AS last_race_date
    FROM runners ru
    JOIN results res ON res.runner_id = ru.runner_id
    JOIN races ra ON ra.race_id = res.race_id AND ra.published_at IS NOT NULL
    JOIN events e ON e.event_id = ra.event_id
"""


def find_runner(runner_id: str) -> Runner | None:
    with get_connection() as connection:
        row = connection.execute(_RUNNER_SELECT + " WHERE ru.runner_id = %s GROUP BY ru.runner_id", (runner_id,)).fetchone()
    return Runner(**row) if row else None


def search_runners(query: str, limit: int = 25) -> list[Runner]:
    """Runners with at least one published result whose name contains every word of the query."""
    words = [w for w in runner_name_key(query, "", "").split("|")[0].split() if w]
    if not words:
        return []
    clauses = " AND ".join("ru.name_key LIKE %s ESCAPE '\\'" for _ in words)
    # A literal % or _ in the query must not turn into a wildcard that matches every runner.
    escaped = (word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") for word in words)
    params = tuple(f"%{word}%" for word in escaped) + (limit,)
    with get_connection() as connection:
        rows = connection.execute(
            _RUNNER_SELECT + f" WHERE {clauses} GROUP BY ru.runner_id ORDER BY result_count DESC, ru.family_name, ru.first_name LIMIT %s",
            params,
        ).fetchall()
    return [Runner(**row) for row in rows]


def list_runners(limit: int = 500) -> list[Runner]:
    """Every runner with a published result (for the runner index table; bounded)."""
    with get_connection() as connection:
        rows = connection.execute(_RUNNER_SELECT + " GROUP BY ru.runner_id ORDER BY ru.family_name, ru.first_name LIMIT %s", (limit,)).fetchall()
    return [Runner(**row) for row in rows]


def published_results_for_runner(runner_id: str) -> list[dict]:
    """(race_id, event_date) pairs of the runner's results in published races, newest first."""
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT res.id AS result_id, res.race_id, e.event_date FROM results res "
            "JOIN races ra ON ra.race_id = res.race_id AND ra.published_at IS NOT NULL "
            "JOIN events e ON e.event_id = ra.event_id WHERE res.runner_id = %s ORDER BY e.event_date DESC, res.id",
            (runner_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def published_results_grouped_by_race() -> dict[str, list[dict]]:
    """For the runner table: every result in a published race, keyed by race. One query."""
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT res.id AS result_id, res.race_id, res.runner_id, e.event_date FROM results res "
            "JOIN races ra ON ra.race_id = res.race_id AND ra.published_at IS NOT NULL "
            "JOIN events e ON e.event_id = ra.event_id WHERE res.runner_id IS NOT NULL"
        ).fetchall()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["race_id"], []).append(dict(row))
    return grouped


# --- Organizer profile ---------------------------------------------------------

PROFILE_FIELDS = ("display_name", "organization", "website", "phone", "country", "bio", "marketing_opt_in")


def get_profile(organizer_id: int) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            f"SELECT {', '.join(PROFILE_FIELDS)}, marketing_opt_in_at, terms_accepted_at, two_factor_method, password_changed_at FROM organizers WHERE id = %s", (organizer_id,)
        ).fetchone()
    return dict(row) if row else {}


def update_profile(organizer_id: int, values: dict) -> dict:
    fields = [f for f in PROFILE_FIELDS if f in values]
    if fields:
        assignments = ", ".join(f"{f} = %s" for f in fields)
        params = [values[f] for f in fields]
        if "marketing_opt_in" in values:
            # Consent is a dated fact: keep when it was given, clear it when it is withdrawn.
            assignments += ", marketing_opt_in_at = CASE WHEN %s THEN COALESCE(marketing_opt_in_at, NOW()) ELSE NULL END"
            params.append(bool(values["marketing_opt_in"]))
        with get_connection() as connection:
            connection.execute(f"UPDATE organizers SET {assignments} WHERE id = %s", tuple(params) + (organizer_id,))
    return get_profile(organizer_id)


def list_newsletter_subscribers() -> list[dict]:
    """Verified accounts that opted in to OTRI news, for a marketing audience export."""
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT email, display_name, organization, country, marketing_opt_in_at FROM organizers"
            " WHERE marketing_opt_in AND email_verified AND NOT is_demo ORDER BY marketing_opt_in_at"
        ).fetchall()
    return [dict(row) for row in rows]


# --- Reports (corrections and removal requests from the public site) ----------


@dataclass(frozen=True)
class Report:
    id: int
    kind: str
    subject_id: str
    subject_label: str | None
    reason: str | None
    message: str
    reporter_email: str | None
    page_url: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution: str | None = None


_REPORT_COLUMNS = "id, kind, subject_id, subject_label, reason, message, reporter_email, page_url, status, created_at, resolved_at, resolved_by, resolution"


def create_report(*, kind: str, subject_id: str, subject_label: str | None, reason: str | None, message: str, reporter_email: str | None, page_url: str | None) -> Report:
    with get_connection() as connection:
        row = connection.execute(
            "INSERT INTO reports (kind, subject_id, subject_label, reason, message, reporter_email, page_url) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {_REPORT_COLUMNS}",
            (kind, subject_id, subject_label, reason, message, reporter_email, page_url),
        ).fetchone()
    return Report(**row)


def list_reports(status: str | None = "open") -> list[Report]:
    with get_connection() as connection:
        if status:
            rows = connection.execute(f"SELECT {_REPORT_COLUMNS} FROM reports WHERE status = %s ORDER BY created_at DESC", (status,)).fetchall()
        else:
            rows = connection.execute(f"SELECT {_REPORT_COLUMNS} FROM reports ORDER BY (status = 'open') DESC, created_at DESC").fetchall()
    return [Report(**row) for row in rows]


def count_open_reports() -> int:
    with get_connection() as connection:
        row = connection.execute("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").fetchone()
    return int(row["n"])


def resolve_report(report_id: int, *, resolved_by: str, resolution: str | None) -> Report | None:
    with get_connection() as connection:
        row = connection.execute(
            "UPDATE reports SET status = 'resolved', resolved_at = now(), resolved_by = %s, resolution = %s WHERE id = %s "
            f"RETURNING {_REPORT_COLUMNS}",
            (resolved_by, resolution, report_id),
        ).fetchone()
    return Report(**row) if row else None


def delete_report(report_id: int) -> bool:
    with get_connection() as connection:
        return connection.execute("DELETE FROM reports WHERE id = %s", (report_id,)).rowcount > 0


def delete_runner(runner_id: str) -> int:
    """Remove a runner and every result attached to them. Returns how many results went."""
    with get_connection() as connection:
        removed = connection.execute("DELETE FROM results WHERE runner_id = %s", (runner_id,)).rowcount
        connection.execute("DELETE FROM runners WHERE runner_id = %s", (runner_id,))
    return removed


# --- Admin: accounts and platform statistics ---------------------------------


@dataclass(frozen=True)
class OrganizerAccount:
    id: int
    email: str
    email_verified: bool
    is_admin: bool
    is_demo: bool
    created_at: datetime
    event_count: int = 0
    race_count: int = 0
    display_name: str | None = None
    organization: str | None = None
    two_factor_method: str | None = None
    marketing_opt_in: bool = False
    terms_accepted_at: datetime | None = None


def list_organizer_accounts() -> list[OrganizerAccount]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT o.id, o.email, o.email_verified, o.is_admin, o.is_demo, o.created_at,
                   COUNT(DISTINCT e.event_id) AS event_count, COUNT(DISTINCT r.race_id) AS race_count,
                   o.display_name, o.organization, o.two_factor_method, o.marketing_opt_in, o.terms_accepted_at
            FROM organizers o
            LEFT JOIN events e ON e.organizer_id = o.id
            LEFT JOIN races r ON r.event_id = e.event_id
            GROUP BY o.id ORDER BY o.created_at DESC
            """
        ).fetchall()
    return [OrganizerAccount(**row) for row in rows]


def find_organizer_account(organizer_id: int) -> OrganizerAccount | None:
    return next((account for account in list_organizer_accounts() if account.id == organizer_id), None)


def set_organizer_verified(organizer_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("UPDATE organizers SET email_verified = TRUE WHERE id = %s", (organizer_id,))
        return cursor.rowcount > 0


def delete_organizer(organizer_id: int) -> bool:
    """Delete an account and everything it owns (events cascade to races and results)."""
    with get_connection() as connection:
        connection.execute("DELETE FROM events WHERE organizer_id = %s", (organizer_id,))
        cursor = connection.execute("DELETE FROM organizers WHERE id = %s", (organizer_id,))
        return cursor.rowcount > 0


def database_size_bytes() -> int | None:
    try:
        with get_connection() as connection:
            row = connection.execute("SELECT pg_database_size(current_database()) AS n").fetchone()
        return int(row["n"]) if row else None
    except Exception:  # noqa: BLE001
        return None


def platform_stats() -> dict:
    with get_connection() as connection:
        one = lambda sql: int(connection.execute(sql).fetchone()["n"])  # noqa: E731
        return {
            "organizers": one("SELECT COUNT(*) AS n FROM organizers"),
            "verified": one("SELECT COUNT(*) AS n FROM organizers WHERE email_verified"),
            "unverified": one("SELECT COUNT(*) AS n FROM organizers WHERE NOT email_verified"),
            "admins": one("SELECT COUNT(*) AS n FROM organizers WHERE is_admin"),
            "newsletter": one("SELECT COUNT(*) AS n FROM organizers WHERE marketing_opt_in AND email_verified AND NOT is_demo"),
            "events": one("SELECT COUNT(*) AS n FROM events"),
            "orphan_events": one("SELECT COUNT(*) AS n FROM events WHERE organizer_id IS NULL"),
            "races": one("SELECT COUNT(*) AS n FROM races"),
            "published_races": one("SELECT COUNT(*) AS n FROM races WHERE published_at IS NOT NULL"),
            "races_with_gpx": one("SELECT COUNT(*) AS n FROM races WHERE gpx_content IS NOT NULL"),
            "results": one("SELECT COUNT(*) AS n FROM results"),
            "finishers": one("SELECT COUNT(*) AS n FROM results WHERE finish_time_seconds IS NOT NULL"),
            "runners": one("SELECT COUNT(*) AS n FROM runners"),
        }


# --- Organizer flags (admin / demo) ------------------------------------------


def get_organizer_flags(organizer_id: int) -> dict | None:
    """Flags plus the current session version; None when the account no longer exists."""
    with get_connection() as connection:
        row = connection.execute("SELECT is_admin, is_demo, session_version FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
    if row is None:
        return None
    return {"is_admin": bool(row["is_admin"]), "is_demo": bool(row["is_demo"]), "session_version": int(row["session_version"])}


def bump_session_version(organizer_id: int) -> int:
    """Invalidate every token issued so far for this account; returns the new version."""
    with get_connection() as connection:
        row = connection.execute(
            "UPDATE organizers SET session_version = session_version + 1 WHERE id = %s RETURNING session_version", (organizer_id,)
        ).fetchone()
    return int(row["session_version"]) if row else 1


def export_organizer(organizer_id: int) -> dict:
    """Everything OTRI holds for one account, for the 'download my data' button."""
    with get_connection() as connection:
        account = connection.execute(
            "SELECT email, created_at, email_verified, is_admin, display_name, organization, website, phone, country, bio, "
            "terms_accepted_at, marketing_opt_in, marketing_opt_in_at, two_factor_method, password_changed_at "
            "FROM organizers WHERE id = %s",
            (organizer_id,),
        ).fetchone()
        events = connection.execute("SELECT * FROM events WHERE organizer_id = %s ORDER BY event_date", (organizer_id,)).fetchall()
        races = connection.execute(
            "SELECT r.race_id, r.event_id, r.course_name, r.distance_km, r.elevation_gain_m, r.scoring_version, r.published_at, r.created_at, "
            "(r.gpx_content IS NOT NULL) AS has_gpx FROM races r JOIN events e ON e.event_id = r.event_id WHERE e.organizer_id = %s",
            (organizer_id,),
        ).fetchall()
        results = connection.execute(
            "SELECT res.* FROM results res JOIN races r ON r.race_id = res.race_id JOIN events e ON e.event_id = r.event_id WHERE e.organizer_id = %s",
            (organizer_id,),
        ).fetchall()
        emails = connection.execute(
            "SELECT subject, status, created_at FROM email_log WHERE to_email = %s ORDER BY created_at DESC LIMIT 200", (account["email"],)
        ).fetchall() if account else []
    return {
        "account": dict(account) if account else None,
        "events": [dict(row) for row in events],
        "races": [dict(row) for row in races],
        "results": [dict(row) for row in results],
        "emails_sent_to_you": [dict(row) for row in emails],
    }


def log_email(to_email: str, subject: str, status: str, provider_id: str | None = None, error: str | None = None) -> None:
    try:
        with get_connection() as connection:
            connection.execute(
                "INSERT INTO email_log (to_email, subject, provider_id, status, error) VALUES (%s, %s, %s, %s, %s)",
                (to_email, subject, provider_id, status, (error or None) and str(error)[:500]),
            )
    except Exception:  # noqa: BLE001 - logging must never break the send path
        pass


def email_stats() -> dict:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT COUNT(*) FILTER (WHERE status = 'sent') AS sent, COUNT(*) FILTER (WHERE status <> 'sent') AS failed, "
            "MAX(created_at) FILTER (WHERE status <> 'sent') AS last_failure_at FROM email_log WHERE created_at > now() - interval '24 hours'"
        ).fetchone()
    return {"emails_24h": int(row["sent"]), "email_failures_24h": int(row["failed"]), "email_last_failed_at": row["last_failure_at"]}


def recent_emails(limit: int = 50) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, to_email, subject, provider_id, status, error, created_at FROM email_log ORDER BY created_at DESC LIMIT %s", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


def set_organizer_flags(email: str, *, is_admin: bool | None = None, is_demo: bool | None = None) -> bool:
    """Returns False when no account with that email exists."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE organizers SET is_admin = COALESCE(%s, is_admin), is_demo = COALESCE(%s, is_demo) WHERE email = %s",
            (is_admin, is_demo, email.strip().lower()),
        )
        return cursor.rowcount > 0


def find_organizer_id(email: str) -> int | None:
    with get_connection() as connection:
        row = connection.execute("SELECT id FROM organizers WHERE email = %s", (email.strip().lower(),)).fetchone()
    return int(row["id"]) if row else None


def adopt_events(organizer_id: int, event_id_prefix: str) -> int:
    """Give ownerless events whose id starts with the prefix to an organizer (used for the demo account)."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE events SET organizer_id = %s WHERE organizer_id IS NULL AND event_id LIKE %s",
            (organizer_id, f"{event_id_prefix}%"),
        )
        return cursor.rowcount


def get_measurement(race_id: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute("SELECT measurement FROM races WHERE race_id = %s", (race_id,)).fetchone()
    return row["measurement"] if row else None
