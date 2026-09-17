# OTRI Power Curve — V0.8

**Status:** Current default scoring model
**Model identifier:** `0.8.0-course-standard-power` · **Processing version:** `course-measurement-v3`
**Extends:** [`../v0.7/OTRI-DEM-GATED-MEASUREMENT.md`](../v0.7/OTRI-DEM-GATED-MEASUREMENT.md) — measurement, terrain adjustment, endurance reference and confidence gating are V0.7's, unchanged. V0.8 changes only the **shape of the score curve**, and it changes it everywhere.
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) §21

## 1. The problem this fixes

V0.6 removed one kink from V0.1's demo-anchored curve; what remained above 544 was already a single power law, and writing it in terms of `f` — the runner's fraction of the human-ceiling rate for the course — makes its shape visible:

```text
score = 1000 × f^0.692
```

An exponent below 1 is concave: it gives the middle of the field more than its share. A runner at 53% of the ceiling scored 643 — 64% of the scale — on a real 80 km mountain course. Below 544 the curve was still V0.1's two demo anchors, with the 0→349 segment so elastic that ±10% of pace moved a back-of-field score by ~80 points.

## 2. The fix: one power law, one published exponent

```text
f     = Q_lookup / Q_1000          (Q_lookup = Q × rate(D_ref)/rate(D), Q_1000 = rate(D_ref) = 21.5331)
score = 1000 × f^0.85
```

and its inverse, for target times: `Q_lookup = Q_1000 × (score/1000)^(1/0.85)`.

No anchor table. The last two V0.1 demo-race anchors (349 and 544) retire; the only remaining V0.1 constant is the course-demand integral itself. The reference course size `D_ref = 27.560` survives only as the normalisation point of the endurance reference.

### 2.1 Why 0.85

`k = 1` would make the score literally *your percentage of the world-best rate, ×10* — no constant at all — but it drops the back of the field by ~40%. `k = 0.692` is what V0.6/V0.7 already were. 0.85 is a judgement between the two: the top of the scale holds, the middle comes down materially, the back comes down less than under `k = 1`. It is **not fitted** to any field data and **not referenced to any third-party index**; a single runner's external rating was used only as a sanity check on the *direction* of the change, never as a target (DATA_POLICY.md).

## 3. Effect

| performance | f | V0.7 | **V0.8** |
|---|---:|---:|---:|
| 5000 m / marathon / 24 h world bests | 100% | 1000 | **1000** |
| 100 km / 100 mile road world bests | 95% | 964 / 968 | **957 / 960** |
| Reference 100-mile win, 18:16 (calibration value; uploaded elevation) | 95% | 966 | **958** |
| Reference 100-miler, 24 h | 72% | 800 | **760** |
| Reference 100-miler, 32 h | 54% | 656 | **595** |
| CM4 80 km, 12:33 (DEM-measured, production) | 53% | 643 | **581** |
| CM6 winner 2:20 (V0.1's 692 finisher) | 61% | 707 | **653** |
| Road half 1:45 / 2:00 | 56% / 49% | 667 / 608 | **609 / 543** |
| CM6 last finisher 6:30 | 22% | 371 | **274** |
| Reference 100-miler, 46 h | 38% | 515 | **437** |

Two invariants from V0.4 hold by construction and are tested: a runner at a fixed fraction of the ceiling scores the same at every course size, and every world best stays at or above 940.

## 4. Required tests

- **Shape:** `curve_type == "power"`, exponent 0.85, no anchors, `q_1000` is V0.4's ceiling at `D_ref`; terrain model and endurance reference are V0.7's objects.
- **Definition:** `raw_score(f × Q_1000) == 1000 × f^0.85` to 1e-12 for `f` from 0.05 to 1.1.
- **Top held, middle lowered:** within 8 points of V0.7 at `f ≥ 0.95`; at least 40 points lower at `f` in 0.2–0.65.
- **Inverse round-trip** across course sizes 3–700 demand-km and scores 50–1000; **monotone** in finish time; **calibre-invariant** across course sizes to within 1 point; **world bests ≥ 940**.
- **Real-course pins** (skipped without the files): Reference 100-mile winner (calibration value) 958, CM6 winner 653 on uploaded elevation; CM4 12:33:43 within 640–680 on the file's noise-inflated ascent (581 on the DEM in production); V0.7 still returns 966.

## 5. Explicit limitations

- **0.85 is a choice, not a measurement.** The honest alternatives were 1.0 (a definition) or a fit to real field distributions, which OTRI does not yet have. It should be revisited when licensed finish data exists, and it must never be adjusted to track a proprietary index.
- **The back of the field drops most in relative terms** (any exponent above 0.692 does that). A last finisher at 22% of the ceiling scores 274, not 371.
- **Scores depend on the elevation source.** The CM4 example above is instructive: its GPX carried 3,844 implausible edges and a raw point-to-point gain of 72,000 m; standard smoothing left 7,525 m, the Chiang Mai DEM reads 4,549 m, and heavier smoothing of the file converges on the DEM. Production measures from the DEM (V0.7); uploaded-elevation pins in this note and in V0.5/V0.6 differ from production by a few % on noisy or alpine files.
- Everything in V0.7 §6, V0.5 §5 and V0.4 §6 still applies.
