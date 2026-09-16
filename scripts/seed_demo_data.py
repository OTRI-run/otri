"""Seed the Postgres database with OTRI's synthetic demo races/results.

Idempotent: skips races that already exist (matched by race_id). Run after
``api.db.init_db()`` has created the schema (the API does this on startup),
or just run this script — it creates the schema itself too.

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
        if db.find_race(race.race_id) is not None:
            continue
        db.insert_race(race)
        inserted += 1

        result_path = RESULTS_DIR / f"{race.race_id}.csv"
        if result_path.exists():
            db.replace_results(race.race_id, result_records(result_path))

    print(f"Seeded {inserted} new race(s) out of {len(races)} in the demo dataset.")


if __name__ == "__main__":
    main()
