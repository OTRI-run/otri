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

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Migration:
    name: str
    sql: str
    note: str = ""
    # Some backfills cannot be written in SQL because the rule they apply lives in Python -- the
    # runner name key is one. `python` runs after `sql`, in the same transaction, and gets the
    # connection. It must be as one-shot and as safe to re-run as the SQL beside it.
    python: Callable[[object], None] | None = None


def _rebuild_runner_identity(connection) -> None:
    """Recompute every runner's name key, and give back their own profile to anyone who was merged
    into somebody else's.

    The old key encoded names to ASCII and dropped what would not fit, so a name written in any
    script but Latin became the empty string and every such runner shared one key. Two people with
    the same gender and the same year of birth then matched each other and their results were
    collected under whichever profile existed first.

    A result row keeps the name it was uploaded with, so the damage is undoable: each result is
    re-keyed from its own name, and any that no longer belongs to the runner it points at is moved
    to the right runner, creating one where there is none. Runners left with nothing go.
    """
    from .db import _insert_with_new_id, runner_name_key

    runners = connection.execute("SELECT runner_id, family_name, first_name, gender FROM runners").fetchall()
    keys: dict[str, str] = {}
    for runner in runners:
        key = runner_name_key(runner["family_name"], runner["first_name"], runner["gender"])
        keys[runner["runner_id"]] = key
        connection.execute("UPDATE runners SET name_key = %s WHERE runner_id = %s", (key, runner["runner_id"]))

    results = connection.execute(
        "SELECT id, runner_id, family_name, first_name, gender, birth_year, nationality FROM results "
        "WHERE runner_id IS NOT NULL ORDER BY id"
    ).fetchall()
    # (key, birth_year) -> runner_id, so the rows of one person find each other as they are walked.
    placed: dict[tuple[str, int | None], str] = {}
    for result in results:
        key = runner_name_key(result["family_name"], result["first_name"], result["gender"])
        if keys.get(result["runner_id"]) == key:
            placed.setdefault((key, result["birth_year"]), result["runner_id"])
            continue
        target = placed.get((key, result["birth_year"]))
        if target is None:
            row = connection.execute(
                "SELECT runner_id FROM runners WHERE name_key = %s AND (birth_year = %s OR (birth_year IS NULL AND %s IS NULL)) "
                "ORDER BY created_at, runner_id LIMIT 1",
                (key, result["birth_year"], result["birth_year"]),
            ).fetchone()
            target = row["runner_id"] if row else None
        if target is None:
            target = _insert_with_new_id(
                connection,
                "run",
                "INSERT INTO runners (runner_id, family_name, first_name, gender, birth_year, nationality, name_key) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (runner_id) DO NOTHING RETURNING runner_id",
                (
                    (result["family_name"] or "").strip(),
                    (result["first_name"] or "").strip(),
                    (result["gender"] or "").strip().upper()[:1] or "X",
                    result["birth_year"],
                    result["nationality"],
                    key,
                ),
                nbytes=8,
            )
            keys[target] = key
        placed[(key, result["birth_year"])] = target
        connection.execute("UPDATE results SET runner_id = %s WHERE id = %s", (target, result["id"]))

    connection.execute(
        "DELETE FROM runners ru WHERE NOT EXISTS (SELECT 1 FROM results res WHERE res.runner_id = ru.runner_id)"
    )


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
    Migration(
        "0004_single_scoring_model",
        """
        UPDATE races SET scoring_version = '0.9.0-course-standard-domain-gated', updated_at = now()
        WHERE scoring_version <> '0.9.0-course-standard-domain-gated' AND published_at IS NULL;
        ALTER TABLE races ALTER COLUMN scoring_version SET DEFAULT '0.9.0-course-standard-domain-gated';
        """,
        "The development builds before OTRI model 0.1.0 were removed from the code; a race stored under one "
        "is scored with the model from now on instead of failing as an unknown version.",
    ),
    Migration(
        "0005_vertical_build",
        """
        UPDATE races SET scoring_version = '0.10.0-course-standard-vertical', updated_at = now()
        WHERE scoring_version <> '0.10.0-course-standard-vertical' AND published_at IS NULL;
        ALTER TABLE races ALTER COLUMN scoring_version SET DEFAULT '0.10.0-course-standard-vertical';
        """,
        "Build 0.10.0 scores uphill-only courses (OEP-003) and gives every other course the same score as "
        "0.9.0 to the last digit, so stored races move to it without any score changing.",
    ),
    Migration(
        "0006_calculator_courses",
        """
        ALTER TABLE races ADD COLUMN IF NOT EXISTS calculator_only BOOLEAN NOT NULL DEFAULT FALSE;
        """,
        "Courses an admin puts up for the calculator's Pick a race: public for trying a target time, "
        "never shown as a race on the races page.",
    ),
    Migration(
        "0007_sign_out_and_mail_log",
        """
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            token TEXT PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL
        );
        UPDATE email_log SET subject = 'Your OTRI sign-in code' WHERE subject ~ '^[0-9]{6} is your OTRI sign-in code';
        DELETE FROM runners ru WHERE NOT EXISTS (SELECT 1 FROM results res WHERE res.runner_id = ru.runner_id);
        """,
        "Signing out revokes that token (digests, until they expire); sign-in codes leave the email log; runners left behind by replaced or deleted results go.",
    ),
    Migration(
        "0008_forget_phone_numbers_and_spent_tokens",
        """
        UPDATE organizers SET phone = NULL WHERE phone IS NOT NULL;
        DELETE FROM email_verification_tokens WHERE expires_at < now();
        DELETE FROM password_reset_tokens WHERE expires_at < now() - INTERVAL '1 hour';
        """,
        "The profile form stopped asking for a phone number but the endpoint still accepted one, and it was in no policy: "
        "existing numbers are emptied. One-time tokens that nobody can use any more are removed, which the code now also "
        "does on the path that makes them; PRIVACY.md said reset tokens were deleted after two hours and nothing ever did.",
    ),
    Migration(
        "0009_names_in_every_script",
        """
        DELETE FROM site_hits WHERE path LIKE '%?%';
        """,
        "A runner's name key kept only the characters that survived a conversion to ASCII, so every name written in a "
        "script other than Latin became the empty string and those runners shared one key -- unrelated people could be "
        "merged into one public profile and none of them could be found by searching. Keys are recomputed and merged "
        "profiles are separated again from the names on their own result rows. Counted page addresses that still carry a "
        "query string are dropped: the organizer app routes on the fragment, so a password-reset token could be counted.",
        python=_rebuild_runner_identity,
    ),
    Migration(
        "0010_keep_daily_visitor_counts",
        """
        CREATE TABLE IF NOT EXISTS site_visitor_days (
            day DATE PRIMARY KEY,
            visitors INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO site_visitor_days (day, visitors)
        SELECT day, count(*)::int FROM site_visitors GROUP BY day
        ON CONFLICT (day) DO UPDATE SET visitors = GREATEST(site_visitor_days.visitors, EXCLUDED.visitors);
        """,
        "The traffic report counted a day's visitors from the digests themselves, which are deleted after three days, so "
        "every older day showed nobody beside a page count that was still there. The count is kept as it is made; the days "
        "whose digests are still on file are backfilled, and older days stay at nobody because that number is not recoverable.",
    ),
    Migration(
        "0012_model_0_1_1",
        """
        UPDATE races SET scoring_version = '0.11.0-course-standard-model-0.1.1', updated_at = now()
        WHERE scoring_version = '0.10.0-course-standard-vertical';
        ALTER TABLE races ALTER COLUMN scoring_version SET DEFAULT '0.11.0-course-standard-model-0.1.1';
        """,
        "OTRI model 0.1.1 (OEP-004): the curve exponent 0.692 for 0.85, every other rule unchanged. "
        "Every race moves to it, published ones included, on the maintainer's decision: the change is a "
        "monotone restatement of one scale, no finisher changes place, and a 0.1.0 score restates exactly. "
        "The 0.1.0 build stays in the registry so that a score published under it can be reproduced.",
    ),
    Migration(
        "0011_race_review",
        """
        ALTER TABLE races ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'none';
        ALTER TABLE races ADD COLUMN IF NOT EXISTS review_flags JSONB;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS auto_verify_at TIMESTAMPTZ;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS review_note TEXT;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS publish_attested_at TIMESTAMPTZ;
        ALTER TABLE races ADD COLUMN IF NOT EXISTS results_fingerprint TEXT;
        CREATE INDEX IF NOT EXISTS races_review_status_idx ON races (review_status) WHERE review_status IN ('pending', 'held');
        CREATE INDEX IF NOT EXISTS races_results_fingerprint_idx ON races (results_fingerprint) WHERE results_fingerprint IS NOT NULL;
        UPDATE races SET review_status = 'verified', reviewed_at = now(), reviewed_by = 'migration'
        WHERE published_at IS NOT NULL AND review_status = 'none';
        """,
        "Publishing is screened: a clean race is public at once and verifies itself after a short window unless an admin "
        "objects; an obvious fake is held for an admin with the reasons on record. Races already published before the "
        "screening existed are marked verified as they stand.",
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
            if migration.sql.strip():
                connection.execute(migration.sql)
            if migration.python is not None:
                migration.python(connection)
            connection.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (migration.name,))
        applied.append(migration.name)
    return applied
