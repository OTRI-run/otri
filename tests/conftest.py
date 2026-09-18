"""Shared pytest fixtures: point every test at a dedicated Postgres test database.

Must set DATABASE_URL / OTRI_API_JWT_SECRET *before* anything imports
``api.db`` or ``api.auth`` (both read env vars once, at module import time),
so this happens at conftest module load — pytest always imports conftest.py
before collecting test modules.
"""

from __future__ import annotations

import os
from pathlib import Path

# Always a dedicated test database: the suite TRUNCATEs every table, so it must never run against
# the database a dev server or production uses, even when DATABASE_URL is set machine-wide.
# Override with OTRI_TEST_DATABASE_URL (CI, a different host), never with DATABASE_URL.
os.environ["DATABASE_URL"] = os.environ.get(
    "OTRI_TEST_DATABASE_URL", "postgresql://postgres:otri_dev_password@localhost:5432/otri_test"
)
os.environ.setdefault("OTRI_API_JWT_SECRET", "test-secret-not-for-production-use-only-1234")

import bcrypt  # noqa: E402
import pytest  # noqa: E402

from api import db, rate_limit  # noqa: E402
from ingestion import race_records, result_records  # noqa: E402

# api/auth.py's bcrypt.gensalt() defaults to cost factor 12 (~250ms/hash), which is
# appropriate for production but makes a test suite that registers/logs in dozens of
# organizers dominated by hashing time rather than actual test logic. Patch the shared
# `bcrypt` module's gensalt to a much cheaper cost factor for the whole test run only —
# production code (api/auth.py) is untouched and still asks for the default at runtime.
_real_gensalt = bcrypt.gensalt
bcrypt.gensalt = lambda rounds=4, prefix=b"2b": _real_gensalt(rounds=4, prefix=prefix)

REPO_ROOT = Path(__file__).resolve().parents[1]
RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"


@pytest.fixture
def clean_state():
    """Reset the test database to just the demo dataset, and clear the in-memory rate limiter, before every test.

    Not autouse: only tests/unit/test_api.py and tests/unit/test_auth.py actually hit the
    database, so they opt in via `pytestmark = pytest.mark.usefixtures("clean_state")`. Running
    this TRUNCATE+reseed before every one of the ~140 tests (including pure-math scoring/course
    tests that never touch the DB) was the dominant cost of the whole suite.
    """
    db.init_db()
    with db.get_connection() as connection:
        connection.execute(
            "TRUNCATE organizers, email_verification_tokens, password_reset_tokens, events, races, results, runners "
            "RESTART IDENTITY CASCADE"
        )
    for race in race_records(RACES_FILE):
        event_id = f"evt-{race.race_id}"
        db.create_event(race.race_name, race.event_date, organizer_id=None, event_id=event_id)
        db.create_race(event_id, race.course_name, race.distance_km, race.elevation_gain_m, race_id=race.race_id)
        result_path = RESULTS_DIR / f"{race.race_id}.csv"
        if result_path.exists():
            db.replace_results(race.race_id, result_records(result_path))
            db.set_race_published(race.race_id, True)  # demo races are public, as in production
    rate_limit._hits.clear()
    yield
