# Course

GPX parsing and deterministic course-feature extraction — kept separate from `scoring/`, per `METHODOLOGY.md` §3: course difficulty and athlete performance are independent models that get combined later.

- `gpx.py` — dependency-free reader for `<trkpt>` points (lat/lon/elevation/time) from GPX 1.0/1.1 files. Uses only the Python standard library (`xml.etree.ElementTree`); no external GPX package.
- `features.py` — `extract_features()` turns an ordered list of track points into `CourseFeatures`: distance, elevation gain/loss, steep-climb/descent distance, max climb/descent grade, min/max elevation.

## Known limitations (intentional, for now)

- **Elevation gain/loss uses a "prominence" state machine, not a real DEM.** It tracks the running extreme (peak while climbing, valley while descending) and only confirms a climb/descent once elevation reverses from that extreme by at least `ELEVATION_NOISE_THRESHOLD_M` (8 m — tuned against a real course file, see below). Every elevation reading eventually ends up in gain or loss — nothing is silently discarded — which guarantees `gain - loss` always equals the net elevation change end-to-end (important for out-and-back and loop courses, where that should be ~0). It still trusts the GPX file's own recorded elevation, though — it does not re-sample against a real digital elevation model (DEM), which is why totals can still differ noticeably from tools that do (see "Why elevation totals differ between tools" below).
- **`max_climb_grade` / `max_descent_grade` are run-averaged, not per-segment.** Each is the net elevation change of a confirmed climb/descent run (see above) divided by the distance covered during that run — a steepest-sustained-grade figure. A single noisy pair of points can no longer produce an implausible spike (e.g. 40%) the way a per-segment calculation could.
- **No gradient-distribution histogram yet** — only max climb/descent grade and a single steep-grade threshold (15%).
- **No terrain/technicality signal** — GPX geometry alone cannot tell you about trail surface.
- **Not calibrated against real results yet.** `CourseFeatures` are geometry only; turning them into course *difficulty* (relative to athlete performance) is Phase 4+ work and requires real race data (`docs/gpx-predictor.md`).

## Why elevation totals differ between tools

Feed the same GPX file into OTRI, Mapbox, Strava, and Garmin, and you'll likely get four different elevation gain/loss numbers. This is expected, not a bug in any one of them:

- Raw GPX elevation (from GPS or a barometric altimeter) is noisy by several meters even on a track that's smooth on the ground.
- Most consumer platforms discard the file's own elevation values and re-sample against a DEM (e.g. SRTM-derived terrain tiles) instead — a different data source entirely — then apply their own smoothing on top.
- OTRI currently trusts the GPX file's recorded elevation and only smooths noise via the prominence threshold above.

There's no single universally "correct" number here, only different reasonable methodologies. OTRI's approach is deliberately simple, deterministic, and fully described in this file rather than delegated to an opaque third-party algorithm (`METHODOLOGY.md` §3's transparency principle) — but that means it won't always match Mapbox/Strava exactly.

`ELEVATION_NOISE_THRESHOLD_M` was tuned against a real 14.6 km course file: at 1 m it produced ~780/782 m gain/loss, while Garmin, Coros, and Mapbox all agreed on ~626-640 m for the same course; 8 m landed within a few meters of that consensus (and, as a loop course, correctly produced gain == loss).


## Usage

```python
from course import read_track_points, extract_features

points = read_track_points("path/to/course.gpx")
features = extract_features(points)
print(features.to_dict())
```
