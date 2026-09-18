"""Runs the real OTRI scoring pipeline over data/calibration/ to compare V0.1 vs V0.3
(duration-scaled) scores across common trail-race distances — both retired development
builds listed in docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md section 14. All courses/times here are synthetic/illustrative (data/calibration/README.md).

Run with: python scripts/calibration_report.py
"""

from __future__ import annotations

from pathlib import Path

from course.gpx import read_track_points
from ingestion.records import race_records, result_records
from scoring.course_demand import compute_course_demand
from scoring.course_standard import DURATION_SCALED_CURVE, OFFICIAL_CURVE, score_for_time

REPO_ROOT = Path(__file__).resolve().parents[1]
CAL_DIR = REPO_ROOT / "data" / "calibration"


def main() -> None:
    races = {race.race_id: race for race in race_records(CAL_DIR / "races.csv")}
    header = f"{'race':<14}{'distance_km':>12}{'demand_km':>11}{'runner':>10}{'time':>10}{'V0.1':>7}{'V0.3':>7}"
    print(header)
    print("-" * len(header))

    for race_id, race in races.items():
        gpx_path = CAL_DIR / "gpx" / f"{race_id}.gpx"
        points = read_track_points(gpx_path)
        demand = compute_course_demand(points)
        results = result_records(CAL_DIR / "results" / f"{race_id}.csv")

        labels = {results[0].rank: "winner", results[-1].rank: "last"}
        for result in results:
            label = labels.get(result.rank, "mid-pack")
            official = score_for_time(demand.course_demand_km, result.finish_time_seconds, curve=OFFICIAL_CURVE)
            scaled = score_for_time(demand.course_demand_km, result.finish_time_seconds, curve=DURATION_SCALED_CURVE)
            hours, remainder = divmod(result.finish_time_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            time_str = f"{hours}:{minutes:02}:{seconds:02}"
            print(
                f"{race_id:<14}{race.distance_km:>12.1f}{demand.course_demand_km:>11.1f}{label:>10}"
                f"{time_str:>10}{official['otri_score']:>7}{scaled['otri_score']:>7}"
            )


if __name__ == "__main__":
    main()
