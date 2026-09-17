# OTRI Smoothed Upper Curve — V0.6

**Status:** Curve still current; scored through [V0.7](../v0.7/OTRI-DEM-GATED-MEASUREMENT.md), which adds measurement gating and confidence on top — V0.6 remains selectable and reproducible
**Model identifier:** `0.6.0-course-standard-smoothed-upper`
**Extends:** [`../v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md`](../v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md) — demand measurement, terrain adjustment and the endurance reference are V0.5's, unchanged. V0.6 changes only the **shape of the score curve above 544**.
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md)

## 1. The problem this fixes

V0.5 lifted steep courses as intended, but it lifted the **middle of the field more than the front**. On the V0.1 reference race:

| CM6 finisher | V0.4 | V0.5 | lift |
|---|---:|---:|---:|
| 2:20:30 (winner) | 687 | 737 | +50 |
| 2:40:00 | 613 | 676 | **+63** |
| 3:05:04 | 541 | 596 | +55 |
| 3:30:00 | 502 | 537 | +35 |

The terrain factor is a uniform multiplier on performance rate — the right model for "this course is harder for everyone". The unevenness comes from the score curve it feeds.

### 1.1 The kink at 692

V0.1's curve is a piecewise power law through three demo finishers assigned 349, 544 and 692. Each segment has its own exponent, and the segment between the 544 and 692 anchors is much more elastic than its neighbours:

| segment | Q range | elasticity (d ln score / d ln Q) | points per +10% Q at midpoint |
|---|---:|---:|---:|
| 0 → 349 | 1.00 → 4.24 | 4.053 | +82 |
| 349 → 544 | 4.24 → 8.94 | 0.596 | +26 |
| **544 → 692** | **8.94 → 11.77** | **0.873** | **+54** |
| 692 → 1000 | 11.77 → 21.53 | 0.609 | +51 |

A +10% rate boost buys 54 points at ~620 but only 26 points at ~450 — the same physical improvement is worth twice as much in one band as in the band next to it. Nothing about running justifies that; it is what falls out of forcing a curve through three arbitrary points. Every uniform course-level correction — V0.4's duration scaling, V0.5's terrain factor, any future one — gets amplified precisely in the 550–700 band.

### 1.2 Why "smooth the whole curve" was rejected

A single power law from the 349 anchor to the 1000 anchor was modelled first. It does not remove the mid-pack lift; it *relocates* it. The 349→544 segment is very flat (rate doubles for 195 points), so smoothing over it raises everyone in the 400–580 band by 15–20 points — on road courses too. Rejected.

## 2. The fix: drop the 692 anchor

```text
anchor_scores = (0, 349, 544, 1000)
anchor_qs     = (1.0, 4.2404, 8.9352, 21.5331)
```

One power law now runs from the 544 demo anchor to the world-best 1000 anchor:

```text
p = ln(21.5331 / 8.9352) / ln(1000 / 544) = 1.4448      elasticity 0.692
```

Everything at or below 544 is byte-for-byte V0.5. Above 544 the elasticity is constant, so a uniform rate boost buys points in strict proportion to score — a required test. The 692 anchor was a demo assignment (V0.1 §12.1: "calibration evidence only"), and V0.5 had already moved that finisher to 737; V0.6 places the same performance rate at **658** at the reference course size.

## 3. Effect

| CM6 21.9 km | V0.4 | V0.5 | V0.6 | V0.4→V0.5 | V0.4→V0.6 |
|---|---:|---:|---:|---:|---:|
| 2:20:30 | 687 | 737 | **707** | +50 | +20 |
| 2:40:00 | 613 | 676 | **646** | +63 | +33 |
| 3:05:04 | 541 | 596 | **584** | +55 | +43 |
| 3:30:00 | 502 | 537 | **537** | +35 | +35 |
| 4:00:00 | 464 | 496 | **496** | +32 | +32 |
| 6:29:58 | 338 | 371 | **371** | +33 | +33 |

| UTMB 171 km | V0.4 | V0.5 | V0.6 | V0.4→V0.5 | V0.4→V0.6 |
|---|---:|---:|---:|---:|---:|
| 18:16:29 | 888 | 970 | **966** | +82 | +78 |
| 24:00:00 | 752 | 822 | **800** | +70 | +48 |
| 32:00:00 | 606 | 688 | **656** | +82 | +50 |
| 40:00:00 | 513 | 566 | **562** | +53 | +49 |
| 46:00:00 | 472 | 515 | **515** | +43 | +43 |

*UTMB figures use the file's own elevations. On Copernicus GLO-30 (V0.7 production) the winner scores 987 rather than 966 — see [V0.7 §6](../v0.7/OTRI-DEM-GATED-MEASUREMENT.md).*

| Phuket trail 14.6 km | V0.4 | V0.5 | V0.6 | V0.4→V0.5 | V0.4→V0.6 |
|---|---:|---:|---:|---:|---:|
| 1:15:00 | 753 | 792 | **767** | +39 | +14 |
| 1:45:00 | 582 | 626 | **608** | +44 | +26 |
| 2:20:00 | 480 | 504 | **504** | +24 | +24 |
| 4:00:00 | 343 | 366 | **366** | +23 | +23 |

The 2:40 lift on CM6 halves (+63 → +33); the 32-hour UTMB lift drops from +82 to +50; back-of-field scores do not move.

### 3.1 The side effect: road scores in the same band come down

The score curve is universal — it maps *fraction of the human ceiling* to a score regardless of surface — so removing the inflated band lowers anyone who was in it, including road runners:

| Laguna Half (road) | V0.5 | V0.6 | change |
|---|---:|---:|---:|
| 1:05:00 | 938 | **930** | −8 |
| 1:15:00 | 860 | **842** | −18 |
| 1:25:00 | 797 | **772** | −25 |
| 1:45:00 | 700 | **667** | −33 |
| 2:00:00 | 627 | **608** | −19 |
| 2:20:00 | 548 | **547** | −1 |
| 2:45:00 | 496 | **496** | 0 |

Those runners were not scored "correctly" under V0.5 and "penalised" now; they were sitting in the same artefact. World bests are unaffected at the very top: 5000 m, marathon and 24-hour still score 1000; 100 km and 100 miles 964 and 968.

## 4. Required tests

- **Only the 692 anchor is dropped:** anchor scores are `(0, 349, 544, 1000)`; the three surviving rates are V0.1's; the 1000 rate is V0.4's; the terrain model and endurance reference are V0.5's objects.
- **At or below 544, V0.6 equals V0.5** to floating-point tolerance at the reference course size.
- **One exponent above 544:** `raw_score` reproduces `544 × (Q/Q₅₄₄)^(1/p)` exactly across the segment.
- **The kink is gone:** V0.5's +10%-rate gain at 620 exceeds its gain at 850 (pinning the defect); V0.6's gain rises monotonically with score and is the same proportion of score everywhere above 544.
- **Real-course pins** (skipped when the course files are absent — see DATA_POLICY.md): CM6 2:40 goes 676 → 646 and the winner 737 → 707 while 3:30 and the last finisher are unchanged; UTMB's winner scores 966; a 1:45 road half goes 700 → 667 while 2:45 is unchanged.
- **V0.5 stays reproducible:** the UTMB winner still scores exactly 970 on `TERRAIN_ADJUSTED_CURVE`.
- Inverse round-trip and monotonicity across course sizes, and world bests ≥ 940, as for V0.4.

## 5. Explicit limitations

- **The 0→349 and 349→544 segments are still V0.1's demo fit.** The 0→349 segment has an elasticity of 4.05 — a +10% rate change swings the score by ~80 points at 175 — and 349→544 is unusually flat. Both are untouched here because changing them moves back-of-field scores on every course, which nobody has asked for, and because there is no data to replace them with. They remain the weakest-evidenced part of the model.
- **This is a shape decision, not a measurement.** No new data entered V0.6. The change is justified by removing an artefact that had no physical basis, and by the numbers in §3; it is not calibrated to any field distribution.
- Everything in V0.5 §5 — the single-point calibration of `STEEP_COEFFICIENT`, the invisibility of technical footing to GPX, and sampling-density sensitivity — still applies.
