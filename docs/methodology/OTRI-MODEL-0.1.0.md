# OTRI scoring model 0.1.0

**Status:** The model in production. Every published race, runner profile and calculator estimate is scored under it.
**Public name:** `OTRI model 0.1.0` · **Measurement:** `course-measurement-v3` · **Elevation:** Copernicus GLO-30 where installed
**Internal build id:** `0.8.0-course-standard-power` — the identifier the API returns as `scoring_version` and stores with every score, so old results replay byte-for-byte. It is a build label, not a second model; the website shows it as "OTRI model 0.1.0".

This page is the single specification of model 0.1.0. It consolidates the development builds under [`v0.1/`](v0.1/) … [`v0.8/`](v0.8/), which are kept as history: they document how each constant was arrived at, and they remain selectable by build id so any score ever published can be reproduced. Nothing in those folders is current on its own.

---

## 1. Definition

> **An OTRI score is a runner's speed over a course, as a share of the fastest a human has ever sustained over a course of that demand, raised to a fixed power.**

```text
score = 1000 × f^0.85          where  f = rate / ceiling(D)
rate    = D / hours            flat-equivalent kilometres per hour
D       = course demand        flat-equivalent kilometres (§3)
ceiling = the human-ceiling rate for demand D (§4)
```

Nothing about who else raced enters the number. The same course, finish time and model give the same score anywhere; the API reports the build id, the measurement version, the elevation source and a hash of the measured profile with every score.

## 2. Inputs

| input | source | notes |
|---|---|---|
| Route | GPX track uploaded by the organizer or calculator user | must be dense enough (§6) |
| Elevation | Copernicus GLO-30 (30 m grid, pinned by checksum) when the region is installed; otherwise the file's own elevations | the page says which was used |
| Finish time | official result, or the calculator's target time | seconds |

Distance is measured along the WGS84 ellipsoid. Elevation is sampled on a 10 m grid, smoothed with a ±10 m window; climbs count only when they exceed 8 m of prominence. The route is then cut into 50 m segments with a gradient each.

## 3. Course demand `D`

Each 50 m segment is weighed by how much harder its gradient is than flat running, using the Minetti et al. (2002) energy-cost polynomial (valid −45 … +45 %; steeper segments reject the course with an explicit error rather than extrapolating). The sum is the course's flat-equivalent distance. Two adjustments follow:

- **Sustained steep ground.** The share of the course at ≥ 20 % gradient multiplies demand by `1 + 0.5951 × share`. The coefficient was calibrated so that one strong, real trail performance — a 2026 alpine 100-mile win in 18:16:29 — scored 970 at the time; it is the model's weakest constant and is stated as such.
- **Altitude.** Ground above 1,500 m costs 7 % per further 1,000 m, from the physiology literature.

## 4. The ceiling

`ceiling(D)` is a piecewise power law through three public world-best performances chosen for depth of competition: 5000 m (12:35.36), marathon (2:00:35) and 24 hours (319.614 km), each converted to a rate over its flat-equivalent distance. Beyond 320 flat-km the 24-hour segment extrapolates, which is conservative for multi-day events; such courses are flagged.

Evidence that the shape is right, not fitted: nine other world records the curve never saw land at 92–102 % of it, and the 5 km → marathon segment has exponent 1.059 where Riegel (1981) found 1.06 independently.

## 5. The curve

`score = 1000 × f^0.85`. A runner at the ceiling scores 1000; the calibration performance sits at 984; 6:30 on a 22 km mountain course is 274. The exponent 0.85 is a stated judgement between "percentage of world best" (1.0) and the concave 0.692 of the development builds. It will be revisited only when licensed field data exists, and never to track a third-party index.

## 6. Confidence

Every score carries `High` or `Low` confidence. `High` requires terrain-model elevation **and** a track whose median point spacing is ≤ 30 m (tested: demand error ≤ 3 % below that spacing, 4–13 % above). Anything else is `Low` and the page says why. Confidence affects trust, never the number.

## 7. What every constant is

| constant | value | origin |
|---|---:|---|
| Gradient energy cost | Minetti 2002 polynomial | published |
| Ceiling anchors | 5000 m 12:35.36 · marathon 2:00:35 · 24 h 319.614 km | public world bests |
| Altitude cost | 7 % per 1,000 m above 1,500 m | literature |
| Steep-terrain cost | 0.5951 per unit share of ≥ 20 % ground | calibrated to one good trail performance |
| Curve exponent | 0.85 | chosen |
| Sparse-track gate | median spacing > 30 m | from data (four real courses) |
| Measurement | 10 m grid · ±10 m smoothing · 8 m prominence · 50 m segments | chosen, sensitivity documented |
| Terrain data | Copernicus GLO-30 | public dataset, pinned |

Nothing is fitted to a field of results and nothing is referenced to another index ([`DATA_POLICY.md`](../../DATA_POLICY.md)).

## 8. Known limits

1. Technical footing (rock, roots, mud, exposure) is invisible to a GPX; a fire road and a scramble with the same profile score alike.
2. One constant is calibrated to one performance.
3. The exponent is a judgement.
4. GLO-30 is a surface model: canopy can read ascent high on forested ground.
5. Courses outside the installed terrain tiles are measured from their file, at `Low` confidence.
6. Conditions (heat, mud, night) do not enter, by design.

## 9. Versioning

- The public model name changes (`0.2.0`, …) only when a score can change for the same course and time. Anything that leaves every score identical (engine speed-ups, caching, a new measurement build with identical output) keeps the name.
- Every change to the formulas above needs an OEP ([`../governance/`](../governance/)) and a new build id in `scoring/`. Old build ids stay selectable so historical scores replay.
- The plain-language companion to this page is [`HOW-OTRI-SCORES.md`](HOW-OTRI-SCORES.md); the runner index that combines scores into one number per runner is [`RUNNER-INDEX-v1.md`](RUNNER-INDEX-v1.md).

## 10. Development history (superseded builds)

| build id | folder | what it contributed to 0.1.0 |
|---|---|---|
| `0.1.0-course-standard-calibrated` | [`v0.1/`](v0.1/) | the code spec: segmenting, Minetti demand, determinism rules (§21 versioning policy) |
| `0.3.0-course-standard-duration-scaled` | [`v0.3/`](v0.3/) | first attempt at length-invariance (Riegel scaling); superseded |
| `0.4.0-course-standard-endurance-referenced` | [`v0.4/`](v0.4/) | the world-best ceiling (§4) |
| `0.5.0-course-standard-terrain-adjusted` | [`v0.5/`](v0.5/) | steep-terrain and altitude adjustments (§3) |
| `0.6.0-course-standard-smoothed-upper` | [`v0.6/`](v0.6/) | dropped the last demo anchor from the curve |
| `0.7.0-course-standard-dem-gated` | [`v0.7/`](v0.7/) | terrain-model elevation and the confidence gate (§6) |
| `0.8.0-course-standard-power` | [`v0.8/`](v0.8/) | the single power curve (§5); this build **is** model 0.1.0 |

The retired baseline `0.1.0-field-relative` (`scoring/model.py`, [OEP-001](../governance/oep/OEP-001-baseline-scoring-model.md)) shares the number but is a different, competitor-relative rule kept only for reproducibility; it is not model 0.1.0.
