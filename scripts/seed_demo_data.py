"""Seed the Postgres database with OTRI's synthetic demo events/races/results.

Each demo race becomes its own event with a single race distance under it
(matching the flat structure of the original demo CSV). Idempotent: skips
events that already exist (matched by event_id, derived from the original
race_id). Run after ``api.db.init_db()`` has created the schema (the API
does this on startup), or just run this script — it creates the schema
itself too.

    python scripts/seed_demo_data.py
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))  # allow running as `python scripts/seed_demo_data.py`

from api import db  # noqa: E402
from ingestion import race_records, result_records  # noqa: E402

RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"


def main() -> None:
    db.init_db()

    races = race_records(RACES_FILE)
    inserted = 0
    for race in races:
        event_id = f"evt-{race.race_id}"
        if db.find_event(event_id) is None:
            db.create_event(race.race_name, race.event_date, organizer_id=None, event_id=event_id)
            inserted += 1

        if db.find_race(race.race_id) is None:
            db.create_race(
                event_id, race.course_name, race.distance_km, race.elevation_gain_m, race_id=race.race_id
            )

        result_path = RESULTS_DIR / f"{race.race_id}.csv"
        if result_path.exists():
            db.replace_results(race.race_id, result_records(result_path))

    print(f"Seeded {inserted} new event(s) out of {len(races)} in the demo dataset.")


if __name__ == "__main__":
    main()
