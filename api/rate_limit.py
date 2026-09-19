"""Rate limiting for the auth and upload endpoints, shared by every worker.

Counts live in the ``rate_limits`` table (one row per key and fixed 60-second window), so the
limits hold across gunicorn workers and API restarts. If the database is unreachable the
limiter falls back to an in-process counter rather than failing open, so a database outage
does not also switch off brute-force protection on the login form.

Per-account lockout (``login_failures``) is separate: it counts wrong passwords for one email
whatever the source IP, and locks the account for a while after too many, which is what stops a
distributed guess at one organizer's password.
"""

from __future__ import annotations

import random
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from . import db

WINDOW_SECONDS = 60
_MAX_REQUESTS_PER_WINDOW = 10

# Fallback only: used when the database cannot be reached.
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _window_start(now: datetime) -> datetime:
    return now.replace(second=0, microsecond=0)


def _count_in_db(key: str, now: datetime) -> int:
    with db.get_connection() as connection:
        row = connection.execute(
            "INSERT INTO rate_limits (key, window_start, count) VALUES (%s, %s, 1) "
            "ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count",
            (key, _window_start(now)),
        ).fetchone()
        if random.random() < 0.02:  # opportunistic cleanup, no cron needed
            connection.execute("DELETE FROM rate_limits WHERE window_start < %s", (now - timedelta(minutes=10),))
    return int(row["count"])


def _count_in_memory(key: str) -> int:
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > WINDOW_SECONDS:
        hits.popleft()
    hits.append(now)
    return len(hits)


def enforce_rate_limit(request: Request, *, max_requests: int = _MAX_REQUESTS_PER_WINDOW, scope: str | None = None, subject: str | int | None = None) -> None:
    """Raise 429 if this client has made too many requests to this endpoint in the current minute.

    `scope` names the limit when the path will not do: `/races/{id}/gpx` is a different path for
    every race, so a script would get a fresh allowance per race. `subject` counts per account
    instead of per address, for a signed-in caller who changes addresses."""
    key = f"{scope or request.url.path}:{subject if subject is not None else _client_key(request)}"
    try:
        count = _count_in_db(key, datetime.now(timezone.utc))
    except Exception:  # noqa: BLE001 - database down: keep limiting in-process rather than failing open
        count = _count_in_memory(key)
    if count > max_requests:
        raise HTTPException(
            status_code=429,
            detail="too many requests, try again later",
            headers={"Retry-After": str(WINDOW_SECONDS)},
        )


def reset() -> None:
    """Test helper: forget every counter (database rows and the in-process fallback)."""
    _hits.clear()
    try:
        with db.get_connection() as connection:
            connection.execute("DELETE FROM rate_limits")
            connection.execute("DELETE FROM login_failures")
    except Exception:  # noqa: BLE001
        pass


# --- Per-account lockout ----------------------------------------------------

LOCKOUT_FAILURES = 10
LOCKOUT_WINDOW = timedelta(minutes=15)
LOCKOUT_DURATION = timedelta(minutes=15)


class AccountLocked(Exception):
    def __init__(self, until: datetime):
        self.until = until
        minutes = max(1, int((until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        super().__init__(f"too many failed sign-in attempts; try again in {minutes} minute{'s' if minutes != 1 else ''}, or reset your password")


def check_account_lock(email: str) -> None:
    """Raise AccountLocked while the account is in its lockout period."""
    email = email.strip().lower()
    with db.get_connection() as connection:
        row = connection.execute("SELECT locked_until FROM login_failures WHERE email = %s", (email,)).fetchone()
    if row and row["locked_until"] and row["locked_until"] > datetime.now(timezone.utc):
        raise AccountLocked(row["locked_until"])


def record_login_failure(email: str) -> None:
    """Count a wrong password; the Nth within the window locks the account."""
    email = email.strip().lower()
    now = datetime.now(timezone.utc)
    with db.get_connection() as connection:
        row = connection.execute("SELECT failures, first_failure_at FROM login_failures WHERE email = %s", (email,)).fetchone()
        if row is None or row["first_failure_at"] is None or now - row["first_failure_at"] > LOCKOUT_WINDOW:
            failures, first = 1, now
        else:
            failures, first = int(row["failures"]) + 1, row["first_failure_at"]
        locked_until = now + LOCKOUT_DURATION if failures >= LOCKOUT_FAILURES else None
        connection.execute(
            "INSERT INTO login_failures (email, failures, first_failure_at, locked_until) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (email) DO UPDATE SET failures = EXCLUDED.failures, first_failure_at = EXCLUDED.first_failure_at, "
            "locked_until = EXCLUDED.locked_until",
            (email, failures, first, locked_until),
        )


def clear_login_failures(email: str) -> None:
    with db.get_connection() as connection:
        connection.execute("DELETE FROM login_failures WHERE email = %s", (email.strip().lower(),))
