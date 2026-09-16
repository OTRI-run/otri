# OTRI Score Scale — V0.5 Calibrated Candidate

**Status:** Development / research candidate  
**Version:** 0.5  
**Scope:** Universal time-to-score scale  
**Principle:** Course-relative, deterministic, competitor-independent

## 1. V0.5 decision

OTRI V0.5 uses:

1. A GPX-derived **course demand** based on deterministic 50 m segmentation and signed gradient cost.
2. A direct **performance rate** equal to course demand divided by finish time.
3. A fixed **piecewise power-law 0–1000 score curve**.

The production score does not use competitor times, finishing position, winner time, field strength, participant count, runner history, physiology, weather, subjective difficulty, or race-specific regression.

Real external results may be used in a separate validation/calibration process. Once the V0.5 constants are published, they are fixed for production scoring until a new model version is released.

---

## 2. Course demand

For a GPX course, the deterministic pipeline is:

```text
GPX
 ↓
clean/validate track
 ↓
process elevation
 ↓
50 m horizontal segments
 ↓
signed gradient per segment
 ↓
Minetti running-cost polynomial
 ↓
segment demand
 ↓
Course Demand D
```

For segment `i`:

```text
g_i = Δh_i / d_i

C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6

R(g) = C(g) / 3.6

segment_demand_i = d_i × R(g_i)

D = Σ segment_demand_i
```

`g` is decimal grade, so `+10% = +0.10`.

The supported gradient domain is:

```text
-0.45 ≤ g ≤ +0.45
```

Do not add separate ascent, climb-count, or elevation coefficients.

---

## 3. Performance rate

For finish time `T` in hours:

```text
Q = D / T
```

`Q` is the OTRI performance coordinate, expressed as modeled demand-km/hour.

It is not a physiological measurement.

---

## 4. V0.5 score curve

V0.5 is defined by these authoritative anchor constants:

```text
ANCHOR_SCORES = [0.0, 349.0, 544.0, 692.0, 1000.0]

ANCHOR_QS = [
    1.0,
    4.240362424138815,
    8.935158501440922,
    11.769395017793594,
    17.93986234619293,
]
```

Each adjacent interval is a power law.

For adjacent anchors `(S1,Q1)` and `(S2,Q2)`, with `S1 > 0`:

```text
p = ln(Q2 / Q1) / ln(S2 / S1)
Q(S) = Q1 × (S / S1)^p
```

The first interval uses the lower-bound convention:

```text
Q(0) = 1.0

p_low = ln(4.240362424138815) / ln(349)

Q(S) = S^p_low
for 0 < S ≤ 349
```

The intervals are:

```text
0 < S ≤ 349
349 < S ≤ 544
544 < S ≤ 692
692 < S ≤ 1000
```

For scores above 692, the exponent from the final interval is continued to the 1000 ceiling.

---

## 5. V0.5 reference table

| OTRI | Required Q (demand-km/h) |
|---:|---:|
| 0 | 1.000000 |
| 100 | 3.115080 |
| 200 | 3.696100 |
| 300 | 4.084995 |
| **349** | **4.240362** |
| 400 | 5.331726 |
| 500 | 7.755256 |
| 600 | 9.995881 |
| **692** | **11.769395** |
| 700 | 11.925305 |
| 800 | 13.895218 |
| 900 | 15.901228 |
| **1000** | **17.939862** |

The full-precision anchor constants are authoritative. Rounded table values are documentation/test references only.

---

## 6. Real calibration anchors

The current V0.5 curve was shaped using three observed CM6 score/time pairs on the same modeled course-demand basis:

```text
6:29:58 → 349
3:05:04 → 544
2:20:30 → 692
```

Using approximately:

```text
D = 27.560 demand-km
```

these correspond to:

```text
Q ≈ 4.2403624241
Q ≈ 8.9351585014
Q ≈ 11.7693950178
```

These are **calibration observations**, not inputs to the production score. The production scorer must not look at other runners to score a runner.

V0.5 is therefore a calibration candidate, not a claim that these three observations establish the final universal scale.

---

## 7. Score from Q

Given `Q > 0`, locate the Q interval corresponding to the published anchors.

For an interval with `(S1,Q1)` and `(S2,Q2)`:

```text
p = ln(Q2 / Q1) / ln(S2 / S1)
S_raw = S1 × (Q / Q1)^(1/p)
```

For the first interval:

```text
S_raw = Q^(1/p_low)
```

Then:

```text
public_score = round(clamp(S_raw, 0, 1000))
```

`otri_raw` should retain the continuous value before final public rounding/clamping for auditability.

Boundary rules:

```text
Q ≤ 1.0       → score 0
Q ≥ 17.939862 → score 1000
```

Non-positive or non-finite `Q` must be rejected.

---

## 8. Finish time → OTRI

The complete production path is:

```text
GPX
 ↓
Course Demand D
 ↓
finish time T
 ↓
Q = D / T_hours
 ↓
V0.5 score_from_q(Q)
 ↓
OTRI 0–1000
```

Example:

```text
D = 27.560 demand-km
T = 3:05:04
Q ≈ 8.9351585014
OTRI = 544
```

---

## 9. Desired OTRI → target time

Given a target score `S`:

```text
Q_target = Q(S)
T_hours = D / Q_target
T_seconds = 3600 × D / Q_target
```

Example:

```text
D = 27.560 demand-km
S = 692
Q_target = 11.7693950178
T ≈ 2:20:30
```

The same canonical curve implementation must be used for both directions.

---

## 10. Implementation requirements for AI coding agents

An AI implementation must:

```text
1. Read the V0.5 code specification completely.
2. Use the canonical course-demand implementation.
3. Use one canonical V0.5 score-curve implementation.
4. Do not duplicate curve constants in API/frontend/scripts.
5. Compute Q only from course demand and the runner's own finish time.
6. Verify the four non-zero score anchors.
7. Verify inverse symmetry.
8. Verify faster time → higher score.
9. Verify competitor independence.
10. Run all tests before declaring completion.
```

The implementation must not infer a formula from the rounded reference table. It must use the full-precision `ANCHOR_SCORES` and `ANCHOR_QS` constants.

---

## 11. Versioning

The current model identifier is:

```text
0.5.0-course-standard-calibrated
```

Changing any score anchor, curve equation, clipping rule, or course-demand definition requires a new model/processing version.

Historical V0.5 scores must remain reproducible.

---

## 12. Core principle

```text
same course
+
same course-processing version
+
same finish time
+
same OTRI model version
=
same OTRI score
```

Competitors do not define the score.
