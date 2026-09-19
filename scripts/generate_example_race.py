"""Generate the example race on the Score my race page: a synthetic course and 100 made-up finishers.

    python scripts/generate_example_race.py

Writes `public/examples/otri-example-course.gpx` and `public/examples/otri-example-results.csv`.
The race is invented and deterministic (fixed seed). The course is a drawn loop, not a marked trail,
laid over real ground: the forested hills west of Hang Dong, south-west of Chiang Mai, a place
people do run trails. Its elevations are read from the Copernicus GLO-30 terrain tile for that
ground (fetched into `data/cache/example-dem/` on first run, which needs the network and
`course/requirements-terrain.txt`). That matters: OTRI fetches terrain tiles on demand, so a
server measures this course from the real terrain, and a course with invented hills on flat
ground would measure flat there. With the file's elevations taken from the same terrain, it measures
the same with and without terrain data, to within a percent.

The runners carry placeholder names (John Doe, Max Mustermann and their counterparts elsewhere).
Finish times are derived from the scoring model itself, from a spread of scores with the winner
well short of 1000, so the example shows a believable field rather than a record.
"""

from __future__ import annotations

import csv
import math
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from course import dem_fetch, parse_track_points  # noqa: E402
from course.elevation import RasterProvider  # noqa: E402
from course.measurement import measure_course  # noqa: E402
from scoring.course_standard import MODEL_CURVE, adjusted_demand, target_time_seconds  # noqa: E402
from scoring.measured_demand import compute_measured_demand  # noqa: E402

OUT = ROOT / "public" / "examples"
SEED = 20260919
# Hills west of Hang Dong, Chiang Mai: of the loops tried across this tile, one of the few with a
# trail-like climb (about +930 m, 14 % of it steep). A drawn loop straight over Doi Suthep itself
# comes out at +2,800 m with half its distance steeper than 20 %: real trails follow the contours.
CENTRE_LAT, CENTRE_LON = 18.72, 98.89
DEM_CACHE = ROOT / "data" / "cache" / "example-dem" / "manifest.json"
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


def terrain() -> RasterProvider:
    """The terrain tile under the course, fetched once into the cache."""
    os.environ["OTRI_DEM_AUTOFETCH"] = "1"
    os.environ["OTRI_DEM_MANIFEST"] = str(DEM_CACHE)
    from course.gpx import TrackPoint

    outcome = dem_fetch.ensure_tiles([TrackPoint(CENTRE_LAT, CENTRE_LON, None, None)])
    if outcome["skipped"] or not DEM_CACHE.exists():
        raise SystemExit(f"could not get the terrain tile: {outcome}")
    return RasterProvider(DEM_CACHE)


def course_gpx(provider: RasterProvider) -> str:
    """A closed loop of about 24 km, a point every 16 m or so, with the ground's real elevations."""
    track = []
    for i in range(POINTS + 1):
        angle = 2 * math.pi * i / POINTS
        # a wobbly loop, about 6.5 km across
        radius = 0.0300 * (1 + 0.22 * math.sin(3 * angle) + 0.10 * math.cos(5 * angle))
        track.append((CENTRE_LAT + radius * math.sin(angle), CENTRE_LON + radius * 1.05 * math.cos(angle)))
    points = [(lat, lon, elevation) for (lat, lon), elevation in zip(track, provider.sample(track))]
    body = "\n".join(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}"><ele>{ele:.1f}</ele></trkpt>' for lat, lon, ele in points)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="OTRI example generator" xmlns="http://www.topografix.com/GPX/1/1">\n'
        "  <metadata><name>OTRI Example Trail 24K (synthetic)</name><desc>An invented loop over real ground in the hills west of Hang Dong, Chiang Mai. Not a marked trail or a real race. Elevations: Copernicus DEM GLO-30.</desc></metadata>\n"
        "  <trk>\n    <name>OTRI Example Trail 24K (synthetic)</name>\n    <trkseg>\n"
        f"{body}\n    </trkseg>\n  </trk>\n</gpx>\n"
    )


def hms(seconds: float) -> str:
    seconds = int(round(seconds))
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def main() -> None:
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    provider = terrain()
    gpx = course_gpx(provider)
    (OUT / "otri-example-course.gpx").write_text(gpx, encoding="utf-8", newline="\n")

    # Times come from the course as a server with terrain data measures it; without terrain data
    # (the tests, a fresh checkout) the file's own elevations give almost the same course.
    demand = compute_measured_demand(measurement=measure_course(parse_track_points(gpx), provider))
    from_file = compute_measured_demand(measurement=measure_course(parse_track_points(gpx), None))
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
    print(f"from the file alone: {from_file.physical_distance_km} km, +{from_file.elevation_gain_m} m, scored on {adjusted_demand(from_file, MODEL_CURVE)[0]:.2f} demand-km")
    print(f"results: {len(times)} finishers, {hms(times[0])} to {hms(times[-1])}, plus 4 DNF and 2 DNS")


if __name__ == "__main__":
    main()
