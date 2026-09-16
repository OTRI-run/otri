# OTRI Course-Demand Formula — V0 Research Specification

**Status:** Proposed V0 foundation  
**Scope:** Deterministic course-only difficulty calculation from GPX  
**Principle:** Course-relative, competitor-independent, reproducible

---

## 1. Decision

OTRI V0 should use a **segment-based, gradient-dependent course-demand integral** as the foundation of course difficulty.

The core quantity is an equivalent horizontal-demand distance derived from the energetic cost of running at the local course gradient.

```text
D = Σ [ d_i × R(g_i) ]
```

where:

- `d_i` = horizontal distance of segment `i`
- `g_i` = processed grade of segment `i`
- `R(g_i)` = dimensionless gradient cost relative to level running
- `D` = total modeled course demand

`D` is **not** the athlete score. It is the course quantity used by the OTRI time-to-score model.

---

## 2. Why this foundation

A trail course cannot be adequately described by advertised distance and total elevation alone.

Two courses may both be:

```text
20 km
+1,000 m ascent
```

while having very different distributions of climbing and descending.

OTRI therefore models the complete elevation profile segment by segment.

The scientific basis is strong enough for a first physical model: running energy cost changes materially with gradient, and the relationship is nonlinear and asymmetric between uphill and downhill running. Minetti et al. measured running cost across approximately −45% to +45% slope; later work in trained trail runners measured markedly different costs at −15%, level and +15%. citeturn187845search0turn152714search0

A 2026 physics-based trail-running study also used Minetti's fifth-degree polynomial as the core terrain-dependent component of a more complex trail-performance model. OTRI uses the terrain component but deliberately excludes the paper's athlete-specific physiology, fatigue and pacing terms. citeturn187845search2

---

# 3. Course data requirements

The preferred source is an official course GPX.

The GPX should contain at least:

```text
latitude
longitude
elevation
```

The course-processing pipeline must also record:

```text
course_id
course_version
gpx_sha256
processing_version
model_version
```

The source GPX is immutable once a course version is published.

---

# 4. GPX processing pipeline

The processing pipeline is deterministic.

```text
Raw GPX
  ↓
validate points
  ↓
remove invalid / duplicate coordinates
  ↓
calculate cumulative horizontal distance
  ↓
process elevation
  ↓
resample course
  ↓
calculate segment grade
  ↓
calculate gradient cost
  ↓
sum segment demand
```

No race-result information enters this pipeline.

---

# 5. Distance calculation

For each consecutive GPX pair, calculate horizontal surface distance from geographic coordinates.

A geodesic or equivalent WGS84 distance calculation should be used consistently.

The implementation must not mix incompatible distance definitions inside one course model.

For each segment:

```text
d_i = horizontal distance
```

The final course distance is:

```text
D_distance = Σ d_i
```

The course-demand distance `D` is calculated separately.

---

# 6. Elevation processing

Raw GPX elevation can contain GPS/barometric noise. OTRI must therefore use a deterministic elevation-processing method.

V0 requirements:

1. Identify impossible elevation jumps.
2. Remove duplicate or invalid points.
3. Apply a documented smoothing method.
4. Preserve real sustained gradients.
5. Version the processing algorithm.

The exact smoothing filter should be selected after sensitivity testing.

The test should compare at least:

```text
raw
light smoothing
moderate smoothing
```

and determine whether course demand changes materially.

A recent physics-based trail model used a sliding-median filter for barometric profiles and then constructed course segments; this provides a practical precedent for explicit, deterministic elevation preprocessing. citeturn187845search2

---

# 7. Segment resolution

V0 should use **20 m target segments**.

Why 20 m:

- fine enough to preserve substantial gradient changes
- small enough to represent sustained steep sections
- computationally inexpensive
- easy to explain

This is a starting standard, not a claim that 20 m is biologically optimal.

The implementation must test:

```text
10 m
20 m
50 m
```

on representative courses.

The selected resolution should be retained only if the resulting course demand is stable.

If a course's score changes materially merely because the GPX was resampled differently, the method is not ready for release.

---

# 8. Grade calculation

For each segment:

```text
g_i = Δh_i / d_horizontal_i
```

where:

- `Δh_i` = processed elevation change
- `d_horizontal_i` = horizontal distance

Express grade as a decimal:

```text
+10% = +0.10
-10% = -0.10
```

The model must use the same grade definition everywhere.

---

# 9. Gradient-cost function

The V0 physical candidate is the Minetti running-cost relationship:

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3
     + 46.3g^2 + 19.5g + 3.6
```

where `g` is decimal slope.

At level:

```text
C(0) = 3.6
```

Normalize to level running:

```text
R(g) = C(g) / C(0)
```

Therefore:

```text
R(0) = 1
```

The model naturally produces different uphill and downhill costs because the polynomial is asymmetric.

Minetti et al. measured running cost over slopes from approximately −0.45 to +0.45 and found running cost to be about 3.40 J·kg⁻¹·m⁻¹ on level terrain, increasing strongly uphill and reaching a minimum around −20% downhill before increasing again at steeper negative slopes. citeturn187845search0

A 2026 secondary analysis of 23 studies similarly found a downhill minimum around −18.8% and reported that uphill running cost increased approximately linearly over the analysed positive-slope range. citeturn187845search1

---

# 10. Supported gradient range

The primary empirical source supports approximately:

```text
-45% ≤ grade ≤ +45%
```

Therefore V0 should **not extrapolate the polynomial indefinitely**.

Recommended behavior:

```text
if -0.45 <= g <= +0.45:
    calculate normally
else:
    mark the course model as unsupported
```

A course containing substantial sections beyond the validated range should not silently receive a normal score.

This is preferable to an arbitrary extrapolation that could create nonsensical course demand.

---

# 11. Segment demand

For each segment:

```text
demand_i = d_i × R(g_i)
```

Total course demand:

```text
D = Σ demand_i
```

The result has the units of a distance under the normalized cost model and can be interpreted as a **flat-equivalent demand distance**.

Example:

```text
Physical distance = 20.0 km
Course demand     = 27.4 km-equivalent
```

The second number does not mean the course is physically 27.4 km long. It means the model assigns the course the same normalized energetic demand as 27.4 km of level running under its reference relationship.

---

# 12. Why not simply use elevation gain?

A simple model such as:

```text
D = distance + elevation_gain / constant
```

has two major limitations:

1. It ignores downhill behavior.
2. It ignores how the same elevation can be distributed across very different gradients.

Research shows that downhill cost is not a mirror image of uphill cost, and that steep downhill mechanics differ materially from level and moderate downhill running. citeturn152714search8turn152714search4

OTRI therefore retains the full signed gradient profile.

---

# 13. Why not add arbitrary steepness penalties?

Do not begin V0 with terms such as:

```text
+ 10% for steepness
+ 5% for many climbs
+ 15% for difficult sections
```

unless each term has a separately justified mathematical basis.

A major strength of the initial OTRI model is that every segment is already affected continuously by its measured grade.

Adding unexplained multipliers would make the model harder to audit and easier to overfit.

---

# 14. Course structure

Course structure is still important.

However, V0 should measure it first rather than immediately giving it an arbitrary score multiplier.

The processing layer should calculate diagnostics such as:

```text
number of uphill sections
number of downhill sections
mean uphill grade
mean downhill grade
maximum sustained climb
maximum sustained descent
length of each climb
length of each descent
gradient variance
gradient-change rate
```

These values should be stored for research and displayed as course diagnostics.

They should not automatically alter `D` in V0.

This keeps the first formula minimal and gives us a clean experiment later:

```text
Base model
vs.
Base model + validated course-structure term
```

---

# 15. Technical terrain

Technical terrain is clearly relevant to trail running, but it should not be represented by a subjective coefficient in V0.

Experimental research has shown greater oxygen cost and substantially greater foot-acceleration magnitude/variability on trail terrain than treadmill running at otherwise matched conditions. citeturn152714search6

That establishes that terrain itself matters, but it does not yet give OTRI a universal GPX-only technicality coefficient.

Therefore V0 excludes subjective technicality.

Future research can investigate measurable variables such as:

```text
terrain roughness
surface variability
turn density
path width
obstacle density
foot-placement variability
```

A newer transparent mechanical-power model for trail/mountain running also proposes explicit components for uneven technical sections, demonstrating a possible direction for future objective terrain modelling. citeturn187845search7

---

# 16. Downhill treatment

The Minetti relationship is retained in V0 because it already captures the key nonlinearity:

```text
moderate downhill
    ↓
lower energetic cost

steeper downhill
    ↓
cost rises again
```

This is preferable to common simplistic rules in which every metre of descent merely subtracts difficulty.

The recent literature confirms that the minimum downhill energetic cost occurs roughly around −15% to −20%, with different mechanisms becoming important on steeper descents. citeturn187845search8turn187845search1

However, V0 should not claim that the Minetti curve perfectly predicts race pace on descents. It represents energetic cost, not all biomechanical constraints affecting speed.

---

# 17. Important limitation: energy cost is not race pace

This is the most important caveat in the course model.

`C(g)` measures energy cost per unit distance. It is not itself a measured race-time multiplier.

Therefore:

```text
R(g) = C(g)/C(0)
```

is a **physically motivated course-demand transformation**, not a proven universal time multiplier.

OTRI V0 should therefore describe `D` as:

> **modeled course demand**

rather than:

> exact energetic expenditure

or:

> exact equivalent race distance.

The distinction matters because outdoor trail conditions, foot placement and terrain can materially change movement cost beyond slope alone. citeturn152714search6

---

# 18. Proposed V0 course-demand formula

The complete initial formula is:

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3
     + 46.3g^2 + 19.5g + 3.6

R(g) = C(g) / 3.6

D = Σ [d_i × R(g_i)]
```

where:

```text
d_i = horizontal segment distance

g_i = processed decimal grade
D   = modeled course demand
```

This is the course layer only.

---

# 19. Connecting course demand to OTRI

Once `D` has been calculated, OTRI uses the performance-rate layer:

```text
Q = D / T_hours
```

and the current proposed score scale:

```text
OTRI_raw = 500 + (500 / ln(1.5)) × ln(Q / 15.0)
```

then:

```text
OTRI = round(clamp(OTRI_raw, 0, 1000))
```

The score-scale specification is documented separately in:

```text
OTRI-SCORE-SCALE-FINAL-V0.md
```

Keeping course demand separate from score scaling is intentional.

---

# 20. Pre-race calculation

Because course demand is known before the race, a runner can calculate a target time for any score.

Given desired OTRI `S`:

```text
Q(S) = 15.0 × exp((S - 500) / (500 / ln(1.5)))
```

Then:

```text
T_hours = D / Q(S)
```

This produces the target time.

Therefore:

```text
GPX
 ↓
D
 ↓
Desired OTRI
 ↓
Target time
```

And after the race:

```text
GPX
 ↓
D
 ↓
Actual finish time
 ↓
OTRI
```

The two directions use the same model.

---

# 21. What real race data is allowed to do

Real-world results are essential for evaluating whether the model is useful, but they must not be used as hidden score inputs.

Allowed:

```text
model validation
error measurement
sensitivity analysis
model comparison
course-model diagnostics
```

Not allowed:

```text
field-strength adjustment
winner-based adjustment
race-relative coefficient
historical competitor normalization
hidden calibration per race
```

This preserves OTRI's independence from competitor strength.

---

# 22. Validation design

The course-demand model should be tested against a large independent dataset of high-quality race GPXs and official finish times.

The validation question is not:

> Can we fit historical results as closely as possible?

It is:

> **Does the same physical course model behave sensibly across many different course profiles?**

Tests should include:

### Same distance, different elevation

Example:

```text
20 km / 200 m
20 km / 1,000 m
20 km / 1,800 m
```

### Same elevation, different distribution

```text
20 km / 1,000 m
```

with climbing distributed differently.

### Same distance/elevation, different gradient structure

```text
rolling
vs.
sustained climb/descent
```

### Downhill-heavy courses

Test whether the downhill part of the model behaves plausibly.

---

# 23. Stability tests

The following must be automated:

```text
10 m segmentation
20 m segmentation
50 m segmentation
```

and:

```text
raw elevation
light smoothing
moderate smoothing
```

The course demand should not be excessively sensitive to tiny technical processing choices.

Also test:

```text
±1 m elevation perturbations
small GPX point removal
GPS jitter
```

A robust course model should produce small changes under small perturbations.

---

# 24. Cross-course invariants

The implementation should test basic mathematical properties.

### Flat course

For a perfectly flat course:

```text
R(0) = 1
D = physical distance
```

### Uphill

Positive grade must increase modeled demand relative to the same horizontal distance at 0%.

### Moderate downhill

Moderate negative grades should reduce modeled metabolic cost relative to level running.

### Very steep downhill

Demand should eventually rise again in accordance with the source relationship.

### Monotonic score

For the same course:

```text
faster time → higher OTRI
```

---

# 25. Course difficulty output

The API/database should expose at least:

```json
{
  "course_distance_km": 20.0,
  "elevation_gain_m": 1000,
  "elevation_loss_m": 1000,
  "modeled_course_demand_km": 27.4,
  "model_version": "0.1"
}
```

The exact example value is illustrative.

The actual output must be calculated from the supplied GPX.

---

# 26. Explainability output

For each course OTRI should be able to expose:

```text
physical distance
modeled demand distance
uphill demand
level demand
downhill demand
```

and optionally:

```text
largest-demand segments
steepest segments
longest climbs
longest descents
```

Example:

```text
COURSE DEMAND

Physical distance        31.7 km
Modeled demand            42.1 km-equivalent

Level contribution        XX km
Uphill contribution        XX km
Downhill contribution      XX km
```

The decomposition should add back to the total `D`.

---

# 27. Why this is preferable to a single course coefficient

A single value such as:

```text
course_difficulty = 1.38
```

hides the reason for the value.

The OTRI demand integral can instead show:

```text
segment 001 → cost
segment 002 → cost
segment 003 → cost
...
```

This makes the course model inspectable and auditable.

---

# 28. Future extension: structural correction

Only after V0 validation should OTRI investigate whether course structure needs an additional term.

A possible future form is:

```text
D_final = D_gradient × S_structure
```

where `S_structure` could describe objectively measurable properties such as gradient variability or sustained climbing.

However, **S_structure must not be introduced merely because it improves correlation on one dataset**.

It needs:

```text
scientific basis
independent validation
transparent parameters
versioned release
```

Otherwise the base model remains preferable.

---

# 29. Future extension: terrain correction

A future model could theoretically become:

```text
D_final = D_gradient × S_surface × S_technical
```

but only after objective terrain measurements become available.

The goal is not to maximize formula complexity.

The goal is to add a term only when it explains a physical property of trail running that the existing model demonstrably misses.

---

# 30. V0 implementation pseudocode

```python
points = load_gpx(path)
points = validate_points(points)
points = clean_duplicates(points)
points = process_elevation(points)
segments = resample(points, target_length_m=20)

for segment in segments:
    distance_m = segment.horizontal_distance_m
    elevation_delta_m = segment.elevation_delta_m
    grade = elevation_delta_m / distance_m

    if grade < -0.45 or grade > 0.45:
        raise UnsupportedCourseGradient()

    cost = (
        155.4 * grade**5
        - 30.4 * grade**4
        - 43.3 * grade**3
        + 46.3 * grade**2
        + 19.5 * grade
        + 3.6
    )

    ratio = cost / 3.6
    segment.demand_m = distance_m * ratio

D = sum(segment.demand_m for segment in segments)
```

Then:

```python
Q = D / finish_time_hours

raw_score = 500 + (500 / log(1.5)) * log(Q / 15.0)

score = round(clamp(raw_score, 0, 1000))
```

---

# 31. Reference implementation requirements

A reference implementation should include automated unit tests for:

```text
level grade
positive grade
negative grade
extreme supported grade
unsupported grade
course summation
GPX resampling
score monotonicity
pre/post-race inverse
```

The model should use double precision for all intermediate calculations.

Do not round segment distance, grade, course demand, or performance rate before the final score.

---

# 32. Scientific limitations

The V0 model is intentionally not a complete physiological race simulator.

It does not attempt to model:

```text
VO₂max
lactate threshold
fatigue
fuel depletion
runner strength
individual pacing
running ability
technical skill
weather
competition
```

This is intentional.

OTRI's fundamental purpose is to construct a **course standard**, not to predict how a particular physiological profile will behave on race day.

---

# 33. Interpretation

The modeled course demand should be described as:

> **A deterministic representation of the physical running demand implied by the course's measured distance and gradient profile under the published gradient-cost relationship.**

It should not be described as an exact measurement of the total physiological cost experienced by every runner.

---

# 34. Recommended V0 formula

The current recommended OTRI V0 course model is therefore:

```text
1. Clean and normalize GPX

2. Resample at 20 m target segments

3. Calculate signed grade for each segment

4. Apply Minetti gradient-cost function

5. Normalize against level running

6. Integrate the segment costs

D = Σ[d_i × C(g_i)/C(0)]
```

Then the performance layer uses:

```text
Q = D / T_hours
```

followed by the current OTRI score-scale function.

---

# 35. Final V0 position

OTRI should **start with the simplest physically defensible course model** and only increase complexity when evidence shows that the existing model fails systematically.

The recommended order is:

```text
V0
Gradient-only course demand

↓

Validation

↓

V0.x research
Course structure terms, if justified

↓

Future
Objective technical/surface terms, if measurable
```

Do not begin with a large collection of arbitrary coefficients.

A smaller model whose every step can be explained is preferable to a more accurate-looking model that cannot be independently reproduced.

---

# References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn187845search0
2. Lemire M, Falbriard M, Aminian K, Millet GP, Meyer F. *Level, Uphill, and Downhill Running Economy Values Are Correlated Except on Steep Slopes.* Sports Medicine. 2021. citeturn152714search8
3. Bascuas I et al. *Energy Cost of Running in Well-Trained Athletes: Toward Slope-Dependent Factors.* International Journal of Sports Physiology and Performance. 2021;17(1). DOI: 10.1123/ijspp.2021-0047. citeturn152714search0
4. *Effect of ground technicity on cardio-respiratory and biomechanical parameters in uphill trail running.* 2021. citeturn152714search6
5. *A Physics-Based Digital Twin for Trail Running Race Performance Prediction: A Proof-of-Concept Study.* 2026. citeturn187845search2turn187845search3
6. *Mechanical power for trail and mountain running — Introduction of a parametric model.* 2025. citeturn187845search7
7. *Correlations Between the Metabolic Costs of Level and Graded Running: A Secondary Analysis of the Literature.* Sports Medicine. 2026. citeturn187845search1
