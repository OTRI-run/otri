# OTRI Duration-Scaled Curve — V0.3 Addendum

**Status:** Superseded by [V0.4](../v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md) — retained so V0.3 scores stay reproducible
**Model identifier:** `0.3.0-course-standard-duration-scaled`
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) — this document only adds a duration-scaling step on top of that spec's course-demand engine and anchor table. Every section of the V0.1 spec still applies unchanged (course demand calculation, exclusions, determinism, versioning policy).

> **Superseded.** V0.3 correctly identified that performance rate decays with event duration,
> but corrected for it with Riegel's `b = 1.06` — an exponent derived from road racing under
> about four hours. Fitted segment by segment against world-best performances, the real exponent
> stays near 1.06 up to the marathon and then climbs to roughly 1.22 in the ultra range, so V0.3
> left most of the correction unmade (the worked example below reached only 783). V0.3 also left
> V0.1's *extrapolated* 1000-anchor in place, so the short end of the scale still saturated: a
> 15:06 5 km scored 1000. Section 5's own limitations flagged both risks.
>
> [V0.4](../v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md) replaces this model. The rest of this
> document is kept unchanged as the historical record for `0.3.0-course-standard-duration-scaled`.

## 1. The problem this fixes

V0.1's score curve maps a performance rate `Q` (demand-km/h) to a score using one fixed anchor table, calibrated entirely from a single reference course of course demand `D_ref = 27.560` demand-km (spec v0.1 §12.1). This implicitly treats `Q` as **duration-invariant** — the same `Q` always means the same score, no matter how large the course is.

That assumption breaks down at extreme distances. A real 2026 winning performance on an alpine 100-mile course (~171 km / +9,890 m, course demand `D ≈ 218.671` demand-km, finish time `18:16:29`) computes to `Q ≈ 11.97` — only marginally above V0.1's own `692`-anchor `Q` (`11.769`), giving the winner of one of the world's most competitive 100-mile mountain races a V0.1 score of only **702**. Meanwhile V0.1's `1000`-anchor (`Q ≈ 17.94`) was never a real observation at all — it was documented as "upper-scale continuation," a pure extrapolation (spec v0.1 §12, anchor table).

This is not a bug in the course-demand math. It reflects a well-documented real phenomenon: **sustainable performance rate necessarily drops as event duration grows** — nobody can hold their 3-hour intensity for 18 hours. V0.1's explicit exclusion of "fatigue" and "training history" as *scoring inputs* is still correct (§2) — but a fixed universal `Q`-to-score table implicitly assumes no such drop exists *at all*, which is a modeling gap, not a calibration error.

### 1.1 Why a naive fix does not work

Replacing V0.1's `1000` anchor with the real calibration-performance `Q` (so the winner scores exactly 1000) was tested and rejected: any performance rate above the winner's — including physically impossible ones — then also clips to 1000, since the anchor table has no room above the observation used to define it. See the required-Q table below at `D = 218.671`:

| Q | V0.1 score | naive single-anchor-replace score |
|---:|---:|---:|
| 11.769 (V0.1's own 692 anchor) | 692 | 692 |
| 11.97 (the real calibration performance) | 702 | 1000 |
| 15.0 (never run by a human) | 855 | 1000 |

A real fix needs required-`Q` to depend on **course demand**, not just score.

## 2. The fix: a published duration-decay exponent

[Riegel's formula](https://en.wikipedia.org/wiki/Peter_Riegel) (Riegel, P.S., "Athletic Records and Human Endurance," *American Scientist* 69(3):285–290, 1981) is the standard, widely-cited relationship for predicting equivalent performance across different endurance distances:

```text
T2 = T1 * (D2 / D1)^b
```

with `b ≈ 1.06` derived from a broad survey of real running/swimming/walking records across the "endurance range" (roughly 3.5–230 minutes in Riegel's original data, but the same functional form is widely used well beyond that, including ultramarathons — Riegel's own literature already notes `b=1.06` tends to *underestimate* the slowdown at very long distances).

OTRI applies the same functional form to **course demand** (our own gradient-cost-normalized distance unit) instead of raw physical distance, since demand is already OTRI's distance-equivalent measure. This gives a duration/course-demand scaling factor for the required performance rate at any score:

```text
Q_required(S, D) = Q_ref(S) * (D / D_ref)^(1 - b)
```

where:

- `Q_ref(S)` is V0.1's exact, unchanged anchor table (`docs/methodology/v0.1/...` §13) — the required `Q` at the reference course size.
- `D_ref = 27.560` demand-km — the V0.1 calibration course's own course demand.
- `b = 1.06` — Riegel's published exponent (`ENDURANCE_EXPONENT` in code).
- `D` — the actual course's course demand.

At `D = D_ref`, `(D/D_ref)^(1-b) = 1`, so **V0.3 reduces to V0.1 exactly** at the reference course size — this is a required test (§4).

### 2.1 Equivalent, implementation-friendly form

Since `(D/D_ref)^(1-b)` is a constant multiplier for a given course, this is mathematically equivalent to rescaling the *observed* `Q` before looking it up in the unchanged V0.1 table — which is what the reference implementation actually does:

```text
scale(D) = (D / D_ref)^(b - 1)
adjusted_Q = Q_observed * scale(D)
score = score_from_q_v01(adjusted_Q)          # exact V0.1 function, unmodified
```

and the inverse (target time):

```text
Q_required_at_D = required_q_v01(score) / scale(D)
T = D / Q_required_at_D * 3600
```

`performance_rate` in output/API stays the **raw, unscaled** `Q = D / T_hours` — a plain physical quantity. Only the score lookup is duration-adjusted.

## 3. Worked example (the real validation point)

```text
D = 218.671 demand-km
T = 18:16:29 (65,789 s)
Q = D / (T/3600) = 11.965763273495568   # unchanged from V0.1

scale(D) = (218.671 / 27.560)^(1.06 - 1) = (7.9366)^0.06 = 1.13236
adjusted_Q = 11.965763273495568 * 1.13236 = 13.548

V0.1 score:              702
V0.3 duration-scaled:    783
```

This is a real, meaningful improvement over V0.1 (783 vs 702) — but note it is **not** claimed to be "correct" in any validated sense; it is what one published, generic exponent plus one real ultra observation currently produces. See §5.

## 4. Required tests

- **Reference-size equivalence:** for any score `S`, `target_time_seconds(D_ref, S, DURATION_SCALED_CURVE) == target_time_seconds(D_ref, S, OFFICIAL_CURVE)` within floating-point tolerance.
- **Elite ultra performance scores meaningfully higher than V0.1, without saturating:** the worked example above must satisfy `V0.3_score > V0.1_score` and `V0.3_score < 1000`.
- **No saturation for implausible paces:** a performance rate far beyond any real observation on the same course must still score strictly higher than the real elite observation (i.e. the curve must not clip early, unlike the rejected naive patch in §1.1).
- **Monotonicity:** for a fixed course demand, faster times must always score higher (same invariant as V0.1 §18).
- **Inverse symmetry:** `score → target_time → score` must round-trip within tolerance, for a range of course-demand sizes (small, reference, and ultra-scale).
- All of V0.1's own required tests continue to apply to `OFFICIAL_CURVE` and `MEASURED_CURVE` unchanged — V0.3 is additive, not a replacement.

## 5. Explicit limitations (read before trusting this for anything but "better than V0.1")

- **`b = 1.06` is a generic, non-ultra-specific, non-trail-specific constant.** It was not fit to OTRI's own data — it is borrowed from Riegel's original road-running/swimming/walking survey. Riegel's own literature flags it as an *underestimate* of fatigue at long distances, which likely means V0.3 still under-corrects for extreme mountain ultras.
- **Exactly one real ultra-distance point has been used to validate (not calibrate) this model**, the 2026 calibration performance. `b` was **not** fit to that point — it is Riegel's literal published constant, deliberately not tuned to match this single observation (tuning one exponent to one data point would be nearly meaningless).
- **This is not calibrated against, or intended to reproduce, any third-party proprietary index** (e.g. a race organizer's own performance index). Any resemblance or difference is incidental — OTRI's principle of independence from competitor methodologies applies here as everywhere else in this project.
- Course-demand sizes far below the reference course (very short races) are equally untested against real data — only the long-distance direction has a real validation point so far.

## 6. What would make this non-provisional

Real finish times, on real GPX courses with known course demand, at a spread of course-demand sizes (e.g. 10K-equivalent, marathon-equivalent, 50-mile, 100-mile, 200-mile) and a range of relative performance levels (not just winners) — enough to fit `b` (and possibly a more flexible functional form) directly from OTRI's own data instead of borrowing Riegel's generic exponent. Until then, treat `0.3.0-course-standard-duration-scaled` the same way V0.1 asks you to treat itself: a calibration candidate, not a final answer.
