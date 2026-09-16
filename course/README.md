# Course

GPX parsing and deterministic course-feature extraction — kept separate from `scoring/`, per `METHODOLOGY.md` §3: course difficulty and athlete performance are independent models that get combined later.

- `gpx.py` — dependency-free reader for `<trkpt>` points (lat/lon/elevation/time) from GPX 1.0/1.1 files. Uses only the Python standard library (`xml.etree.ElementTree`); no external GPX package.
- `features.py` — `extract_features()` turns an ordered list of track points into `CourseFeatures`: distance, elevation gain/loss, steep-climb/descent distance, max grade, min/max elevation.

## Known limitations (intentional, for now)

- **Elevation noise filtering is per-segment, not accumulating.** A change smaller than `ELEVATION_NOISE_THRESHOLD_M` (1 m) between two consecutive points is treated as GPS/barometric noise and ignored. This is simple and predictable, but can under-count a long, very gradual climb made of many sub-threshold steps. Revisit once real GPX data is available to tune this properly.
- **No gradient-distribution histogram yet** — only max grade and a single steep-grade threshold (15%).
- **No terrain/technicality signal** — GPX geometry alone cannot tell you about trail surface.
- **Not calibrated against real results yet.** `CourseFeatures` are geometry only; turning them into course *difficulty* (relative to athlete performance) is Phase 4+ work and requires real race data (`docs/gpx-predictor.md`).

## Usage

```python
from course import read_track_points, extract_features

points = read_track_points("path/to/course.gpx")
features = extract_features(points)
print(features.to_dict())
```
