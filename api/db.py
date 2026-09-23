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

import atexit
import os
import threading
from psycopg.types.json import Jsonb
import random
import secrets
from contextlib import contextmanager
from dataclasses import dataclass
import json
from datetime import date, datetime
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

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

-- Accounts made through Google have no password of their own; the column tells the account page
-- which actions can ask for one. The hash column stays NOT NULL and holds an unusable random hash.
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT TRUE;
-- The 30-second step of the last authenticator code that opened this account, so the same code
-- cannot open it twice inside the minute and a half it is accepted for (RFC 6238 section 5.2).
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

-- A sign-in identity from an outside provider, keyed on the provider's stable subject id, never on
-- the email: addresses change, subjects do not. One organizer may hold several.
CREATE TABLE IF NOT EXISTS organizer_identities (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS organizer_identities_organizer_idx ON organizer_identities (organizer_id);

-- A sign-in with an outside provider that has been started and not yet finished: ten minutes,
-- used once. The state and nonce are kept as digests, like every other one-time token.
-- A link between a Google identity and an account that already exists, waiting for whoever reads
-- the account's mailbox to open the link we sent there. Google's answer about an address on a
-- third party's domain says who held it when Google checked, not who holds it today.
CREATE TABLE IF NOT EXISTS identity_link_tokens (
    token TEXT PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    browser TEXT NOT NULL,
    intent TEXT NOT NULL,
    accept_terms BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    remember BOOLEAN NOT NULL DEFAULT FALSE,
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
CREATE INDEX IF NOT EXISTS results_race_id_idx ON results (race_id);
CREATE INDEX IF NOT EXISTS races_event_id_idx ON races (event_id);
CREATE INDEX IF NOT EXISTS races_published_at_idx ON races (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_organizer_id_idx ON events (organizer_id);

-- listed_at: an organizer shows their own race publicly before it has results; published_at still
-- gates results. website, source_url, course_permission and score_requests belong to the retired
-- OTRI-compiled listings (docs/product/open-scoring-tool.md): kept so existing data is not destroyed,
-- no longer written or read.
ALTER TABLE events ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE races ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ;
-- A course an admin put up for the calculator's "Pick a race" only: public for trying a target time,
-- never shown as a race on the races page (OTRI lists no race on anyone's behalf).
ALTER TABLE races ADD COLUMN IF NOT EXISTS calculator_only BOOLEAN NOT NULL DEFAULT FALSE;
-- The edition a calculator course's file is from: courses change between years.
ALTER TABLE races ADD COLUMN IF NOT EXISTS edition_year INTEGER;
ALTER TABLE races ADD COLUMN IF NOT EXISTS course_permission TEXT;
CREATE INDEX IF NOT EXISTS races_listed_at_idx ON races (listed_at) WHERE listed_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS score_requests (
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    visitor_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (race_id, visitor_key)
);

-- How many visits a page had on a day, and what they had in common. One row per combination, a
-- counter on the end: there is no row for a visit, so there is nothing to read back about one.
CREATE TABLE IF NOT EXISTS site_hits (
    day DATE NOT NULL,
    path TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'direct',
    zone TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    browser TEXT NOT NULL DEFAULT '',
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path, source, zone, device, browser)
);

-- One row per visitor per day, where the visitor is a digest of the day, the address and the
-- browser (api/analytics.py). The address is never stored; the day is inside the digest, so two
-- days cannot be joined. Kept three days (api/analytics.py VISITOR_RETENTION), then dropped; the
-- count they were counted into lives on in site_visitor_days.
CREATE TABLE IF NOT EXISTS site_visitors (
    day DATE NOT NULL,
    visitor TEXT NOT NULL,
    PRIMARY KEY (day, visitor)
);

-- How many distinct visitors a day had, kept after the digests for that day are gone. The count is
-- the thing worth keeping; the digests are only how it is arrived at, and they are deleted after
-- three days. Reading the count straight from site_visitors meant every day older than that
-- reported nobody, beside a page-view count that was still there.
CREATE TABLE IF NOT EXISTS site_visitor_days (
    day DATE PRIMARY KEY,
    visitors INTEGER NOT NULL DEFAULT 0
);

-- The things worth counting besides pages: a score worked out, a race scored, an account made.
CREATE TABLE IF NOT EXISTS site_actions (
    day DATE NOT NULL,
    action TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, action)
);

-- Settings an admin changes while the site runs, one row each (api/app.py: /site/status).
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
-- Unused since race suggestions were retired; kept for the reports already filed.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS payload JSONB;
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
    website: str | None = None
    source_url: str | None = None


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
    # Known only once a course file has been measured (the official figures carry no descent).
    elevation_loss_m: float | None = None
    # A listing: public without results. `course_permission` records why OTRI may show the course
    # file of a race nobody has claimed (licence or the organizer's consent); see DATA_POLICY.md.
    listed_at: datetime | None = None
    course_permission: str | None = None
    event_website: str | None = None
    # Offered in the calculator's "Pick a race" only; not a race on the races page.
    calculator_only: bool = False
    event_source_url: str | None = None
    # The edition (year) a calculator course's file is from; None when not given.
    edition_year: int | None = None
    # The publish review (api/screening.py): 'none' until published, then 'pending' (public, verifies
    # itself at auto_verify_at), 'verified', 'held' (not public, an admin decides) or 'rejected'.
    review_status: str = "none"
    review_flags: list | None = None
    auto_verify_at: datetime | None = None
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None
    review_note: str | None = None
    publish_attested_at: datetime | None = None
    results_fingerprint: str | None = None

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


_POOL: ConnectionPool | None = None
_POOL_LOCK = threading.Lock()
# Per process (each gunicorn worker opens its own after the fork, on first use): a handful of
# long-lived connections instead of a TCP handshake plus Postgres backend start per request.
POOL_MAX_SIZE = int(os.environ.get("OTRI_DB_POOL_MAX", "10"))


def _pool() -> ConnectionPool:
    global _POOL
    if _POOL is None or _POOL.closed:
        with _POOL_LOCK:
            if _POOL is None or _POOL.closed:
                _POOL = ConnectionPool(
                    DATABASE_URL,
                    min_size=1,
                    max_size=POOL_MAX_SIZE,
                    kwargs={"row_factory": dict_row},
                    check=ConnectionPool.check_connection,  # drop connections a Postgres restart killed
                    name="otri",
                    open=True,
                )
    return _POOL


def close_pool() -> None:
    """Close the pool's connections; registered for interpreter exit so short-lived processes
    (scripts, the test runner) do not leave backends behind or trip the pool's finaliser."""
    global _POOL
    if _POOL is not None and not _POOL.closed:
        _POOL.close()
    _POOL = None


atexit.register(close_pool)


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    """Yield a pooled connection with dict-style row access: committed on success, rolled back on
    an exception, and returned to the pool either way (never closed)."""
    with _pool().connection() as connection:
        yield connection


def init_db() -> list[str]:
    """Apply the idempotent baseline, then every pending numbered migration (api/migrations.py).
    Safe to call on every startup. Returns the names of the migrations applied this time."""
    from . import migrations

    with get_connection() as connection:
        connection.execute(_SCHEMA)
        applied = migrations.apply_pending(connection)
    assign_missing_runners()
    return applied


def _new_id(prefix: str, nbytes: int = 4) -> str:
    return f"{prefix}-{secrets.token_hex(nbytes)}"


def _insert_with_new_id(connection, prefix: str, sql: str, values: tuple, *, nbytes: int = 4) -> str:
    """Run an INSERT whose first value is a fresh random id, again with another id if that one is
    taken. `sql` must end in `ON CONFLICT (<id column>) DO NOTHING RETURNING <id column>`.

    Eight hex digits are 32 bits. With 100,000 runners stored, one new id in 43,000 is already
    taken, and a results file of 20,000 new names met one more often than not: the upload failed
    with a server error, all of it, and the next try as likely as the first. Raising inside the
    transaction would lose it, so the conflict is skipped and the insert repeated."""
    for _ in range(8):
        candidate = _new_id(prefix, nbytes)
        if connection.execute(sql, (candidate, *values)).fetchone() is not None:
            return candidate
    raise RuntimeError(f"could not find a free {prefix} id")


# --- Events --------------------------------------------------------------


def list_events() -> list[Event]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT e.event_id, e.event_name, e.event_date, e.organizer_id, o.email AS organizer_email, e.location, e.country, e.website, e.source_url "
            "FROM events e LEFT JOIN organizers o ON o.id = e.organizer_id ORDER BY e.event_date"
        ).fetchall()
    return [Event(**row) for row in rows]


def find_event(event_id: str) -> Event | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT e.event_id, e.event_name, e.event_date, e.organizer_id, o.email AS organizer_email, e.location, e.country, e.website, e.source_url "
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
    website: str | None = None,
    source_url: str | None = None,
    max_for_organizer: int | None = None,
) -> Event:
    sql = "INSERT INTO events (event_id, event_name, event_date, organizer_id, location, country, website, source_url) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
    values = (event_name, event_date_, organizer_id, location, country, website, source_url)
    with get_connection() as connection:
        if max_for_organizer is not None and organizer_id is not None:
            # The account row, then the count, then the insert, all in one transaction: without the
            # lock a burst of requests each read the count before any of them had inserted.
            connection.execute("SELECT 1 FROM organizers WHERE id = %s FOR UPDATE", (organizer_id,))
            held = connection.execute("SELECT count(*) AS n FROM events WHERE organizer_id = %s", (organizer_id,)).fetchone()["n"]
            if held >= max_for_organizer:
                raise QuotaExceeded(str(max_for_organizer))
        if event_id:
            connection.execute(sql, (event_id, *values))
        else:
            event_id = _insert_with_new_id(connection, "evt", sql + " ON CONFLICT (event_id) DO NOTHING RETURNING event_id", values)
    return Event(event_id=event_id, event_name=event_name, event_date=event_date_, organizer_id=organizer_id, location=location, country=country, website=website, source_url=source_url)


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


def count_events_for_organizer(organizer_id: int) -> int:
    with get_connection() as connection:
        return int(connection.execute("SELECT COUNT(*) AS n FROM events WHERE organizer_id = %s", (organizer_id,)).fetchone()["n"])


def _runner_ids(connection, where: str, params: tuple) -> list[str]:
    """The runners of the results about to be deleted (`where` is a condition on `results res`)."""
    rows = connection.execute(f"SELECT DISTINCT res.runner_id FROM results res WHERE res.runner_id IS NOT NULL AND {where}", params).fetchall()
    return [row["runner_id"] for row in rows]


def _drop_runners_without_results(connection, runner_ids: list[str]) -> None:
    """A runner exists because a results file named them. When the last result goes (the file is
    replaced, the race deleted, the account closed) the runner goes too: the row was left behind,
    so one race, its results replaced over and over with new names, grew the table without end and
    outside every quota, and a deleted account's runners stayed for good."""
    if runner_ids:
        connection.execute(
            "DELETE FROM runners ru WHERE ru.runner_id = ANY(%s) AND NOT EXISTS (SELECT 1 FROM results res WHERE res.runner_id = ru.runner_id)",
            (runner_ids,),
        )


def delete_event(event_id: str) -> None:
    with get_connection() as connection:
        runners = _runner_ids(connection, "res.race_id IN (SELECT race_id FROM races WHERE event_id = %s)", (event_id,))
        cursor = connection.execute("DELETE FROM events WHERE event_id = %s", (event_id,))
        if cursor.rowcount == 0:
            raise NotFoundError(f"event {event_id!r} not found")
        _drop_runners_without_results(connection, runners)


# --- Races (distances under an event) ------------------------------------

_RACE_JOIN_SELECT = """
    SELECT r.race_id, r.event_id, r.course_name, r.distance_km, r.elevation_gain_m,
           (r.gpx_content IS NOT NULL) AS has_gpx, r.scoring_version,
           r.measurement->>'version' AS measurement_version,
           r.measurement->>'status' AS measurement_status,
           (r.measurement->'snapshot'->>'loss_m')::double precision AS elevation_loss_m,
           r.listed_at, r.course_permission, NULLIF(e.website, '') AS event_website,
           r.calculator_only, NULLIF(e.source_url, '') AS event_source_url, r.edition_year,
           r.published_at, COALESCE(o.is_demo, FALSE) AS is_demo, r.created_at,
           r.review_status, r.review_flags, r.auto_verify_at, r.reviewed_at, r.reviewed_by, r.review_note,
           r.publish_attested_at, r.results_fingerprint,
           e.event_name, e.event_date, e.organizer_id, e.location AS event_location, e.country AS event_country,
           -- The organization only. display_name is the organizer's own name, which the account
           -- page promises is shown to admins and not published; falling back to it put a real
           -- person's name on a public race page whenever they had left the organization blank.
           NULLIF(o.organization, '') AS organizer_display, NULLIF(o.website, '') AS organizer_website
    FROM races r JOIN events e ON e.event_id = r.event_id
    LEFT JOIN organizers o ON o.id = e.organizer_id
"""


def list_races(published_only: bool = False) -> list[Race]:
    """``published_only`` means public: races with published results, and listings awaiting them."""
    # A race is public once its organizer published results or listed it. Rows nobody owns (from
    # the retired OTRI-compiled listings) stay in the table and out of sight.
    where = " WHERE (r.published_at IS NOT NULL OR (r.listed_at IS NOT NULL AND e.organizer_id IS NOT NULL))" if published_only else ""
    with get_connection() as connection:
        rows = connection.execute(_RACE_JOIN_SELECT + where + " ORDER BY e.event_date DESC, r.distance_km").fetchall()
    return [Race(**row) for row in rows]


def fill_in_runner_details(connection, race_id: str) -> None:
    """What `_match_runner` holds back for a draft, done when the race is published: a year of
    birth or a nationality for runners that had none, where this race's results agree on one."""
    for column in ("birth_year", "nationality"):
        connection.execute(
            f"UPDATE runners ru SET {column} = src.value FROM ("
            f"  SELECT runner_id, MIN({column}) AS value FROM results WHERE race_id = %s AND runner_id IS NOT NULL AND {column} IS NOT NULL"
            f"  GROUP BY runner_id HAVING COUNT(DISTINCT {column}) = 1"
            f") src WHERE ru.runner_id = src.runner_id AND ru.{column} IS NULL",
            (race_id,),
        )


def refresh_runner_details(connection, runner_ids: list[str]) -> None:
    """Put a runner's year of birth and nationality back to what their *published* results say.

    fill_in_runner_details copies these onto the shared runner record when a race is published, and
    nothing used to take them off again. Unpublishing a race hid its result rows but left the year
    of birth and nationality it had contributed on a profile the public can still read through the
    runner's other races -- and correcting a file did not put a wrong value right either. Recomputed
    from the published results that remain: if they agree on a value it stands, if they disagree or
    say nothing it is cleared.
    """
    if not runner_ids:
        return
    for column in ("birth_year", "nationality"):
        connection.execute(
            f"UPDATE runners ru SET {column} = src.value FROM ("
            f"  SELECT ids.runner_id, ("
            f"    SELECT CASE WHEN COUNT(DISTINCT res.{column}) = 1 THEN MIN(res.{column}) END"
            f"    FROM results res JOIN races ra ON ra.race_id = res.race_id AND ra.published_at IS NOT NULL"
            f"    WHERE res.runner_id = ids.runner_id AND res.{column} IS NOT NULL"
            f"  ) AS value FROM unnest(%s::text[]) AS ids(runner_id)"
            f") src WHERE ru.runner_id = src.runner_id AND ru.{column} IS DISTINCT FROM src.value",
            (runner_ids,),
        )


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
        if published:
            fill_in_runner_details(connection, race_id)
        else:
            # Taking a race down takes back what it contributed to the shared runner records, which
            # the public can still read through the runner's other races.
            refresh_runner_details(connection, _runner_ids(connection, "res.race_id = %s", (race_id,)))
    race = find_race(race_id)
    assert race is not None
    return race


# --- The publish review -------------------------------------------------------------------------


def set_race_review(
    race_id: str,
    *,
    status: str,
    flags: list[dict] | None = None,
    auto_verify_at: datetime | None = None,
    reviewed_by: str | None = None,
    note: str | None = None,
    attested: bool = False,
    fingerprint: str | None = None,
) -> Race:
    """Record where a race stands in the publish review. ``reviewed_by`` is 'auto' or an admin's
    address; ``reviewed_at`` is set whenever it is given. ``attested`` stamps the organizer's
    confirmation that they organize the race and may publish its results."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET review_status = %s, review_flags = %s::jsonb, auto_verify_at = %s, "
            "reviewed_by = %s, reviewed_at = CASE WHEN %s::text IS NULL THEN reviewed_at ELSE now() END, "
            "review_note = %s, publish_attested_at = CASE WHEN %s THEN now() ELSE publish_attested_at END, "
            "results_fingerprint = COALESCE(%s, results_fingerprint), updated_at = now() WHERE race_id = %s",
            (status, json.dumps(flags) if flags is not None else None, auto_verify_at, reviewed_by, reviewed_by, note, attested, fingerprint, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def settle_pending_reviews() -> int:
    """A clean race nobody objected to verifies itself once its window has passed. Called from the
    public reads, so it needs no scheduler and works the same under every worker."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET review_status = 'verified', reviewed_at = now(), reviewed_by = 'auto', updated_at = now() "
            "WHERE review_status = 'pending' AND published_at IS NOT NULL AND auto_verify_at IS NOT NULL AND auto_verify_at <= now()"
        )
        return cursor.rowcount


_REVIEW_SELECT = _RACE_JOIN_SELECT.replace("FROM races r", ", o.email AS organizer_email\n    FROM races r", 1)


def list_reviews(*, open_only: bool = True) -> list[tuple[Race, str | None]]:
    """Races in the publish review with their organizer's address, newest first. ``open_only`` is
    what an admin has to look at: pending and held."""
    where = " WHERE r.review_status IN ('pending', 'held')" if open_only else " WHERE r.review_status <> 'none'"
    with get_connection() as connection:
        rows = connection.execute(_REVIEW_SELECT + where + " ORDER BY r.updated_at DESC").fetchall()
    out = []
    for row in rows:
        row = dict(row)
        email = row.pop("organizer_email", None)
        out.append((Race(**row), email))
    return out


def find_duplicate_results(fingerprint: str, *, exclude_race_id: str) -> str | None:
    """Another race that carries exactly these results (same names and times), if one is on file."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT race_id FROM races WHERE results_fingerprint = %s AND race_id <> %s ORDER BY published_at DESC NULLS LAST LIMIT 1",
            (fingerprint, exclude_race_id),
        ).fetchone()
    return row["race_id"] if row else None


def course_published_by_other_organizer(geometry_hash: str, *, organizer_id: int | None, exclude_race_id: str) -> bool:
    """Whether this exact course geometry is already public under a different organizer."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT 1 FROM races r JOIN events e ON e.event_id = r.event_id "
            "WHERE r.measurement->>'geometry_hash' = %s AND r.race_id <> %s AND r.published_at IS NOT NULL "
            "AND e.organizer_id IS DISTINCT FROM %s LIMIT 1",
            (geometry_hash, exclude_race_id, organizer_id),
        ).fetchone()
    return row is not None


def count_races_by_event(*, public_only: bool = False) -> dict[str, int]:
    """How many races each event holds. `public_only` counts the ones a stranger could open.

    The public list used to show the total, which told anyone reading how many distances an
    organizer was still preparing -- the same thing the filter that builds the list exists to keep
    private, and a number that disagreed with the event's own page.
    """
    where = " WHERE published_at IS NOT NULL OR listed_at IS NOT NULL" if public_only else ""
    with get_connection() as connection:
        rows = connection.execute(f"SELECT event_id, COUNT(*) AS n FROM races{where} GROUP BY event_id").fetchall()
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
    max_for_event: int | None = None,
) -> Race:
    # Pass the version explicitly rather than relying on the column's SQL DEFAULT — `CREATE
    # TABLE IF NOT EXISTS` never updates an already-existing column's default, so an older
    # deployed schema could otherwise keep minting races on a stale/removed model version.
    from scoring import DEFAULT_SCORING_VERSION

    sql = "INSERT INTO races (race_id, event_id, course_name, distance_km, elevation_gain_m, scoring_version) VALUES (%s, %s, %s, %s, %s, %s)"
    values = (event_id, course_name, distance_km, elevation_gain_m, scoring_version or DEFAULT_SCORING_VERSION)
    with get_connection() as connection:
        if max_for_event is not None:
            # As create_event: the event row is taken first so that the count cannot be read by
            # several requests at once and then satisfied by all of them.
            connection.execute("SELECT 1 FROM events WHERE event_id = %s FOR UPDATE", (event_id,))
            held = connection.execute("SELECT count(*) AS n FROM races WHERE event_id = %s", (event_id,)).fetchone()["n"]
            if held >= max_for_event:
                raise QuotaExceeded(str(max_for_event))
        if race_id:
            connection.execute(sql, (race_id, *values))
        else:
            race_id = _insert_with_new_id(connection, "race", sql + " ON CONFLICT (race_id) DO NOTHING RETURNING race_id", values)
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
    allow_published: bool = False,
) -> Race:
    """Change a race's name, its course figures or its scoring model.

    The figures and the model are what a score means, so on a published race they are frozen for
    the reason given in replace_results, and the refusal is here rather than only in the handler
    that called this. The handler reads the race and then calls this on another connection; a
    publish committing between those two was enough for the change to land on a race that is now
    public. Inside this transaction the row is already held, so there is no such moment. Renaming
    stays open either way: the freeze is on what the numbers mean, not on the words around them.
    """
    restated = distance_km is not None or elevation_gain_m is not None or scoring_version is not None
    with get_connection() as connection:
        if restated and not allow_published:
            current = connection.execute("SELECT published_at, scoring_version FROM races WHERE race_id = %s FOR UPDATE", (race_id,)).fetchone()
            if current is None:
                raise NotFoundError(f"race {race_id!r} not found")
            # A scoring_version that is already what the race carries changes nothing, so it is not
            # a restatement and should not be refused.
            moves_model = scoring_version is not None and scoring_version != current["scoring_version"]
            if current["published_at"] is not None and (distance_km is not None or elevation_gain_m is not None or moves_model):
                raise RacePublished(race_id)
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
        runners = _runner_ids(connection, "res.race_id = %s", (race_id,))
        cursor = connection.execute("DELETE FROM races WHERE race_id = %s", (race_id,))
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
        _drop_runners_without_results(connection, runners)


def attach_gpx(race_id: str, filename: str, content: str, distance_km: float, elevation_gain_m: float, measurement: dict | None = None, *, allow_published: bool = False) -> Race:
    """Store a GPX file for a race and refresh its course stats from the real parsed data.

    Refuses on a published race, under the row lock, for the reason given in replace_results: a
    score is worked out from the course every time it is asked for, so a new course here restates
    a leaderboard the public has already read.
    """
    with get_connection() as connection:
        race = connection.execute("SELECT published_at FROM races WHERE race_id = %s FOR UPDATE", (race_id,)).fetchone()
        if race is None:
            raise NotFoundError(f"race {race_id!r} not found")
        if race["published_at"] is not None and not allow_published:
            raise RacePublished(race_id)
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


def set_race_calculator_only(race_id: str, calculator_only: bool) -> Race:
    """A calculator course is listed (public without results) and marked as not being a race page."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET calculator_only = %s, listed_at = CASE WHEN %s THEN COALESCE(listed_at, now()) ELSE listed_at END, "
            "updated_at = now() WHERE race_id = %s",
            (calculator_only, calculator_only, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def update_calculator_course(race_id: str, *, event_name: str, course_name: str, location: str | None, country: str | None, source_url: str | None, edition_year: int | None = None) -> Race:
    """Set a calculator course's names, where it is and which edition it is; None clears a field
    (unlike update_event, which keeps what it is not given)."""
    with get_connection() as connection:
        row = connection.execute(
            "UPDATE races SET course_name = %s, edition_year = %s, updated_at = now() WHERE race_id = %s AND calculator_only RETURNING event_id",
            (course_name, edition_year, race_id),
        ).fetchone()
        if row is None:
            raise NotFoundError(f"calculator course {race_id!r} not found")
        connection.execute(
            "UPDATE events SET event_name = %s, location = %s, country = %s, source_url = %s, updated_at = now() WHERE event_id = %s",
            (event_name, location, country, source_url, row["event_id"]),
        )
    race = find_race(race_id)
    assert race is not None
    return race


def list_calculator_courses() -> list[Race]:
    with get_connection() as connection:
        rows = connection.execute(_RACE_JOIN_SELECT + " WHERE r.calculator_only ORDER BY e.event_name, r.distance_km").fetchall()
    return [Race(**row) for row in rows]


def set_race_listed(race_id: str, listed: bool) -> Race:
    """List a race publicly without results (or take the listing down). Results stay gated by publishing."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE races SET listed_at = CASE WHEN %s THEN COALESCE(listed_at, now()) ELSE NULL END, updated_at = now() WHERE race_id = %s",
            (listed, race_id),
        )
        if cursor.rowcount == 0:
            raise NotFoundError(f"race {race_id!r} not found")
    race = find_race(race_id)
    assert race is not None
    return race


def count_results_by_race() -> dict[str, int]:
    with get_connection() as connection:
        rows = connection.execute("SELECT race_id, COUNT(*) AS n FROM results WHERE finish_time_seconds IS NOT NULL GROUP BY race_id").fetchall()
    return {row["race_id"]: int(row["n"]) for row in rows}


def has_results(race_id: str) -> bool:
    with get_connection() as connection:
        row = connection.execute("SELECT 1 FROM results WHERE race_id = %s LIMIT 1", (race_id,)).fetchone()
    return row is not None


class RacePublished(Exception):
    """A published race's course or results cannot be replaced while it is public."""


class QuotaExceeded(Exception):
    """A per-account limit reached: events, race distances, or result rows. Counted in the same
    transaction as the row it would allow, so a burst of requests cannot all pass the same check."""


def replace_results(race_id: str, results: list[ResultRecord], *, max_rows_for_organizer: int | None = None, allow_published: bool = False) -> None:
    """Overwrite all results for a race in one transaction (re-submission replaces prior data).

    Each result is attached to a runner (matched or created) as it is inserted, so runner
    profiles are consistent the moment a submission lands.

    A published race refuses, here rather than only in the handler that called this. The handler
    reads the race and then calls this, and a publish committing between those two is enough for
    the write to land on a race that is now public; inside this transaction the row is already
    held, so there is no such moment. `allow_published` is for the seed script, which owns the
    races it makes.
    """
    with get_connection() as connection:
        race = connection.execute(
            "SELECT ra.published_at, e.organizer_id FROM races ra JOIN events e ON e.event_id = ra.event_id WHERE ra.race_id = %s FOR UPDATE OF ra", (race_id,)
        ).fetchone()
        published = race is not None and race["published_at"] is not None
        if published and not allow_published:
            raise RacePublished(race_id)
        if max_rows_for_organizer is not None and race is not None and race["organizer_id"] is not None:
            # One upload of an account at a time gets past this line; the other waits for the first
            # to commit and then counts its rows too.
            connection.execute("SELECT 1 FROM organizers WHERE id = %s FOR UPDATE", (race["organizer_id"],))
            held = connection.execute(
                "SELECT COUNT(*) AS n FROM results res JOIN races ra ON ra.race_id = res.race_id JOIN events e ON e.event_id = ra.event_id "
                "WHERE e.organizer_id = %s AND res.race_id <> %s",
                (race["organizer_id"], race_id),
            ).fetchone()["n"]
            if int(held) + len(results) > max_rows_for_organizer:
                raise QuotaExceeded()
        before = _runner_ids(connection, "res.race_id = %s", (race_id,))
        scope = MatchScope(organizer_id=race["organizer_id"] if race else None, keep=tuple(before))
        connection.execute("DELETE FROM results WHERE race_id = %s", (race_id,))
        with connection.cursor() as cursor:
            for result in results:
                runner_id = _match_runner(connection, result, fill_in=published, scope=scope)
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
        # Replacing a file can correct a year of birth or a nationality, or remove one. Those are
        # copied onto the shared runner record when a race is published, so they are recomputed
        # here from whatever published results remain rather than left at the old value.
        after = _runner_ids(connection, "res.race_id = %s", (race_id,))
        refresh_runner_details(connection, sorted(set(before) | set(after)))
        _drop_runners_without_results(connection, before)


# --- Runners (identity across races) ------------------------------------------
#
# See docs/methodology/runner-index/RUNNER-INDEX-v1.md §3 for the matching rule. Only the year of birth is
# ever stored, never the full date; nationality is a 3-letter code or NULL.


def runner_name_key(family_name: str, first_name: str, gender: str) -> str:
    """How two spellings of one runner's name are recognised as the same name.

    Accents are folded, so Müller and Muller meet. Everything else is kept. This used to encode to
    ASCII and drop whatever would not fit, which folded the accents by destroying the letter: a
    Chinese, Thai, Japanese, Korean, Cyrillic, Greek or Arabic name lost every character and became
    the empty string. Every runner whose name is written in one of those scripts then shared a
    single key -- "||M" -- so unrelated people were candidates to be merged into one profile, and
    searching for them could not work at all. Stripping combining marks rather than non-ASCII
    characters folds the accents and leaves the name.
    """

    def norm(text: str) -> str:
        import unicodedata

        decomposed = unicodedata.normalize("NFKD", text)
        without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
        return " ".join(unicodedata.normalize("NFKC", without_marks).casefold().split())

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


@dataclass(frozen=True)
class MatchScope:
    """Which runners an upload may be matched to: those the public already sees (a result in a
    published race), those of the uploading organizer's own races, and those this race's results
    pointed to before they were replaced (`keep`, so a re-upload keeps its runners' ids).

    Without it a runner that exists only in somebody's private draft was a candidate for
    everybody. An unconfirmed account could upload a draft naming people with a year of birth and
    a nationality of its choosing; the next organizer to publish those names without such details
    matched the planted runners, and the planted details became their public profile."""

    organizer_id: int | None
    keep: tuple[str, ...] = ()


_VISIBLE_TO_SCOPE = """
    AND (ru.runner_id = ANY(%s) OR EXISTS (
        SELECT 1 FROM results res JOIN races ra ON ra.race_id = res.race_id JOIN events e ON e.event_id = ra.event_id
        WHERE res.runner_id = ru.runner_id AND (ra.published_at IS NOT NULL OR e.organizer_id IS NOT DISTINCT FROM %s)))
"""


def _match_runner(connection, result: ResultRecord, *, fill_in: bool = True, scope: MatchScope | None = None) -> str:
    """The runner_id for a result, matching an existing runner or creating one (see the note).

    A match may complete the runner: a year of birth or a nationality the runner did not have yet.
    That is a write to a profile the public sees and other organizers' results hang on, so it
    happens only for a published race (`fill_in`). A draft is private, needs no confirmed address,
    and used to do it too: anyone could upload a file naming a known runner and give them a year
    of birth, without publishing anything. For a draft the match is kept and the runner left as
    they are; publishing the race completes them (`fill_in_runner_details`)."""
    key = runner_name_key(result.family_name, result.first_name, result.gender)
    # A key with no name left in it identifies nobody, so it must not gather people together. This
    # cannot happen for a name in any script any more, but a row whose name fields are blank or
    # punctuation still gets a runner of its own rather than joining whoever came first.
    if key.split("|", 2)[0] == "" and key.split("|", 2)[1] == "":
        candidates = []
    else:
        candidates = connection.execute(
            "SELECT ru.runner_id, ru.birth_year, ru.nationality FROM runners ru WHERE ru.name_key = %s"
            + (_VISIBLE_TO_SCOPE if scope is not None else "")
            + " ORDER BY ru.created_at, ru.runner_id",
            (key, list(scope.keep), scope.organizer_id) if scope is not None else (key,),
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
                if fill_in:
                    connection.execute("UPDATE runners SET birth_year = %s WHERE runner_id = %s", (result.birth_year, chosen))
    else:
        pool = [row for row in candidates if compatible_nationality(row)]
        if len(pool) == 1:
            chosen = pool[0]["runner_id"]
    if chosen is not None:
        if nat is not None and fill_in:
            connection.execute(
                "UPDATE runners SET nationality = COALESCE(nationality, %s) WHERE runner_id = %s", (nat, chosen)
            )
        return chosen

    # Runners are the one table that grows by the hundred thousand: their new ids are 64 bits.
    return _insert_with_new_id(
        connection,
        "run",
        "INSERT INTO runners (runner_id, family_name, first_name, gender, birth_year, nationality, name_key) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (runner_id) DO NOTHING RETURNING runner_id",
        (result.family_name.strip(), result.first_name.strip(), (result.gender or "").strip().upper()[:1] or "X", result.birth_year, nat, key),
        nbytes=8,
    )


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


def list_runners(limit: int | None = None) -> list[Runner]:
    """Every runner with a published result, for the runner index table.

    `limit` is a ceiling on the work, not a page: the caller ranks what comes back, and a slice
    taken here in alphabetical order would be ranked among itself. The table used to ask for 500
    ordered by family name, so with more runners than that the "by index" ranking was the ranking
    of whoever came first in the alphabet, and the strongest runner in the world could be missing
    from it because their name begins with W.
    """
    sql = _RUNNER_SELECT + " GROUP BY ru.runner_id ORDER BY ru.family_name, ru.first_name"
    with get_connection() as connection:
        if limit is None:
            rows = connection.execute(sql).fetchall()
        else:
            rows = connection.execute(sql + " LIMIT %s", (limit,)).fetchall()
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


def published_results_grouped_by_race(runner_ids: list[str] | None = None) -> dict[str, list[dict]]:
    """For the runner table: the results in published races of these runners, keyed by race.

    Without `runner_ids` this reads every published result there is. That is what the public
    /runners endpoint used to do on every request, however few runners it was showing, so the cost
    of one anonymous call grew with the whole database. It asks for the hundred it is about to
    show instead.
    """
    if runner_ids is not None and not runner_ids:
        return {}
    where = "WHERE res.runner_id IS NOT NULL" if runner_ids is None else "WHERE res.runner_id = ANY(%s)"
    params = () if runner_ids is None else (list(runner_ids),)
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT res.id AS result_id, res.race_id, res.runner_id, e.event_date FROM results res "
            "JOIN races ra ON ra.race_id = res.race_id AND ra.published_at IS NOT NULL "
            "JOIN events e ON e.event_id = ra.event_id " + where,
            params,
        ).fetchall()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["race_id"], []).append(dict(row))
    return grouped


# --- Organizer profile ---------------------------------------------------------

# No phone number. The form stopped asking for one, but the column, the schema and the endpoint
# all kept accepting and returning it, so any client could still put one there -- data OTRI has no
# use for, does not show anywhere, and does not list in PRIVACY.md. The column stays for now so
# nothing breaks on an older row; a migration empties it.
PROFILE_FIELDS = ("display_name", "organization", "website", "country", "bio", "marketing_opt_in")


def get_profile(organizer_id: int) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            f"SELECT {', '.join(PROFILE_FIELDS)}, marketing_opt_in_at, terms_accepted_at, two_factor_method, password_changed_at, has_password FROM organizers WHERE id = %s", (organizer_id,)
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
    payload: dict | None = None


_REPORT_COLUMNS = "id, kind, subject_id, subject_label, reason, message, reporter_email, page_url, status, created_at, resolved_at, resolved_by, resolution, payload"


def create_report(*, kind: str, subject_id: str, subject_label: str | None, reason: str | None, message: str, reporter_email: str | None, page_url: str | None, payload: dict | None = None) -> Report:
    with get_connection() as connection:
        row = connection.execute(
            "INSERT INTO reports (kind, subject_id, subject_label, reason, message, reporter_email, page_url, payload) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_REPORT_COLUMNS}",
            (kind, subject_id, subject_label, reason, message, reporter_email, page_url, Jsonb(payload) if payload else None),
        ).fetchone()
    return Report(**row)


def list_reports(status: str | None = "open") -> list[Report]:
    with get_connection() as connection:
        if status:
            rows = connection.execute(f"SELECT {_REPORT_COLUMNS} FROM reports WHERE status = %s ORDER BY created_at DESC", (status,)).fetchall()
        else:
            # Open first, then removal requests before anything else: somebody asking for their
            # own data to come down is waiting on a person, and the form tells them this is how it
            # is ordered. Within that, oldest open first, so nothing is left at the bottom forever.
            rows = connection.execute(
                f"SELECT {_REPORT_COLUMNS} FROM reports "
                "ORDER BY (status = 'open') DESC, (reason = 'remove_my_data') DESC, "
                "CASE WHEN status = 'open' THEN created_at END ASC, created_at DESC"
            ).fetchall()
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


def delete_runner(runner_id: str) -> tuple[int, list[str]]:
    """Remove a runner and every result attached to them.

    Returns how many results went and which published races were taken down because of it.

    A runner's results are spread across whatever races they ran, which belong to whatever
    organizers held them. Removing the runner therefore reaches into other people's published
    leaderboards, and a race that loses its last finisher this way used to stay public, still
    listed as scored, with a results page that answered 404. A race with nobody left in it is
    unpublished here, in the same transaction, so the public record is never left saying something
    that is not so. The race itself and its course are untouched: the organizer can look at it,
    see what is left and decide.
    """
    with get_connection() as connection:
        affected = [
            row["race_id"]
            for row in connection.execute("SELECT DISTINCT race_id FROM results WHERE runner_id = %s", (runner_id,)).fetchall()
        ]
        removed = connection.execute("DELETE FROM results WHERE runner_id = %s", (runner_id,)).rowcount
        connection.execute("DELETE FROM runners WHERE runner_id = %s", (runner_id,))
        unpublished: list[str] = []
        if affected:
            rows = connection.execute(
                "UPDATE races SET published_at = NULL, updated_at = now() WHERE race_id = ANY(%s) AND published_at IS NOT NULL "
                "AND NOT EXISTS (SELECT 1 FROM results res WHERE res.race_id = races.race_id AND res.finish_time_seconds IS NOT NULL) "
                "RETURNING race_id",
                (affected,),
            ).fetchall()
            unpublished = [row["race_id"] for row in rows]
    return removed, unpublished


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
        runners = _runner_ids(
            connection, "res.race_id IN (SELECT ra.race_id FROM races ra JOIN events e ON e.event_id = ra.event_id WHERE e.organizer_id = %s)", (organizer_id,)
        )
        # The delivery log is keyed on the address rather than the account, so it survived a
        # deletion and kept a list of everyone who had ever had an account, readable by any admin.
        # Its purpose -- answering "I never got the email" -- ends with the account, so the address
        # goes and the row stays as a delivery statistic belonging to nobody.
        address = connection.execute("SELECT email FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
        if address is not None:
            connection.execute(
                "UPDATE email_log SET to_email = %s, error = NULL WHERE to_email = %s",
                ("(deleted account)", address["email"]),
            )
            # The abuse counters are keyed on the address too: wrong passwords, wrong codes, the
            # confirm-password lock. They exist to slow an attacker down on a live account.
            escaped = address["email"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            connection.execute(
                "DELETE FROM login_failures WHERE email = %s OR email LIKE %s ESCAPE '\' "
                "OR email = %s OR email = %s",
                (address["email"], escaped + "|%", f"confirm|{address['email']}", f"2fa|{address['email']}"),
            )
        connection.execute("DELETE FROM events WHERE organizer_id = %s", (organizer_id,))
        cursor = connection.execute("DELETE FROM organizers WHERE id = %s", (organizer_id,))
        _drop_runners_without_results(connection, runners)
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


# ------------------------------------------------------------------ site traffic (api/analytics.py)


def record_site_hit(*, day, path: str, source: str, zone: str, device: str, browser: str, visitor: str) -> None:
    """One page view. Two counters and nothing else: the row for this combination goes up by one,
    and the visitor's digest is remembered for today so the same person is one visitor."""
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO site_hits (day, path, source, zone, device, browser, hits) VALUES (%s, %s, %s, %s, %s, %s, 1) "
            "ON CONFLICT (day, path, source, zone, device, browser) DO UPDATE SET hits = site_hits.hits + 1",
            (day, path, source, zone, device, browser),
        )
        first_today = connection.execute(
            "INSERT INTO site_visitors (day, visitor) VALUES (%s, %s) ON CONFLICT (day, visitor) DO NOTHING RETURNING 1",
            (day, visitor),
        ).fetchone()
        if first_today is not None:
            # Counted as it happens, so the number outlives the digests it was counted from.
            connection.execute(
                "INSERT INTO site_visitor_days (day, visitors) VALUES (%s, 1) "
                "ON CONFLICT (day) DO UPDATE SET visitors = site_visitor_days.visitors + 1",
                (day,),
            )
        if random.random() < 0.01:  # opportunistic, as the rate limiter prunes its own
            connection.execute("DELETE FROM site_visitors WHERE day < %s - INTERVAL '3 days'", (day,))


def record_site_action(day, action: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO site_actions (day, action, count) VALUES (%s, %s, 1) "
            "ON CONFLICT (day, action) DO UPDATE SET count = site_actions.count + 1",
            (day, action),
        )


def prune_site_visitors(before) -> int:
    """Old digests cannot be joined to any other day (the date is inside them), so they go."""
    with get_connection() as connection:
        return connection.execute("DELETE FROM site_visitors WHERE day < %s", (before,)).rowcount


def site_traffic(since) -> dict:
    """Everything the admin traffic page shows, in one round trip per list."""
    with get_connection() as connection:
        def rows(sql, limit=None):
            params = (since, limit) if limit is not None else (since,)
            return [dict(row) for row in connection.execute(sql, params).fetchall()]

        by_day = rows(
            "SELECT h.day::text AS day, sum(h.hits)::int AS hits,"
            " COALESCE((SELECT d.visitors FROM site_visitor_days d WHERE d.day = h.day), 0)::int AS visitors"
            " FROM site_hits h WHERE h.day >= %s GROUP BY h.day ORDER BY h.day"
        )
        return {
            "by_day": by_day,
            "pages": rows("SELECT path AS name, sum(hits)::int AS hits FROM site_hits WHERE day >= %s GROUP BY path ORDER BY hits DESC LIMIT %s", 20),
            "sources": rows("SELECT source AS name, sum(hits)::int AS hits FROM site_hits WHERE day >= %s GROUP BY source ORDER BY hits DESC LIMIT %s", 15),
            "zones": rows("SELECT zone AS name, sum(hits)::int AS hits FROM site_hits WHERE day >= %s AND zone <> '' GROUP BY zone ORDER BY hits DESC LIMIT %s", 15),
            "devices": rows("SELECT device AS name, sum(hits)::int AS hits FROM site_hits WHERE day >= %s GROUP BY device ORDER BY hits DESC LIMIT %s", 5),
            "browsers": rows("SELECT browser AS name, sum(hits)::int AS hits FROM site_hits WHERE day >= %s GROUP BY browser ORDER BY hits DESC LIMIT %s", 8),
            "actions": rows("SELECT action AS name, sum(count)::int AS hits FROM site_actions WHERE day >= %s GROUP BY action ORDER BY hits DESC LIMIT %s", 20),
            "totals": {
                "hits": sum(row["hits"] for row in by_day),
                "visitors": sum(row["visitors"] for row in by_day),
                "days": len(by_day),
            },
        }


def get_organizer_flags(organizer_id: int, token_id: str | None = None) -> dict | None:
    """Flags plus the current session version, and whether this very token was signed out; None
    when the account no longer exists. One query: it runs on every authenticated request."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT is_admin, is_demo, session_version, email_verified, "
            "EXISTS (SELECT 1 FROM revoked_tokens WHERE token = %s) AS revoked FROM organizers WHERE id = %s",
            (token_id, organizer_id),
        ).fetchone()
    if row is None:
        return None
    verified = bool(row["email_verified"])
    # Admin rights rest on an address in OTRI_ADMIN_EMAILS; an address nobody has confirmed proves nothing.
    return {
        "is_admin": bool(row["is_admin"]) and verified,
        "is_demo": bool(row["is_demo"]),
        "session_version": int(row["session_version"]),
        "email_verified": verified,
        "revoked": bool(row["revoked"]),
    }


def revoke_token(token_id: str, expires_at: datetime) -> None:
    """Signing out ends that one session on the server too: the token's id (its `jti`, which opens
    nothing) is kept until the token would have expired anyway."""
    with get_connection() as connection:
        connection.execute("INSERT INTO revoked_tokens (token, expires_at) VALUES (%s, %s) ON CONFLICT (token) DO NOTHING", (token_id, expires_at))
        connection.execute("DELETE FROM revoked_tokens WHERE expires_at < now()")


def keep_admins(emails: set[str]) -> int:
    """Take the admin flag from every account whose address is not in `emails`; returns how many."""
    with get_connection() as connection:
        return connection.execute("UPDATE organizers SET is_admin = FALSE WHERE is_admin AND NOT (email = ANY(%s))", (sorted(emails),)).rowcount


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
            "SELECT email, created_at, email_verified, is_admin, display_name, organization, website, country, bio, "
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
        # A linked sign-in is held about the person and is nowhere else they can see it: the account
        # page shows only that Google is connected, not which address or since when.
        identities = connection.execute(
            "SELECT provider, subject, email, created_at, last_used_at FROM organizer_identities WHERE organizer_id = %s ORDER BY created_at",
            (organizer_id,),
        ).fetchall()
    return {
        "account": dict(account) if account else None,
        "linked_sign_ins": [dict(row) for row in identities],
        "events": [dict(row) for row in events],
        "races": [dict(row) for row in races],
        "results": [dict(row) for row in results],
        "emails_sent_to_you": [dict(row) for row in emails],
        "not_included": (
            "Security material is deliberately left out: the password hash, any authenticator secret "
            "and the hashed recovery codes. Email history is the most recent 200 messages."
        ),
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


# --- Site settings --------------------------------------------------------------------------


def get_setting(key: str) -> dict | None:
    """One site setting, or None when it was never set."""
    with get_connection() as connection:
        row = connection.execute("SELECT value FROM site_settings WHERE key = %s", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: dict) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO site_settings (key, value, updated_at) VALUES (%s, %s, now()) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
            (key, Jsonb(value)),
        )


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
