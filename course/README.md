# Course measurement

`measure_course()` in `measurement.py` is the shared physical-course pipeline for new GPX statistics, API profiles and Course Standard V0.2 scoring. `extract_features()` delegates to it. The original `extract_features_legacy()` and V0.1 scoring integral remain available for reproducibility.

## Current method: course-measurement-v1

- Parse one track, preserving segment boundaries. Reject malformed/nonfinite coordinates and elevations, DTDs, excessive uploads and incomplete elevation coverage.
- Aggregate consecutive duplicate locations using median elevation. Never connect separate segments or remove nonconsecutive revisits.
- Measure horizontal distance using GeographicLib 2.1 on WGS84. Keep original polyline chainage when interpolating a 10 m elevation grid, so sampling does not cut corners.
- Use uploaded elevations by default, explicitly marked as unknown provenance. A configured, checksum-pinned local terrain provider replaces those elevations and records its manifest. There are no hidden remote lookups.
- Spatial median/mean smoothing uses 10 m radii on the uniform grid for terrain data or anomalous GPX segments. GPX anomalies are conflicting duplicate elevations or an adjacent height change greater than both 8 m and horizontal distance. Already smooth profiles retain their interpolated elevations, avoiding two successive noise filters that remove real undulations. This quality rule never reads filenames, creator names or reference race totals.
- Count ascent/descent using an 8 m prominence reversal threshold, retaining the final extreme and actual endpoint. Gain minus loss equals the sum of segment endpoint changes. Tiny residual endpoint reversals are intentionally included.
- Measure maximum sustained grades over full 50 m windows. Tracks shorter than that return null. Steep-distance bins use 15% grade and retain the final shorter bin. Grades outside the scoring model's range remain physical diagnostics; only scoring contributions are clamped.

All measurements are estimates. `provisional` indicates unvalidated source accuracy; `needs_review` identifies local anomalies, unsupported sustained grades or disconnected segments. Incomplete elevation coverage is rejected with an actionable error rather than reported as a flat course. Short missing intervals (at most 30 m between known heights) are interpolated by distance; missing endpoints are not extrapolated.

The default geometry is the supplied route: there is no road snapping, GPS-wander reconstruction or surface-distance inflation. Sparse geometry is flagged. It cannot recover missing switchbacks. Thresholds and source selection have not been independently field-calibrated.

## Optional terrain correction

Install core dependencies with `python -m pip install -r api/requirements.txt`. To use local DEMs, also install `python -m pip install -r course/requirements-terrain.txt`.

Set `OTRI_DEM_MANIFEST` to an absolute JSON manifest path. The provider supports north-up, single-resolution EPSG:4326 GeoTIFF tiles, pixel-center bilinear interpolation including adjacent tiles, and nodata masks. It verifies SHA-256 before reading. Bad coverage, configuration or checksums produce an error, never a silent GPX fallback. Install a halo of neighboring tiles around the route so interpolation near tile edges has coverage. Tiles named the Copernicus way (`Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif`) are verified and opened the first time a course needs them, and may differ in pixel width (GLO-30 narrows above 50° latitude); rows must share one height.

### Tiles on demand

With `OTRI_DEM_AUTOFETCH=1` (and `OTRI_DEM_MANIFEST` set; the file need not exist yet), `course/dem_fetch.py` downloads the Copernicus GLO-30 tiles under a course the first time one is measured there, from `https://copernicus-dem-30m.s3.amazonaws.com`, checks and checksums them and adds them to the manifest with a `fetched_at` time. Only the tile is requested; nothing about the course is sent. Fetched tiles are kept within `OTRI_DEM_BUDGET_MB` (default 8192) by deleting the ones unused for longest; entries without `fetched_at` (installed by hand or by `scripts/deploy/06-install-dem.sh`) are never deleted. At most 6 tiles per course, at most 3 downloads at once across all workers (a request that finds them taken measures without, it does not queue), 60 s per tile and 90 s per course, and the manifest lock is held only while the manifest is rewritten. Who may cause a fetch is the API's decision (`_tile_allowance` in `api/app.py`): 6 new tiles a day per visitor address, 40 per account, `OTRI_DEM_FETCH_PER_HOUR` (default 30) for everyone together, no limit for admins. Cells with no tile (sea) are remembered for 30 days under `absent`, and a failed fetch never fails the course: it is measured from its own elevations at Low confidence, as without terrain data. The folder of the manifest must be writable by the API.

Example manifest structure (replace the placeholder values with the actual release and file hash):

```json
{
  "dataset": "Copernicus GLO-30",
  "release": "REPLACE_WITH_ACTUAL_RELEASE",
  "datum": "EGM2008",
  "resolution_m": 30,
  "tiles": [
    {"path": "tiles/course-tile.tif", "sha256": "REPLACE_WITH_ACTUAL_SHA256"}
  ]
}
```

Tile paths resolve relative to the manifest. Keep manifests and tiles immutable and record their licenses. Copernicus is a surface model; forest canopy can bias terrain estimates. Licensed FABDEM or locally surveyed bare-earth data can be supplied through the same adapter. Merely configuring a dataset does not establish local accuracy. No Phuket DEM or ground survey is bundled or enabled by this change.

## API and reproducibility

`POST /gpx/analyze` returns features and a `measurement` containing the cleaned profile, method/parameters, source, hashes and quality status. The browser renders this server profile. `POST /races/{id}/gpx` stores the raw GPX, feature totals and measurement snapshot atomically. `GET /races/{id}/measurement` returns public provenance and profile. Measured race totals cannot be overwritten using PATCH; replace the GPX explicitly.

New races and the predictor use `0.2.0-course-standard-measured`. Existing races retain their stored scoring version. V0.2 reads the persisted snapshot when scoring stored results, independent of future provider configuration. Existing GPX races without a snapshot must reattach their GPX before selecting V0.2. Changing an existing race's GPX remains an explicit course replacement and can change its scores; no bulk migration runs automatically.

## Diagnostics

```sh
python scripts/diagnose_course.py route.gpx --output measurement.json
python -m pytest tests/unit/test_course_measurement.py tests/unit/test_elevation_provider.py
```

The diagnostic output includes raw-file identity, legacy/new features and demand, cleaned profile, provider metadata and flags. Terrain tests use tiny synthetic rasters, not live services. See [research and implementation specification](../docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md) and [implementation validation](../docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md#appendix-course-measurement-v1-implementation-and-validation).
