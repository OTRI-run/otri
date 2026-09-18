# Course measurement v1: implementation and validation

Date: 2026-09-17. This records the implemented scope of the [research specification](REAL-WORLD-COURSE-MEASUREMENT-SPEC.md). These results validate software behavior, not surveyed ground accuracy.

## Supplied Phuket files

The diagnostic command was run on the exact file hashes recorded in the research specification, with no configured DEM. Results use WGS84 horizontal distance and cleaned uploaded elevations.

| Metric | 2025 legacy | 2025 v1 | 2026 legacy | 2026 v1 |
| --- | ---: | ---: | ---: | ---: |
| Distance (km) | 16.285 | 16.254 | 14.611 | 14.575 |
| Ascent (m) | 1178.0 | 881.2 | 628.4 | 617.6 |
| Descent (m) | 1182.0 | 881.2 | 628.4 | 617.5 |
| Maximum uphill grade (%) | 719.46 | 41.49 | 17.37 | 39.06 |
| Maximum downhill grade (%) | 404.69 | 58.27 | 20.32 | 37.16 |
| Scoring demand (km) | 21.347 | 20.991 | 17.481 | 17.364 |

Legacy grades average entire prominence runs; v1 grades measure the steepest full 50 m window. They are different quantities: the increased 2026 maximum does not mean the course became steeper. v1 scoring-demand ascent diagnostics equal the feature ascent rather than independently summing a second, differently sampled profile.

2025 is `needs_review` because of conflicting duplicate elevations, implausible local elevation changes and sustained grades beyond the scoring model's domain. It remains 43.2 m above the 838 m published comparison, so it does not demonstrate the proposed 5% accuracy target. The 2026 supplied GPX remains a different distance from the current published route and is `provisional`; its elevations have not been independently validated. Its small gain/loss difference follows the uploaded endpoint heights rather than forcing a loop to balance.

The change from spherical haversine to WGS84 explains the distance convention change; it does not recover missing route geometry. The original course polyline is retained rather than shortened by resampling chords.

## Implemented behavior

- Segment-aware GPX parsing, finite/range validation, upload and point limits, duplicate aggregation and explicit missing-elevation errors.
- Shared chainage/profile computation, prominence ascent/descent with endpoint accounting, 50 m grades and steep-distance bins.
- Optional checksum-pinned local raster provider, pixel-center bilinear interpolation, neighboring-tile sampling and nodata handling. No remote API dependency.
- Server profile consumed by the GPX tester and sample-course chart; automatic analysis on selection, stale-request protection, source/quality notices and disconnected map/profile segments.
- Additive measurement snapshot storage, public measurement endpoint and prevention of manual totals overriding an attached GPX's measurements.
- Separate V0.2 scoring version that reuses saved measurements; existing model versions remain unchanged. The new model reuses the prior score curve and has not been recalibrated with field data.
- Reproducible diagnostic command and local synthetic raster tests.

## Deliberate limits and changes from the proposal

Spatial smoothing is conditional on terrain input or measured GPX anomalies, rather than unconditional. Applying both spatial smoothing and 8 m prominence to the smooth 2026 upload removed too much of its small undulations (576.8 m ascent in the exploratory implementation). The selected policy preserves the interpolated profile for segments without those anomalies. Its criteria are recorded in `course/README.md`; they do not depend on race names or target totals. This remains an initial quality policy requiring validation on additional courses.

Large missing elevation spans and missing endpoints are rejected instead of returning partial ascent. There is no automatic multi-provider ranking, barometer fusion, field-survey ingestion, GPS-wander correction, snapping, uncertainty interval or surface-distance estimate. There is no separate isolated-spike deletion step: anomalous segments are smoothed and flagged for review. These limits remain explicit rather than inventing missing data or silently changing the route.

No live Phuket DEM was downloaded or enabled. The optional provider is tested against synthetic rasters, including zero elevations, nodata, seams and checksum changes. Production terrain correction requires installing tiles and setting `OTRI_DEM_MANIFEST` as described in [course setup](../../../course/README.md). Provider failures stop that measurement; they never become zero ascent or an unannounced fallback.

## Verification

- Full Python suite: 169 tests passed during implementation, including API/database integration and terrain tests.
- After final edge-case and snapshot-replay changes: 28 targeted measurement, terrain and API tests passed (including one additional duplicate-invariance test).
- Production frontend build passed; generated demo data includes the server measurement profile.
- Existing exact legacy course-feature fixtures remain tested through `extract_features_legacy`; legacy scoring tests retain their mathematical expectations. The legacy field-relative response fixture was updated to include the already-existing empty `quality_flags` field.

The supplied GPX files are not redistributed here. Reproduce with `python scripts/diagnose_course.py <2025-file> <2026-file> --output measurement.json`. The output includes hashes, legacy/new features and demand, source metadata, full corrected profiles and diagnostic flags. Field evidence and held-out routes are still required before asserting real-world accuracy.
