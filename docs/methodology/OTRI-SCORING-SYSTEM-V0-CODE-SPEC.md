# OTRI Scoring System V0 — AI Implementation Specification

**Status:** Development / research implementation candidate  
**Version:** 0.5.0  
**Audience:** Developers, coding agents, AI implementation agents, reviewers  
**Principle:** Course-relative, deterministic, competitor-independent

> **Implement this specification exactly. Do not invent hidden scoring variables.**
>
> **V0.5 is the current scoring candidate.** Older curves remain historical and must not be substituted for V0.5 unless a caller explicitly selects an older model version.

## 1. Goal

OTRI answers two inverse questions:

1. Given an exact course GPX and a finish time, what OTRI score does that performance receive?
2. Given an exact course GPX and a desired OTRI score, what finish time corresponds to that score?

For a fixed course version and model version:

```text
same course + same finish time = same OTRI
```

The fundamental score MUST NOT depend on who else raced.

---

## 2. Explicit exclusions

The fundamental score MUST NOT use:

- competitor times
- finishing position
- winner time
- field strength
- participant count
- previous race results
- previous OTRI scores
- comparable-race populations
- race-specific regression
- VO2max
- heart rate
- lactate threshold
- body mass
- age or sex coefficients
- fatigue
- training history
- weather adjustment
- subjective difficulty
- AI/ML correction

Real-world race results are permitted only in a separate validation/calibration research process. Once V0.5 constants are published, the production score calculation uses only the course inputs, finish time, and the published V0.5 curve.

---

## 3. V0.5 pipeline

```text
Official GPX
    ↓
Deterministic GPX processing
    ↓
50 m horizontal segments
    ↓
Signed segment gradient
    ↓
Published Minetti gradient-cost function
    ↓
Course Demand D
    ↓
Finish time T
    ↓
Performance Rate Q = D / T
    ↓
V0.5 piecewise power score transformation
    ↓
OTRI 0–1000
```

Reverse direction:

```text
Desired OTRI score S
    ↓
V0.5 required performance rate Q(S)
    ↓
Course Demand D
    ↓
Target finish time
```

---

## 4. Important interpretation

`D` is an **OTRI modeled course-demand coordinate**.

It is not a literal measurement of total athlete metabolic energy expenditure.

The Minetti relationship is used as the physical basis for transforming the course gradient profile. Its cost ratio is not claimed to be an exact race-time multiplier.

Therefore code, API output, UI copy, and documentation MUST describe `D` as a **modeled demand-equivalent distance** or **course demand**, not as measured human energy expenditure.

---

## 5. GPX provenance

Retain immutable provenance for every scored course:

```text
course_id
course_version
event_id
source
source_url
source_timestamp
original_file_sha256
processing_version
model_version
```

The original GPX MUST remain available for audit.

For an identical GPX and identical processing/model versions, the computed course demand MUST be deterministic.

---

## 6. GPX processing

The processing pipeline is fixed and deterministic:

```text
Raw GPX
 ↓
Parse track points
 ↓
Remove invalid coordinates
 ↓
Remove consecutive duplicate coordinates
 ↓
Calculate horizontal distance
 ↓
Process elevation
 ↓
Resample to 50 m horizontal segments
 ↓
Calculate signed gradient
 ↓
Calculate gradient cost
 ↓
Sum course demand
```

No external service or live race database may be required to calculate a score from a stored course definition.

### 6.0 Canonical constants

An implementation MUST reproduce these exact values to get bit-for-bit identical results to the reference implementation:

```text
EARTH_RADIUS_M                = 6,371,000.0   # haversine mean Earth radius
SEGMENT_LENGTH_M              = 50.0          # section 6.3
SPIKE_THRESHOLD_M             = 50.0          # section 6.2
ELEVATION_SMOOTHING_RADIUS_M   = 10.0          # section 6.2
MIN_GRADE                     = -0.45         # section 9
MAX_GRADE                     = +0.45         # section 9
```

Canonical modules: `course/features.py` (haversine distance), `scoring/course_demand.py` (GPX → course demand pipeline), `scoring/course_standard.py` (course demand + finish time → 0–1000 score curve). All of section 6–14 below describes exactly what these modules compute — an AI or human reimplementing this spec elsewhere should port these modules directly rather than deriving equivalent-but-different code.

### 6.1 Horizontal distance

The reference implementation MUST use the haversine great-circle formula over a fixed spherical Earth radius, not a full WGS84 ellipsoidal geodesic — this is what the canonical code computes, and reproducing the same result requires the same formula:

```text
R = 6,371,000 m               # mean Earth radius (canonical constant)

phi1 = radians(lat1); phi2 = radians(lat2)
d_phi = radians(lat2 - lat1)
d_lambda = radians(lon2 - lon1)

a = sin(d_phi/2)^2 + cos(phi1) * cos(phi2) * sin(d_lambda/2)^2
d_i = 2 * R * asin(min(1.0, sqrt(a)))
```

The physical course distance is:

```text
D_physical = Σ d_i
```

where `d_i` is the haversine horizontal distance between consecutive track points, computed as above.

The advertised race distance is metadata only. It MUST NOT replace the GPX-derived physical distance inside the mathematical engine.

Canonical implementation: `course/features.py`'s `haversine_m`.

### 6.2 Elevation processing

Elevation MUST be processed deterministically before gradient is calculated, in this exact order:

```text
raw elevation
→ fill missing/non-finite values (linear interpolation between nearest valid neighbours)
→ remove obvious isolated spikes
→ rolling median
→ rolling mean
```

The canonical fixed parameters for the current processing version are:

```text
SPIKE_THRESHOLD_M = 50.0 metres
ELEVATION_SMOOTHING_RADIUS_M = 10.0 metres
```

1. **Fill missing values.** For any point with a missing/non-finite elevation, linearly interpolate between the nearest earlier and later valid readings. If only one side has a valid reading, use that value.
2. **Remove isolated spikes.** A point whose elevation differs from *both* immediate neighbours by more than `SPIKE_THRESHOLD_M` is replaced with the average of those two neighbours.
3. **Rolling median**, then **rolling mean**, each over a **±`ELEVATION_SMOOTHING_RADIUS_M` window measured in cumulative horizontal distance** (metres), not a fixed point count — real GPX tracks are unevenly sampled (dense on curves, sparse on straights), so an index-based window would mix readings from very different physical distances.

Window sizes, spike rules, and all other preprocessing parameters MUST be fixed for a processing version. Do not tune them separately for individual races.

Raw elevation MUST remain available for audit.

Canonical implementation: `scoring/course_demand.py`'s `_clean_elevations` (and its helpers `_interpolate_missing`, `_remove_isolated_spikes`, `_rolling_median`, `_rolling_mean`).

### 6.3 Segment resolution

Production resolution:

```text
SEGMENT_LENGTH_M = 50 metres
```

Build segment boundaries by starting at 0 and stepping by `SEGMENT_LENGTH_M` until reaching the total cumulative course distance, then append the total distance itself as the final boundary — this naturally retains a shorter final remainder segment instead of dropping or stretching it.

For each segment boundary, the cleaned elevation value is **linearly interpolated** along the cumulative-distance polyline (not snapped to the nearest raw track point) — see `_interpolate_at` in the canonical implementation.

The 50 m production resolution is the current deterministic compromise between local gradient representation and stability. Shorter resolutions may be used for research comparisons but are not the V0.5 production definition.

Canonical implementation: `scoring/course_demand.py`'s `_segment_boundaries` and `_interpolate_at`.

---

## 7. Segment representation

Each segment MUST contain at least:

```text
segment_index
start_distance_m
end_distance_m
segment_distance_m
elevation_start_m
elevation_end_m
elevation_change_m
grade_decimal
```

Useful diagnostics:

```text
cumulative_ascent_m
cumulative_descent_m
course_position_fraction
segment_demand
```

---

## 8. Signed gradient

For segment `i`:

```text
g_i = Δh_i / d_i
```

Use decimal slope:

```text
+10% = +0.10
-10% = -0.10
```

Example:

```text
5 m rise over 50 m
5 / 50 = 0.10
```

The sign MUST be preserved.

---

## 9. Gradient-cost function

V0.5 uses the published Minetti et al. running-cost polynomial:

```text
C(g) = 155.4g^5
     - 30.4g^4
     - 43.3g^3
     + 46.3g^2
     + 19.5g
     + 3.6
```

Normalize to level running:

```text
R(g) = C(g) / 3.6
```

Therefore:

```text
R(0) = 1
```

The sign MUST remain part of the calculation:

```text
R(+0.10) ≠ R(-0.10)
```

### 9.1 Supported gradient domain

V0.5 supports:

```text
MIN_GRADE = -0.45
MAX_GRADE = +0.45
```

If a segment's grade falls outside this domain, the reference implementation does **not** reject the whole course. Instead it:

1. Clamps that segment's grade to the nearest bound (`MIN_GRADE` or `MAX_GRADE`) before evaluating `R(g)`, so the course still produces a demand and a score.
2. Appends a `quality_flags` entry recording the segment location, the original grade, and the clamped grade actually used, e.g. `"gradient_out_of_supported_domain: segment 12.30-12.35 km (grade +52%, clamped to +45% for scoring)"`.

Do not silently extrapolate the polynomial beyond ±45%, and do not invent a different fallback formula — clamp-and-flag is the only permitted fallback. A non-empty `quality_flags` list means the result is a best-effort approximation for those segments and should be surfaced to organizers/runners for review, not hidden.

Canonical implementation: `scoring/course_demand.py`'s `UnsupportedGradientError` handling inside `compute_course_demand`.

---

## 10. Course Demand D

For each segment:

```text
segment_demand_i = d_i × R(g_i)
```

Then:

```text
D = Σ segment_demand_i
```

The scoring layer uses kilometres:

```text
D_km = Σ [segment_distance_km × R(g_i)]
```

Flat-course identity:

```text
flat GPX → D_km = physical_distance_km
```

No separate elevation multiplier may be added.

Do NOT add hand-built terms such as:

```text
ascent / 100
maximum_climb coefficient
number_of_climbs coefficient
```

Course demand already comes from the full signed gradient sequence.

---

## 11. Performance Rate Q

Given finish time `T` in hours:

```text
Q = D_km / T_hours
```

`Q` is the OTRI-defined performance coordinate.

It MUST NOT be described as VO2max, metabolic rate, running power, or physiological fitness.

### Example

For:

```text
D_km = 27.560
T = 3:05:04
```

```text
T_hours = 3.084444...
Q ≈ 8.9351585014 demand-km/hour
```

---

# 12. OTRI V0.5 score curve

V0.5 uses a **piecewise power-law transformation** from performance rate `Q` to public score `S`.

The curve is deterministic, public, monotonic, and invertible over the defined domain.

The authoritative anchor table is:

| Score S | Required Q (demand-km/h) | Source/role |
|---:|---:|---|
| 0 | 1.0000000000 | Lower-bound convention |
| 349 | 4.2403624241 | Demo/test race calibration anchor |
| 544 | 8.9351585014 | Demo/test race calibration anchor |
| 692 | 11.7693950178 | Demo/test race calibration anchor |
| 1000 | 17.9398623462 | Upper-scale continuation |

### 12.1 Demo/test calibration observations

The three demo/test race observations used to shape V0.5 came from a single non-production reference race (internally nicknamed "CM6") used only as illustrative calibration data, not a claim about any specific real-world event:

```text
6:29:58 → score 349
3:05:04 → score 544
2:20:30 → score 692
```

For the demo/test course-demand calculation used in calibration:

```text
D ≈ 27.560 demand-km
```

Therefore:

```text
6:29:58 → Q ≈ 4.2403624241
3:05:04 → Q ≈ 8.9351585014
2:20:30 → Q ≈ 11.7693950178
```

These observations are **calibration evidence only**, drawn from demo/test data. A production scorer MUST NOT inspect other runners or race results when calculating an individual's V0.5 score.

---

## 13. Exact V0.5 mathematical definition

The authoritative constants are:

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

For each interval, use a power law. Given adjacent score/Q anchors `(S1,Q1)` and `(S2,Q2)`, define:

```text
p = ln(Q2 / Q1) / ln(S2 / S1)
```

Then for `S1 > 0`:

```text
Q(S) = Q1 × (S / S1)^p
```

### 13.1 Lowest interval: score 0 to 349

Use the lower-bound convention `Q(0)=1.0` and define:

```text
p_low = ln(4.240362424138815 / 1.0) / ln(349.0)

Q(0) = 1.0

Q(S) = S^p_low              for 0 < S ≤ 349
```

### 13.2 Middle intervals

```text
349 < S ≤ 544:

p1 = ln(Q544 / Q349) / ln(544 / 349)
Q(S) = Q349 × (S / 349)^p1
```

```text
544 < S ≤ 692:

p2 = ln(Q692 / Q544) / ln(692 / 544)
Q(S) = Q544 × (S / 544)^p2
```

### 13.3 Upper interval

```text
692 < S ≤ 1000:

p3 = ln(Q1000 / Q692) / ln(1000 / 692)
Q(S) = Q692 × (S / 692)^p3
```

The final interval's exponent is the official continuation rule up to the score ceiling 1000.

### 13.4 Reference values

A conforming implementation should reproduce approximately:

| Score | Required Q |
|---:|---:|
| 0 | 1.000000 |
| 100 | 3.115080 |
| 200 | 3.696100 |
| 300 | 4.084995 |
| 349 | 4.240362 |
| 400 | 5.331726 |
| 500 | 7.755256 |
| 600 | 9.995881 |
| 692 | 11.769395 |
| 700 | 11.925305 |
| 800 | 13.895218 |
| 900 | 15.901228 |
| 1000 | 17.939862 |

The anchor constants, not the rounded display table, are authoritative.

---

## 14. Score from performance rate Q

Given finite `Q > 0`, locate the appropriate Q interval.

For any non-lowest interval with anchors `(S1,Q1)` and `(S2,Q2)`:

```text
p = ln(Q2 / Q1) / ln(S2 / S1)
S_raw = S1 × (Q / Q1)^(1/p)
```

For the lowest interval:

```text
S_raw = Q^(1/p_low)
```

Then:

```python
s_raw = max(0.0, min(1000.0, s_raw))
public_score = round(s_raw)
```

The continuous unclipped value MUST be retained as `otri_raw` before final public clamping/rounding, according to the API's audit contract.

### 14.1 Boundary behavior

- `Q <= 1.0` maps to public score `0`.
- Exact anchor Q values map to their corresponding anchor scores within floating-point tolerance.
- `Q >= Q(1000)` maps to public score `1000` after clamping.
- non-positive or non-finite `Q` MUST be rejected.

---

## 15. Score from finish time

For a course demand `D_km` and finish time `T_seconds`:

```text
T_hours = T_seconds / 3600
Q = D_km / T_hours
S_raw = score_from_q(Q)
public_score = round(clamp(S_raw, 0, 1000))
```

This is the complete production scoring path after course demand has been calculated.

### Example calibration result

```text
D_km = 27.560
finish = 3:05:04
Q ≈ 8.9351585014
OTRI ≈ 544
```

---

## 16. Pre-race target time

Given desired score `S` in `0..1000`:

```text
Q_target = required_q(S)
T_hours = D_km / Q_target
T_seconds = T_hours × 3600
```

Example:

```text
course demand = 27.560 demand-km
score target = 692
Q_target = 11.7693950178
T ≈ 2:20:30
```

The target-time calculation MUST use the same exact V0.5 curve as forward scoring.

It MUST NOT use competitor times, expected winner times, field strength, or a race database.

---

## 17. Canonical implementation pseudocode

```python
import math

ANCHOR_SCORES = (0.0, 349.0, 544.0, 692.0, 1000.0)
ANCHOR_QS = (
    1.0,
    4.240362424138815,
    8.935158501440922,
    11.769395017793594,
    17.93986234619293,
)


def required_q(score: float) -> float:
    if not math.isfinite(score) or not 0.0 <= score <= 1000.0:
        raise ValueError("score must be finite and between 0 and 1000")

    if score == 0.0:
        return 1.0

    if score <= 349.0:
        p = math.log(ANCHOR_QS[1] / ANCHOR_QS[0]) / math.log(ANCHOR_SCORES[1])
        return ANCHOR_QS[0] * score ** p

    for i in range(1, len(ANCHOR_SCORES) - 1):
        s1 = ANCHOR_SCORES[i]
        s2 = ANCHOR_SCORES[i + 1]
        q1 = ANCHOR_QS[i]
        q2 = ANCHOR_QS[i + 1]
        if score <= s2:
            p = math.log(q2 / q1) / math.log(s2 / s1)
            return q1 * (score / s1) ** p

    raise AssertionError("unreachable")


def score_from_q(q: float) -> float:
    if not math.isfinite(q) or q <= 0.0:
        raise ValueError("Q must be finite and positive")

    if q <= ANCHOR_QS[0]:
        return 0.0

    if q < ANCHOR_QS[1]:
        p = math.log(ANCHOR_QS[1] / ANCHOR_QS[0]) / math.log(ANCHOR_SCORES[1])
        raw = q ** (1.0 / p)
        return max(0.0, min(1000.0, raw))

    for i in range(1, len(ANCHOR_QS) - 1):
        q1 = ANCHOR_QS[i]
        q2 = ANCHOR_QS[i + 1]
        s1 = ANCHOR_SCORES[i]
        s2 = ANCHOR_SCORES[i + 1]
        if q <= q2:
            p = math.log(q2 / q1) / math.log(s2 / s1)
            raw = s1 * (q / q1) ** (1.0 / p)
            return max(0.0, min(1000.0, raw))

    s1, s2 = ANCHOR_SCORES[-2:]
    q1, q2 = ANCHOR_QS[-2:]
    p = math.log(q2 / q1) / math.log(s2 / s1)
    raw = s1 * (q / q1) ** (1.0 / p)
    return max(0.0, min(1000.0, raw))


def score_for_time(course_demand_km: float, finish_time_seconds: float) -> dict:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("course demand must be finite and positive")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish time must be finite and positive")

    q = course_demand_km / (finish_time_seconds / 3600.0)
    raw = score_from_q(q)
    public = round(max(0.0, min(1000.0, raw)))

    return {
        "performance_rate": q,
        "otri_raw": raw,
        "otri_score": public,
    }


def target_time_seconds(course_demand_km: float, score: float) -> float:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("course demand must be finite and positive")

    q = required_q(score)
    return course_demand_km / q * 3600.0
```

Implementations MAY optimize this code, but mathematical behavior MUST remain identical.

**Important:** The canonical implementation MUST expose one score-forward function and one target-time function. UI, API, batch scoring, CSV generation, and prediction code MUST call the canonical implementation rather than maintaining separate formula copies.

---

## 18. Required tests

### Anchor tests

Verify:

```text
required_q(349) ≈ 4.240362424138815
required_q(544) ≈ 8.935158501440922
required_q(692) ≈ 11.769395017793594
required_q(1000) ≈ 17.93986234619293
```

and:

```text
score_from_q(4.240362424138815) ≈ 349
score_from_q(8.935158501440922) ≈ 544
score_from_q(11.769395017793594) ≈ 692
```

### Inverse symmetry

For:

```text
0, 100, 200, 300, 349, 400, 500, 544, 600, 692, 700, 800, 900, 1000
```

verify:

```text
score → target time → score
```

within floating-point tolerance before public integer rounding.

### Time monotonicity

For a fixed course:

```text
faster time → higher score
slower time → lower score
```

### Curve monotonicity

For the public score domain:

```text
higher score → higher required Q
```

### Determinism

```text
same GPX
+ same processing version
+ same course version
+ same finish time
+ same model version
= same score
```

### Competitor independence

Adding, removing, or changing other runners MUST NOT change one runner's V0.5 score.

### Flat-course identity

```text
flat GPX → D_km = physical_distance_km
```

### Gradient asymmetry

```text
R(+g) ≠ R(-g)
```

for valid nonzero `g`.

---

## 19. Output contract

A scored result should expose at least:

```json
{
  "course_id": "COURSE-123",
  "course_version": "1",
  "model_version": "0.5.0-course-standard-calibrated",
  "physical_distance_km": 21.959,
  "elevation_gain_m": 1120.0,
  "elevation_loss_m": 1120.0,
  "segment_count": 440,
  "course_demand_km": 27.560,
  "finish_time_seconds": 11104.0,
  "performance_rate": 8.935,
  "otri_raw": 544.0,
  "otri_score": 544,
  "quality_flags": []
}
```

Field names may be adapted to project API conventions, but the intermediate values MUST remain available for auditability.

---

## 20. Explainability requirements

The UI should be able to show:

```text
OTRI: 544

Course demand: 27.560 demand-km
Finish time: 3:05:04
Performance rate: 8.935 demand-km/h
```

The score-curve explanation should be inspectable:

```text
Your performance rate: 8.935
Your OTRI: 544

Score 349 requires: 4.240
Score 544 requires: 8.935
Score 692 requires: 11.769
Score 1000 requires: 17.940
```

This makes the score transformation visible rather than presenting a black-box number.

---

## 21. Versioning and reproducibility

The V0.5 model identifier is:

```text
0.5.0-course-standard-calibrated
```

Older models MUST remain available for historical reproducibility.

A historical score MUST store at least:

```text
course_version
processing_version
model_version
```

Changing any published course-processing parameter or score-curve constant creates a new version. Never silently rewrite historical scores under a new formula.

---

## 22. Calibration policy

V0.5 is a **calibration candidate**, not a claim that three demo/test race observations define the final universal OTRI scale.

The calibration procedure is:

```text
real external trail-score observations
        ↓
validation dataset
        ↓
curve research / comparison
        ↓
published constants
        ↓
versioned deterministic production model
```

Do not use the live race field to calculate that race's production score.

Future curve revisions MUST create a new model version, for example:

```text
0.6.0-course-standard-calibrated
```

and MUST NOT silently alter V0.5 outputs.

---

# 23. AI implementation checklist

Before an AI coding agent declares the implementation complete, it MUST verify:

```text
[ ] Read this specification completely.
[ ] Read the canonical course-demand implementation.
[ ] Read the canonical V0.5 scoring implementation.
[ ] Do not duplicate score constants across files.
[ ] Use the canonical score function from API/UI/batch/predictor code.
[ ] Verify all published V0.5 anchors.
[ ] Verify score/time inverse symmetry.
[ ] Verify faster time means higher score.
[ ] Verify competitor independence.
[ ] Verify flat-course identity.
[ ] Verify signed uphill/downhill behavior.
[ ] Run the complete test suite.
[ ] Record model_version in scored outputs.
```

The phrase **"looks similar to the example"** is not sufficient for implementation acceptance. Mathematical behavior MUST match the published constants and equations.