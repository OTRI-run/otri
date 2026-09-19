"""Generate the example race on the Score my race page: a synthetic course and 100 made-up finishers.

    python scripts/generate_example_race.py

Writes `public/examples/otri-example-course.gpx` and `public/examples/otri-example-results.csv`.
Everything is invented and deterministic (fixed seed): the course is a drawn loop with drawn hills,
placed where no terrain data is installed so it always measures from its own elevations, and the
runners carry placeholder names (John Doe, Max Mustermann and their counterparts elsewhere). Finish
times are derived from the scoring model itself, from a spread of scores with the winner well short
of 1000, so the example shows a believable field rather than a record.
"""

from __future__ import annotations

import csv
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from course import parse_track_points  # noqa: E402
from course.measurement import measure_course  # noqa: E402
from scoring.course_standard import MODEL_CURVE, adjusted_demand, target_time_seconds  # noqa: E402
from scoring.measured_demand import compute_measured_demand  # noqa: E402

OUT = ROOT / "public" / "examples"
SEED = 20260919
CENTRE_LAT, CENTRE_LON = 13.62, 100.48  # no terrain tiles here: the file's own elevations are used
POINTS = 1500
WINNER_SCORE, LAST_SCORE = 792, 236

# Placeholder people, as each country writes "John Doe": (first name, family name, gender, nationality).
PLACEHOLDERS = [
    ("John", "Doe", "M", "USA"), ("Jane", "Doe", "F", "USA"), ("Max", "Mustermann", "M", "DEU"), ("Erika", "Mustermann", "F", "DEU"),
    ("Joe", "Bloggs", "M", "GBR"), ("Jane", "Bloggs", "F", "GBR"), ("Jean", "Dupont", "M", "FRA"), ("Marie", "Dupont", "F", "FRA"),
    ("Mario", "Rossi", "M", "ITA"), ("Maria", "Rossi", "F", "ITA"), ("Juan", "Perez", "M", "ESP"), ("Maria", "Garcia", "F", "ESP"),
    ("Jan", "Kowalski", "M", "POL"), ("Anna", "Kowalska", "F", "POL"), ("Jan", "Novak", "M", "CZE"), ("Jana", "Novakova", "F", "CZE"),
    ("Ola", "Nordmann", "M", "NOR"), ("Kari", "Nordmann", "F", "NOR"), ("Sven", "Svensson", "M", "SWE"), ("Anna", "Svensson", "F", "SWE"),
    ("Matti", "Meikalainen", "M", "FIN"), ("Maija", "Meikalainen", "F", "FIN"), ("Jan", "Jansen", "M", "NLD"), ("Jan", "Modaal", "M", "NLD"),
    ("Hans", "Muster", "M", "CHE"), ("Petra", "Muster", "F", "CHE"), ("Joao", "Silva", "M", "PRT"), ("Maria", "Silva", "F", "BRA"),
    ("Fulano", "de Tal", "M", "MEX"), ("Juan", "dela Cruz", "M", "PHL"), ("Maria", "dela Cruz", "F", "PHL"), ("Somchai", "Jaidee", "M", "THA"),
    ("Somsri", "Jaidee", "F", "THA"), ("Taro", "Yamada", "M", "JPN"), ("Hanako", "Yamada", "F", "JPN"), ("Gildong", "Hong", "M", "KOR"),
    ("San", "Zhang", "M", "CHN"), ("Si", "Li", "F", "CHN"), ("Ashok", "Kumar", "M", "IND"), ("Priya", "Sharma", "F", "IND"),
    ("Ivan", "Ivanov", "M", "BGR"), ("Ivana", "Ivanova", "F", "BGR"), ("Janez", "Novak", "M", "SVN"), ("Ion", "Popescu", "M", "ROU"),
    ("Jonas", "Petraitis", "M", "LTU"), ("Janis", "Berzins", "M", "LVA"), ("Joe", "Bloggs", "M", "AUS"), ("Fred", "Nerk", "M", "AUS"),
    ("Joe", "Blow", "M", "NZL"), ("Sipho", "Nkosi", "M", "ZAF"),
]
# The same people's clubmates, so a hundred names stay recognisably made up.
EXTRA_FIRST = {"M": ["Alex", "Sam", "Chris", "Robin", "Kim", "Pat", "Lee", "Toni", "Nico", "Jo"], "F": ["Alexa", "Sam", "Chris", "Robin", "Kim", "Pat", "Lea", "Toni", "Nika", "Jo"]}
CLUBS = ["Trail Club", "Mountain Crew", "Hill Harriers", "Ridge Runners", "", "", ""]


def course_gpx() -> str:
    """A closed loop of about 24 km with three hills, a point every 16 m or so."""
    points = []
    for i in range(POINTS + 1):
        t = i / POINTS
        angle = 2 * math.pi * t
        # a wobbly loop, about 3.3 km across
        radius = 0.0300 * (1 + 0.22 * math.sin(3 * angle) + 0.10 * math.cos(5 * angle))
        lat = CENTRE_LAT + radius * math.sin(angle)
        lon = CENTRE_LON + radius * 1.05 * math.cos(angle)
        # three climbs of different size; starts and ends at the same height
        elevation = 120 + 210 * math.sin(math.pi * t) ** 2 + 150 * math.sin(3 * math.pi * t) ** 2 + 60 * math.sin(7 * math.pi * t) ** 2
        points.append((lat, lon, elevation))
    body = "\n".join(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}"><ele>{ele:.1f}</ele></trkpt>' for lat, lon, ele in points)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="OTRI example generator" xmlns="http://www.topografix.com/GPX/1/1">\n'
        "  <metadata><name>OTRI Example Trail 24K (synthetic)</name></metadata>\n"
        "  <trk>\n    <name>OTRI Example Trail 24K (synthetic)</name>\n    <trkseg>\n"
        f"{body}\n    </trkseg>\n  </trk>\n</gpx>\n"
    )


def hms(seconds: float) -> str:
    seconds = int(round(seconds))
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def main() -> None:
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    gpx = course_gpx()
    (OUT / "otri-example-course.gpx").write_text(gpx, encoding="utf-8", newline="\n")

    demand = compute_measured_demand(measurement=measure_course(parse_track_points(gpx), None))
    scored_km, _flags = adjusted_demand(demand, MODEL_CURVE)

    people = list(PLACEHOLDERS)
    while len(people) < 106:
        first, family, gender, nationality = rng.choice(PLACEHOLDERS)
        candidate = (rng.choice(EXTRA_FIRST[gender]), family, gender, nationality)
        if candidate not in people:
            people.append(candidate)
    rng.shuffle(people)

    # A field, not a podium: most finishers in the middle, a few quick, a long tail.
    draws = sorted(rng.betavariate(1.7, 2.2) for _ in range(100))
    low, high = draws[0], draws[-1]
    scores = [LAST_SCORE + (WINNER_SCORE - LAST_SCORE) * (draw - low) / (high - low) for draw in draws]
    times = sorted(target_time_seconds(scored_km, score) for score in scores)

    rows = []
    for index, seconds in enumerate(times):
        first, family, gender, nationality = people[index]
        born = rng.randint(1984, 2001) if index < 12 else rng.randint(1962, 2004)
        rows.append([index + 1, hms(seconds), family, first, gender, "Finisher", 100 + index * 3 + rng.randint(0, 2), nationality, born, rng.choice(CLUBS)])
    for offset, status in enumerate(["DNF", "DNF", "DNF", "DNF", "DNS", "DNS"]):
        first, family, gender, nationality = people[100 + offset]
        rows.append([status if status == "DNF" else "", "", family, first, gender, status, 500 + offset, nationality, rng.randint(1962, 2004), ""])

    with (OUT / "otri-example-results.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["Rank", "Time", "Last name", "First name", "Gender", "Status", "Bib", "Nationality", "Birth year", "Team"])
        writer.writerows(rows)

    print(f"course: {demand.physical_distance_km} km, +{demand.elevation_gain_m} m, scored on {scored_km:.2f} demand-km, steep share {demand.steep_distance_fraction:.2%}")
    print(f"results: {len(times)} finishers, {hms(times[0])} to {hms(times[-1])}, plus 4 DNF and 2 DNS")


if __name__ == "__main__":
    main()
