"""Seed the Postgres database with OTRI's synthetic demo events/races/results.

The demo data belongs to a dedicated, flagged organizer account (``demo@otri.run``) so the
site can label it DEMO DATA. It is test data, so it is **not public by default**: the races are
created unpublished (admins see them under Admin, Events & races, and can publish one by hand),
and a race somebody has published is left as it is. ``--publish`` publishes every demo race,
``--unpublish`` hides every one. Idempotent: existing events/races are kept (matched by id, derived from the
original race_id); results are replaced from the CSV files; ownerless demo events from older
seeds are adopted by the demo account. Run after ``api.db.init_db()`` has created the schema
(the API does this on startup), or just run this script — it creates the schema itself too.

    python scripts/seed_demo_data.py                # seed, leave publishing alone
    python scripts/seed_demo_data.py --publish      # a local or staging site that should show them
    python scripts/seed_demo_data.py --unpublish    # take them off a public site
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))  # allow running as `python scripts/seed_demo_data.py`

from api import db
from scoring.registry import DEFAULT_SCORING_VERSION  # noqa: E402
from api.auth import register_organizer  # noqa: E402
from ingestion import race_records, result_records  # noqa: E402

RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"
DEMO_EMAIL = "demo@otri.run"
DEMO_EVENT_PREFIX = "evt-OTRI-DEMO-"


def demo_organizer_id() -> int:
    """The demo account. Created with a random password nobody knows: it is never signed into."""
    organizer_id = db.find_organizer_id(DEMO_EMAIL)
    if organizer_id is None:
        organizer_id = register_organizer(DEMO_EMAIL, secrets.token_urlsafe(24)).id
        with db.get_connection() as connection:
            connection.execute("UPDATE organizers SET email_verified = TRUE WHERE id = %s", (organizer_id,))
    db.set_organizer_flags(DEMO_EMAIL, is_demo=True)
    return organizer_id


def main(publish: bool | None = None) -> None:
    """``publish``: True publishes every demo race, False hides every one, None leaves each as it is."""
    db.init_db()
    organizer_id = demo_organizer_id()
    adopted = db.adopt_events(organizer_id, DEMO_EVENT_PREFIX)

    races = race_records(RACES_FILE)
    inserted = 0
    for race in races:
        event_id = f"{DEMO_EVENT_PREFIX}{race.race_id.removeprefix('OTRI-DEMO-')}"
        if db.find_event(event_id) is None:
            db.create_event(race.race_name, race.event_date, organizer_id=organizer_id, event_id=event_id, location=race.location, country=race.country)
            inserted += 1
        elif race.location or race.country:
            db.update_event(event_id, location=race.location, country=race.country)

        existing = db.find_race(race.race_id)
        if existing is None:
            db.create_race(
                event_id, race.course_name, race.distance_km, race.elevation_gain_m, race_id=race.race_id
            )
        elif existing.scoring_version != DEFAULT_SCORING_VERSION and not existing.has_gpx:
            # Demo races are synthetic and carry no course file, so they can always follow the
            # model in production; otherwise the public demo leaderboards would keep showing a
            # retired build's numbers after every model change.
            db.update_race(race.race_id, scoring_version=DEFAULT_SCORING_VERSION)

        result_path = RESULTS_DIR / f"{race.race_id}.csv"
        if result_path.exists():
            db.replace_results(race.race_id, result_records(result_path), allow_published=True)
            if publish is not None:
                db.set_race_published(race.race_id, publish)

    public = sum(1 for race in races if (found := db.find_race(race.race_id)) is not None and found.published_at is not None)
    print(
        f"Seeded {inserted} new event(s) out of {len(races)} in the demo dataset; "
        f"adopted {adopted} ownerless demo event(s); {public} of {len(races)} demo race(s) are public."
    )


if __name__ == "__main__":
    flags = set(sys.argv[1:])
    if {"--publish", "--unpublish"} <= flags:
        sys.exit("choose one of --publish and --unpublish")
    main(True if "--publish" in flags else False if "--unpublish" in flags else None)
