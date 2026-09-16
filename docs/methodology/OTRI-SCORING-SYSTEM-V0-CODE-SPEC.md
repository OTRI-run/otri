# OTRI Scoring System V0 — Code Specification

**Status:** Development / research implementation candidate  
**Version:** 0.2.0  
**Audience:** Developers and coding agents  
**Principle:** Course-relative, deterministic, competitor-independent

> **Implement this specification exactly. Do not invent hidden scoring variables.**

## 1. Goal

OTRI V0 answers two inverse questions:

1. Given an exact course GPX and a finish time, what OTRI score does that performance receive?
2. Given an exact course GPX and a desired OTRI score, what finish time corresponds to that score?

For a fixed course version and model version:

```text
same course + same finish time = same OTRI
```

The result must not depend on who else raced.

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

Real-world results are permitted only in a separate validation pipeline.

---

## 3. Model overview

```text
Official GPX
    ↓
Deterministic processing
    ↓
20 m segments
    ↓
Signed segment gradient
    ↓
Published gradient-cost function
    ↓
Course Demand D
    ↓
Finish time T
    ↓
Performance Rate Q = D / T
    ↓
Logarithmic score transformation
    ↓
OTRI 0–1000
```

Reverse direction:

```text
Desired OTRI
    ↓
Performance Rate Q(S)
    ↓
Course Demand D
    ↓
Target finish time
```

---

# 4. Important interpretation

`D` is an **OTRI modeled course-demand coordinate**.

It is not a literal measurement of total athlete metabolic energy expenditure.

The Minetti relationship is used as the physical basis for transforming the course gradient profile. It measures running energy cost at different slopes; it does **not** prove that its cost ratio is itself an exact race-time multiplier. citeturn492103search1turn492103search3

Therefore the code MUST describe `D` as a modeled demand-equivalent distance, not as measured human energy expenditure.

---

# 5. GPX input

Minimum required fields:

```text
latitude
longitude
elevation
track order
```

Retain immutable provenance:

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

The original GPX must remain available for audit.

---

# 6. GPX processing

The processing pipeline is fixed and deterministic:

```text
Raw GPX
 ↓
Parse track points
 ↓
Remove invalid coordinates
 ↓
Remove consecutive duplicates
 ↓
Calculate horizontal distance
 ↓
Process elevation
 ↓
Resample to target 20 m segments
 ↓
Calculate signed gradient
 ↓
Calculate gradient cost
 ↓
Sum course demand
```

No external service or live race database may be required to calculate a score.

---

# 7. Horizontal distance

Use one documented Earth-distance algorithm consistently.

V0 recommendation:

```text
WGS84 geodesic distance
```

The physical distance is:

```text
D_physical = Σ d_i
```

The advertised race distance is metadata only. It must not replace the GPX-derived distance inside the mathematical engine.

---

# 8. Elevation processing

Elevation noise must be processed deterministically before grades are calculated.

V0 initial pipeline:

```text
raw elevation
→ remove non-finite values
→ remove obvious isolated spikes
→ rolling median
→ rolling mean
```

Window sizes MUST be fixed model parameters and recorded with the processing version.

Do not tune them separately for individual races.

Raw elevation must remain available for audit.

---

# 9. Segment resolution

V0 target:

```text
20 metres
```

Resample along cumulative horizontal distance so segments are approximately 20 m long. Retain the final remainder rather than dropping it.

During research, compare 10 m, 20 m and 50 m for stability, but production V0 uses exactly one fixed resolution.

---

# 10. Segment data

Each segment must contain at least:

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

Optional diagnostics:

```text
cumulative_ascent_m
cumulative_descent_m
course_position_fraction
```

---

# 11. Grade

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
2 m rise over 20 m
2 / 20 = 0.10
```

Do not pass `10` to the gradient polynomial when the intended grade is +10%.

---

# 12. Gradient-cost function

V0 uses the published Minetti et al. running-cost polynomial:

```text
C(g) = 155.4g^5
     - 30.4g^4
     - 43.3g^3
     + 46.3g^2
     + 19.5g
     + 3.6
```

where `g` is decimal grade. Minetti et al. measured running cost over approximately `-0.45` to `+0.45` and found strong uphill/downhill asymmetry. citeturn492103search1turn492103search3

Normalize to level running:

```text
R(g) = C(g) / 3.6
```

so:

```text
R(0) = 1
```

The sign MUST be preserved:

```text
R(+0.10) ≠ R(-0.10)
```

---

# 13. Supported gradient domain

V0 does not silently extrapolate the Minetti polynomial.

Supported domain:

```text
-0.45 ≤ g ≤ +0.45
```

If any production segment lies outside this range:

```text
quality_flag = "gradient_out_of_supported_domain"
```

and scoring should stop with a course-review error.

Do not invent a fallback formula in V0.

---

# 14. Course Demand D

For every segment:

```text
segment_demand_i = d_i × R(g_i)
```

Then:

```text
D = Σ segment_demand_i
```

Use kilometres in the scoring layer.

```text
D_km = Σ [segment_distance_km × R(g_i)]
```

For a flat 10 km course:

```text
D_km = 10.0
```

No separate elevation multiplier may be added.

Do not add:

```text
ascent / 100
```

or any equivalent hand-built coefficient.

---

# 15. Why course structure is already represented

V0 does not separately add arbitrary terms for:

```text
number_of_climbs
maximum_climb
average_climb
```

The whole gradient sequence is already represented through the segment integral.

A future structural term requires its own research specification and independent validation.

---

# 16. Performance Rate Q

Given finish time `T` in hours:

```text
Q = D_km / T_hours
```

`Q` is the OTRI-defined performance coordinate.

It is deliberately not described as VO2, metabolic rate, running power or physiological fitness.

---

# 17. OTRI score scale

V0 uses a public integer scale:

```text
0–1000
```

The central reference is:

```text
Q_500 = 15.0 demand-km/hour
```

The upper reference is:

```text
Q_1000 = 22.5 demand-km/hour
```

Therefore:

```text
Q_1000 / Q_500 = 1.5
```

These are explicit OTRI scale conventions. They are not population averages, records, ITRA values or UTMB values.

---

# 18. Logarithmic scoring formula

Define:

```text
K = 500 / ln(1.5)
```

which is approximately:

```text
K = 1233.151...
```

Then:

```text
OTRI_raw = 500 + K × ln(Q / 15.0)
```

Equivalent Python:

```python
K = 500.0 / math.log(1.5)
otri_raw = 500.0 + K * math.log(q / 15.0)
```

By construction:

```text
Q = 10.0  → OTRI_raw = 0
Q = 15.0  → OTRI_raw = 500
Q = 22.5  → OTRI_raw = 1000
```

Because the scale is logarithmic, equal percentage changes in `Q` create equal score changes.

A 100-point change corresponds to:

```text
exp(100 / K)
≈ 1.08447
```

or approximately 8.45% in modeled performance rate.

---

# 19. Public score and clipping

Official V0 public score:

```python
score = round(max(0.0, min(1000.0, otri_raw)))
```

The unclipped value MUST be retained as:

```text
otri_raw
```

for audit/research.

The public score is always an integer from 0 through 1000.

---

# 20. Pre-race target time

For desired score `S`:

```text
Q(S) = 15.0 × exp((S - 500) / K)
```

Then:

```text
T_hours(S) = D_km / Q(S)
```

Python:

```python
q_target = 15.0 * math.exp((score - 500.0) / K)
target_hours = course_demand_km / q_target
target_seconds = target_hours * 3600.0
```

This is the exact inverse of the post-race equation.

---

# 21. Required symmetry tests

For a fixed course, test:

```text
score → target time → score
```

and:

```text
time → score → target time
```

The same mathematical definitions must be used in both directions.

---

# 22. Required invariants

The implementation must satisfy:

### Determinism

```text
same GPX
+ same processing version
+ same course version
+ same finish time
+ same model version
= same score
```

### Monotonicity

For the same course:

```text
faster time → higher score
slower time → lower score
```

### Flat-course identity

```text
flat GPX → D_km = physical_distance_km
```

### Gradient asymmetry

```text
positive and negative gradients must not be collapsed to |g|
```

---

# 23. Input validation

Reject:

```text
missing GPX
invalid coordinates
insufficient elevation
zero physical distance
zero course demand
missing finish time
finish time ≤ 0
non-finite values
unsupported gradient domain
```

Return structured machine-readable errors.

---

# 24. Output contract

Score output should contain at least:

```json
{
  "course_id": "COURSE-123",
  "course_version": "1",
  "model_version": "otri-v0.2.0",
  "physical_distance_km": 24.81,
  "elevation_gain_m": 1182.0,
  "elevation_loss_m": 1170.0,
  "segment_count": 1241,
  "course_demand_km": 31.47,
  "finish_time_seconds": 10240.0,
  "performance_rate": 11.044,
  "otri_raw": 320.7,
  "otri_score": 321,
  "quality_flags": []
}
```

Names may be adapted to existing API conventions, but the intermediate values must remain available for auditability.

---

# 25. Course diagnostics

Expose:

```text
physical_distance_km
course_demand_km
elevation_gain_m
elevation_loss_m
segment_count
minimum_grade
maximum_grade
percent_uphill
percent_downhill
```

Useful diagnostic decomposition:

```text
level_demand_km
uphill_demand_km
downhill_demand_km
```

These are diagnostics only. Do not turn them into additional score coefficients.

---

# 26. Explainability

The website should be able to show:

```text
OTRI: 612

Course demand: 31.8 km-equivalent
Finish time: 2:35:14
Performance rate: 12.28 demand-km/h

Course:
25.1 km
1,180 m ascent
1,170 m descent
```

A gradient profile should be available so users can inspect where course demand comes from.

---

# 27. No weather or technicality in V0

V0 does not use temperature, humidity, wind, rain, surface condition or subjective technicality in the fundamental score.

These may be stored as metadata or race context.

A future technical-terrain or environmental factor requires a separate research paper, measurement definition and model version.

---

# 28. No athlete model

The fundamental score does not require:

```text
VO2max
HRmax
threshold
weight
age
sex
fatigue
training load
```

These variables describe an athlete, while V0 is deliberately a **course + time** index.

---

# 29. Real-world validation

Observed race results are used only to test the model.

Validation may measure:

```text
MAE
median absolute error
RMSE
bias
error by distance
error by elevation
error by gradient distribution
```

Validation results must not silently change the score of an individual race.

A model change requires a new version and public documentation.

---

# 30. Required module structure

Recommended implementation:

```text
course/
  gpx_parser.py
  distance.py
  elevation.py
  segmentation.py
  gradient.py
  demand.py

scoring/
  constants.py
  score.py
  target_time.py

models/
  course.py
  result.py
  version.py

tests/
  test_gpx.py
  test_gradient.py
  test_demand.py
  test_score.py
  test_inverse.py
  test_edge_cases.py
```

Pure functions should be preferred:

```text
process_gpx(gpx) -> course
calculate_course_demand(course) -> D
calculate_score(D, finish_time) -> score
calculate_target_time(D, score) -> finish_time
```

---

# 31. Reference implementation

```python
import math

MIN_GRADE = -0.45
MAX_GRADE = 0.45
Q_500 = 15.0
Q_1000 = 22.5
K = 500.0 / math.log(Q_1000 / Q_500)


def gradient_cost(g: float) -> float:
    if not math.isfinite(g):
        raise ValueError("grade must be finite")
    if g < MIN_GRADE or g > MAX_GRADE:
        raise ValueError("grade outside supported domain")
    return (
        155.4 * g**5
        - 30.4 * g**4
        - 43.3 * g**3
        + 46.3 * g**2
        + 19.5 * g
        + 3.6
    )


def gradient_ratio(g: float) -> float:
    return gradient_cost(g) / 3.6


def calculate_course_demand(segments) -> float:
    demand_km = 0.0
    for segment in segments:
        demand_km += (
            segment.distance_km
            * gradient_ratio(segment.grade_decimal)
        )
    return demand_km


def calculate_score(course_demand_km: float,
                    finish_time_seconds: float) -> dict:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("invalid course demand")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("invalid finish time")

    time_hours = finish_time_seconds / 3600.0
    q = course_demand_km / time_hours
    raw = 500.0 + K * math.log(q / Q_500)
    public = round(max(0.0, min(1000.0, raw)))

    return {
        "performance_rate": q,
        "otri_raw": raw,
        "otri_score": public,
    }


def target_time_seconds(course_demand_km: float,
                        target_score: float) -> float:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("invalid course demand")
    if not math.isfinite(target_score) or not 0 <= target_score <= 1000:
        raise ValueError("target score must be 0..1000")

    q = Q_500 * math.exp((target_score - 500.0) / K)
    return (course_demand_km / q) * 3600.0
```

---

# 32. Engineering warning

Do not change this expression:

```text
D = Σ[d_i × R(g_i)]
```

to a different formula merely because the result looks surprising on a course.

If V0 produces a systematic problem, record it as a model limitation, validate it against independent data, and change the methodology through a new model version.

Do not introduce hidden corrections.

---

# 33. V0 boundaries

The following are intentionally NOT solved by V0:

```text
technical trail surface
weather
altitude adjustment
walking/running transitions
athlete physiology
fatigue
field strength
race calibration
ML correction
```

The purpose of V0 is to establish a clean, deterministic course-demand foundation.

---

# 34. Scientific status

This implementation combines:

1. A published slope-dependent running-cost function as the physical basis for the course-demand coordinate. citeturn492103search1turn492103search3
2. A deterministic GPX segmentation and integration procedure.
3. A transparent logarithmic transformation for the public OTRI scale.
4. An explicitly declared, competitor-independent reference scale.

The gradient-cost model is scientifically sourced; the transformation from gradient cost to OTRI course demand and the numerical score anchors are OTRI design choices and must be validated.

Running-performance research supports power-law/logarithmic mathematical descriptions but does not dictate a unique universal OTRI scale. citeturn492103search0

---

# 35. Acceptance criteria for coding agents

A coding agent may consider V0 implemented only when:

```text
[ ] GPX parser works
[ ] deterministic elevation processing works
[ ] 20 m segmentation works
[ ] signed gradient calculation works
[ ] Minetti polynomial implemented exactly
[ ] unsupported gradients fail explicitly
[ ] course demand is deterministic
[ ] score is deterministic
[ ] score is monotonic with time
[ ] 0/500/1000 anchors pass
[ ] clipping passes
[ ] pre/post inverse tests pass
[ ] raw score is retained
[ ] model and course versions are recorded
[ ] competitor/race-relative variables are absent
[ ] audit diagnostics are exposed
```

**This document is the source of truth for the OTRI V0 scoring implementation until superseded by a newer versioned methodology.**
