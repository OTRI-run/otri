# OTRI Terrain-Adjusted Demand — V0.5

**Status:** Extended by [V0.6](../v0.6/OTRI-SMOOTHED-UPPER-CURVE.md), which keeps this model's demand and terrain adjustment and changes only the score-curve shape above 544 — V0.5 remains selectable and reproducible
**Model identifier:** `0.5.0-course-standard-terrain-adjusted`
**Extends:** [`../v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md`](../v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md) — the score curve is V0.4's, unchanged. V0.5 changes only **course demand**.
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md)

## 1. The problem this fixes

V0.4 fixed the score curve so race *length* stopped moving the score. It left a second bias untouched: the best 100-mile mountain performance OTRI has scored only **889**, or 82.5% of the human ceiling, while road world bests reached 1000.

That gap is not in the curve. It is in the measurement. Course demand integrates [Minetti et al. 2002](https://journals.physiology.org/doi/10.1152/japplphysiol.01177.2001)'s metabolic-cost polynomial over each 50 m segment's grade — and that polynomial was measured **on a treadmill**: smooth, firm, uniform ground, at sea level, in a single bout. A real alpine 100-miler departs from those conditions badly enough that the integral understates what the course actually costs, so every runner on it posts a lower performance rate and is scored as though they ran worse than they did.

Put concretely: the winner covered 218.073 demand-km in 18:16:29. V0.4's road-referenced ceiling for that much demand is 15:04:37. The mountain course took **21.2% longer** than the road-equivalent prediction, and V0.4 charged the runner for all of it.

## 2. What the GPX can and cannot support

Before choosing a model we measured which course properties are actually recoverable from a GPX. Two are; one famously is not.

### 2.1 Recoverable: sustained steep terrain

Above roughly 20% grade a mountain course stops being run and starts being power-hiked or scrambled — loose rock, roots, steps, poles, broken rhythm. Minetti's treadmill cost understates that, in proportion to how much of the course is that steep. The share of distance at or above 20% grade separates course types cleanly:

| course | 0–10% | 10–20% | 20–30% | 30–45% | >45% |
|---|---:|---:|---:|---:|---:|
| Reference 100-miler (technical alpine) | 51.7 | 29.9 | 13.7 | 4.3 | 0.3 |
| CM6 (V0.1 reference race) | 55.5 | 25.8 | 14.8 | 3.9 | 0.0 |
| Phuket trail (jungle) | 66.0 | 20.2 | 12.7 | 1.0 | 0.0 |
| Canyons 50k (US trail) | 77.7 | 19.9 | 2.2 | 0.2 | 0.0 |
| Laguna Half (road) | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 |

### 2.2 Recoverable: altitude

Aerobic capacity declines above roughly 1500 m. Read straight off the course's own denoised elevation profile as a distance-weighted mean excess, this is the **only** measured feature that distinguishes a high-alpine course from a merely steep one — the reference 100-miler carries 243 m of it, and every other course in the table above carries zero.

### 2.3 Not recoverable: technical footing

Rock, roots, mud, steps, exposure — the things that most obviously make a mountain course slow — are **not in a GPX**, and no amount of modelling recovers them:

- They live below 50 m. GPS elevation is accurate to several metres at best, DEM-derived elevation is smoothed by construction, and the measurement pipeline applies a ±10 m rolling median and mean before segmenting at 50 m.
- Whatever undulation *does* survive at 50 m scale is already priced by the gradient integral. Counting it again as "roughness" would double-count the same elevation data, not add information.

This is the model's central limitation and §5 returns to it.

## 3. The model

```text
terrain_factor(D) = 1
                  + STEEP_COEFFICIENT    * steep_distance_fraction
                  + ALTITUDE_COEFFICIENT * altitude_excess_m / 1000

adjusted_demand = course_demand * terrain_factor
```

Everything downstream — the endurance-referenced curve, the anchor table, target times — is V0.4's, untouched.

| constant | value | source |
|---|---:|---|
| `STEEP_GRADE_THRESHOLD` | 0.20 | where mountain courses stop being run |
| `ALTITUDE_THRESHOLD_M` | 1500 | onset of measurable aerobic decrement |
| `ALTITUDE_COEFFICIENT` | 0.07 | ~6–8% VO₂max loss per 1000 m; midpoint taken |
| `STEEP_COEFFICIENT` | 0.5951 | **calibrated** — see §5.1 |

Both inputs are computed from the same denoised 50 m segment profile that produces course demand, so a terrain factor is deterministic for a given GPX and measurement version, and needs no organizer input or subjective difficulty rating. V0.1 §2's exclusions still hold.

A flat sea-level course has both inputs at zero and a factor of exactly **1.000**, so road courses are mathematically untouched — a required test.

## 4. Effect

| course | ≥20% grade | altitude excess | factor | demand → adjusted | V0.4 → V0.5 |
|---|---:|---:|---:|---:|---:|
| Laguna Half (road) | 0.0% | 0 m | 1.000 | 21.33 → 21.33 | 827 → **827** |
| Canyons 50k (US trail) | 2.4% | 0 m | 1.014 | 54.62 → 55.40 | 696 → 703 |
| Phuket trail (jungle) | 13.7% | 0 m | 1.082 | 17.36 → 18.78 | 526 → 557 |
| CM6 (V0.1 reference race) | 18.7% | 0 m | 1.111 | 27.35 → 30.39 | 687 → **737** |
| Reference 100-miler (technical alpine) | 18.4% | 243 m | 1.126 | 218.07 → 245.63 | 888 → **970** |

### 4.1 Worked example — the 2026 calibration performance

```text
measured demand      218.073 demand-km
steep fraction       0.183686        (18.4% of distance at or above 20%)
altitude excess      243.352 m       (distance-weighted, above 1500 m)

steep term           0.5951 x 0.183686      = 0.10931
altitude term        0.07   x 243.352/1000  = 0.01703
terrain factor                               1.126346

adjusted demand      245.626 demand-km
Q                    13.4407 demand-km/h
ceiling rate(D')     14.1294 demand-km/h
fraction of ceiling  95.13%

V0.1 702 -> V0.3 783 -> V0.4 889 -> V0.5 970
```

> **Elevation source.** The figures above, and the calibration of `STEEP_COEFFICIENT`, use the GPX file's own elevations. In production V0.7 measures from Copernicus GLO-30, which reads this course's ascent about 7.5% higher (10,311 m vs 9,592 m; official 9,890 m) and scores the same performance **987** on the current curve. See [V0.7 §6](../v0.7/OTRI-DEM-GATED-MEASUREMENT.md).

### 4.2 Headroom

The trap V0.3 §1.1 documented and rejected was a curve that clips just above its own calibration point. V0.5 keeps room above the performance it was calibrated on:

| faster than the calibration performance | score |
|---:|---:|
| — | 970 |
| 10 min | 975 |
| 30 min | 987 |
| 60 min | 1000 |

About 5% of headroom. A future win under roughly 17:16 would reach 1000 and stop separating; that is the accepted cost of targeting 970 rather than a lower figure.

## 5. Explicit limitations

### 5.1 `STEEP_COEFFICIENT` is calibrated, not measured

`0.5951` was chosen so that one real performance — the 2026 calibration performance — scores 970. **One coefficient fitted to one data point.** V0.3 §5 rightly called that "nearly meaningless" as evidence, and nothing here changes that judgement. What can honestly be claimed:

- The *shape* of the model (cost rising with steep-terrain share and with altitude) is physically motivated and independent of the calibration.
- `ALTITUDE_COEFFICIENT` is taken from published physiology and was **not** tuned.
- The target of 970 is a **product decision** — that the best trail performance in the world should sit near the top of a trail-running index — not a measurement result.

Read this model as "OTRI's scale now spans the sport it serves", not as "OTRI has measured how hard the reference 100-miler is."

### 5.2 It cannot tell a technical course from a merely steep one

Because footing is invisible to GPX (§2.3), the steep-terrain term lifts **every** steep course by roughly the same proportion. The reference 100-miler (18.4% steep) and the V0.1 reference race CM6 (18.7% steep) receive nearly identical factors, despite being very different courses. A smooth steep fire-road gets the same treatment as an alpine scramble at the same gradient.

Closing that would need a technicality signal from outside the GPX — an organizer-declared class, surface data, or field-measured split times.

### 5.3 It moves V0.1's published anchors

Since CM6 is itself a steep course, its demand rises 11.1% and its winner's score moves from **692 to 737**; the 3:05:04 anchor moves from 544 to 596. V0.1's demo/test anchor table therefore no longer reproduces under V0.5. The V0.1 spec labels those anchors "calibration evidence only", drawn from a non-production reference race, and V0.5 is a new model version, so this is permitted — but it is a real consequence and it is why V0.4 and earlier remain selectable and reproducible (V0.1 §21).

### 5.4 Course demand still depends on GPX recording density

Independent of this model: the same real course sampled at 19 m/point and at 276 m/point yields 17.36 and 12.91 demand-km respectively, a 25% spread, because a sparse track genuinely contains less terrain than a dense one. The measurement pipeline already resamples to a fixed 10 m grid, so this is not a resampling bug — it is missing information that resampling cannot restore. It affects the terrain inputs here exactly as it affects demand. A minimum-density requirement or a DEM-backed elevation source would address it; neither is in place yet.

### 5.5 Not calibrated against any third-party index

OTRI's independence from competitor methodologies applies here as everywhere else. The 970 target was set by the project, not derived from any external rating.

## 6. Required tests

- **Road courses are untouched:** `terrain_factor == 1.0` exactly, and a road course scores identically under V0.4 and V0.5.
- **Monotonicity:** the factor rises with both steep-terrain share and altitude excess; real courses order road < jungle trail < alpine.
- **Altitude stays traceable:** 1000 m of excess costs exactly 7%.
- **The calibration point holds:** the 2026 calibration performance scores exactly 970.
- **Headroom survives:** a faster run on the same course scores strictly higher, up to 1000.
- **The adjustment is surfaced** as a `terrain_adjustment_applied` quality flag, never silently applied.
- **Both terms are load-bearing:** zeroing either coefficient lowers the mountain score.
- **Invalid inputs are rejected** rather than silently clamped.
- **The documented limitation is pinned:** the reference 100-miler and CM6 must measure within 2 percentage points of each other on steepness, so §5.2 cannot quietly stop being true.
- All V0.4 and earlier required tests continue to apply to their own curves unchanged.

## 7. What would make this non-provisional

Elite finish times on several *different* real mountain courses with known GPX — enough to fit `STEEP_COEFFICIENT` to a spread of observations instead of one, and enough to test whether a single steepness term is sufficient or whether technicality genuinely needs its own non-GPX input.
