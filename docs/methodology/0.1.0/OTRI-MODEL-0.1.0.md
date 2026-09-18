# OTRI scoring model 0.1.0

**Status:** The model in production. Every published race, runner profile and calculator estimate is scored under it.
**Public name:** `OTRI model 0.1.0` · **Measurement:** `course-measurement-v3` · **Elevation:** Copernicus GLO-30 where installed
**Internal build id:** `0.9.0-course-standard-domain-gated` — the identifier the API returns as `scoring_version` and stores with every score, so old results replay byte-for-byte. It is a build label, not a second model; the website shows it, and `0.8.0-course-standard-power` before it (same scores, §7.4), as "OTRI model 0.1.0".
**Code:** `scoring/course_demand.py` (course demand), `scoring/terrain.py` (terrain factor), `scoring/course_standard.py` (ceiling and curve), `course/` (measurement). If this page and the code disagree, the code wins and this page has a bug.

This page is the complete specification of model 0.1.0: every formula, every constant, where each came from, the evidence, the tests that pin it, and its limits. It is self-contained. The development builds it consolidates (§14) live only in git history.

---

## 1. Definition

> **An OTRI score is a runner's speed over a course, as a share of the fastest a human has ever sustained over a course of that demand, raised to a fixed power.**

```text
score = 1000 × f^0.85          where  f = Q_lookup / Q_1000
Q       = D' / hours           the runner's rate, in flat-equivalent km per hour
D'      = D × terrain_factor   course demand (§3) with the terrain adjustment (§4)
Q_lookup = Q × rate(D_ref) / rate(D')      the rate re-expressed at the reference course size (§5)
Q_1000  = rate(D_ref) = 21.5331347785      the human ceiling at the reference size
```

Nothing about who else raced enters the number. The same course, finish time and model give the same score anywhere; the API reports the build id, the measurement version, the elevation source and a hash of the measured profile with every score.

### 1.1 What the score must never use

Competitor times, finishing position, winner time, field strength, participant count, previous results or scores, comparable-race populations, race-specific regression, VO₂max, heart rate, lactate threshold, body mass, age or sex coefficients, fatigue, training history, weather adjustment, subjective difficulty, or any machine-learned correction. Real results may be used in a separate calibration study; the production score uses only the course, the finish time and the published constants.

## 2. Inputs and measurement

| input | source | notes |
|---|---|---|
| Route | GPX track uploaded by the organizer or calculator user | must be dense enough (§7) |
| Elevation | Copernicus GLO-30 (30 m grid, pinned by SHA-256) when the region is installed; otherwise the file's own elevations | the page says which was used |
| Finish time | official result, or the calculator's target time | seconds |

Measurement is specified in [`REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](../course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md) and validated in [`COURSE-MEASUREMENT-V1-VALIDATION.md`](../course-measurement/COURSE-MEASUREMENT-V1-VALIDATION.md). The parts the score depends on:

- Distance along the WGS84 ellipsoid (Karney geodesics via `pyproj.Geod`).
- Elevation sampled on a 10 m grid, then a rolling median and a rolling mean over ±10 m windows measured in distance, not point count, because real tracks are dense on bends and sparse on straights. Climbs count only when they exceed 8 m of prominence.
- The route is then cut into 50 m horizontal segments with one signed gradient each (`g = Δh / d`, so +10 % is `+0.10`). The final remainder segment is kept, not dropped or stretched.
- The track's median point spacing (`median_edge_m`) is recorded for the confidence gate.

`course-measurement-v3` is the same arithmetic as v2 in C and numpy; on three real courses every profile point agreed within 2.3e-8 m and every score was identical. It carries its own version because the profile hashes differ.

## 3. Course demand `D`

Each 50 m segment is weighed by how much harder its gradient is than flat running, using the Minetti et al. (2002) energy-cost polynomial measured on a treadmill from −45 % to +45 %:

```text
C(g) = 155.4·g⁵ − 30.4·g⁴ − 43.3·g³ + 46.3·g² + 19.5·g + 3.6
R(g) = C(g) / 3.6                       so R(0) = 1, and R(+g) ≠ R(−g)
D    = Σ  d_i × R(g_i)                  in kilometres: flat-equivalent km
```

- **Flat-course identity.** A flat course has `D` equal to its physical distance. No extra ascent, climb-count or elevation-gain term is added; the signed gradient sequence already carries it.
- **Domain.** `MIN_GRADE = −0.45`, `MAX_GRADE = +0.45`. A segment steeper than that is not extrapolated and does not reject the course: its gradient is clamped to the nearest bound for the demand contribution and a `gradient_out_of_supported_domain` quality flag records the segment, the real gradient and the clamped one. Clamp-and-flag is the only permitted fallback. On steep alpine courses this touches a fraction of a percent of the distance (12 of 3,430 windows on the calibration course).
- `D` is a modelled demand-equivalent distance, not a measurement of energy expenditure, and must be described as course demand everywhere.

## 4. Terrain adjustment

Minetti's polynomial describes smooth, firm ground at sea level. Two properties that a GPX can support are added; the third that matters most, technical footing, cannot be (§12).

```text
terrain_factor = 1 + 0.5951 × steep_share + 0.07 × altitude_excess_m / 1000
D' = D × terrain_factor
```

| constant | value | meaning | origin |
|---|---:|---|---|
| `STEEP_GRADE_THRESHOLD` | 0.20 | above about 20 % a course stops being run and is power-hiked or scrambled | where mountain courses stop being run |
| `STEEP_COEFFICIENT` | 0.5951 | cost per unit share of distance at ≥ 20 % gradient | **calibrated** to one performance (§4.1) |
| `ALTITUDE_THRESHOLD_M` | 1500 | onset of a measurable aerobic decrement | physiology literature |
| `ALTITUDE_COEFFICIENT` | 0.07 | cost per 1,000 m of distance-weighted mean elevation above the threshold | ~6–8 % VO₂max loss per 1,000 m, midpoint |

Both inputs come from the same denoised 50 m profile that produces `D`, so the factor is deterministic and needs no organizer input. A flat sea-level course has both inputs at zero and a factor of exactly 1.000, so road courses are untouched. The adjustment is always surfaced as a `terrain_adjustment_applied` quality flag.

Typical values: a road half marathon 1.000; a US trail 50 km with 2.4 % steep ground 1.014; a jungle trail with 13.7 % steep ground 1.082; a technical alpine 100-miler with 18.4 % steep ground and 243 m of altitude excess 1.126.

### 4.1 The calibration performance

`STEEP_COEFFICIENT` was set so that one strong, real trail performance — a 2026 alpine 100-mile win in 18:16:29 on a ~171 km / +9,890 m course — scored 970 under the development curve of the time. One coefficient fitted to one data point: the *shape* of the adjustment is physically motivated and independent of that choice, the altitude coefficient was not tuned, and the target of 970 was a product decision that the best trail performance in the world should sit near the top of a trail-running index. Read the constant as "OTRI's scale spans the sport it serves", not as a measurement of that course. It is the model's weakest constant and §12 says so.

## 5. The ceiling `rate(D)`

A score measures what fraction of the best humanly possible performance on a course of *this size* the runner achieved. `rate(D)` is the world-best rate over `D` flat-equivalent km, a piecewise power law in log-log space through three public performances chosen for depth of competition and wide spacing:

| reference performance | `D` (flat-km) | rate (flat-km/h) |
|---|---:|---:|
| 5000 m track, 12:35.36 | 5.000 | 23.8297 |
| marathon road, 2:00:35 | 42.195 | 20.9954 |
| 24-hour road, 319.614 km | 319.614 | 13.3172 |

```text
rate(D) = Q₁ × (D / D₁)^p        p = ln(Q₂/Q₁) / ln(D₂/D₁)   per segment; end segments continue outside the range
factor(D) = rate(D_ref) / rate(D)              D_ref = 27.560 flat-km
Q_lookup = Q × factor(D')
```

These are flat courses, so `D` is the event distance to within a percent. `D_ref` is a normalisation point only (`factor(D_ref) = 1`); it is the demand of the reference course the early development builds were calibrated on and has no other role.

### 5.1 Why race length stops mattering

`Q_lookup = (Q / rate(D')) × rate(D_ref)`: the only course-dependent term is the runner's fraction of the ceiling for a course of that size. A runner held at a fixed 80 % of the ceiling scores the same at 5, 27, 42, 100, 219 and 320 flat-km, by construction, and that is a required test.

### 5.2 The emergent Riegel exponent

The equivalent fatigue exponent `b(D) = 1 − d ln rate / d ln D` is a derived property of the curve, not an input:

| segment | `b` |
|---|---:|
| 5.000 → 42.195 flat-km | **1.059** |
| 42.195 → 319.614 flat-km | **1.225** |

The short segment was built only from the 5000 m and marathon records, and lands on Riegel's (1981) published 1.06 to two decimals over exactly the range his data covered. That is the model's one independent corroboration. `b` is non-decreasing in `D` (fatigue cannot get gentler as races get longer), which guarantees `factor(D)` is monotone.

### 5.3 Held-out validation

None of the following were used to build the curve:

| world record | `D` | observed rate | `rate(D)` | share of ceiling |
|---|---:|---:|---:|---:|
| 1500 m track (3:26.00) | 1.500 | 26.214 | 25.595 | 102.4 % |
| 3000 m track (7:20.67) | 3.000 | 24.508 | 24.563 | 99.8 % |
| 10000 m track (26:11.00) | 10.000 | 22.915 | 22.869 | 100.2 % |
| Half marathon (57:30) | 21.098 | 22.015 | 21.877 | 100.6 % |
| 50 km road (2:42:07) | 50.000 | 18.505 | 20.209 | 91.6 % |
| 6-hour road (97.200 km) | 97.200 | 16.200 | 17.404 | 93.1 % |
| 100 km road (6:05:35) | 100.000 | 16.412 | 17.293 | 94.9 % |
| 100 miles road (10:51:39) | 160.934 | 14.818 | 15.539 | 95.4 % |
| 12-hour road (177.410 km) | 177.410 | 14.784 | 15.202 | 97.3 % |

From 1500 m to the half marathon the curve reproduces records it never saw within 2.4 %, mostly within 1 %. The ultra records sit at 92–97 %, which is expected rather than a fit error: those events are contested by far smaller fields, so their records genuinely sit further below the ceiling. They score 940–983, high and correctly ordered, not saturated.

### 5.4 Range

Below 5 flat-km and above 319.614 flat-km the end segments extrapolate. Multi-day events include sleep stops, so their true decay is steeper and the model under-credits them. Such courses carry a `course_demand_above_reference_range` (or `below`) quality flag.

## 6. The curve

```text
f          = Q_lookup / Q_1000            Q_1000 = rate(D_ref) = 21.5331347785 flat-km/h
otri_raw   = 1000 × f^0.85
otri_score = round(clamp(otri_raw, 0, 1000))
```

The inverse, for target times: `Q_lookup = Q_1000 × (score / 1000)^(1/0.85)`, then `T = D' / (Q_lookup / factor(D')) × 3600`. Forward scoring and target time use the same function; the API, the calculator and batch scoring call it rather than keeping copies.

`otri_raw` is kept unclipped for audit. `performance_rate` in API responses is the raw, unscaled `Q = D' / hours`; only the lookup is scaled. Non-positive or non-finite inputs are rejected, never clamped.

### 6.1 Why 0.85

`k = 1` would make the score literally the runner's percentage of the world-best rate, times ten, with no constant at all, but it drops the back of the field by about 40 % relative to the development curve. `k = 0.692` is the concave shape the development builds had, which gave the middle of the field more than its share (53 % of the ceiling scored 643, 64 % of the scale). 0.85 is a stated judgement between the two: the top of the scale holds, the middle comes down materially, the back comes down less than under 1.0. It is not fitted to any field data and not referenced to any third-party index; it will be revisited only when licensed field data exists, and never to track another index ([`DATA_POLICY.md`](../../../DATA_POLICY.md)).

### 6.2 What the scale looks like

| performance | share of ceiling `f` | score |
|---|---:|---:|
| 5000 m, marathon and 24-hour world bests | 100 % | **1000** |
| 100 km / 100-mile road world bests | 95 % | **957 / 960** |
| The calibration performance, 18:16:29, terrain-model elevation (production) | 98 % | **984** |
| The same run measured from the file's own elevation | 95 % | **958** |
| The calibration course in 24 h / 32 h / 46 h | 72 % / 54 % / 38 % | **760 / 595 / 437** |
| An 80 km Chiang Mai mountain course in 12:33 (production) | 53 % | **581** |
| A 22 km mountain course in 2:20 / 6:30 | 61 % / 22 % | **653 / 274** |
| A road half marathon in 1:45 / 2:00 | 56 % / 49 % | **609 / 543** |

### 6.3 Worked example

The calibration performance, measured from the file's own elevation (the numbers the constant was set on):

```text
D              218.073 flat-km
steep share    0.183686        altitude excess 243.352 m
terrain_factor 1 + 0.5951×0.183686 + 0.07×0.243352 = 1.126346
D'             245.626 flat-km
Q              245.626 / 18.2747 h = 13.4407 flat-km/h
rate(D')       14.1294 flat-km/h        f = 0.9513
otri_raw       1000 × 0.9513^0.85 = 958.4       otri_score 958
```

On the Copernicus terrain model the same course reads about 7.5 % more ascent (10,311 m against 9,592 m from the file and 9,890 m official), which is why production scores it 984.

## 7. Confidence

Every score carries `High` or `Low` confidence. Confidence affects trust, never the number.

```text
High    elevation from the pinned terrain model  AND  no reproducibility flag  AND  inside the model's evidence (§7.4)
Low     otherwise, with the reason appended to quality_flags:
          elevation_not_dem_sourced: …
          route_not_reproducible: <flags> (median point spacing 47.2 m; …)
          gradient_domain_exceeded: …          course_below_validated_range: …
```

### 7.1 The point-spacing gate

A sparse track chords the switchbacks into straight lines, so the course gets shorter and the score higher. Most of the loss is horizontal, which a terrain model cannot put back. The measurement therefore records the median point spacing and adds one rule: **median spacing > 30 m** sets `sparse_geometry_median_over_30m`, marks the course `needs_review` and blocks `High`. The threshold comes from thinning four real courses:

| median spacing | alpine 100-miler | jungle 15 km | US trail 50 km | 22 km mountain |
|---:|---:|---:|---:|---:|
| ≤ 30 m | −1.2 % | −2.2 % | −2.0 % | −3.6 % |
| ~45 m | −3.2 % | −5.8 % | — | −5.6 % |
| ~60 m | −4.3 % | −7.6 % | −3.9 % | — |

Sparse tracks are still measured and scored; the score says why it should not be trusted, in words a runner can act on. Route-planner exports at 40–50 m spacing land here, correctly.

### 7.2 Two tiers of flags

| tier | flags | effect |
|---|---|---|
| review (`REVIEW_FLAGS`) | `implausible_local_elevation_change`, `sustained_grade_outside_scoring_domain`, `disconnected_track_segments`, `sparse_geometry_median_over_30m` | `status = needs_review`: an organizer should glance at it |
| reproducibility (`CONFIDENCE_BLOCKING_FLAGS`) | `sparse_geometry_median_over_30m`, `disconnected_track_segments`, `implausible_local_elevation_change` | blocks `High`: another device would not measure the same route |

`sustained_grade_outside_scoring_domain` is a clamp notice inherent to steep terrain and never blocks `High`; otherwise `High` would be unreachable on exactly the courses OTRI exists for. `implausible_local_elevation_change` is raised only for the elevation actually used: under the terrain model a noisy watch file is recorded as informational `uploaded_elevation_implausible_unused`.

### 7.3 The tested claim

> For a track that passes the gate, scored against the pinned terrain model, the same route scores within about 3 % regardless of which device recorded it, and any track that cannot meet that standard says so on the score.

A course outside the installed tiles is measured from its own elevations with `terrain_coverage_incomplete_used_uploaded_elevation`, provenance `uploaded-gpx`, and `Low` confidence. A genuine provider failure (checksum mismatch, unreadable tile, no elevation in the file either) stops the measurement rather than inventing one.

### 7.4 Where the model's own evidence ends

Build `0.9.0` ([OEP-002](../../governance/oep/OEP-002-domain-gating-and-vertical-races.md)) changes no score. It adds what the model says about courses beyond what it was built and checked on:

| condition | effect | why |
|---|---|---|
| more than 20 % of the course's demand comes from segments clamped at ±45 % | `Low`, `gradient_domain_exceeded` | a clamped segment is under-credited by an unknown amount (13.5 % at 50 %, 18.6 % at 52 % if the polynomial is extrapolated); at a fifth of the demand the course-level error passes the 3 % of §7.3. The clamp notice alone still never blocks `High` (§7.2) |
| `D'` below 1.5 flat-km | `Low`, `course_below_validated_range` | 1,500 m is the shortest held-out record (§5.3); below it events are anaerobic and the records outrun the curve (800 m 107 %, 400 m 121 %) |
| steep share above 0.50, or with no course file an average grade of 20 % or more | **not scored**: `otri_score` is null, the row carries `course_not_scored: …`, the result does not enter a runner index | the steep-terrain coefficient (§4) was calibrated at a steep share of 0.184 and real mountain courses measure 0–0.25; an uphill-only course is about 1.0, the linear term multiplies its demand by 1.6, and a 50-minute vertical kilometre would score 1000 |

Vertical races are therefore published with finish times and ranks and without scores until the term is recalibrated on vertical-race data (§12). Race summaries carry a descriptive `is_vertical` label (ascent ≥ 10 × descent and average grade ≥ 10 %; from official figures alone, average grade ≥ 20 %); the label never enters a score.

## 8. Every constant

| constant | value | origin |
|---|---:|---|
| Gradient energy cost | `155.4g⁵ − 30.4g⁴ − 43.3g³ + 46.3g² + 19.5g + 3.6`, normalised by 3.6 | Minetti et al. 2002, published |
| Gradient domain | −0.45 … +0.45, clamp-and-flag outside | the polynomial's measured range |
| Segment length | 50 m | chosen; 20 m let short real pitches average past the domain |
| Measurement | 10 m grid · ±10 m median and mean · 8 m prominence | chosen, sensitivity documented |
| Steep-terrain threshold and cost | ≥ 0.20 gradient · 0.5951 per unit share | threshold from course profiles; coefficient calibrated to one performance |
| Altitude threshold and cost | 1,500 m · 0.07 per 1,000 m | physiology literature |
| Ceiling anchors | 5000 m 12:35.36 · marathon 2:00:35 · 24 h 319.614 km | public world bests, frozen in this version |
| Reference size | `D_ref = 27.560` flat-km | normalisation point only |
| `Q_1000` | 21.5331347785 flat-km/h | `rate(D_ref)`, derived |
| Curve exponent | 0.85 | chosen |
| Sparse-track gate | median spacing > 30 m | from data (four real courses) |
| Not scored above | steep share 0.50 | chosen: twice any course the steep term has been seen on (§7.4) |
| `Low` above / below | 20 % of demand clamped · 1.5 flat-km | derived from the 3 % claim · the shortest held-out record |
| Terrain data | Copernicus GLO-30, pinned by checksum | public dataset |

Nothing is fitted to a field of results and nothing is referenced to another index.

## 9. Rules that hold everywhere

- **Determinism.** Same GPX + same measurement version + same build id + same finish time = same score, bit for bit. No external service or live database is needed to score a stored course.
- **Competitor independence.** Adding, removing or changing other runners never changes a score.
- **Provenance.** Every scored course keeps its track as uploaded (every position and elevation, exactly; the file's own metadata, timestamps and extensions are removed before storage and its statements of origin kept in the private record), the SHA-256 of the original upload and of the stored file, the measurement version, the elevation source, and the profile hash; every score stores the build id. Raw elevation stays available for audit, and the stored file measures bit-identically to the upload.
- **Explainability.** The UI can show course demand, finish time, rate, the ceiling for that size, the share and the score, and the calculator's breakdown does.
- **Output.** A scored result exposes at least the physical distance, gain and loss, segment count, course demand, finish time, `performance_rate`, `otri_raw`, `otri_score`, confidence and `quality_flags`.

## 10. Required tests

All of these run in `tests/unit` (`test_scoring_course_demand.py`, `test_scoring_course_standard.py`, `test_scoring_registry.py`, `test_scoring_model.py` and the measurement tests):

- Flat-course identity; gradient asymmetry `R(+g) ≠ R(−g)`; clamp-and-flag outside ±45 %.
- Road courses have `terrain_factor == 1.0` exactly and score identically with and without the adjustment; the factor rises with steep share and with altitude; 1,000 m of excess costs exactly 7 %; both terms are load-bearing.
- Ceiling: the short segment's `b` is 1.06 ± 0.01; `b(D)` non-decreasing and above 1; `rate(D)` strictly decreasing; every world best in §5 scores ≥ 940; a runner at a fixed share of the ceiling scores within 1 point across 5–700 flat-km; out-of-range courses are flagged.
- Curve: `otri_raw(f × Q_1000) == 1000 × f^0.85` to 1e-12 for `f` in 0.05–1.1; inverse round-trip within tolerance across 3–700 flat-km and scores 50–1000; faster time always scores higher; the reported rate is unscaled.
- Confidence: `High` only with terrain-model elevation and a reproducible route; `Low` with the reason for sparse tracks and for uploaded elevation; the clamp notice alone leaves `High` reachable; two files with the same geometry and different uploaded elevations hash identically under the terrain model; thinning that passes the gate measures within 3 %.
- Domain gating (`test_scoring_domain_gated.py`): builds `0.8.0` and `0.9.0` score every scored course identically; the two `Low` thresholds sit exactly at 20 % and 1.5 flat-km; a course with a steep share above 0.50 lists every finisher with no score and the reason; official figures beyond ±45 % are clamped and flagged.
- Reproducibility: every earlier build id still returns its published numbers for the worked examples; a `course-measurement-v1`/`v2` snapshot replays unchanged.
- Real-course pins run when the (gitignored) organizer files are present and are skipped otherwise.

## 11. What changed a score during development, and why

The scale is defined by three published world bests, two literature constants, one calibrated constant and one chosen exponent. The development builds arrived there in steps, each fixing one defect:

- **Race length used to move the score** (the same calibre of run scored 1000 at 5 km and 702 at 100 miles). Fixed by referencing the curve to the human ceiling for the course size (§5).
- **Mountain courses were scored as road courses of the same gradient profile.** Fixed by the terrain adjustment (§4).
- **The curve had kinks from demo-race anchors** that gave the 550–700 band twice the elasticity of its neighbours, so every course-level correction landed hardest on the middle of the field. Fixed by dropping the anchors and using one power law (§6).
- **Two devices recording the same route got different scores and nothing said so.** Fixed by terrain-model elevation, the spacing gate and the confidence label (§7).

## 12. Known limits

1. **Technical footing is invisible.** Rock, roots, mud, exposure live below 50 m and are not in a GPX; whatever undulation survives at 50 m is already priced by the gradient integral, so counting it again would double-count. A smooth steep fire road and an alpine scramble with the same profile get the same factor. This is the largest reason a mountain-ultra winner sits at 98 % of a road-referenced ceiling rather than 100 %.
2. **One constant is calibrated to one performance** (§4.1).
3. **The exponent is a judgement** (§6.1). The further from the top, the larger the relative drop compared with the concave development shape: a last finisher at 22 % of the ceiling scores 274, not 371.
4. **GLO-30 is a surface model.** It includes canopy and buildings and can read ascent high on forested alpine ground (about +4 % against the official figure on the calibration course; exact agreement on a jungle trail). `High` means *reproducible against a named dataset*, not *validated against the ground*; the benchmarking programme in the measurement spec has not been run, and no constant has been re-tuned to close the gap.
5. **Coverage is per region.** A course outside the installed tiles is measured from its file at `Low` confidence.
6. **The gate is a floor, not a fix.** A track at 25 m spacing passes and still measures 1–3 % short of a 10 m one; only route-snapping could rebuild chorded switchbacks, and it is not built.
7. **Conditions do not enter** (heat, mud, snow, night), by design.
8. **Beyond 320 flat-km the ceiling extrapolates** (§5.4).
9. **Three anchors is a deliberately small basis**, justified by the held-out validation; an OTRI-owned dataset would justify more.
10. **Vertical races cannot be scored.** The steep-terrain term is linear in the steep share and calibrated at 0.18; at 1.0 it over-scores by about 60 % of demand. Such courses are listed without scores (§7.4) until the term is refitted on vertical-race data, which would be a new model.

What would make the model non-provisional: real, licensed finish data on real courses across sizes and ability levels, enough to fit the steep-terrain coefficient and the exponent instead of choosing them, and a same-route benchmark of the terrain model against a bare-earth model and calibrated barometric traversals.

## 13. Versioning

- The public model name changes (`0.2.0`, …) only when a score can change for the same course and time. Anything that leaves every score identical (engine speed-ups, caching, a new measurement build with identical output, a build that changes only confidence or withholds a score it cannot defend, §7.4) keeps the name.
- Every change to a formula or constant above needs an OEP ([`../governance/`](../../governance/)) and a new build id in `scoring/`. Old build ids stay selectable so historical scores replay; a historical score is never rewritten under a new formula. The ceiling anchors are frozen constants of this version: refreshing them when a record falls is a new version.
- The plain-language companion to this page is [`HOW-OTRI-SCORES.md`](HOW-OTRI-SCORES.md); the runner index that combines scores into one number per runner is [`RUNNER-INDEX-v1.md`](../runner-index/RUNNER-INDEX-v1.md).

## 14. Development history

Model 0.1.0 is the consolidation of eight development builds, plus one build since that changes no score. Each remains selectable by its build id in `scoring/registry.py` so any score ever published can be reproduced. Their individual specifications were removed from this folder in September 2026 because everything 0.1.0 uses is on this page; they are in git history (`git log --all -- docs/methodology/v0.8`).

| build id | what it contributed to 0.1.0 |
|---|---|
| `0.1.0-course-standard-calibrated` | the course-demand integral (§3), the exclusions, determinism and versioning rules; its demo-race anchor curve is retired |
| `0.3.0-course-standard-duration-scaled` | first attempt at length-invariance with Riegel's 1.06; superseded, retained for reproducibility |
| `0.4.0-course-standard-endurance-referenced` | the world-best ceiling and the held-out validation (§5) |
| `0.5.0-course-standard-terrain-adjusted` | the steep-terrain and altitude adjustments (§4) |
| `0.6.0-course-standard-smoothed-upper` | dropped the last demo anchor from the upper curve |
| `0.7.0-course-standard-dem-gated` | terrain-model elevation, the spacing gate and the confidence label (§7) |
| `0.8.0-course-standard-power` | the single power curve (§6); the first build of model 0.1.0 |
| `0.9.0-course-standard-domain-gated` | the same scores; confidence reports the model's own limits and vertical races are listed without scores (§7.4, OEP-002); the current build of model 0.1.0 |

The retired baseline `0.1.0-field-relative` (`scoring/model.py`, [OEP-001](../../governance/oep/OEP-001-baseline-scoring-model.md)) shares the number but is a different, competitor-relative rule kept only for reproducibility; it is not model 0.1.0.
