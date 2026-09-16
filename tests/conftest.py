"""Shared pytest fixtures: point every test at a dedicated Postgres test database.

Must set DATABASE_URL / OTRI_API_JWT_SECRET *before* anything imports
``api.db`` or ``api.auth`` (both read env vars once, at module import time),
so this happens at conftest module load — pytest always imports conftest.py
before collecting test modules.
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:otri_dev_password@localhost:5432/otri_test")
os.environ.setdefault("OTRI_API_JWT_SECRET", "test-secret-not-for-production-use-only-1234")

import pytest  # noqa: E402

from api import db, rate_limit  # noqa: E402
from ingestion import race_records, result_records  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"


@pytest.fixture(autouse=True)
def clean_state():
    """Reset the test database to just the demo dataset, and clear the in-memory rate limiter, before every test."""
    db.init_db()
    with db.get_connection() as connection:
        connection.execute(
            "TRUNCATE organizers, email_verification_tokens, password_reset_tokens, events, races, results "
            "RESTART IDENTITY CASCADE"
        )
    for race in race_records(RACES_FILE):
        event_id = f"evt-{race.race_id}"
        db.create_event(race.race_name, race.event_date, organizer_id=None, event_id=event_id)
        db.create_race(event_id, race.course_name, race.distance_km, race.elevation_gain_m, race_id=race.race_id)
        result_path = RESULTS_DIR / f"{race.race_id}.csv"
        if result_path.exists():
            db.replace_results(race.race_id, result_records(result_path))
    rate_limit._hits.clear()
    yield
