# OTRI Scoring System V0 — Code Specification

**Status:** Development / research implementation candidate  
**Version:** 0.3.0  
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

The V0 scale is intentionally **curved**: the ordinary-to-good range occupies useful space in the middle of the scale, while increasingly stronger performance requires disproportionately higher modeled performance rate. In particular, moving from 500 toward 1000 is deliberately much harder than moving from 200 toward 500.

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
50 m segments
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
Curved score transformation
    ↓
OTRI 0–1000
```

Reverse direction:

```text
Desired OTRI
    ↓
Curved target performance rate Q(S)
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
Resample to 50 m segments
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

V0 production resolution:

```text
50 metres
```

Resample along cumulative horizontal distance so segments are approximately 50 m long. Retain the final remainder rather than dropping it.

A 50 m production segment was selected after practical testing because 20 m segments were too sensitive to short-lived GPX/elevation noise and local micro-pitches. The 50 m segment is the current deterministic compromise between local gradient representation and stability.

During research, 20 m may remain as a comparison resolution, but it is **not** the V0 production resolution.

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
5 m rise over 50 m
5 / 50 = 0.10
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

# 17. OTRI score scale — curved V0.3

V0 uses a public integer scale:

```text
0–1000
```

The score curve is intentionally **nonlinear**.

The design anchors are:

```text
score 200 → Q = 11.0 demand-km/hour
score 500 → Q = 15.0 demand-km/hour
score 1000 → Q = 30.0 demand-km/hour
```

These are explicit OTRI scale conventions. They are not population averages, records, ITRA values or UTMB values.

The anchors create an important scale property:

```text
200 → 500:
Q increases from 11.0 to 15.0  (+36.4%)

500 → 1000:
Q increases from 15.0 to 30.0 (+100.0%)
```

Thus the top half of the score scale requires progressively greater modeled performance. The middle of the scale remains usable without making 500 an arbitrary elite-only threshold, while 1000 represents a genuinely exceptional modeled performance level.

The intention is that many ordinary/recreational performances can occupy roughly the 200–400 region, stronger runners move into the 400–600+ region, and the highest scores become progressively difficult to reach. This is a **scale-design hypothesis**, not an empirical claim about the runner population; validation must test it.

---

# 18. Curved score function

V0.3 defines the required performance rate for score `S` using a smooth exponential-quadratic curve:

```text
Q(S) = exp(A + B·S + C·S²)
```

with fixed published constants:

```text
A = 2.2351808956091976
B = 0.0007254607359190918
C = 0.0000004405557501338660
```

These constants are chosen so that, within floating-point tolerance:

```text
Q(200)  = 11.0
Q(500)  = 15.0
Q(1000) = 30.0
```

The curve is smooth and monotonic over the public scale. The rate of increase of required `Q` grows with score, which is the intended difficulty curve.

Representative values are:

```text
Score   Required Q (demand-km/h)
0       9.35
100     10.10
200     11.00
300     12.09
400     13.41
500     15.00
600     16.93
700     19.28
800     22.14
900     25.66
1000    30.00
```

The published constants and anchor table are part of the model version. Do not tune them per course, runner or race.

---

# 19. Score from finish time

Given a positive performance rate `Q`, recover the continuous score by solving:

```text
ln(Q) = A + B·S + C·S²
```

or:

```text
C·S² + B·S + (A - ln(Q)) = 0
```

Use the positive/upper root:

```text
S_raw = (-B + sqrt(B² - 4C(A - ln(Q)))) / (2C)
```

Then the public score is:

```python
score = round(max(0.0, min(1000.0, s_raw)))
```

The unclipped value MUST be retained as:

```text
otri_raw
```

for audit/research.

Perform numerical domain checks before evaluating the square root. Invalid/non-positive `Q` must be rejected.

---

# 20. Pre-race target time

For desired score `S`:

```text
Q_target = exp(A + B·S + C·S²)
```

Then:

```text
T_hours = D_km / Q_target
```

Python:

```python
q_target = math.exp(A + B * score + C * score * score)
target_hours = course_demand_km / q_target
target_seconds = target_hours * 3600.0
```

This is the exact inverse direction of the forward score curve.

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

Test at minimum:

```text
0
100
200
300
400
500
600
700
800
900
1000
```

The recovered continuous score should match the requested score within floating-point tolerance before public integer rounding.

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

### Curve monotonicity

For the public score range:

```text
higher score → higher required Q
```

and the increase in required Q must become progressively larger toward the top of the scale.

### Flat-course identity

```text
flat GPX → D_km = physical_distance_km
```

### Gradient asymmetry

```text
positive and negative gradients must not be collapsed to |g|
```

### Anchor identity

```text
score 200 ↔ Q 11.0
score 500 ↔ Q 15.0
score 1000 ↔ Q 30.0
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
non-positive performance rate
```

Return structured machine-readable errors.

---

# 24. Output contract

Score output should contain at least:

```json
{
  "course_id": "COURSE-123",
  "course_version": "1",
  "model_version": "otri-v0.3.0",
  "physical_distance_km": 24.81,
  "elevation_gain_m": 1182.0,
  "elevation_loss_m": 1170.0,
  "segment_count": 497,
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

Course demand: 31.8 demand-km
Finish time: 2:35:14
Performance rate: 12.28 demand-km/h

Course:
25.1 km
1,180 m ascent
1,170 m descent
```

A gradient profile should be available so users can inspect where course demand comes from.

The UI should also be able to explain the score curve:

```text
Your performance rate: 12.28
Score: 321

Score 200 requires: 11.00
Score 500 requires: 15.00
Score 1000 requires: 30.00
```

This makes the increasing difficulty of higher scores directly inspectable.

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

Validation MUST test at least:

```text
score distribution across recreational runners
score distribution across competitive runners
MAE
median absolute error
RMSE
bias
error by distance
error by elevation
error by gradient distribution
stability under GPX resampling
```

Special attention should be paid to whether the intended middle range (roughly 200–400) is useful for ordinary runners and whether the upper tail remains sparse and increasingly difficult to reach.

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

# V0.3 curved score scale.
SCORE_MIN = 0.0
SCORE_MAX = 1000.0
CURVE_A = 2.2351808956091976
CURVE_B = 0.0007254607359190918
CURVE_C = 0.0000004405557501338660


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
        if segment.distance_km <= 0:
            raise ValueError("segment distance must be positive")
        demand_km += segment.distance_km * gradient_ratio(segment.grade_decimal)
    if not math.isfinite(demand_km) or demand_km <= 0:
        raise ValueError("course demand must be positive and finite")
    return demand_km


def performance_rate(course_demand_km: float, finish_time_seconds: float) -> float:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("course_demand_km must be positive and finite")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be positive and finite")
    return course_demand_km / (finish_time_seconds / 3600.0)


def q_for_score(score: float) -> float:
    if not math.isfinite(score) or not SCORE_MIN <= score <= SCORE_MAX:
        raise ValueError("score must be between 0 and 1000")
    return math.exp(CURVE_A + CURVE_B * score + CURVE_C * score * score)


def score_for_q(q: float) -> float:
    if not math.isfinite(q) or q <= 0:
        raise ValueError("performance rate must be positive and finite")

    discriminant = CURVE_B**2 - 4.0 * CURVE_C * (CURVE_A - math.log(q))
    if discriminant < 0:
        raise ValueError("performance rate is outside the score-model domain")

    raw = (-CURVE_B + math.sqrt(discriminant)) / (2.0 * CURVE_C)
    return raw


def calculate_score(course_demand_km: float, finish_time_seconds: float) -> dict:
    q = performance_rate(course_demand_km, finish_time_seconds)
    raw = score_for_q(q)
    public = round(max(SCORE_MIN, min(SCORE_MAX, raw)))
    return {
        "performance_rate": q,
        "otri_raw": raw,
        "otri_score": public,
    }


def calculate_target_time(course_demand_km: float, score: float) -> float:
    q_target = q_for_score(score)
    time_hours = course_demand_km / q_target
    return time_hours * 3600.0
```

---

# 32. Versioning and reproducibility

The following MUST be stored with every official result:

```text
model_version
processing_version
course_version
original_file_sha256
```

Changing any of the following requires a new model/processing version as appropriate:

```text
segment length
 elevation smoothing
spike removal
gradient model
course-demand formula
score-curve constants
score inversion
clipping rules
```

Historical scores must not silently change.

---

# 33. V0 design summary

The complete V0 scoring model is:

```text
GPX
 ↓
WGS84 distance
 ↓
fixed elevation processing
 ↓
50 m segments
 ↓
signed gradient
 ↓
Minetti gradient-cost ratio
 ↓
course demand D
 ↓
Q = D / time
 ↓
curved Q(S) model
 ↓
OTRI 0–1000
```

The core design properties are:

```text
course-relative
competitor-independent
deterministic
inspectable
invertible
```

The score curve is deliberately designed so that the scale is useful in the middle and progressively harder toward the top, rather than treating 500→1000 as the same type of step as 200→500.

---

# 34. References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn492103search1turn492103search3
2. Vandewalle H. *Modelling of Running Performances: Comparisons of Power-Law, Hyperbolic, Logarithmic, and Exponential Models in Elite Endurance Runners.* BioMed Research International. 2018:8203062. citeturn492103search0

---

# 35. Important status note

This specification is an **OTRI V0 implementation candidate**, not a scientifically validated final scoring standard.

The following are explicitly OTRI design decisions requiring empirical validation:

```text
50 m segment resolution
course-demand construction
score anchors
curved score constants
public 0–1000 interpretation
```

The model must be validated against independent real-world race results before being described as authoritative.