"""Reproduce course measurements: python scripts/diagnose_course.py route.gpx [...]."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from course.gpx import read_track_points
from course.features import extract_features_legacy, features_from_measurement, haversine_m
from course.measurement import measure_course
from course.elevation import configured_provider
from scoring.measured_demand import compute_measured_demand


def diagnose(path):
    points = read_track_points(path)
    m = measure_course(points, configured_provider())
    spacings = [haversine_m(a.lat,a.lon,b.lat,b.lon) for a,b in zip(points,points[1:]) if a.segment_id == b.segment_id]
    return dict(file=path.name, raw_sha256=sha256(path.read_bytes()).hexdigest(),
                point_count=len(points), median_raw_spacing_m=statistics.median(spacings),
                legacy_features=extract_features_legacy(points).to_dict(),
                features=features_from_measurement(m).to_dict(),
                demand=compute_measured_demand(measurement=m).to_dict(), measurement=m.to_dict())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', type=Path, nargs='+')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = json.dumps([diagnose(path) for path in args.files], indent=2, allow_nan=False)
    if args.output:
        args.output.write_text(result+'\n', encoding='utf-8')
    else:
        print(result)
