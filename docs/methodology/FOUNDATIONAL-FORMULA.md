# OTRI Foundational Formula

**Status:** Proposed research foundation  
**Version:** 0.1  
**Purpose:** Define the simplest defensible mathematical foundation for OTRI before implementation

---

## 1. Executive Summary

The proposed OTRI foundation combines three ideas from the research candidates:

1. **Gradient Energy Cost (GECI)** as the physical basis for representing course demand.
2. **Grade-Adjusted Time (GATI)** as the mechanism that converts a performance standard into an expected time on the exact GPX.
3. **Course Structure (CSDI)** only as a limited, explicit extension for GPX-derived effects that are not adequately represented by the raw gradient-energy integral.

The fundamental OTRI score remains **course-relative, not competitor-relative**.

The model does not require:

- other competitors
- race-field strength
- previous runner results
- runner VO2max
- heart rate
- training history
- fatigue simulation
- machine learning
- race-specific statistical coefficients

The fundamental calculation is deterministic:

```text
GPX
 ↓
course segmentation
 ↓
gradient-dependent physical demand
 ↓
transparent course-difficulty model
 ↓
OTRI time-standard curve
 ↓
finish time ↔ OTRI score
```

For a fixed course version and model version:

```text
same GPX + same finish time = same OTRI
```

---

# 2. Why These Components Are Combined

## 2.1 GECI is the core

A segment-by-segment gradient-energy model is the strongest physical foundation because running cost changes continuously with slope and behaves differently uphill and downhill.

Minetti et al. measured running energy cost over approximately −45% to +45% grade and fitted a fifth-order polynomial to the running-cost relationship. Their published equation is:

```text
Cr(g) = 155.4g^5 − 30.4g^4 − 43.3g^3
         + 46.3g^2 + 19.5g + 3.6
```

where `g` is grade expressed as a decimal, e.g. `0.10` for +10%. The polynomial gives approximately 3.6 J·kg⁻¹·m⁻¹ on level ground and shows a strongly non-linear, asymmetric response to uphill and downhill gradients. citeturn747585search0turn747585search5

A 2026 secondary analysis of 23 studies also found a continuous relationship between graded running cost and slope, with downhill cost minimized near −18.8% and progressively weaker correlation between level and graded running cost at steeper slopes. citeturn650709search2

Therefore the fundamental course engine should be gradient-aware rather than based only on total distance and elevation gain.

---

## 2.2 GATI supplies the time-standard mechanism

The key innovation is not merely calculating an "equivalent distance." The result must directly produce a **course-specific time for every OTRI score**.

Let:

```text
P(S) = reference flat-course pace for OTRI score S
```

and let:

```text
M(g) = Cr(g) / Cr(0)
```

Then a first-order segment time model is:

```text
segment_time_i = d_i × P(S) × M(g_i)
```

and the full-course time standard becomes:

```text
T_course(S) = Σ [ d_i × P(S) × M(g_i) ]
```

This makes the relationship explicitly reversible:

```text
Target OTRI → target finish time
```

and:

```text
Observed finish time → OTRI
```

The same curve is used in both directions.

---

# 3. The Fundamental Course-Demand Variable

Define:

```text
D₀ = Σ d_i × M(g_i)
```

where:

- `d_i` is horizontal course distance represented by segment `i`
- `g_i` is the smoothed grade of segment `i`
- `M(g_i)` is the gradient cost relative to level running

`D₀` is an **energy-cost-equivalent distance** measured in metres of level-running demand under the chosen model.

It is not yet an OTRI score.

The important property is:

```text
flat course:
D₀ ≈ physical distance
```

while a hilly course has:

```text
D₀ > physical distance
```

when the aggregate gradient demand is greater than level running.

Because `M(g)` is non-linear, two courses with equal distance, equal ascent and equal descent can still produce different `D₀` values when their gradient distributions differ.

---

# 4. Why the Course Must Be Segmented

The input should be the complete course geometry rather than only headline statistics.

An initial implementation should test:

```text
10 m
20 m
50 m
```

segment resolutions and select a standard after stability analysis.

Each segment should contain at minimum:

```text
segment_id
distance
elevation_start
elevation_end
grade
cumulative_ascent
cumulative_descent
course_position
```

The elevation-processing and smoothing pipeline must be deterministic and versioned.

The model should be robust enough that modest changes in segment resolution or elevation noise do not create large score changes.

---

# 5. Gradient Cost Function

The first candidate is the published Minetti running-cost function:

```text
Cr(g) = 155.4g^5 − 30.4g^4 − 43.3g^3
         + 46.3g^2 + 19.5g + 3.6
```

with:

```text
Cr(0) = 3.6
```

Therefore:

```text
M(g) = Cr(g) / 3.6
```

This is attractive because it is:

- published
- explicit
- continuous
- reproducible
- independent of race results
- asymmetric for uphill and downhill

The formula should initially be restricted to the empirically supported gradient range and should not be silently extrapolated indefinitely. Minetti's study covered approximately −45% to +45%. citeturn747585search0

---

# 6. Important Limitation of a Pure Energy Model

A pure energy-cost integral is not automatically a perfect model of achievable trail-race speed.

At very steep gradients, several factors become important:

- the athlete may no longer run continuously
- downhill speed can be mechanically constrained
- technical terrain can impose constraints independent of slope
- abrupt gradient changes can make the course behave differently from a smooth gradient profile

The fundamental OTRI score should **not** solve these limitations with race-results-derived coefficients.

Instead, the first extension should be a transparent **course-structure term derived entirely from the GPX**.

---

# 7. Limited Course-Structure Extension

The preferred hybrid form is:

```text
D = Σ [ d_i × M(g_i) × S_i ]
```

where `S_i` is a structure multiplier.

For the initial model:

```text
S_i = 1
```

unless a specific structural correction is justified by independent research.

This is deliberate.

The first OTRI formula should **not** contain a large number of tunable coefficients.

Potential future structural variables include:

```text
climb continuity
climb fragmentation
gradient-change intensity
sustained steep-gradient exposure
```

If these are added, each must be:

1. computed from the GPX,
2. mathematically defined,
3. independently testable,
4. versioned,
5. published with its coefficient,
6. shown to improve validation without introducing race-specific fitting.

---

# 8. The Core Time Equation

Let:

```text
P(S) = flat reference pace for score S
D    = modeled course-demand distance
```

Then the simplest course time equation is:

```text
T_course(S) = D × P(S)
```

This is the central OTRI equation.

It means:

```text
OTRI score
    ↓
flat reference performance
    ↓
course demand transformation
    ↓
course finish-time standard
```

For an observed finish time `T_obs`, the score is the inverse:

```text
OTRI = P⁻¹(T_obs / D)
```

This is particularly attractive because the pre-race and post-race calculations are mathematically identical.

---

# 9. The Score Scale Is a Separate Problem

The course-demand model and the score scale should be kept separate.

The course engine answers:

> How physically demanding is this GPX relative to level running?

The score-scale engine answers:

> What flat-running performance corresponds to OTRI 500, 600, 700, etc.?

That separation is crucial because it prevents arbitrary scoring constants from becoming hidden course coefficients.

A final OTRI release should explicitly publish `P(S)`.

Possible forms to investigate include:

### A. Logarithmic velocity scale

```text
P(S) = P_ref × exp(−kS)
```

### B. Power-law scale

```text
v(S) = a × (S + b)^c
P(S) = 1 / v(S)
```

### C. Piecewise reference curve

```text
S ranges → published reference paces
```

For V0.x, the mathematical form should be selected by studying which gives the most useful scale properties rather than fitting it to a race-result database.

---

# 10. Required Properties of P(S)

Regardless of the selected functional form, the reference curve must satisfy:

### Monotonicity

```text
higher S → faster flat pace
```

### Smoothness

Small changes in score should produce small changes in time.

### Invertibility

A finish time should map to exactly one score.

### Stability

The curve should behave sensibly throughout the intended score range.

### Transparency

Its parameters must be public.

---

# 11. Example Without Locking the Final Scale

Suppose a hypothetical course produces:

```text
Physical distance = 30.0 km
Course-demand distance D = 43.5 km
```

Suppose a hypothetical score standard has:

```text
OTRI 600 flat pace = 4:00/km
```

Then:

```text
T_course(600)
= 43.5 × 4:00/km
= 2:54:00
```

A runner finishing in exactly that time would receive OTRI 600 under that model.

The number 43.5 km is only an illustrative course-demand result and 4:00/km is only an illustrative score-standard input. Neither should be treated as the final OTRI calibration.

---

# 12. Why This Is Better Than a Simple Distance + Elevation Formula

A simple formula might say:

```text
Equivalent distance = distance + ascent / constant
```

That treats every metre of climbing equally.

OTRI instead evaluates the entire gradient distribution:

```text
5% for 2 km
```

is different from:

```text
15% for 667 m
```

and:

```text
many short steep ramps
```

can be distinguished from:

```text
one sustained climb
```

because the underlying GPX segmentation preserves the course profile.

---

# 13. Downhill Treatment

Downhill should not be represented as negative ascent or a simple speed bonus.

The published gradient-cost relationship is non-linear and reaches a minimum running cost on moderately steep downhill grades before cost rises again at steeper negative gradients. citeturn747585search0turn650709search1

Therefore OTRI should allow the downhill contribution to emerge from the gradient-cost curve rather than imposing a manually chosen downhill discount.

A future structural cap may be necessary for extremely steep descents if validation demonstrates that the energy-only formulation predicts physically implausible times. Any such cap should be a published mathematical rule, not a race-specific correction.

---

# 14. Technical Terrain

Technical terrain should not be inserted into V0.1 as a subjective number.

Research indicates that ground technicity can change cardiorespiratory and biomechanical demands, but an objective universal terrain measurement remains a separate research problem. citeturn747585search3

Therefore:

```text
V0.1:
GPX gradient model only
```

Later versions may investigate measurable terrain descriptors such as:

```text
surface roughness
obstacle density
turn density
path variability
technical downhill exposure
```

A technicality term should only become part of the fundamental score once OTRI has a reproducible method for obtaining it.

---

# 15. Weather

Weather should initially be recorded as contextual metadata rather than secretly changing the fundamental score.

Examples:

```text
temperature
humidity
wind
rain
surface condition
```

If OTRI later introduces environmental adjustments, they should be separate, explicit and versioned.

The underlying course-time curve should remain reproducible without an observed field-strength correction.

---

# 16. Real Race Results

Real-world results are important for **validation**, but not for the fundamental definition of the score.

The correct workflow is:

```text
published research
      ↓
mathematical course model
      ↓
OTRI time standard
      ↓
real race validation
      ↓
error analysis
      ↓
possible published model revision
```

The incorrect workflow is:

```text
race results
      ↓
secret statistical correction
      ↓
race-specific score
```

The latter would reintroduce the competitor-relative dependency OTRI is intended to avoid.

---

# 17. Validation Tests

The foundational formula should be tested on courses with deliberately contrasting profiles.

### Distance controlled

Same distance, different elevation distributions.

### Elevation controlled

Same ascent, different gradient distributions.

### Gradient controlled

Similar gradient exposure, different course structures.

### Profile controlled

Similar total statistics, different sequencing of climbs and descents.

For each validation group calculate:

```text
bias
mean absolute error
median absolute error
RMSE
rank correlation
calibration error
```

The model should also be tested for:

```text
segment-resolution stability
elevation-noise stability
GPX resampling stability
course-version stability
```

---

# 18. The Most Important Validation Question

The key scientific test is not:

> Can OTRI predict a particular runner's finish time?

The key test is:

> **Can one course-derived model produce a stable relationship between course demand and finish time across materially different trail courses without using competitor-relative information?**

That is the hypothesis OTRI should attempt to falsify.

---

# 19. Recommended V0.1 Formula

The first implementation should therefore be:

```text
For each GPX segment i:

1. Calculate smoothed grade g_i
2. Calculate running cost Cr(g_i)
3. Calculate multiplier M(g_i) = Cr(g_i) / 3.6
4. Calculate demand contribution d_i × M(g_i)

Then:

D = Σ [d_i × M(g_i)]

Course time for score S:

T_course(S) = D × P(S)

Observed score:

OTRI = P⁻¹(T_obs / D)
```

This is the **minimum viable scientific formula**.

No other variables should enter the fundamental score until they earn their place through independent evidence.

---

# 20. Recommended V0.2 Extension

Only if V0.1 validation demonstrates systematic error related to course structure:

```text
D = Σ [d_i × M(g_i) × S_i]
```

where `S_i` is built from a small number of explicitly defined GPX structural features.

Possible features:

```text
sustained-climb factor
sustained-descent factor
gradient-transition factor
```

Each factor should be tested independently.

Avoid introducing several interacting correction factors simultaneously because that makes model attribution difficult.

---

# 21. What We Should Not Combine

The following candidate concepts should remain outside the fundamental score for now:

### Individual physiology

VO2max, threshold, running economy and body composition are established determinants of trail performance, but including them would answer a different question: personalized prediction rather than standardized performance scoring. citeturn650709search0turn650709search7

### Fatigue simulation

Useful for race-time prediction, but unnecessary for the fundamental course-time scoring relationship.

### Machine learning

Potentially useful for future GPX feature extraction or validation analysis, but not appropriate as the fundamental scoring mechanism.

### Competitor-relative calibration

Explicitly excluded.

### Race-specific coefficients

Explicitly excluded.

---

# 22. Why This Foundation Is Strong

The proposed model has five desirable properties:

1. **Physical:** the core course transformation is grounded in measured gradient-dependent running energetics. citeturn747585search0
2. **Deterministic:** identical course + identical time gives identical score.
3. **Pre-race capable:** a complete time↔score curve can be generated from a GPX before the race has results.
4. **Inspectable:** every course-demand contribution originates from a visible segment calculation.
5. **Independent:** competitor performance is not needed to establish the fundamental score.

---

# 23. Fundamental OTRI Definition

> **OTRI is a deterministic course-based performance index in which an observed finish time is evaluated against a published time standard derived from the physical demand of the exact course GPX.**

Or, operationally:

```text
OTRI = inverse_reference_pace(
    finish_time / course_demand
)
```

where:

```text
course_demand = Σ segment_distance × gradient_cost_ratio
```

This is the foundation to test before adding complexity.

---

# 24. Research Decision

The recommended path is therefore:

```text
GECI
  ↓
FOUNDATION
  +
GATI
  ↓
TIME ↔ SCORE ENGINE
  +
limited CSDI features only if validated
  ↓
OTRI V0.x
```

Do **not** combine all candidate indexes into one weighted average.

A weighted mixture of unrelated indexes would make the result harder to interpret and would create exactly the kind of hidden complexity OTRI is trying to avoid.

The best foundation is the smallest model that explains enough of the observed course-to-time relationship and can be improved transparently.

---

# References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. The study measured running and walking energy cost over approximately −45% to +45% gradient and published fifth-order polynomial fits. citeturn747585search0turn747585search5

2. Secondary analysis of graded-running metabolic cost literature. 2026. The analysis included 23 studies and found continuous slope-dependent behavior, including a downhill cost minimum near −18.8%. citeturn650709search2

3. Sabater Pastor F, et al. *Performance Determinants in Trail-Running Races of Different Distances.* International Journal of Sports Physiology and Performance. 2022. Trail performance was associated with multiple physiological variables, illustrating that athlete physiology is a distinct problem from the proposed course-standard model. citeturn650709search0

4. *Physiological Indicators of Trail Running Performance: A Systematic Review.* The review found associations between trail-running performance and variables including maximal aerobic capacity, lactate threshold and running economy. citeturn650709search7

5. *A Physics-Based Digital Twin for Trail Running Race Performance Prediction: A Proof-of-Concept Study.* 2026. Demonstrates the feasibility of GPX-based, gradient-aware trail models, but its individualized physiological/fatigue prediction objective is deliberately outside the fundamental OTRI score. citeturn747585search2turn747585search3
