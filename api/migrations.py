"""Ordered, one-shot schema migrations on top of the idempotent baseline in ``api.db``.

The baseline (``db._SCHEMA``) only ever adds: ``CREATE TABLE IF NOT EXISTS`` and
``ADD COLUMN IF NOT EXISTS``. Anything that has to rename, backfill, drop or transform data goes
here instead, as a numbered entry that runs exactly once per database, inside one transaction,
and is recorded in ``schema_migrations``. ``api.db.init_db()`` applies pending entries on every
start (and ``python scripts/migrate.py`` does it by hand), so a deploy is: pull, restart.

Rules:
- Never edit an entry after it has shipped; add a new one. Applied names are checked against this
  list, and an unknown applied name aborts startup rather than guessing.
- Each entry must be safe to run on a database that already has the baseline applied.
- Keep entries small and reversible by a following entry; there is no automatic downgrade.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Migration:
    name: str
    sql: str
    note: str = ""


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        "0001_session_version",
        """
        ALTER TABLE organizers ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
        """,
        "Bumping it invalidates every token issued before (password change, 2FA off, sign out everywhere).",
    ),
    Migration(
        "0002_rate_limits_and_lockout",
        """
        CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT NOT NULL,
            window_start TIMESTAMPTZ NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (key, window_start)
        );
        CREATE TABLE IF NOT EXISTS login_failures (
            email TEXT PRIMARY KEY,
            failures INTEGER NOT NULL DEFAULT 0,
            first_failure_at TIMESTAMPTZ,
            locked_until TIMESTAMPTZ
        );
        """,
        "Rate limits shared by every worker and surviving restarts; per-account lockout after repeated bad passwords.",
    ),
    Migration(
        "0003_email_log",
        """
        CREATE TABLE IF NOT EXISTS email_log (
            id SERIAL PRIMARY KEY,
            to_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            provider_id TEXT,
            status TEXT NOT NULL,
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS email_log_created_at ON email_log (created_at DESC);
        """,
        "Every send with the provider's message id, so 'I never got the email' can be answered.",
    ),
)

_TRACKING_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def applied_names(connection) -> list[str]:
    connection.execute(_TRACKING_SQL)
    return [row["name"] for row in connection.execute("SELECT name FROM schema_migrations ORDER BY name").fetchall()]


def pending(connection) -> list[Migration]:
    done = set(applied_names(connection))
    known = {m.name for m in MIGRATIONS}
    unknown = sorted(done - known)
    if unknown:
        raise RuntimeError(
            f"database has migrations this code does not know about: {unknown}. "
            "Deploying older code on a newer database is not supported; update the code first."
        )
    return [m for m in MIGRATIONS if m.name not in done]


def apply_pending(connection) -> list[str]:
    """Runs every pending migration, each in its own transaction, in order. Returns the names applied."""
    applied: list[str] = []
    for migration in pending(connection):
        with connection.transaction():
            connection.execute(migration.sql)
            connection.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (migration.name,))
        applied.append(migration.name)
    return applied
