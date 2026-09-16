# OTRI V0 — Implementation Specification

**Status:** Research implementation candidate  
**Purpose:** Give an implementation AI a precise, modular specification for the first OTRI course-based scoring engine.  
**Important:** This is not OTRI 1.0. The score-scale calibration constants remain versioned research parameters and must not be silently fitted to race fields.

---

## 1. What should be implemented

Implement the **course-only** OTRI engine.

The engine takes:

```text
course GPX
finish time
OTRI model version
```

and returns:

```text
OTRI score
course difficulty metrics
calculation trace
```

It must also support the inverse calculation:

```text
course GPX
TARGET OTRI SCORE
        ↓
TARGET FINISH TIME
```

The pre-race and post-race calculations must use the same mathematical relationship.

---

## 2. Explicitly DO NOT implement

Do not use any of the following in the fundamental score:

- competitor results
- winner time
- field strength
- race participation count
- runner rankings
- runner history
- runner VO2max
- heart rate
- lactate
- fatigue model
- individualized physiology
- machine learning score prediction
- hidden race coefficients
- ITRA score
- UTMB Index
- placing
- race-specific empirical adjustments

Real-world results may later be used in a separate validation pipeline, but they must not alter the fundamental calculation for an individual result.

---

## 3. Mathematical architecture

The implementation has four layers:

```text
Layer 1: GPX processing
        ↓
Layer 2: segment course-demand calculation
        ↓
Layer 3: course time-performance transformation
        ↓
Layer 4: OTRI score conversion
```

Keep all four layers independent and unit-testable.

---

# 4. Layer 1 — GPX Processing

## 4.1 Input

Accept GPX track points with:

```text
latitude
longitude
elevation
optional timestamp
```

Do not require timestamp for scoring.

## 4.2 Clean track

Apply a deterministic pipeline:

1. Remove invalid coordinates.
2. Remove exact duplicate points.
3. Validate coordinate ranges.
4. Calculate horizontal distance between consecutive points using a geodesic/haversine implementation.
5. Calculate elevation difference.
6. Reject or flag impossible jumps according to documented thresholds.
7. Smooth elevation using the selected OTRI model configuration.
8. Resample to a target segment length.

The exact thresholds and smoothing parameters must live in a versioned configuration object, not scattered through application code.

## 4.3 Segment resolution

V0 should use:

```text
TARGET_SEGMENT_LENGTH_M = 20
```

but expose this as configuration.

The implementation must support testing at 10 m, 20 m and 50 m.

The final standardized value must be fixed in a future model release after stability testing.

---

# 5. Segment representation

Create a normalized segment object:

```ts
interface CourseSegment {
  index: number
  distance_m: number
  elevation_start_m: number
  elevation_end_m: number
  elevation_change_m: number
  grade: number
  cumulative_distance_m: number
  cumulative_gain_m: number
  cumulative_loss_m: number
}
```

Grade:

```text
grade = elevation_change_m / distance_m
```

Example:

```text
2 m rise / 20 m horizontal
= 0.10
= +10%
```

---

# 6. Layer 2 — Gradient Energy Model

Use the published Minetti running-cost relationship as the V0 physical basis.

Minetti et al. measured walking/running energy cost over slopes approximately from -45% to +45% and fitted a fifth-order polynomial to running cost. The resulting curve is asymmetric between uphill and downhill. See Minetti et al. (2002), DOI 10.1152/japplphysiol.01177.2001. citeturn582099search6

## 6.1 Running cost function

Use the grade `g` as a decimal fraction.

```text
Cr(g) =
  155.4*g^5
-  30.4*g^4
-  43.3*g^3
+  46.3*g^2
+  19.5*g
+   3.6
```

The function returns modeled running energy cost in J·kg⁻¹·m⁻¹.

Normalize to level running:

```text
M(g) = Cr(g) / Cr(0)
```

Because `Cr(0) = 3.6` for the published polynomial:

```text
M(g) = Cr(g) / 3.6
```

Do not replace the polynomial with a straight-line elevation multiplier.

---

# 7. Supported gradient range

The source experiment covered approximately:

```text
-45% ≤ grade ≤ +45%
```

Do not silently extrapolate outside this domain.

V0 behavior:

```text
if grade < -0.45:
    clamp to -0.45 and emit a model_warning

if grade > +0.45:
    clamp to +0.45 and emit a model_warning
```

Future versions may use a different treatment, including a dedicated hiking/very-steep model, but V0 must be deterministic.

---

# 8. Course Demand

For every segment:

```text
segment_demand_i = distance_i * M(grade_i)
```

Then:

```text
D = Σ segment_demand_i
```

Units:

```text
metres of flat-running-equivalent demand
```

Convert to kilometres only for display.

Example:

```text
D_km = D / 1000
```

This value is a **course-demand quantity**, not the OTRI score.

---

# 9. Why this is the foundation

The course-demand calculation uses the complete grade profile rather than only:

```text
total distance
+
total elevation gain
```

Consequently:

```text
Course A:
20 km / 1,000 m gain
```

and:

```text
Course B:
20 km / 1,000 m gain
```

can produce different demand values when their gradient distributions differ.

---

# 10. Optional V0 diagnostic metrics

Return these values for transparency:

```text
total_distance_km
total_gain_m
total_loss_m
mean_grade
max_grade
min_grade
steep_uphill_distance_m
steep_downhill_distance_m
course_demand_m
course_demand_km
```

Also provide a grade histogram by fixed bins for visualization, but do not use the histogram directly as a hidden score adjustment.

---

# 11. Layer 3 — Time Standard

The core scoring problem is to construct a universal score-performance relationship.

For a flat reference course, define:

```text
P(S) = reference flat pace for OTRI score S
```

Then transform that performance over the course.

The preferred V0 mathematical form is:

```text
T_course(S) = P(S) * D
```

where:

```text
P(S) = reference flat time per metre for score S
D    = course-demand metres
```

Equivalently, using seconds per kilometre:

```text
T_course_seconds(S) = P_flat_sec_per_km(S) * D_km
```

This produces a deterministic time for every score.

---

# 12. Score calculation

For an observed finish time `T`:

```text
P_observed = T / D_km
```

Then map that reference pace to the OTRI score:

```text
S = inverse_P(P_observed)
```

The same function must be used in reverse for pre-race planning:

```text
TargetTime = P(S) * D_km
```

Therefore:

```text
same GPX + same finish time + same model version
        =
same OTRI score
```

---

# 13. Score-scale research direction

The score scale should use a mathematical scoring curve rather than a race-field-relative lookup.

Research comparing performance models has found power-law relationships to be useful descriptions of running performance across distances, while also showing that model choice matters and that no simple power law should be assumed universal without testing. citeturn933944search3turn933944search8

Research on scoring systems also shows that progressive scoring can be represented mathematically rather than only as a lookup table. Grammaticos, Meloun and Purdy proposed a scoring function combining a Gompertz-type exponential component and a logarithmic component. citeturn612173search0turn612173search16

For OTRI V0, do not blindly copy either scoring system. Use their mathematical ideas as candidate forms and keep the OTRI score calibration parameters explicit and versioned.

---

# 14. Provisional OTRI score function

Until formal score-scale calibration is completed, implement a configurable logarithmic performance coordinate:

```text
Q = 1 / P_observed
```

where `P_observed` is seconds per kilometre.

Then:

```text
OTRI_raw = S0 + K * ln(Q / Q0)
```

Recommended configuration shape:

```json
{
  "score_scale": {
    "type": "log_performance",
    "score_anchor": 500,
    "reference_pace_sec_per_km": null,
    "points_per_ln_unit": null,
    "min_score": 0,
    "max_score": 1000
  }
}
```

**Do not invent the null values in production code.** The implementation should fail closed or mark the system as `research` until the score-scale paper supplies the approved constants.

This separation is deliberate: the GPX course model can be implemented and tested now without prematurely inventing the meaning of 500/600/700.

---

# 15. Score calibration requirements

Before OTRI 1.0, the project must explicitly publish:

```text
S0
Q0
K
minimum score behavior
maximum score behavior
```

The constants must be derived from a documented mathematical convention and/or a declared fixed reference standard.

They must not be fitted separately for individual races.

They must not be changed to improve one race's result distribution.

---

# 16. Important distinction: course model vs score calibration

These are independent:

```text
COURSE MODEL
GPX → D
```

and:

```text
SCORE SCALE
D + time → OTRI
```

This allows OTRI to change the score-scale convention in a future version without rewriting the GPX course-demand engine.

It also allows independent researchers to test alternative score scales against the same course-demand dataset.

---

# 17. Do not add race-relative correction

Never implement:

```text
race coefficient = f(participant results)
```

Never implement:

```text
winner adjustment
field-strength adjustment
median-runner adjustment
historical-course adjustment
```

Observed race results belong in a separate validation database.

---

# 18. Technical terrain

Do not add subjective technicality to V0.

GPX-derived gradient is measurable. Technicality is not sufficiently represented by the basic GPX alone.

Research shows that ground technicity can affect cardiorespiratory and biomechanical responses in trail running, so this is an important future research area. However, V0 should not fabricate an unexplained technicality coefficient. citeturn582099search11

---

# 19. Weather

Do not modify the fundamental OTRI score using observed race-day weather in V0.

Weather can be stored as contextual metadata:

```text
temperature
humidity
wind
precipitation
surface condition
```

but does not enter the score formula.

---

# 20. Course versions

Every course needs a stable version identifier.

```text
course_id
course_version
gpx_sha256
model_version
```

If the route changes materially:

```text
course_version 1
→
course_version 2
```

Do not silently overwrite the course model used for older results.

---

# 21. Required calculation trace

Every score calculation should be able to return a trace like:

```json
{
  "model_version": "otri-v0.1",
  "course_id": "example",
  "course_version": 1,
  "gpx_sha256": "...",
  "distance_km": 24.8,
  "gain_m": 1180,
  "loss_m": 1150,
  "course_demand_km": 31.72,
  "finish_time_seconds": 10200,
  "observed_reference_pace_sec_per_km": 321.31,
  "otri_score": null,
  "status": "score-scale-calibration-pending"
}
```

The `null` score is intentional until the score calibration constants have been formally approved.

---

# 22. Pseudocode

```python
def calculate_course_demand(gpx, config):
    points = clean_gpx(gpx, config)
    points = smooth_elevation(points, config)
    segments = resample(points, target_m=config.segment_length_m)

    demand_m = 0.0
    gain_m = 0.0
    loss_m = 0.0

    for s in segments:
        grade = s.elevation_change_m / s.distance_m
        grade_used = clamp(grade, -0.45, 0.45)

        cost = (
            155.4 * grade_used**5
            - 30.4 * grade_used**4
            - 43.3 * grade_used**3
            + 46.3 * grade_used**2
            + 19.5 * grade_used
            + 3.6
        )

        multiplier = cost / 3.6
        demand_m += s.distance_m * multiplier

        if s.elevation_change_m > 0:
            gain_m += s.elevation_change_m
        elif s.elevation_change_m < 0:
            loss_m += -s.elevation_change_m

    return CourseDemand(
        demand_m=demand_m,
        distance_km=sum(s.distance_m for s in segments) / 1000,
        gain_m=gain_m,
        loss_m=loss_m,
        segments=segments,
    )


def calculate_observed_reference_pace(finish_time_s, demand_km):
    if finish_time_s <= 0:
        raise ValueError("finish_time_s must be positive")
    if demand_km <= 0:
        raise ValueError("demand_km must be positive")
    return finish_time_s / demand_km


def score_from_time(finish_time_s, course_demand_km, score_config):
    pace = calculate_observed_reference_pace(
        finish_time_s,
        course_demand_km,
    )

    if score_config.reference_pace_sec_per_km is None:
        return ScoreResult(
            score=None,
            status="score-scale-calibration-pending",
            reference_pace_sec_per_km=pace,
        )

    q = 1.0 / pace
    q0 = 1.0 / score_config.reference_pace_sec_per_km
    raw = (
        score_config.score_anchor
        + score_config.points_per_ln_unit * math.log(q / q0)
    )

    score = clamp(raw, score_config.min_score, score_config.max_score)
    return ScoreResult(score=score, status="research")
```

---

# 23. Reverse calculation

Once score calibration is approved:

```python
def target_time_for_score(score, demand_km, score_config):
    q0 = 1.0 / score_config.reference_pace_sec_per_km

    q = q0 * math.exp(
        (score - score_config.score_anchor)
        / score_config.points_per_ln_unit
    )

    reference_pace = 1.0 / q
    return reference_pace * demand_km
```

This guarantees inverse consistency.

---

# 24. Core invariants

Automated tests must verify:

### Determinism

```text
same GPX
same model version
same time
→ same result
```

### Monotonicity

For the same course:

```text
faster time → higher score
slower time → lower score
```

### Inverse consistency

```text
score → target time → score
```

must reproduce the original score within numerical tolerance.

### Course independence from competitors

Adding/removing race participants must not change a score.

### Gradient symmetry must NOT be assumed

The model must produce different demand behavior for equal-magnitude positive and negative slopes when the polynomial does so.

### Segment stability

Reprocessing a GPX with small coordinate perturbations should not produce implausibly large changes.

---

# 25. Validation laboratory

Create a separate module/database for real race validation.

Input:

```text
official GPX
official finish times
course metadata
```

Output:

```text
predicted time / score relationship
actual time distribution
prediction error
bias
MAE
MAPE
```

This module must not modify the production scoring function automatically.

A model change requires a new version and a documented research decision.

---

# 26. Recommended project modules

Suggested implementation structure:

```text
src/
  course/
    gpxParser.*
    gpxCleaner.*
    elevation.*
    segmentation.*
    gradient.*

  scoring/
    minetti.*
    courseDemand.*
    scoreScale.*
    otriScore.*

  validation/
    metrics.*
    benchmarks.*

  models/
    otri-v0.1.json

  tests/
    courseDemand.*
    scoreScale.*
    inverseConsistency.*
```

Names may be adapted to the existing language/framework, but the separation of responsibilities should remain.

---

# 27. Model configuration

Use an explicit immutable model configuration.

Example:

```json
{
  "model_id": "otri-v0.1",
  "segment_length_m": 20,
  "gradient_clamp_min": -0.45,
  "gradient_clamp_max": 0.45,
  "energy_cost_model": "minetti-2002-running",
  "score_model": "log-performance-research",
  "score_scale_status": "calibration-pending"
}
```

Do not hard-code model constants outside the model-definition module.

---

# 28. Scientific references

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. The study measured running cost across approximately -45% to +45% slopes and provides the polynomial used as the V0 physical basis. citeturn582099search6

2. Vandewalle H. et al. *Modelling of Running Performances: Comparisons of Power-Law, Hyperbolic, Logarithmic, and Exponential Models in Elite Endurance Runners.* 2018. The study compares several performance-duration models and finds power-law/logarithmic approaches useful for long-distance extrapolation, while highlighting model limitations. citeturn933944search3turn933944search4

3. Grammaticos B, Meloun J, Purdy JG. *Distribution of performances and scoring in athletics.* Maths and Sports. 2022. The work examines mathematical links between performance distributions and scoring functions. citeturn612173search0

4. Grammaticos B, Meloun J, Purdy JG. *Scoring athletic performances.* The proposed progressive scoring function combines exponential/Gompertz and logarithmic terms and demonstrates that scoring can be represented by an explicit mathematical function rather than an opaque table. citeturn612173search16

5. Recent trail-running physics-based modeling research confirms that slope-dependent metabolic cost can be applied segment-by-segment to trail courses, while also showing that adding individual physiology and fatigue changes the problem into athlete-specific prediction. OTRI deliberately does not include those individual terms in the fundamental V0 score. citeturn582099search11

---

# 29. Implementation decision

## Implement now

```text
1. GPX parser
2. GPX cleaning
3. elevation normalization
4. 20 m segmentation
5. continuous gradient calculation
6. Minetti running-cost function
7. course-demand calculation
8. calculation trace
9. deterministic tests
10. validation tooling
```

## Do NOT finalize yet

```text
1. OTRI 500 anchor
2. OTRI 1000 anchor
3. logarithmic scale constant K
4. final score clipping behavior
```

Those belong to the score-scale research decision.

---

# 30. Final engineering rule

The implementation AI must not "improve" the formula by introducing additional variables simply because they improve correlation with historical results.

Any change to the fundamental score requires:

```text
scientific justification
+
mathematical specification
+
new model version
+
validation report
+
public documentation
```

The implementation should prefer a simple, explicit model over a more accurate but opaque model.

---

## Bottom line

The first production-quality engineering target is **not a complete final OTRI score**.

It is a deterministic engine that can reliably calculate:

```text
GPX
 ↓
segments
 ↓
gradient
 ↓
gradient-dependent energy cost
 ↓
course demand D
 ↓
reference performance pace
```

Then the score-scale research layer converts that reference performance into OTRI points.

This keeps the scientific course model stable while allowing the score scale to be researched and changed independently.
