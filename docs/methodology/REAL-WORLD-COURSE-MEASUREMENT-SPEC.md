# Real-world course distance and elevation: research and implementation specification

Research date: 2026-09-17. Status: research specification. The implemented v1 scope and deviations are recorded in [implementation validation](COURSE-MEASUREMENT-V1-VALIDATION.md); field-validation targets below remain targets. Audience: the AI or developer implementing course measurement.

## Decision

Build one versioned, server-side course-measurement pipeline. Preserve the uploaded geometry and elevations, diagnose their quality, compare elevation sources, and publish a cleaned profile with provenance. Use that profile consistently for course statistics, charts and the next scoring version.

For Phuket, benchmark Copernicus GLO-30 against a licensed bare-earth product such as FABDEM and independently recorded, calibrated barometric traversals. Prefer a verified local ground survey or high-resolution bare-earth DTM where available. Do not claim any consumer app, DEM, or organizer total is ground truth without a same-route validation. No Phuket survey or locally validated DEM was obtained in this research.

The immediate problem is demonstrable GPX noise and inconsistent processing. Changing a threshold until 2025 reads exactly 838 m would hide the problem and risk damaging 2026. Distance and ascent require separate quality controls.

## Evidence from the supplied files

The following results were computed locally with the existing Python code. Both screenshot outputs were reproduced. Raw ascent means summing every positive consecutive elevation difference without filtering.

| Measurement | 2025 supplied GPX | 2026 supplied GPX |
| --- | ---: | ---: |
| Creator metadata | Trace de Trail | ultraPacer |
| Track points | 2,590 | 761 |
| Points with timestamps | 2,590 | 0 |
| Median horizontal spacing | 4.96 m | 14.68 m |
| Maximum spacing | 57.26 m | 126.78 m |
| Consecutive intervals below 1 m | 30 | 0 |
| Raw ascent | 1,856.0 m | 797.36 m |
| Current `extract_features` distance | 16.285 km | 14.611 km |
| Current displayed ascent / descent | 1,178.0 / 1,182.0 m | 628.4 / 628.4 m |
| Current displayed maximum uphill / downhill grade | 719.46% / 404.69% | 17.37% / 20.32% |
| Current scoring pipeline ascent / descent | 963.7 / 963.7 m | 681.0 / 680.8 m |
| Current minimum / maximum uploaded elevation | 23 / 494 m | 20.7 / 343.2 m |

2025 includes identical coordinates with different elevations and approximately 11 m elevation changes over 1.11 m horizontally. This is strong evidence of unsuitable local measurements; it does not establish which replacement elevation is correct. Creator names and timestamps do not prove the original sensor or measurement method.

The [2025 Trace de Trail course](https://tracedetrail.fr/en/trace/290076) reports 16.36 km and 838 m ascent/descent, matching the supplied reference screenshot. OTRI's displayed ascent is 340 m, or 40.6%, higher; its distance is only 75 m, or about 0.46%, shorter. This is primarily an elevation problem, not a 40% distance error. The reference profile also has different min/max elevations, so the export and the website's displayed processing cannot be assumed identical.

The [current 2026 Trace de Trail course](https://tracedetrail.fr/fr/trace/341613) reports **15.01 km and 609 m** ascent/descent, with min/max 20/344 m. That differs from the supplied ultraPacer file's 14.611 km. Establish whether this is a route revision, export simplification, or measurement convention before using it as a numerical validation target. The user's assessment that 628.4 m is close is useful context, not a surveyed label. Never calibrate one year's route against the other year's total.

Input identities, SHA-256:

```text
phuket-trail-2025-2025-pkt15.gpx
b70bfcf849182baf35f34e61b2efce65d8613ee2c2335dff924201325ad118f9
PHUKET_TRAIL_2026_PKT15.gpx
fe63bca479d83290a3eb2d20137ec255961e0b8586ef84b2e41bf6b0279713a4
```

Files were read from the user's Downloads directory; they have not been redistributed with this document. Use these hashes to identify fixtures and preserve their provenance when adding them to tests.

An exploratory change to the existing scoring smoother's radius from 10 to 20 to 30 m produced 2025 ascent of 963.7, 918.5 and 892.2 m; 2026 produced 681.0, 668.7 and 638.5 m. These are sensitivity experiments, not corrections or selected parameters. They show that smoothing alone changes the answer materially and does not prove accuracy. No DEM elevations were sampled in this investigation.

## Who gets closest, and why?

| Candidate | Appropriate use | Limitation / decision |
| --- | --- | --- |
| Surveyed trail geometry and ground elevations | Best reference for a known course when its uncertainty and route coverage are documented | Availability, canopy obstruction and measurement effort; verify quality rather than trusting a survey label |
| High-resolution bare-earth LiDAR DTM | Preferred terrain reference after local validation | Must cover the actual trail; bridge decks, steps and recently changed terrain need separate handling |
| Calibrated barometric recordings, repeated independently | Strong practical check on relative ascent | Pressure drift, blocked sensor ports and route deviations; align profiles and examine drift before combining |
| FABDEM | Promising global bare-earth candidate for forested Phuket | Approximately 30 m; inferred ground surface; licensing and local validation required |
| Copernicus GLO-30 | Practical global baseline to benchmark and version | Surface model includes vegetation/buildings; cannot resolve every trail feature |
| NASADEM / SRTM | Alternative comparison or explicit fallback | Do not assume older or coarser data is equivalent; compare local errors |
| Strava, Garmin, COROS, Trace de Trail, ultraPacer | External sanity checks on the same input | Different data, smoothing and exports; agreement can reflect shared source data |
| Mapbox terrain | Convenient rendering and comparison source | Encoding precision and screen detail do not establish ground accuracy |

Strava documents source-dependent smoothing and currently describes thresholds above 10 m without strong barometric data and above 2 m with barometric data. It also describes pressure drift and terrain-basemap limitations. These support quality-dependent processing, but do not disclose enough to clone its algorithm or prove it best in Phuket. See [Strava elevation FAQ](https://support.strava.com/en-us/articles/15402093-elevation-on-strava-faqs) and [elevation methodology](https://support.strava.com/en-us/articles/15401909-elevation).

Copernicus explicitly calls its product a **digital surface model**, including trees and infrastructure. Sampling it every 5 or 10 m does not create new terrain detail. See [Copernicus product description](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

A comparative study found FABDEM strongest overall in its evaluated environments, with important land-cover and slope dependencies. That is evidence for benchmarking it, not proof that its accumulated ascent is correct on this route. Point-height accuracy and total-ascent accuracy are different tests. See [Hawker et al., vertical accuracy comparison](https://doi.org/10.1080/17538947.2024.2308734). Bristol describes FABDEM as removing forest/building bias and identifies noncommercial share-alike licensing; check the exact release's license and commercial terms before production use: [dataset description](https://data.bris.ac.uk/data/dataset/25wfy0f9ukoge2gs7a5mqpq2j7), [V1-2 release files and license](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/).

Mapbox documents mixed elevation sources/datums and 0.1 m encoding increments. The latter is storage precision, not 0.1 m terrain accuracy. Do not compute authoritative ascent from whatever terrain happens to be loaded at the map's current zoom. See [Terrain-RGB documentation](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/).

### Reddit findings: experience, not validation

The [same GPX in different hiking apps discussion](https://www.reddit.com/r/hiking/comments/1sftae1/same_gpx_file_3_different_elevation_gains_which/) contains conflicting platform preferences and examples of both agreement and disagreement. The [Strava versus Garmin discussion](https://www.reddit.com/r/Strava/comments/1ifrx53/) likewise reports different totals after importing routes. These are useful leads for comparison tests; they contain no controlled Phuket ground survey and cannot rank providers reliably. Do not implement advice to spoof device metadata to suppress a platform's corrections.

## Problems in this repository to address

1. `course/gpx.py` flattens all track segments into one list. Segment boundaries, missing elevations and provenance need explicit representation.
2. `course/features.py` trusts uploaded elevations with an 8 m prominence filter. A short noisy run can still produce an enormous grade. Steep-distance classification uses per-edge elevation thresholds, making it dependent on point spacing.
3. `scoring/course_demand.py` separately removes duplicates, smooths and integrates 50 m intervals. It produces different ascent totals from the UI. Its distance-window mean still weights points equally, so dense samples can dominate before resampling.
4. `src/lib/gpx.js` builds the chart from raw elevations and independently computed distances. The visible profile need not represent the data used for scoring.
5. `api/app.py` uses `extract_features` for GPX attachment and analysis; `api/db.py` persists totals without a complete measurement provenance record.
6. `course/README.md` claims a gain-minus-loss endpoint identity that the current final-extreme handling does not guarantee for an unfinished reversal. A profile `[0, 10, 5]` with an 8 m reversal threshold is an explicit regression case: final endpoints must be handled deliberately. The README's blanket statement about consumer platforms replacing elevations is also too broad given Strava's documented barometric handling.

Do not silently change the frozen v0.1 scoring specification's haversine convention or previously published scores. Introduce a measurement version and explicitly associate it with a new scoring version when scoring consumes it.

## Implementation contract

### 1. Parse and preserve

Add a `CourseTrack` structure with tracks, segments, original indices, coordinates, optional elevations/times and source metadata. Validate finite coordinates and legal ranges. Reject malformed numeric fields with actionable errors. Treat missing elevation as missing, never zero. Define file-size and point-count limits.

Keep the original file immutable. Hash its bytes. Preserve track-segment boundaries; never invent distance or ascent between disconnected segments. Multiple tracks require explicit selection or an unambiguous documented composition. Unsupported route-only files should produce a clear error until route-point support exists.

Collapse consecutive identical coordinates within each segment into one measurement location; use the median of finite elevations in that group and retain original indices plus a conflicting-elevations flag. Do not remove nonconsecutive returns to the same location: those may be switchbacks or laps.

### 2. Measure horizontal distance independently

For the new version, sum WGS84 ellipsoidal edge lengths on validated geometry using `Geodesic.WGS84.Inverse(...)["s12"]`. Pin the library version; see [GeographicLib examples](https://geographiclib.sourceforge.io/html/python/examples.html?highlight=inverse). Preserve legacy haversine results for comparisons.

Do not calculate distance by adding straight chords between widely spaced resampled points: that cuts corners. Preserve the original cumulative chainage while resampling elevations. Do not automatically snap jungle trails to roads, simplify switchbacks or apply a constant distance multiplier. Flag implausible jumps and GPS wandering for review; use timestamps only if their provenance makes speed checks meaningful. Long intervals imply unresolved geometry, not permission to invent it.

Publish `horizontal_distance_m` as the main distance convention. Optionally compute `surface_distance_m = sum(hypot(ds, dz))` from the cleaned profile at a declared resolution, clearly labeled as an estimate. Never use raw noisy elevation to inflate 3D distance. Neither definition recovers missing corners or every rock/step; compare external distance only after identifying its convention.

### 3. Select an elevation source explicitly

Implement providers returning elevation, dataset ID/release, resolution, vertical datum, coverage and nodata per sample. Recommended first adapter: pinned local Copernicus tiles, with an optional licensed FABDEM adapter. A self-hosted lookup service is acceptable: [Open Topo Data](https://www.opentopodata.org/api/) documents bilinear interpolation and nodata handling. An API is a transport layer, not an accuracy guarantee.

Use bilinear raster interpolation with correct pixel-center coordinates and adjacent tiles at seams. Store checksums of all contributing tiles. Preserve nodata masks; do not interpret nodata as sea level. Do not silently mix datasets in a route: record fallback intervals and datum transitions. Keep source elevations separately from corrected elevations.

Default unknown GPX provenance to `unknown`, even for familiar creator names. Compute uploaded-elevation and terrain candidates independently. Select by documented coverage/quality rules validated on benchmarks, not whichever candidate happens to match an organizer's total. A high-quality calibrated barometric profile may outrank a coarse DEM. Large disagreement should trigger review rather than blind replacement or averaging.

Do not assume ellipsoidal heights and geoid-referenced heights are interchangeable. Store known datum and transformations. A constant height offset does not change ascent; varying offsets and source seams can. Bridges/tunnels require route-specific exceptions or uncertainty flags.

### 4. Normalize sampling, then filter

Proposed experimental starting configuration, **not validated production constants**:

```text
measurement_version = course-measurement-v1-experimental
profile_spacing_m = 10
median_radius_m = 10
mean_radius_m = 10
gain_reversal_m = 8
grade_window_m = 50
max_interpolated_elevation_gap_m = 30
```

Within each contiguous valid segment, form chainages 0, 10, 20, ... and the exact endpoint. Interpolate coordinates along original edges for DEM lookup, and interpolate uploaded elevations by chainage only across allowed short gaps. Leave larger gaps incomplete. Do not extrapolate missing endpoints. Do not bridge a missing interval just because valid elevations exist on both sides.

Identify isolated spikes with a local robust residual test plus evidence of a rapid return to neighboring elevations; flag uncertain real pitches instead of deleting them. Then apply the centered median and centered mean on the uniform grid, with clipped windows at boundaries and no padding across gaps. Define and test treatment of the shorter final interval. Record the profile before and after every transformation.

Compare spacing 5/10/20 m, smoothing radii 10/20/30 m and reversal thresholds 3/5/8/10 m offline. Select one documented configuration per validated source-quality class using held-out routes. Do not expose race-specific smoothing knobs that alter scoring. Dense sampling of a 30 m DEM remains correlated interpolation.

### 5. Gain, loss and grade

Implement prominence simplification as a separately tested function that retains endpoints and confirmed alternating extrema. Confirm a reversal only after it exceeds the configured height threshold; at the end retain the pending extreme and actual endpoint, coalescing duplicates. Calculate ascent as the sum of positive differences and descent as the absolute sum of negative differences along this retained profile. This deliberately counts the final residual reversal; document that convention. For every contiguous profile, enforce `gain - loss == end_height - start_height` within floating-point tolerance. Sum disconnected segments independently.

For grades, use the cleaned uniform profile, not tiny original edges or prominence-run lengths. Report maximum sustained grade over a full 50 m chainage window; interpolate window endpoints. For profiles shorter than 50 m return null with a reason. Calculate steep-distance metrics on explicitly defined 50 m bins, retaining and labeling the final shorter bin. A 15% threshold applies to grade, not an 8 m per-point height change. Document that maximum rolling grade and binned steep distance are distinct metrics.

Preserve physical grades outside the scoring model's domain as diagnostics. A scoring-specific clamp is not elevation correction and must never change the published physical profile. Decide review/provisional behavior for affected courses before enabling scoring.

### 6. API, storage and UI

Add `course/measurement.py`, `course/elevation.py` and `course/quality.py` (names proposed). Make feature extraction and the new scoring pipeline consume one immutable measurement result. Update `api/schemas.py`, `api/db.py` and both GPX-processing paths in `api/app.py`; migrate additively.

Persist: raw file hash, geometry hash, measurement version, all parameters, provider/release/tile hashes, datum, source-selection reason, corrected-profile artifact/hash, measured totals, coverage fraction, quality flags and processing timestamp. Store organizer/reference totals separately with their source and route revision. Cache by input hash + configuration + dataset manifest; provider failure must not reuse a result from a different configuration.

Return states `complete`, `provisional` or `needs_review`. Incomplete elevation coverage must not masquerade as complete-course ascent; expose partial totals as partial or return null for full-course ascent. Network failure should retain the raw preview and a clear pending/unavailable state, with bounded retries. Never turn a lookup outage into a valid zero-ascent course.

Render the server-returned corrected profile and chainage in the browser, with an optional raw overlay. Show source, method version and quality status. Display sensible rounded values (for example 16.29 km and 840 m); preserve internal precision. Describe any sensitivity envelope as method sensitivity, not a statistical confidence interval. Do not silently overwrite an accepted course revision or rescore historical results.

## Validation and completion gates

Add a reproducible diagnostic command taking local GPX paths and outputting JSON/CSV with input hashes, point spacing, invalid/duplicate/gap counts, raw/legacy/candidate totals, provider metadata, profile differences and flagged chainage ranges. Tests must use local fixtures and pinned small raster samples, without live APIs.

Required synthetic cases: flat profile with jitter; monotonic climb made of sub-threshold steps; `[0,10,5]` unfinished reversal; noisy loop; repeated coordinates with conflicting elevations; switchbacks; multiple segments; missing endpoints and long missing spans; zero/nodata distinction; tile seams; bridge exception; nonfinite input; short final interval; profile shorter than grade window. Verify reversal symmetry, endpoint identity, deterministic replay and constant-altitude-offset invariance.

Sampling robustness tests should densify the same piecewise-linear geometry and elevation without adding information, then compare outputs. Proposed engineering gates: distance change below 0.01% and ascent change below max(2 m, 1%). These are consistency gates, not claims about real-world accuracy.

For Phuket, reproduce the legacy numbers above first. Add both years as independently labeled benchmark cases once fixtures are available. Overlay flagged ranges and corrected profiles against the reference routes. The 2025 result must not publish 719% as a reliable sustained grade. Do not hard-code 838 m as a golden corrected output or require 2026 to remain exactly 628.4 m.

Obtain independent route evidence: verify course revisions, collect several calibrated barometric traversals in different conditions, record start/end checks and intermediate known elevations, and compare with any available ground survey/DTM. Align by course chainage and reject off-route portions before aggregating. Use an independent held-out set spanning flat, rolling, steep and forested terrain. Report bias, absolute error, profile residuals and failure cases by source; shared DEM-based apps are not independent references.

Proposed product accuracy goals against credible same-route references: distance error at most 1%; ascent error at most max(30 m, 5%). These are targets to validate, not guaranteed tolerances of a 30 m DEM. If they cannot be met, publish limitations and review status rather than tuning each course to pass. Require the 2025 discrepancy to be explained and the 2026 route mismatch resolved before calling either a ground-truth benchmark.

## Ordered task for the coding AI

1. Add diagnostics and preserve existing reproducibility fixtures; reproduce the supplied-file results.
2. Implement segment-aware parsing, immutable provenance and deterministic distance/profile processing with synthetic tests.
3. Implement pinned terrain providers and candidate comparisons; benchmark source and smoothing choices before fixing production defaults.
4. Unify API statistics and charts around the measurement result. Add storage migration, partial-coverage behavior and explicit quality states.
5. Introduce a new scoring version consuming that result; produce an impact report for existing fixtures and historical courses before any migration.
6. Update `course/README.md`, API documentation and methodology to describe the actual deployed behavior. Deliver benchmark outputs, known limitations and a reproducible processing manifest with the implementation.

Completion requires reliable provenance and validated behavior, not just an ascent total that looks plausible.
