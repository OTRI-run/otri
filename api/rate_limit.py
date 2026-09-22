"""Rate limiting for the auth and upload endpoints, shared by every worker.

Counts live in the ``rate_limits`` table (one row per key and window), so the limits hold across
gunicorn workers and API restarts. If the database is unreachable the limiter falls back to an
in-process counter rather than failing open, so a database outage does not also switch off
brute-force protection on the login form.

A limit is a sliding window, estimated from two fixed ones: this window's count plus the share of
the previous window that still lies inside the last ``window_seconds``. A plain fixed window lets
a script send its allowance at 11:59:59 and again at 12:00:00, twice the limit in two seconds.

Most limits are per minute. What is cheap per minute and ruinous per day (accounts made, emails
sent, terrain tiles fetched) is also limited per hour or per day: pass ``window_seconds``.

Locks (``login_failures``) are separate: they count failures for one key whatever the source
address, and lock it for a while after too many, which is what stops a distributed guess at one
organizer's password or second factor.
"""

from __future__ import annotations

import hashlib
import random
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from . import db

WINDOW_SECONDS = 60
_MAX_REQUESTS_PER_WINDOW = 10
_LONGEST_WINDOW = timedelta(days=1)

# Fallback only: used when the database cannot be reached.
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request | None) -> str:
    """The caller, as this table may hold them: a digest, never the address itself.

    The limiter only ever compares this value with itself, so it has no use for the address in the
    clear -- and the rows outlive the request by up to two days, then thirty more in a nightly
    backup. Email subjects were already hashed by subject_for for exactly this reason; addresses
    were not. Same length and same shape, so the keys behave identically.
    """
    host = request.client.host if request is not None and request.client else "unknown"
    return hashlib.sha256(host.encode("utf-8")).hexdigest()[:20]


def _window_start(now: datetime, window_seconds: int = WINDOW_SECONDS) -> datetime:
    return datetime.fromtimestamp(now.timestamp() // window_seconds * window_seconds, tz=timezone.utc)


def _count_in_db(key: str, now: datetime, window_seconds: int = WINDOW_SECONDS, cost: int = 1) -> float:
    start = _window_start(now, window_seconds)
    with db.get_connection() as connection:
        row = connection.execute(
            "INSERT INTO rate_limits (key, window_start, count) VALUES (%s, %s, %s) "
            "ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + EXCLUDED.count RETURNING count",
            (key, start, cost),
        ).fetchone()
        previous = connection.execute(
            "SELECT count FROM rate_limits WHERE key = %s AND window_start = %s", (key, start - timedelta(seconds=window_seconds))
        ).fetchone()
        if random.random() < 0.02:  # opportunistic cleanup, no cron needed
            # Minute windows go after ten minutes; the long ones ("~" keys) once the longest has passed twice.
            connection.execute("DELETE FROM rate_limits WHERE window_start < %s AND key NOT LIKE '~%%'", (now - timedelta(minutes=10),))
            connection.execute("DELETE FROM rate_limits WHERE window_start < %s", (now - 2 * _LONGEST_WINDOW,))
    still_inside = 1 - (now - start).total_seconds() / window_seconds
    return int(row["count"]) + (int(previous["count"]) * still_inside if previous else 0)


def _count_in_memory(key: str, window_seconds: int = WINDOW_SECONDS, cost: int = 1) -> int:
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > window_seconds:
        hits.popleft()
    hits.extend([now] * cost)
    return len(hits)


def subject_for(value: str) -> str:
    """A rate-limit subject for something personal (an email address): the table keeps a digest."""
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()[:20]


def over_limit(
    request: Request | None,
    *,
    max_requests: int,
    scope: str | None = None,
    subject: str | int | None = None,
    window_seconds: int = WINDOW_SECONDS,
    cost: int = 1,
) -> bool:
    """Count this call and say whether it went over. For callers that must not answer 429 (an
    endpoint that may not reveal whether an address has an account just stays quiet instead)."""
    name = scope or (request.url.path if request is not None else "global")
    key = f"{name}:{subject if subject is not None else _client_key(request)}"
    if window_seconds != WINDOW_SECONDS:
        key = f"~{window_seconds}~{key}"
    try:
        count = _count_in_db(key, datetime.now(timezone.utc), window_seconds, cost)
    except Exception:  # noqa: BLE001 - database down: keep limiting in-process rather than failing open
        count = _count_in_memory(key, window_seconds, cost)
    return count > max_requests


def enforce_rate_limit(
    request: Request,
    *,
    max_requests: int = _MAX_REQUESTS_PER_WINDOW,
    scope: str | None = None,
    subject: str | int | None = None,
    window_seconds: int = WINDOW_SECONDS,
    cost: int = 1,
) -> None:
    """Raise 429 if this client has made too many requests to this endpoint in the last window.

    `cost` counts one call as several, for a budget measured in something other than calls: the
    shared-course folder is limited by the megabytes one address adds to it, not by the uploads.

    `scope` names the limit when the path will not do: `/races/{id}/gpx` is a different path for
    every race, so a script would get a fresh allowance per race. `subject` counts per account
    instead of per address, for a signed-in caller who changes addresses."""
    if over_limit(request, max_requests=max_requests, scope=scope, subject=subject, window_seconds=window_seconds, cost=cost):
        raise HTTPException(
            status_code=429,
            detail="too many requests, try again later",
            headers={"Retry-After": str(window_seconds)},
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


# --- Locks after repeated failures --------------------------------------------
#
# One row per key in `login_failures` (the column is called `email` for the first kind of key it
# held). The keys:
#
#   <email>|<address>   wrong passwords for this account from this address: 10 lock that address
#                       out of the account. A stranger who types ten wrong passwords for somebody
#                       else's email locks only themselves out, not the owner.
#   <email>             wrong passwords for this account from anywhere: 50 lock the account, which
#                       is what stops a guess spread over many addresses.
#   confirm|<email>     wrong passwords on the signed-in "confirm with your password" actions.
#   2fa|<email>         wrong second-factor codes, across sign-in attempts.

LOCKOUT_FAILURES = 10
LOCKOUT_FAILURES_ANY_SOURCE = 50
LOCKOUT_WINDOW = timedelta(minutes=15)
LOCKOUT_DURATION = timedelta(minutes=15)
SECOND_FACTOR_LOCKOUT_DURATION = timedelta(hours=1)


class AccountLocked(Exception):
    def __init__(self, until: datetime):
        self.until = until
        minutes = max(1, int((until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        super().__init__(f"too many failed sign-in attempts; try again in {minutes} minute{'s' if minutes != 1 else ''}, or reset your password")

    @property
    def retry_after(self) -> str:
        return str(max(1, int((self.until - datetime.now(timezone.utc)).total_seconds())))


def _normal(email: str) -> str:
    return email.strip().lower()


def check_lock(key: str) -> None:
    """Raise AccountLocked while `key` is in its lockout period."""
    with db.get_connection() as connection:
        row = connection.execute("SELECT locked_until FROM login_failures WHERE email = %s", (key,)).fetchone()
    if row and row["locked_until"] and row["locked_until"] > datetime.now(timezone.utc):
        raise AccountLocked(row["locked_until"])


def record_failure(key: str, *, threshold: int = LOCKOUT_FAILURES, duration: timedelta = LOCKOUT_DURATION) -> bool:
    """Count a failure for `key`; the Nth within the window locks it. True when this one locked it."""
    now = datetime.now(timezone.utc)
    with db.get_connection() as connection:
        row = connection.execute("SELECT failures, first_failure_at FROM login_failures WHERE email = %s FOR UPDATE", (key,)).fetchone()
        if row is None or row["first_failure_at"] is None or now - row["first_failure_at"] > LOCKOUT_WINDOW:
            failures, first = 1, now
        else:
            failures, first = int(row["failures"]) + 1, row["first_failure_at"]
        locked_until = now + duration if failures >= threshold else None
        connection.execute(
            "INSERT INTO login_failures (email, failures, first_failure_at, locked_until) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (email) DO UPDATE SET failures = EXCLUDED.failures, first_failure_at = EXCLUDED.first_failure_at, "
            "locked_until = EXCLUDED.locked_until",
            (key, failures, first, locked_until),
        )
        if random.random() < 0.02:
            prune_failures(connection, now)
    return failures == threshold


def prune_failures(connection, now: datetime) -> None:
    """A wrong password for an address nobody has is counted too (answering differently would say
    which addresses have accounts), so a script typing random addresses adds a row each. A row says
    nothing once its window and its lock are over; without this they stayed for ever."""
    connection.execute(
        "DELETE FROM login_failures WHERE (first_failure_at IS NULL OR first_failure_at < %s) AND (locked_until IS NULL OR locked_until < %s)",
        (now - max(LOCKOUT_WINDOW, SECOND_FACTOR_LOCKOUT_DURATION), now),
    )


def clear_failures(*keys: str) -> None:
    with db.get_connection() as connection:
        connection.execute("DELETE FROM login_failures WHERE email = ANY(%s)", (list(keys),))


def check_account_lock(email: str, source: str | None = None) -> None:
    email = _normal(email)
    check_lock(email)
    if source:
        check_lock(f"{email}|{source}")


def record_login_failure(email: str, source: str | None = None) -> None:
    """Count a wrong password, for the address it came from and for the account as a whole."""
    email = _normal(email)
    record_failure(email, threshold=LOCKOUT_FAILURES_ANY_SOURCE if source else LOCKOUT_FAILURES)
    if source:
        record_failure(f"{email}|{source}")


def clear_login_failures(email: str, source: str | None = None) -> None:
    email = _normal(email)
    clear_failures(email, *([f"{email}|{source}"] if source else []))


def clear_all_locks(email: str) -> None:
    """After a password reset: the owner proved the mailbox, so nothing an attacker piled up stays."""
    email = _normal(email)
    with db.get_connection() as connection:
        connection.execute(
            "DELETE FROM login_failures WHERE email = %s OR email LIKE %s ESCAPE '\\' OR email = %s",
            (email, email.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "|%", f"confirm|{email}"),
        )
