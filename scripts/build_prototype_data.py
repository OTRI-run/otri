"""Generate the static dataset used by the prototype frontend.

This is the concrete "wire everything together" step: it runs the real
ingestion -> scoring -> course pipeline against the synthetic demo dataset and
writes plain JSON, because the deployed site is static (GitHub Pages) and
cannot run the Python API/backend live (see api/README.md's known gaps).

Regenerate after changing demo data or scoring_version:

    python scripts/build_prototype_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))  # allow running as `python scripts/build_prototype_data.py`

from course import extract_features, read_track_points  # noqa: E402
from ingestion import race_records, result_records  # noqa: E402
from scoring import score_race  # noqa: E402

RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"
SAMPLE_GPX = REPO_ROOT / "data" / "demo" / "gpx" / "sample-course.gpx"
OUTPUT_FILE = REPO_ROOT / "prototype" / "data" / "races.json"


def format_hms(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def build_race_entry(race) -> dict:
    result_path = RESULTS_DIR / f"{race.race_id}.csv"
    entry = {
        "race_id": race.race_id,
        "race_name": race.race_name,
        "event_date": race.event_date.isoformat(),
        "course_name": race.course_name,
        "distance_km": race.distance_km,
        "elevation_gain_m": race.elevation_gain_m,
        "leaderboard": [],
        "non_finishers": 0,
    }

    if not result_path.exists():
        return entry

    results = result_records(result_path)
    finish_time_by_bib = {result.bib_number: result.finish_time_seconds for result in results if result.bib_number}
    entry["non_finishers"] = sum(1 for result in results if not result.is_finisher)

    for score in score_race(race, results):
        row = score.to_dict()
        seconds = finish_time_by_bib.get(row["bib_number"])
        row["finish_time"] = format_hms(seconds) if seconds is not None else None
        entry["leaderboard"].append(row)

    return entry


def build_sample_course() -> dict:
    points = read_track_points(SAMPLE_GPX)
    from course.measurement import measure_course
    from course.features import features_from_measurement
    measurement = measure_course(points)
    features = features_from_measurement(measurement)
    return {
        "name": "Sample illustrative course",
        "note": (
            "Synthetic profile for demonstrating the map/elevation-profile viewer. "
            "Not the real course of any listed race."
        ),
        "gpx_text": SAMPLE_GPX.read_text(encoding="utf-8"),
        "features": features.to_dict(),
        "measurement": measurement.to_dict(),
    }


def main() -> None:
    races = [build_race_entry(race) for race in race_records(RACES_FILE)]
    data = {
        "generated_by": "scripts/build_prototype_data.py",
        "races": races,
        "sample_course": build_sample_course(),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(races)} races to {OUTPUT_FILE.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
