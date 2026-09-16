# OTRI Scoring System V0 — Complete Implementation Specification

**Status:** Development specification / research implementation candidate  
**Version:** 0.1.0  
**Audience:** Developers and coding agents implementing the OTRI scoring engine  
**Principle:** Course-relative, deterministic, competitor-independent

---

## 1. Objective

Implement the first OTRI scoring engine as a deterministic mathematical system that answers:

> **Given this exact trail course and this exact finish time, what OTRI performance score does the performance represent?**

The reverse calculation must also work:

> **Given this exact trail course and a desired OTRI score, what finish time corresponds to that score?**

The pre-race and post-race calculations must be mathematical inverses.

The fundamental score must not depend on other competitors, race-field strength, finishing position, historical race results, previous athlete scores, athlete physiology, VO₂max, heart rate, fatigue, or race-specific regression.

---

# 2. Core Model

The V0 system has two mathematical layers.

```text
Official GPX
    ↓
Deterministic GPX processing
    ↓
Segmented course
    ↓
Gradient-dependent physical demand
    ↓
Course Demand D
    ↓
Finish time T
    ↓
Performance Rate Q = D / T
    ↓
Logarithmic OTRI scale
    ↓
OTRI 0–1000
```

The core equations are:

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6

R(g) = C(g) / C(0)

D = Σ [d_i × R(g_i)]

Q = D / T_hours

OTRI_raw = 500 + K × ln(Q / 15.0)

K = 500 / ln(1.5)

OTRI = round(clamp(OTRI_raw, 0, 1000))
```

Numerically:

```text
K = 1233.151...
```

Therefore:

```text
OTRI_raw = 500 + 1233.151 × ln(Q / 15.0)
```

---

# 3. Non-Negotiable Design Rules

The implementation MUST obey these rules.

### 3.1 Competitor independence

Do not use:

- other runners' times
- finishing position
- winner time
- median race time
- field strength
- number of participants
- historical athlete results
- historical race coefficients
- comparable-race populations
- competitor-relative normalization

### 3.2 Athlete independence

The fundamental score MUST NOT require:

- VO₂max
- lactate threshold
- heart rate
- body mass
- training history
- previous OTRI scores
- fatigue estimates
- individualized physiological parameters

### 3.3 Determinism

For the same:

```text
GPX bytes
+ GPX processing version
+ course version
+ OTRI model version
+ finish time
```

the result MUST be identical.

### 3.4 No hidden race calibration

Observed race results may be used by a separate validation system, but never as a hidden input to the official score calculation.

---

# 4. Course Input

The preferred source is an official race GPX.

Minimum required information:

```text
latitude
longitude
elevation
track order
```

The official course metadata should also retain:

```text
course_id
course_version
event_id
source
source_url where applicable
source_timestamp
original_file_hash
processing_version
model_version
```

The GPX itself should be preserved as immutable source data.

---

# 5. GPX Processing Pipeline

The GPX-processing pipeline MUST be deterministic and versioned.

```text
Raw GPX
 ↓
Parse track points
 ↓
Remove invalid coordinates
 ↓
Remove duplicate consecutive points
 ↓
Calculate geographic distance
 ↓
Normalize elevation
 ↓
Filter obvious elevation outliers
 ↓
Construct deterministic segments
 ↓
Calculate segment grades
 ↓
Calculate course demand
```

Do not use an external service during score calculation.

---

# 6. Distance Calculation

Calculate horizontal ground distance between consecutive geographic points using a geodesic/Haversine calculation or another explicitly documented Earth-distance algorithm.

The implementation must use one method consistently.

Let:

```text
d_i = horizontal distance of segment i in metres
```

The total physical course distance is:

```text
D_physical = Σ d_i
```

Do not use the race website's advertised distance as a substitute for GPX-derived distance in the mathematical engine.

Advertised distance can be retained as metadata.

---

# 7. Elevation Processing

Elevation is often noisy in consumer GPS files.

The implementation therefore needs a deterministic elevation-processing step before gradients are calculated.

V0 requirements:

1. Remove impossible/non-finite elevation values.
2. Detect obvious isolated elevation spikes.
3. Apply a deterministic smoothing method.
4. Record the exact processing parameters.
5. Keep raw elevation available for audit purposes.

The smoothing method must not be changed silently.

Recommended initial implementation:

```text
processed_elevation = deterministic_rolling_median_then_mean(raw_elevation)
```

The exact window length must be a configurable, versioned parameter and benchmarked during validation.

Do not tune this parameter separately for individual races.

---

# 8. Segment Resolution

V0 should resample the processed course into approximately **20 metre target segments**.

Target segment length:

```text
20 m
```

The segment length is a model parameter and MUST be stored as part of the course-processing version.

During research, compare 10 m, 20 m and 50 m versions for numerical stability. V0 should use one fixed production resolution after that comparison.

The score engine itself must not dynamically choose a segment size per course.

---

# 9. Segment Representation

Each segment should contain at minimum:

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

Optional diagnostic fields:

```text
rolling_grade
cumulative_ascent_m
cumulative_descent_m
course_position_fraction
```

---

# 10. Grade Calculation

For segment `i`:

```text
g_i = Δh_i / d_i
```

where:

- `Δh_i` = elevation change in metres
- `d_i` = horizontal segment distance in metres

Example:

```text
+2 m over 20 m

significant grade = 2 / 20 = 0.10

= +10%
```

Use decimal grades in the equations:

```text
+10% → 0.10
-10% → -0.10
```

Do NOT pass `10` into the Minetti polynomial when the intended grade is +10%. The polynomial expects decimal slope.

---

# 11. Gradient-Cost Function

V0 uses the published Minetti et al. running energy-cost relationship as the initial physical basis.

```text
C(g) = 155.4g^5
     - 30.4g^4
     - 43.3g^3
     + 46.3g^2
     + 19.5g
     + 3.6
```

where `g` is decimal grade.

The model was developed from experimental measurements of walking/running energy cost across steep gradients and demonstrates strongly asymmetric uphill/downhill behavior. citeturn561822search0turn561822search1

The equation should initially be implemented exactly as published.

---

# 12. Gradient-Cost Normalization

At level grade:

```text
C(0) = 3.6
```

Define:

```text
R(g) = C(g) / C(0)
```

Therefore:

```text
R(0) = 1
```

This means a level segment contributes its physical distance directly to course demand.

A positive or negative gradient modifies the segment contribution according to the published energy-cost curve.

---

# 13. Course Demand

For all segments:

```text
D = Σ [d_i × R(g_i)]
```

where:

- `d_i` = segment distance in metres or kilometres
- `R(g_i)` = normalized gradient cost
- `D` = total modeled course-demand distance

Use one distance unit throughout the entire calculation.

Recommended production unit:

```text
kilometres
```

Then:

```text
D = modeled demand in kilometres
```

The term "kilometres" here means **modeled demand-equivalent kilometres**, not necessarily literal geographic distance.

Example:

```text
flat 10 km course
D = 10.0
```

A hilly course can produce a greater or lower modeled demand depending on its complete gradient profile.

---

# 14. Important Constraint on the Gradient Model

The Minetti relationship has an experimentally supported domain and should not be blindly extrapolated to arbitrary trail grades.

Therefore the implementation MUST define a model domain.

Initial engineering rule:

```text
validated_gradient_min = -0.45
validated_gradient_max = +0.45
```

because the cited Minetti experiment covered approximately -45% to +45% grade. citeturn561822search0turn561822search1

Do not silently extrapolate beyond the supported domain.

If a GPX segment is outside the production domain:

```text
mark segment as out_of_domain
```

and return a course-quality warning.

For the first implementation, do NOT invent a new extension formula. The course should be flagged for review rather than creating unexplained behavior.

---

# 15. Why No Separate Elevation Multiplier?

Do not add another arbitrary factor such as:

```text
+ elevation_gain × 0.25
```

or:

```text
+ ascent / 100
```

The purpose of the gradient-cost integral is to make the complete elevation profile matter through the segment gradients themselves.

Two courses with the same distance and elevation gain can therefore receive different modeled demands if their elevation distributions differ.

---

# 16. Uphill and Downhill

Do not transform downhill into positive elevation or take absolute gradient before calculating cost.

Keep the sign:

```text
+0.10 ≠ -0.10
```

The polynomial naturally produces different costs for uphill and downhill gradients.

This is a required part of the model.

---

# 17. Course Demand Output

The course-processing function should return:

```json
{
  "course_id": "...",
  "course_version": "...",
  "model_version": "otri-v0.1.0",
  "physical_distance_km": 0,
  "elevation_gain_m": 0,
  "elevation_loss_m": 0,
  "segment_count": 0,
  "course_demand_km": 0,
  "gradient_domain_valid": true,
  "quality_flags": []
}
```

Do not round `course_demand_km` before score calculation.

---

# 18. Performance Rate

Given a finish time `T` in hours:

```text
Q = D / T
```

where:

- `D` = modeled course demand in km-equivalent units
- `T` = finish time in hours
- `Q` = modeled demand rate in units/hour

For example:

```text
D = 30.0
T = 2.5 h

Q = 30 / 2.5
Q = 12.0 units/hour
```

No competitor data is involved.

---

# 19. OTRI Score Scale

V0 uses a bounded 0–1000 logarithmic scale.

Central reference:

```text
Q_500 = 15.0 units/hour
```

Upper reference:

```text
Q_1000 = 22.5 units/hour
```

These are explicit OTRI design conventions, not population averages, world records, ITRA values, UTMB values, or observed competitor statistics.

The ratio is:

```text
22.5 / 15.0 = 1.5
```

---

# 20. Logarithmic Score Function

Define:

```text
K = 500 / ln(1.5)
```

Numerically:

```text
K ≈ 1233.151
```

Then:

```text
OTRI_raw = 500 + K × ln(Q / 15.0)
```

or:

```text
OTRI_raw = 500 + 1233.151 × ln(Q / 15.0)
```

This guarantees:

```text
Q = 15.0 → OTRI = 500
Q = 22.5 → OTRI = 1000
Q = 10.0 → OTRI = 0
```

The logarithmic structure means equal multiplicative changes in modeled performance rate create equal score changes.

---

# 21. Meaning of 100 OTRI Points

From the construction:

```text
performance factor for +100 points
= 1.5^(100/500)
≈ 1.08447
```

Therefore:

> **Every 100 OTRI points represents approximately an 8.45% multiplicative difference in modeled performance rate.**

This is a property of the chosen scale, not a claim that real-world athletes differ by exactly 8.45% between score categories.

---

# 22. Final Public Score

The mathematical score may fall below 0 or above 1000.

Official V0 behavior:

```text
OTRI_raw < 0
    → OTRI = 0

0 ≤ OTRI_raw ≤ 1000
    → OTRI = round(OTRI_raw)

OTRI_raw > 1000
    → OTRI = 1000
```

Equivalent pseudocode:

```python
raw = 500 + K * math.log(Q / 15.0)
score = round(max(0.0, min(1000.0, raw)))
```

The implementation should retain `raw` internally for audit/debug output.

The published score is an integer from 0 through 1000.

---

# 23. Pre-Race Target Time

Given a desired score `S`:

```text
Q(S) = 15.0 × exp((S - 500) / K)
```

Then:

```text
T_hours(S) = D / Q(S)
```

where:

```text
K = 500 / ln(1.5)
```

Thus:

```text
Q(S) = 15.0 × exp((S - 500) / 1233.151)

T_hours(S) = D / Q(S)
```

This is the exact inverse of the post-race score equation.

---

# 24. Pre-Race Example

Suppose the course engine returns:

```text
D = 30.0 demand-km
```

For target OTRI 600:

```text
Q(600)
= 15 × exp((600 - 500) / 1233.151)
≈ 16.27 units/hour
```

Then:

```text
T = 30 / 16.27
≈ 1.844 hours
≈ 1:50:38
```

The exact implementation should use full floating-point precision and only round the displayed time.

---

# 25. Post-Race Example

Given:

```text
D = 30.0
T = 1.844 hours
```

calculate:

```text
Q = 30 / 1.844
```

then:

```text
OTRI_raw = 500 + 1233.151 × ln(Q / 15)
```

The result should return approximately the original target score, subject only to the precision of the input time and final integer rounding.

---

# 26. No Separate Race-Time Formula

Do not create one algorithm for:

```text
pre-race prediction
```

and another for:

```text
post-race scoring
```

There is exactly one mathematical relationship:

```text
Course Demand ↔ Performance Rate ↔ OTRI
```

The application merely evaluates the relationship in opposite directions.

---

# 27. No Runner Modeling

Do not implement:

```text
VO2max model
fatigue model
critical speed model
lactate model
heart-rate model
energy depletion model
pacing simulation
virtual athletes
Monte Carlo athlete populations
```

Those are outside the fundamental V0 scoring model.

The same course and finish time must produce the same score for every runner.

---

# 28. Weather

Weather must not modify the fundamental V0 score.

Record weather separately if available:

```text
temperature
humidity
wind
rain
surface conditions
```

but do not apply a hidden weather coefficient.

The score remains:

```text
course model + finish time
```

---

# 29. Technical Terrain

Do not introduce a subjective technicality coefficient in V0.

Do not implement:

```text
technicality = 1.20
```

unless the variable has a documented, independently reproducible measurement method and a separately approved future model version.

Research shows that terrain technicity can affect oxygen cost and biomechanics, but measuring it objectively is a separate research problem. citeturn523951search7

For V0:

```text
technical terrain = not directly modeled
```

---

# 30. Why This Is Not a Traditional Race Index

Traditional race-relative approaches can use observed results to estimate race difficulty.

OTRI V0 deliberately does not.

The official score should never require:

```text
similar races
previous runners
race rankings
field strength
winner performance
```

UTMB documentation describes a statistical process involving similar races, prior performances and regression. ITRA documents a race-result-derived adjustment mechanism. OTRI V0 is intentionally structured differently. citeturn475247search3turn475247search2

---

# 31. What Real Race Data Is Allowed To Do

Observed race results are useful, but only outside the official calculation.

Allowed uses:

```text
model validation
error analysis
sensitivity analysis
course-model research
comparison of alternative equations
```

Not allowed:

```text
race-specific coefficient fitting
hidden calibration
competitor normalization
post-hoc score adjustment
```

If validation demonstrates a problem with V0, publish a new model version rather than silently changing the calculation.

---

# 32. Course Versioning

A course must have a version identifier.

Example:

```text
course_id: CM1-20K
course_version: 2026.1
```

If the course changes materially:

```text
course_version: 2027.1
```

A historical result must remain linked to the exact course version used to calculate it.

---

# 33. GPX Integrity

For reproducibility, calculate and retain:

```text
SHA-256(raw_gpx)
```

Example record:

```json
{
  "gpx_sha256": "...",
  "course_id": "CM1-20K",
  "course_version": "2026.1",
  "processing_version": "gpx-v0.1",
  "model_version": "otri-v0.1.0"
}
```

A future recalculation should always be able to identify the exact source file.

---

# 34. Course Quality Flags

The course engine should return warnings instead of silently producing questionable values.

Possible flags:

```text
LOW_POINT_DENSITY
MISSING_ELEVATION
ELEVATION_OUTLIERS
EXCESSIVE_ELEVATION_NOISE
GRADIENT_OUT_OF_DOMAIN
DUPLICATE_POINTS
SHORT_TRACK
INVALID_GEOMETRY
```

A production API should be able to mark a score as:

```text
valid
review_required
invalid
```

based on explicitly documented rules.

---

# 35. Numerical Precision

Use floating-point precision throughout the calculation.

Do not round:

```text
grade
segment cost
course demand
performance rate
raw score
```

until the final display/score stage.

Recommended:

```text
Python: float / Decimal only where audit requirements justify it
JavaScript/TypeScript: Number for calculation with careful handling
```

The exact implementation language may vary, but all platforms must use identical formulas and units.

---

# 36. Reference Implementation Pseudocode

```python
import math

K = 500.0 / math.log(1.5)
Q500 = 15.0


def gradient_cost(g: float) -> float:
    return (
        155.4 * g**5
        - 30.4 * g**4
        - 43.3 * g**3
        + 46.3 * g**2
        + 19.5 * g
        + 3.6
    )


def normalized_gradient_cost(g: float) -> float:
    return gradient_cost(g) / 3.6


def course_demand(segments) -> float:
    total = 0.0
    for segment in segments:
        total += segment.distance_km * normalized_gradient_cost(segment.grade)
    return total


def performance_rate(course_demand_km: float, finish_time_hours: float) -> float:
    if course_demand_km <= 0:
        raise ValueError("Course demand must be positive")
    if finish_time_hours <= 0:
        raise ValueError("Finish time must be positive")
    return course_demand_km / finish_time_hours


def score_raw(q: float) -> float:
    if q <= 0:
        raise ValueError("Performance rate must be positive")
    return 500.0 + K * math.log(q / Q500)


def score_public(q: float) -> int:
    raw = score_raw(q)
    return round(max(0.0, min(1000.0, raw)))


def score_from_time(course_demand_km: float, finish_time_hours: float) -> dict:
    q = performance_rate(course_demand_km, finish_time_hours)
    raw = score_raw(q)
    score = round(max(0.0, min(1000.0, raw)))
    return {
        "course_demand_km": course_demand_km,
        "finish_time_hours": finish_time_hours,
        "performance_rate": q,
        "otri_raw": raw,
        "otri": score,
    }


def performance_rate_for_score(score: float) -> float:
    if not 0 <= score <= 1000:
        raise ValueError("Target score must be between 0 and 1000")
    return Q500 * math.exp((score - 500.0) / K)


def target_time_for_score(course_demand_km: float, score: float) -> float:
    q = performance_rate_for_score(score)
    return course_demand_km / q
```

The code above is a reference specification. It does not replace the need for robust GPX parsing, validation and tests.

---

# 37. Exact Pre-Race/ Post-Race Inverse Test

For every target score used in tests:

```python
for score in [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]:
    target_time = target_time_for_score(D, score)
    result = score_from_time(D, target_time)
    assert abs(result["otri_raw"] - score) < tolerance
```

Use the same underlying floating-point value, not a human-rounded display time, for the strict mathematical test.

A second test can check realistic displayed second-level times and verify that the public score remains within the expected rounding tolerance.

---

# 38. Mandatory Unit Tests

## Gradient

```text
C(0) == 3.6
R(0) == 1.0
R(+grade) != R(-grade)
```

## Course

```text
flat course → D approximately physical distance
longer course → D does not decrease solely because of added distance
```

## Monotonicity

For the same course:

```text
faster time → higher raw score
slower time → lower raw score
```

## Determinism

```text
same input → byte-for-byte same result fields where applicable
```

## Anchors

```text
Q=10.0  → raw ≈ 0
Q=15.0  → raw ≈ 500
Q=22.5  → raw ≈ 1000
```

## Boundaries

```text
very low Q → public score 0
very high Q → public score 1000
```

## Inverse

```text
score → target time → raw score
```

must recover the original score within numerical tolerance.

---

# 39. Course-Demand Stability Tests

The implementation should calculate a given course at multiple segment resolutions:

```text
10 m
20 m
50 m
```

and compare:

```text
D_10
D_20
D_50
```

The selected production resolution must be justified by numerical stability and computational practicality.

The score specification must record that chosen resolution.

---

# 40. Elevation Sensitivity Tests

Perturb the source elevation profile by small known amounts and verify that scores do not change catastrophically.

Test:

```text
+/- 0.5 m
+/- 1.0 m
+/- 2.0 m
```

in controlled benchmark courses.

The purpose is to understand GPX noise sensitivity, not to tune scores to observed races.

---

# 41. Benchmark Course Families

The validation suite should contain synthetic and real benchmark courses covering:

```text
flat
rolling
single sustained climb
multiple sustained climbs
steep ascent
steep descent
mixed mountain profile
same distance / different elevation distribution
same elevation / different gradient distribution
```

The real course dataset is a validation laboratory, not a scoring input.

---

# 42. Synthetic Courses

Create mathematical benchmark courses where the answer can be reasoned about exactly.

Examples:

```text
10 km at 0%
10 km at constant +5%
10 km at constant -5%
20 km alternating +5% / -5%
```

These are useful for regression tests because they eliminate uncertainty from GPS measurement.

---

# 43. Explanation Output

The scoring API should eventually return enough information for a UI to explain the result.

Example:

```json
{
  "otri": 612,
  "otri_raw": 611.73,
  "finish_time_seconds": 9447,
  "course_demand_km": 31.84,
  "performance_rate": 12.10,
  "course": {
    "physical_distance_km": 24.8,
    "elevation_gain_m": 1180,
    "elevation_loss_m": 1150,
    "segment_count": 1240
  },
  "model_version": "otri-v0.1.0"
}
```

The API should allow a later UI to show:

```text
Why this score?
```

without recalculating anything differently.

---

# 44. Course Difficulty Display

The public product may display:

```text
Physical distance
Elevation gain
Elevation loss
Course demand
Gradient distribution
```

Do not label the raw `D` value itself as a universally calibrated "difficulty score" until that interpretation has been separately validated.

`D` is first and foremost the modeled demand variable used by the scoring equation.

---

# 45. What the Scientific Literature Supports

The model's physical foundation is based on published evidence that running energy cost changes substantially as a function of gradient and does so asymmetrically for uphill versus downhill conditions. Minetti et al. provide the primary V0 equation. citeturn561822search0turn561822search1

Research in trained trail runners has also reported slope-dependent differences in running energy cost, supporting the decision to use a gradient-aware course representation rather than a simple distance-plus-elevation rule. citeturn523951search6

Trail technicity can alter physiological and biomechanical demands, but V0 intentionally excludes it because a reproducible objective technicality measurement is not yet established in this project. citeturn523951search7

Research on running performance models supports the use of power-law/logarithmic mathematical relationships as useful descriptions of performance, but V0 uses a deliberately simple explicit logarithmic score transform rather than fitting the public score to an external population. citeturn956357search0turn956357search1

---

# 46. Why V0 Uses D/T Instead of D^b/T

An earlier research candidate considered:

```text
Q = D^b / T
```

with an additional exponent `b`.

V0 does not use that exponent.

Reasons:

1. It introduces an additional arbitrary universal parameter.
2. It is not required to satisfy pre-race/post-race inversion.
3. It risks importing assumptions from distance-running datasets into a trail-course model.
4. `D/T` is directly interpretable as modeled course-demand completed per hour.
5. Fewer parameters make V0 easier to audit and falsify.

The power-law literature remains relevant research for future versions, but V0 should remain simpler unless validation demonstrates a clear need for a duration correction. citeturn956357search0turn956357search3

---

# 47. Why V0 Uses a Logarithmic Score

A logarithmic score transformation provides:

```text
equal multiplicative Q changes
        ↓
equal score changes
```

It also provides a mathematically smooth monotonic scale and makes it easy to define explicit reference points.

The important point is that the logarithm is the **shape of the score scale**. It does not claim that natural human performance is itself logarithmic in every context.

---

# 48. V0 Scale Conventions

V0 formally defines:

```text
Q500  = 15.0 units/hour
Q1000 = 22.5 units/hour
Q0    = 10.0 units/hour
```

The central reference is intentionally easy to interpret:

```text
15 modeled units/hour
```

On a perfectly flat course where `D` equals physical distance, this corresponds to 4:00/km.

The upper and lower points are mathematical scale conventions, not claims about current athlete populations.

---

# 49. Do Not Describe Scores as Population Percentiles

Do not say:

```text
600 = top 20%
700 = elite
800 = top 1%
```

unless a separate population analysis is eventually performed and explicitly introduced as a descriptive layer.

The core V0 number has a mathematical meaning, not a hidden percentile meaning.

---

# 50. API Contract

Recommended public calculation endpoint:

```text
POST /api/v1/score
```

Input:

```json
{
  "course_id": "CM1-20K",
  "course_version": "2026.1",
  "finish_time_seconds": 9932
}
```

Output:

```json
{
  "otri": 612,
  "otri_raw": 611.73,
  "performance_rate": 12.10,
  "course_demand_km": 31.84,
  "model_version": "otri-v0.1.0"
}
```

Target-time endpoint:

```text
POST /api/v1/target-time
```

Input:

```json
{
  "course_id": "CM1-20K",
  "course_version": "2026.1",
  "target_otri": 600
}
```

Output:

```json
{
  "target_otri": 600,
  "target_time_seconds": 9872,
  "target_time_hours": 2.7422,
  "course_demand_km": 31.84,
  "model_version": "otri-v0.1.0"
}
```

---

# 51. Database Fields

A stored OTRI result should retain at minimum:

```text
result_id
course_id
course_version
athlete_id if applicable
official_finish_time_seconds
course_demand_km
performance_rate
otri_raw
otri_public
model_version
processing_version
gpx_sha256
created_at
```

The athlete identity is administrative metadata only; it is not an input to the score calculation.

---

# 52. Recalculation

If the model changes:

```text
otri-v0.1.0
```

to:

```text
otri-v0.2.0
```

historical scores must not silently mutate.

Store the model version under which each score was produced.

A migration/recalculation should explicitly produce a new versioned result.

---

# 53. Validation Protocol

Real-world validation should use a held-out dataset where possible.

For each course:

1. Preserve the official GPX.
2. Calculate `D` without looking at race results.
3. Calculate the OTRI/time curve.
4. Compare predicted time standards with observed finish times.
5. Report errors by course profile.
6. Identify systematic failures.
7. Propose model changes separately.

Never tune the same race and then report that race as unbiased validation evidence.

---

# 54. Important Failure Modes

The implementation should explicitly flag:

### Very technical but low-elevation trails

The gradient-only V0 model may underestimate demand.

### Very steep runnable/non-runnable sections

Gradient energy cost does not automatically tell us whether running remains feasible.

### Aid-station/congestion effects

Official elapsed time can contain non-course factors.

### GPX elevation errors

Poor elevation data can materially change calculated gradients.

### GPX route errors

A wrong or outdated GPX produces a wrong course model.

These are reasons for future model improvement, not reasons for adding hidden coefficients to V0.

---

# 55. Recommended Repository Implementation

Suggested source layout:

```text
src/
  scoring/
    gradientCost.js
    courseDemand.js
    score.js
    targetTime.js
    validation.js
  gpx/
    parser.js
    cleaner.js
    resampler.js
    elevation.js
    segments.js
  models/
    v0_1.js
  types/
    course.js
    result.js
```

Suggested tests:

```text
tests/
  scoring/
    gradientCost.test.js
    courseDemand.test.js
    score.test.js
    targetTime.test.js
    inverse.test.js
  gpx/
    parser.test.js
    segmentation.test.js
    elevation.test.js
```

The exact language can differ, but the separation of responsibilities should remain.

---

# 56. Implementation Order

A coding agent should implement in this order:

```text
1. Mathematical constants
2. Gradient-cost function
3. Normalization
4. Segment model
5. Course-demand integration
6. Performance-rate calculation
7. Raw score calculation
8. Public score clamping/rounding
9. Target-time inversion
10. GPX parser
11. GPX cleaning
12. Resampling
13. Elevation processing
14. Grade calculation
15. End-to-end GPX score calculation
16. Test suite
17. API layer
```

Do not start with UI.

The mathematical engine must exist independently and be unit-testable.

---

# 57. Reference Calculation Flow

```text
raw GPX
  ↓
parse
  ↓
clean
  ↓
process elevation
  ↓
20 m resampling
  ↓
calculate signed grade
  ↓
validate gradient domain
  ↓
C(g)
  ↓
R(g) = C(g)/3.6
  ↓
D = Σ[d × R(g)]
  ↓
finish_time_hours
  ↓
Q = D/T
  ↓
OTRI_raw = 500 + 1233.151 ln(Q/15)
  ↓
clamp 0–1000
  ↓
round
  ↓
public OTRI score
```

---

# 58. Reference Target-Time Flow

```text
raw GPX
  ↓
course processing
  ↓
D
  ↓
target OTRI S
  ↓
Q = 15 × exp((S - 500)/1233.151)
  ↓
T = D/Q
  ↓
target finish time
```

---

# 59. Scientific Interpretation

The OTRI score should be described as:

> **A deterministic representation of finish-time performance relative to the modeled physical demand of a trail course.**

Do not describe it as:

- a physiological measurement
- a ranking percentile
- a measure of talent
- a measure of fitness independent of course
- a race-position score
- a weather-adjusted score

Those interpretations require additional models and are outside V0.

---

# 60. Current Scientific Limitations

This V0 specification intentionally uses a physical gradient-cost relationship as the course foundation. Published research supports the gradient dependence, but no single metabolic equation perfectly describes every real trail environment.

In particular, the model does not fully capture:

```text
technicality
surface
foot placement
obstacles
running feasibility on extreme slopes
trail width
crowding
aid stations
weather
mud/snow
```

Therefore V0 should be presented as a **research implementation**, not as a claim that the course-demand equation is universally exact.

---

# 61. Future Version Rules

Future additions must be introduced only as explicitly versioned changes.

Potential future research areas:

```text
objective technicality measurement
surface classification
terrain roughness
course geometry
altitude
weather context
better elevation processing
improved steep-slope treatment
```

A future feature must provide:

```text
definition
measurement method
equation
parameter source
validation protocol
failure cases
version number
```

No feature should enter the model only because it improves agreement with a particular race dataset.

---

# 62. V0 Definition of Done

The implementation is ready for internal testing when:

- GPX parsing is deterministic.
- Course segmentation is deterministic.
- Elevation processing is documented.
- Signed gradient is calculated correctly.
- Minetti cost is implemented exactly.
- Course demand is reproducible.
- Score calculation is deterministic.
- Target-time calculation is the inverse of score calculation.
- Score is monotonic with time.
- Public score is bounded 0–1000.
- Raw score is preserved.
- Course and model versions are stored.
- GPX SHA-256 is stored.
- All mathematical constants are documented.
- Unit tests cover the anchors and inverse relationship.
- Validation uses data separate from any parameter-selection process.

---

# 63. Final V0 Formula

## Course Demand

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6

R(g) = C(g) / 3.6

D = Σ[d_i × R(g_i)]
```

## Performance Rate

```text
Q = D / T_hours
```

## OTRI Raw

```text
K = 500 / ln(1.5)

OTRI_raw = 500 + K × ln(Q / 15.0)
```

## Public Score

```text
OTRI = round(clamp(OTRI_raw, 0, 1000))
```

## Score → Target Time

```text
Q(S) = 15.0 × exp((S - 500) / K)

T_hours(S) = D / Q(S)
```

---

# 64. Final Concept

The entire fundamental OTRI system can be summarized as:

```text
                COURSE
                   │
                   ▼
              official GPX
                   │
                   ▼
        deterministic segmentation
                   │
                   ▼
         gradient-aware course cost
                   │
                   ▼
           COURSE DEMAND (D)
                   │
             ┌─────┴─────┐
             │           │
       target score    finish time
             │           │
             ▼           ▼
        target time     Q = D/T
             │           │
             └─────┬─────┘
                   ▼
              OTRI 0–1000
```

The central OTRI rule remains:

> **For a fixed course version and model version, the same finish time produces the same score, regardless of who else ran the race.**

This specification is the implementation contract for OTRI V0.1.0.

---

# References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. *Energy Cost of Running in Well-Trained Athletes: Toward Slope-Dependent Factors.* 2021. DOI: 10.1123/ijspp.2021-0047. citeturn523951search6
3. *Effect of ground technicity on cardio-respiratory and biomechanical parameters in uphill trail running.* 2021. citeturn523951search7
4. Péronnet F, Thibault G. *Mathematical analysis of running performance and world running records.* Journal of Applied Physiology. 1989;67(1):453–465. citeturn956357search1
5. *Modelling of Running Performances: Comparisons of Power-Law, Hyperbolic, Logarithmic, and Exponential Models in Elite Endurance Runners.* 2018. DOI: 10.1155/2018/8203062. citeturn956357search0
6. Blythe DAJ, Király FJ. *Prediction and Quantification of Individual Athletic Performance of Runners.* PLOS ONE. 2016;11(6):e0157257. citeturn475247search3
7. World Athletics historical/current scoring documentation. citeturn475247search16turn416396search6
8. UTMB Index methodology documentation. citeturn475247search3
9. ITRA score methodology documentation. citeturn475247search2
