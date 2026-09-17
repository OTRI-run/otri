"""Generates synthetic multi-distance trail-race GPX fixtures for scoring-model calibration
validation (see data/calibration/README.md). All courses/times are fictional and illustrative
— no real race, organizer, or athlete data is used (see DATA_POLICY.md's restrictions on
scraping/redistributing proprietary results or calculated scores).

Run with: python scripts/generate_calibration_fixtures.py
"""

from __future__ import annotations

import math
from pathlib import Path

EARTH_RADIUS_M = 6_371_000.0
REPO_ROOT = Path(__file__).resolve().parents[1]
GPX_DIR = REPO_ROOT / "data" / "calibration" / "gpx"

# (race_id, distance_km, elevation_gain_m) — common trail-race distances, generic/illustrative
# elevation-gain-per-km ratios (not derived from any specific real course).
COURSES = [
    ("CAL-10K", 10.0, 450.0),
    ("CAL-HALF", 21.1, 1000.0),
    ("CAL-MARATHON", 42.2, 2200.0),
    ("CAL-50K", 50.0, 3000.0),
    ("CAL-50MI", 80.5, 4500.0),
    ("CAL-100K", 100.0, 5800.0),
    ("CAL-100MI", 161.0, 9000.0),
]


def _move(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    bearing = math.radians(bearing_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    d_by_r = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(math.sin(lat1) * math.cos(d_by_r) + math.cos(lat1) * math.sin(d_by_r) * math.cos(bearing))
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(d_by_r) * math.cos(lat1),
        math.cos(d_by_r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def _elevation_profile(total_m: float, elevation_gain_m: float, step_m: float) -> list[float]:
    """A repeating triangular climb/descent pattern (net-zero loop course) whose total ascent
    (and descent) equals `elevation_gain_m` exactly, roughly one climb per 6 km for realism."""
    n_points = int(total_m // step_m) + 1
    num_climbs = max(2, round(total_m / 6000.0))
    climb_height = elevation_gain_m / num_climbs
    base_elevation = 800.0

    elevations = []
    for i in range(n_points):
        distance = i * step_m
        segment_length = total_m / num_climbs
        position_in_segment = (distance % segment_length) / segment_length
        # triangular wave: up for first half of the segment, down for the second half
        if position_in_segment < 0.5:
            offset = climb_height * (position_in_segment / 0.5)
        else:
            offset = climb_height * (1 - (position_in_segment - 0.5) / 0.5)
        elevations.append(round(base_elevation + offset, 1))
    return elevations


def _generate_gpx(race_id: str, distance_km: float, elevation_gain_m: float, step_m: float = 200.0) -> str:
    total_m = distance_km * 1000.0
    n_points = int(total_m // step_m) + 1
    elevations = _elevation_profile(total_m, elevation_gain_m, step_m)

    lat, lon = 45.9, 6.9  # arbitrary start point, not tied to any real place
    bearing = 0.0
    points = [(lat, lon, elevations[0])]
    for i in range(1, n_points):
        bearing = (bearing + 22.5 * math.sin(i / 11.0)) % 360.0
        lat, lon = _move(lat, lon, bearing, step_m)
        points.append((lat, lon, elevations[i]))

    trkpts = "\n".join(f'<trkpt lat="{lat:.6f}" lon="{lon:.6f}"><ele>{ele}</ele></trkpt>' for lat, lon, ele in points)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="OTRI calibration fixture generator" '
        'xmlns="http://www.topografix.com/GPX/1/1">\n'
        f"<trk><name>{race_id} (synthetic calibration fixture, not a real course)</name><trkseg>\n"
        f"{trkpts}\n"
        "</trkseg></trk>\n"
        "</gpx>\n"
    )


def main() -> None:
    GPX_DIR.mkdir(parents=True, exist_ok=True)
    for race_id, distance_km, elevation_gain_m in COURSES:
        content = _generate_gpx(race_id, distance_km, elevation_gain_m)
        path = GPX_DIR / f"{race_id}.gpx"
        path.write_text(content, encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_ROOT)} ({distance_km} km, +{elevation_gain_m} m)")


if __name__ == "__main__":
    main()
