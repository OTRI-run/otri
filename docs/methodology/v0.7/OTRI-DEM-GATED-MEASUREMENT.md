# OTRI DEM-Gated Measurement — V0.7

**Status:** Current default scoring model
**Model identifier:** `0.7.0-course-standard-dem-gated` · **Processing version:** `course-measurement-v2`
**Extends:** [`../v0.6/OTRI-SMOOTHED-UPPER-CURVE.md`](../v0.6/OTRI-SMOOTHED-UPPER-CURVE.md) — the score curve, terrain adjustment and endurance reference are V0.6's, unchanged. V0.7 changes **how the course is measured** and **what the score is allowed to claim**.
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) §21 (versioning), [`../REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](../REAL-WORLD-COURSE-MEASUREMENT-SPEC.md) (terrain providers)

## 1. The problem this fixes

V0.6 is deterministic in the GPX *file*: same file, same time, same version → same score, bit for bit. It is not deterministic in the *route*. The same real course, recorded densely and then thinned to simulate a coarser device or a route-planner export, scored through V0.6's live pipeline:

| course | native | thinned ×5 | thinned ×20 |
|---|---:|---:|---:|
| UTMB, 171 km | 218.1 demand-km | −4.3% | **−12.6%** |
| Phuket trail, 14.6 km | 17.4 demand-km | −10.6% | **−25.6%** |

Two organizers uploading the same route from different watches got different scores, and nothing told either of them. For a score whose purpose is cross-race comparison, that is the defect that matters most.

### 1.1 Where the swing comes from — and what a DEM can and cannot fix

The loss decomposes into a horizontal part and a vertical part:

| | distance | gain | demand |
|---|---:|---:|---:|
| UTMB ×20 | **−15.8%** | −5.4% | −12.6% |
| Phuket ×20 | **−26.3%** | −19.2% | −25.6% |

Most of it is **horizontal**: a sparse track chords the switchbacks into straight lines and the course simply gets shorter. A digital elevation model supplies elevation at whatever geometry it is given; it cannot put the switchbacks back. So "use a DEM" alone does not make the score route-invariant, and V0.7 does not claim that it does.

What a DEM *does* fix is the vertical share and, more importantly, **provenance**: elevation stops being "whatever the watch's barometer said" and becomes a named, versioned, checksummed dataset. Two devices over the same geometry then agree exactly (§5, required test).

## 2. The fix, in two parts

### 2.1 A point-spacing gate (`course-measurement-v2`)

Measurement v2 records the track's **median point spacing** (`median_edge_m`) and adds one rule:

```text
median point spacing > 30 m  ->  quality flag  sparse_geometry_median_over_30m
                             ->  status        needs_review
```

The threshold comes from data, not preference. Demand error against median spacing on four real courses:

| median spacing | UTMB | Phuket | Canyons 50k | CM6 |
|---:|---:|---:|---:|---:|
| ≤ 30 m | −1.2% | −2.2% | −2.0% | −3.6% |
| ~45 m | −3.2% | −5.8% | — | −5.6% |
| ~60 m | −4.3% | −7.6% | −3.9% | — |

At or under 30 m the error stays within ~2–3%; above it the error grows past what a performance score can absorb. Sparse tracks are **still measured and still scored** — refusing an organizer's only file would help nobody — but the measurement says why it should not be trusted, in words a runner can act on ("recorded one point every 47 m; switchbacks get cut short; upload a track recorded at least every 30 m"). Route-planner exports at 40–50 m spacing land here, correctly: they do measure 4–6% short.

`sparse_geometry_median_over_30m` joins the review flags (`REVIEW_FLAGS`) and the reproducibility flags (`CONFIDENCE_BLOCKING_FLAGS`, §2.3) — both single shared constants, so the published `status` and the scoring confidence are derived from the same source and differ only where §2.3 says they should.

### 2.2 Pinned DEM elevation as the production default

The terrain-provider adapter (`course/elevation.py`, pinned GeoTIFF tiles with SHA-256 checks, bilinear sampling, no network) existed and was tested but was off unless `OTRI_DEM_MANIFEST` was set — and it was not set in production, so every measurement carried `unknown_elevation_provenance`. V0.7 makes it the default deployment:

- `scripts/deploy/06-install-dem.sh N45E006 …` downloads the named 1°×1° Copernicus GLO-30 tiles from the public COG bucket, checksums them and writes the manifest. `02-deploy-app.sh` picks the manifest up into `.env`.
- The API logs a warning at startup when no manifest is configured, and every score then reports `Low` confidence — on purpose.

**Coverage is per course, not per configuration.** GLO-30 is global but the installed tiles are not; a course outside them is measured from its own uploaded elevations, with `terrain_coverage_incomplete_used_uploaded_elevation` set, `source` recorded as `uploaded-gpx`, and confidence `Low`. This is the *announced* fallback the measurement spec allows; a genuine provider failure (checksum mismatch, unreadable tile, no elevation in the file either) still stops the measurement rather than inventing one.

### 2.3 A confidence label on every score — two tiers of flags

Review and reproducibility are different questions, and the first real courses through V0.7 proved they must be kept apart. Measurement flags now come in two tiers:

| tier | flags | effect |
|---|---|---|
| **review** (`REVIEW_FLAGS`) | `implausible_local_elevation_change`, `sustained_grade_outside_scoring_domain`, `disconnected_track_segments`, `sparse_geometry_median_over_30m` | `status = needs_review` — an organizer should glance at this |
| **reproducibility** (`CONFIDENCE_BLOCKING_FLAGS`) | `sparse_geometry_median_over_30m`, `disconnected_track_segments`, `implausible_local_elevation_change` | blocks `High` — another device would not measure the same route |

```text
High    elevation from the pinned DEM  AND  no reproducibility flag
Low     otherwise — with the reason(s) appended to quality_flags:
          elevation_not_dem_sourced: …
          route_not_reproducible: <flags> (median point spacing 47.2 m; …)
```

Two flags are deliberately treated differently from the first draft of this model:

- **`sustained_grade_outside_scoring_domain` marks review but never blocks `High`.** It is a scoring-domain clamp notice — a 50 m window past Minetti's ±45% — inherent to steep terrain (12 of 3,430 windows on UTMB, 0.35% of the course) and applied deterministically. On the Phuket trail the DEM and the uploaded file agree on ascent to the metre (618 m) yet one sliding window tips 0.39 → 0.47 on a surface-model canopy edge; letting that decide confidence would make `High` unreachable for exactly the courses OTRI exists for.
- **`implausible_local_elevation_change` is raised only for the elevation actually used.** The first draft computed it from the uploaded per-point elevations even when the DEM was the source, so a noisy watch file could never reach `High` on the DEM (this blocked both UTMB and the V0.1 reference race). Under a DEM the noise is recorded as informational `uploaded_elevation_implausible_unused` and not held against the measurement.

Pre-V0.7 curves keep their historical rule (`Medium` with a GPX, `Low` without), so nothing about older scores changes.

## 3. What V0.7 can honestly claim

> For a track that passes the gate, scored against the pinned DEM, the same route scores within about 3% regardless of which device recorded it — and any track that cannot meet that standard says so on the score.

That is narrower than "route invariance", deliberately. The remaining gap — rebuilding chorded switchbacks from a sparse track — is a route-snapping problem (matching to a way network), out of scope here and flagged as future work in §6.

## 4. What does not change

The score itself. For the same measurement, V0.7 and V0.6 produce identical `otri_raw` and `otri_score` (required test). Historical scores stay reproducible: stored `course-measurement-v1` snapshots replay unchanged (the new `median_edge_m` field defaults to `None`), and V0.6 and earlier remain selectable.

## 5. Required tests

- **Version and field:** `measure_course` reports `course-measurement-v2` and a `median_edge_m`.
- **The gate:** a dense synthetic switchback track is not flagged; the same track thinned past 30 m median spacing is flagged and `needs_review`; the flag is in `REVIEW_FLAGS`.
- **v1 replay:** a snapshot without `median_edge_m` still constructs and yields the same demand.
- **DEM path end to end** (synthetic GeoTIFF + manifest through the real `RasterProvider`): provenance recorded, `unknown_elevation_provenance` absent, gain measured.
- **Device independence:** two copies of the same geometry with different uploaded elevations measure identically (same `profile_hash`) when the DEM covers them.
- **Announced fallback:** a course outside coverage with uploaded elevations succeeds with the fallback flag and `uploaded-gpx` provenance; without uploaded elevations it still fails closed on `coverage`.
- **The claim:** with elevation fixed by the DEM, every thinning that passes the gate measures within 3% of the full track; a thinning that fails the gate is `needs_review`.
- **Confidence ladder:** `High` only for DEM + reproducible route; `Low` with a `route_not_reproducible` reason for sparse; `Low` with `elevation_not_dem_sourced` for uploaded elevations; older curves unchanged.
- **Two tiers:** `CONFIDENCE_BLOCKING_FLAGS` is a strict subset of `REVIEW_FLAGS` that excludes the grade-domain flag; a measurement carrying only that flag is `needs_review` *and* `High`.
- **Elevation actually used:** a file with 300 m spikes measured on the DEM carries `uploaded_elevation_implausible_unused`, not the blocking flag, and is `High`; the same file measured from its own elevations carries `implausible_local_elevation_change` and is `Low`.
- **Score identity:** V0.7 equals V0.6 for the same measurement.
- **Real course (skipped if absent):** the UTMB track passes the gate natively and fails it thinned ×5.

## 6. Explicit limitations

- **The gate is a floor, not a fix.** A track at 25 m spacing passes and still measures ~1–3% short of a 10 m one. That residual is inside the claim in §3 but it is not zero.
- **Coverage is operational.** Confidence is `High` only where tiles are installed. The install script takes a tile list; someone has to decide which regions to cover, and an upload from anywhere else is `Low` until its tiles are added.
- **GLO-30 is a surface model, and it shows.** On UTMB it reads 10,311 m of ascent against 9,592 m from the uploaded file and 9,890 m official — the two sources sit −3% / +4% either side of the organizer's figure — and the same winning performance scores **987** on the DEM against the **966** pinned in the V0.6 note on uploaded elevation. On the Phuket trail the two agree exactly (618 m). The difference is alpine rock and canopy, not a general bias. Production numbers are DSM-based; the V0.5/V0.6 calibration and pins were made on uploaded elevation and are recorded as such there. No constant has been re-tuned to close the gap: the measurement spec's benchmarking programme (Copernicus vs a bare-earth model such as FABDEM vs calibrated barometric traversals on a known route) is the honest route to that, and has not been run. `High` means *reproducible against a named dataset*, not *validated against the ground*.
- **Switchback loss is unaddressed.** Only snapping to a route network recovers geometry a sparse track never recorded.
- Everything in V0.6 §5 and V0.5 §5 still applies to the curve and the terrain factor.
