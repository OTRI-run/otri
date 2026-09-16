# OTRI Research Paper — Defining the Time-to-Score Scale

**Status:** Research / proposed foundation  
**Version:** 0.1  
**Scope:** Definition of the universal OTRI performance scale  
**Principle:** Course-relative, deterministic, competitor-independent

---

## Abstract

The OTRI scoring system requires a universal performance scale: a mathematical relationship that turns a finish time on a modeled trail course into an OTRI score and, conversely, turns a desired OTRI score into a target time on that course.

The central design problem is not how to fit a score to historical race results. It is how to define a score scale that remains meaningful while the underlying race field is completely absent from the calculation.

This paper evaluates several possible constructions and proposes a research direction based on two separate layers:

1. **Course demand**, calculated from the GPX using a published, gradient-sensitive physical model.
2. **Performance level**, represented by an explicit, universal time-performance standard.

The recommended V0.x direction is to use a **power-law / logarithmic performance coordinate** for the universal time standard, combined with a dimensionless course-demand ratio. This is attractive because power-law relationships have a long history in distance-running performance research, while logarithmic transformations provide a simple monotonic score coordinate with diminishing changes in score for equal absolute changes in time.

However, the final numeric 0–1000 anchors should not yet be declared. They require an explicit OTRI convention and sensitivity analysis rather than being copied from ITRA, UTMB, VDOT, World Athletics, or any other existing scoring system.

---

# 1. OTRI Design Requirement

OTRI should satisfy the following fundamental rule:

> **For a fixed course version and OTRI model version, a given finish time always maps to the same OTRI score.**

Therefore:

```text
same GPX
+ same course model
+ same finish time
+ same OTRI version
= same score
```

The calculation must not require:

- other competitors
- field strength
- finishing position
- historical race results
- runner history
- previous OTRI scores
- physiological measurements
- race-specific regression coefficients

Observed race results may be used for independent validation, but not as a hidden input to the fundamental score.

---

# 2. Separate Course Demand from Performance Level

The proposed architecture is:

```text
                     GPX
                      │
                      ▼
               Course Analysis
                      │
                      ▼
               Course Demand D
                      │
            ┌─────────┴─────────┐
            │                   │
        desired OTRI S      finish time T
            │                   │
            └─────────┬─────────┘
                      ▼
              universal time
               performance law
```

The score should therefore be an inverse of a course-specific time standard:

```text
T = T_course(S, D)
```

and:

```text
S = inverse(T_course, T, D)
```

This gives OTRI its pre-race and post-race symmetry.

---

# 3. The Main Question: What Should 600 Mean?

A 0–1000 score is only useful if its meaning is mathematically defined.

It is not sufficient to say:

```text
500 = average
600 = good
700 = very good
800 = elite
```

Those labels are descriptive opinions, not a mathematical definition.

OTRI needs a formal quantity from which the score can be derived.

Several candidates were researched.

---

# 4. Candidate A — Equivalent Flat Speed

The simplest construction is to convert the course into a flat-equivalent distance `D` and divide it by elapsed time:

```text
V_eq = D / T
```

where:

- `D` = course demand expressed in flat-equivalent distance units
- `T` = finish time
- `V_eq` = equivalent flat speed

The OTRI score could then be a monotonic function of `V_eq`.

## Advantages

- Extremely simple.
- Completely deterministic.
- Easy to explain.
- Course-only.
- No runner data required.

## Major limitation

A simple equivalent speed does not intrinsically distinguish a short performance from a very long performance when their modeled average speed is identical.

For example, if two course-normalized performances both produce:

```text
V_eq = 12 km/h
```

then they would receive the same score even though one could involve 20 minutes of running and the other several hours.

If OTRI intentionally defines score as **course-adjusted speed**, this is valid. If OTRI wants the score to represent a broader performance standard across substantially different durations, a duration-aware reference law is preferable.

---

# 5. Candidate B — Distance-Time Power Law

Running performance has long been modeled using power-law relationships between distance and time.

A basic form is:

```text
T_ref(D) = a × D^b
```

or equivalently:

```text
V_ref(D) = c × D^(-k)
```

Historical and modern research finds that power-law models can describe running performances across a substantial range of distances, although no single model is perfect across all durations. citeturn417108search2turn417108search0

A 1999 study reviewed power laws as models of athletic performance, while a later comparison found power-law and logarithmic models among the stronger approaches for extrapolating long-distance performances in elite runners. citeturn417108search2turn417108search0

## OTRI adaptation

Rather than asking a runner's individual power-law parameters, OTRI would use a **fixed universal reference law**.

For a course represented by demand `D`:

```text
T_ref(S, D) = A(S) × D^b
```

or, more naturally for a score scale:

```text
performance_index = (D^b / T)
```

followed by a monotonic score transformation.

## Advantages

- Strong mathematical precedent.
- Continuous.
- Naturally handles changing distance.
- Easy to invert.
- Does not require runner physiology.

## Limitation

The exponent `b` is itself a convention. If copied from historical record data, OTRI would become partly dependent on real-world performance populations.

Therefore an OTRI exponent must be treated as a declared model parameter and subjected to sensitivity analysis.

---

# 6. Candidate C — Logarithmic Performance Coordinate

An alternative is to represent performance using the logarithm of normalized time or speed.

For example:

```text
P = ln(D / T)
```

or:

```text
P = ln(V_eq)
```

Then convert `P` linearly into the chosen OTRI score range.

The logarithm has a useful property: equal **percentage** changes in performance correspond to equal changes in the transformed coordinate.

For example:

```text
10 → 11 km/h
```

and:

```text
15 → 16.5 km/h
```

are both approximately +10% changes and therefore receive the same change in `ln(V)`.

## Advantages

- Very simple.
- Monotonic.
- Dimensionally interpretable after normalization.
- Treats proportional performance differences more consistently than a raw linear-speed scale.

## Limitation

The score still needs explicit anchors.

A logarithmic transformation does not magically determine what 600 means.

---

# 7. Candidate D — Gompertz / Exponential Scoring Function

Recent work on athletic scoring has proposed mathematical score functions combining Gompertz-type and logarithmic terms to represent the distribution of athletic performances. A published 2023 paper gives a form of the general type:

```text
p = a(e^(bu) - 1)
    + f log(1 + c(e^(du) - 1))
```

where `u` is normalized performance. citeturn711197search48

World Athletics also maintains formal scoring tables for athletic performances, with the current tables updated using statistical analysis of recent performances. citeturn711197search0turn711197search4

## OTRI interpretation

OTRI could use a similar mathematical shape **without adopting its fitted parameters or database**.

The value is mainly the shape:

```text
low performance
    ↓
large score spacing
    ↓
progressively compressed / curved response
    ↓
high performance
```

## Advantage

Can create a score scale with intuitive bounded behavior.

## Problem

Many parameters need definition.

Unless those parameters have clear theoretical meaning, the system risks becoming a curve-fitting exercise.

For the current OTRI philosophy, that is undesirable.

---

# 8. Candidate E — VDOT-Style Reference Performance

Daniels' VDOT framework demonstrates a very useful concept: a single performance index can represent equivalent performances over multiple distances. VDOT derives an effective performance value from running velocity and duration and then provides equivalent race times. citeturn711197search1turn711197search2

This is conceptually valuable for OTRI because it establishes a desired property:

```text
one performance coordinate
        ↓
multiple event distances
```

However, VDOT is explicitly connected to oxygen-consumption and physiological assumptions and is primarily a road/track running fitness framework.

OTRI should therefore **borrow the mathematical idea of a universal performance coordinate, not the physiological model or numerical values**.

---

# 9. Candidate F — Critical-Speed Coordinate

Critical speed is another established way of representing endurance performance. Research compares critical-speed and power-law models as ways of characterizing running performance. citeturn411322search3turn411322search8

However, critical speed is explicitly connected to physiological intensity domains and finite above-critical capacity (`D'`). A recent review notes continuing lack of consensus regarding optimal CS/D' measurement and modelling methods. citeturn411322search13

Because OTRI intentionally excludes athlete physiology from its fundamental score, critical speed should **not** become the foundation of the public OTRI score.

It is better treated as background research into mathematical performance relationships.

---

# 10. What the Evidence Suggests

The strongest mathematical evidence for the OTRI scale comes from the broader literature on distance-time performance relationships:

1. Power-law relationships can describe running performance over multiple distances. citeturn417108search2turn417108search0
2. Logarithmic and power-law formulations can provide strong long-distance extrapolations within their evidence domain. citeturn417108search0
3. More complex physiological models can improve individualized prediction, but that is a different objective from a simple, course-only OTRI score. citeturn417108search3
4. Critical-speed approaches are useful performance models but introduce physiological concepts that OTRI does not need for its core index. citeturn411322search13

Therefore, the most suitable foundation is likely a **power-law/logarithmic performance coordinate**, not a physiological model and not a race-result regression.

---

# 11. Recommended OTRI Architecture

The proposed architecture is a two-stage mathematical model.

## Stage 1 — Course Demand

Calculate a physical course demand `D` from the GPX.

The existing GECI research candidate provides the starting point:

```text
C(g) = gradient-dependent energy cost

R(g) = C(g) / C(0)

D = Σ [d_i × R(g_i)]
```

This creates an equivalent course-distance quantity based on gradient rather than a simple distance-plus-elevation formula.

The underlying gradient-cost literature supports strong and asymmetric changes in energy cost with slope. citeturn417108search0

---

# 12. Stage 2 — Universal Performance Coordinate

Define a dimensionless course-normalized performance quantity:

```text
Q = D / T
```

where:

- `D` = modeled course demand
- `T` = finish time

`Q` is the first-order **OTRI Performance Rate**.

This is the cleanest possible base because every OTRI result is directly tied to measurable course demand and time.

However, `Q` alone does not solve the entire scale problem if OTRI wants a duration-aware interpretation.

Therefore a second candidate is:

```text
Q_b = D^b / T
```

where `b` is a declared universal exponent.

The exponent controls how course demand scales with total duration/distance.

---

# 13. Preferred V0.x Candidate: Power-Law Reference + Log Score

The most promising combination is:

### Physical layer

```text
D = Σ [d_i × R(g_i)]
```

### Performance layer

```text
Q = D^b / T
```

### Score layer

```text
OTRI = A + B × ln(Q / Q₀)
```

where:

- `D` = course demand
- `T` = finish time
- `b` = universal course-demand exponent
- `Q₀` = reference performance rate
- `A`, `B` = score-scale constants

This form is attractive because it separates the three conceptual problems:

```text
physical course difficulty
          ↓
    D^b / T
          ↓
performance coordinate
          ↓
    logarithmic scale
          ↓
      OTRI score
```

---

# 14. Why Use the Logarithm?

Suppose OTRI uses a raw performance ratio.

A fixed absolute improvement in equivalent speed would always generate the same score increase.

That becomes awkward across the scale because performance differences are generally more meaningful as **relative** differences.

The logarithm gives:

```text
ΔOTRI = B × ln(Q₂ / Q₁)
```

Therefore the same percentage improvement corresponds to the same score change.

For example:

```text
Q₂ = 1.05 × Q₁
```

and:

```text
Q₂ = 1.05 × Q₁
```

produce the same score increase regardless of absolute scale.

This is mathematically clean and easy to explain.

---

# 15. The Hardest Problem: Choosing the Anchors

The constants `A`, `B`, and `Q₀` define what the numeric score means.

They cannot simply be copied from another index.

Three broad approaches exist.

## Option 1 — Pure Mathematical Convention

Choose explicit reference values by OTRI convention.

For example:

```text
Q₀ = declared reference rate
OTRI(Q₀) = 500
```

Then choose the logarithmic scale width so that another explicitly declared performance ratio corresponds to another score.

This is maximally independent, but the initial numeric convention is partly arbitrary.

## Option 2 — Theoretical Performance Reference

Define the reference using an analytic running-performance curve rather than observed race results.

This can use the mathematical structure of power-law running models without taking parameters from an external race database. Power-law models have a long theoretical and empirical history in running research. citeturn417108search0turn417108search2

## Option 3 — External Performance Tables

Use World Athletics, VDOT, records or another performance standard as the anchor.

This gives immediate familiarity but violates the strongest interpretation of OTRI independence because the numeric scale would inherit an external population/reference.

**This option should not be used for the fundamental OTRI score.**

---

# 16. Recommended Anchor Philosophy

OTRI should use a **declared internal reference**, not a hidden external reference.

A useful architecture is:

```text
OTRI 500
=
formal OTRI reference performance rate
```

The reference itself should be publicly specified in physical units.

For example, OTRI could define:

```text
Q₀ = X units of modeled course-demand per hour
```

The number `X` must be chosen through a published design process, sensitivity analysis, and usability testing rather than presented as a scientific fact.

This keeps the score internally coherent without pretending that a particular external athlete or race defines 500.

---

# 17. A Better Alternative to an Arbitrary 0–1000 Anchor

During research, OTRI should also consider publishing the raw physical metric alongside the score.

Example:

```text
OTRI Score                  612
OTRI Performance Rate      9.47 units/h
Course Demand               31.8 units
Finish Time                 3:21:24
Model Version               0.1
```

This is valuable because the score is then a convenient human-readable transformation rather than the only source of information.

The underlying quantity remains inspectable.

---

# 18. Score Inversion

The model must work in both directions.

Given desired score `S`:

```text
S = A + B × ln(D^b / (T × Q₀))
```

Solving for `T`:

```text
T = D^b / [Q₀ × exp((S - A)/B)]
```

Therefore a runner can ask:

```text
What time gives OTRI 600?
```

without racing first.

Conversely:

```text
OTRI = A + B × ln(D^b / (T × Q₀))
```

calculates the score from an actual finish time.

This mathematical symmetry is a core OTRI requirement.

---

# 19. Monotonicity

For a fixed course:

```text
T decreases → OTRI increases
T increases → OTRI decreases
```

This property should be enforced mathematically and tested automatically.

There should never be a statistical anomaly where a slower time receives a higher score on the same course.

---

# 20. Course Independence

The model should allow:

```text
Course A + OTRI 600 → target time A
Course B + OTRI 600 → target time B
Course C + OTRI 600 → target time C
```

The score is the common coordinate.

The course determines the required time.

---

# 21. What This Gives OTRI

The conceptual structure becomes:

```text
                  OTRI SCORE
                       │
                       │
              performance coordinate
                       │
                D^b / finish time
                       │
              course demand D
                       │
       ┌───────────────┴───────────────┐
       │                               │
  distance profile              gradient profile
       │                               │
       └───────────────┬───────────────┘
                       │
                      GPX
```

This is substantially more transparent than a score produced from race population statistics.

---

# 22. Candidate Values for `b`

The exponent `b` should initially be treated as a research parameter rather than fixed by intuition.

Candidate tests should include:

```text
b = 0.90
b = 0.95
b = 1.00
b = 1.05
b = 1.10
```

The purpose is not to optimize a number against a single historical dataset.

The purpose is to determine which value gives desirable mathematical behavior across course lengths and difficulty structures while remaining consistent with published running-performance theory.

The power-law literature shows that the exponent governing time-distance relationships is not universally fixed across all populations and duration domains. citeturn417108search0turn417108search5

Therefore OTRI should report the chosen exponent and its rationale rather than hiding it inside a fitted model.

---

# 23. Sensitivity Analysis

Before release, calculate how scores change when `b` changes.

For a fixed performance:

```text
b = 0.90 → score X
b = 0.95 → score Y
b = 1.00 → score Z
b = 1.05 → score W
b = 1.10 → score V
```

If the model produces large score changes from small changes in `b`, that is evidence that the exponent requires more investigation.

Likewise test sensitivity to:

- GPX elevation smoothing
- segment length
- gradient calculation
- course-demand function
- reference rate `Q₀`
- score scaling constant `B`

---

# 24. Why Not Just Use World Athletics?

World Athletics scoring tables are useful evidence that mathematical performance scoring is feasible. They are maintained as formal scoring tables and periodically updated using statistical performance data. citeturn711197search0turn711197search4

But those tables intentionally represent athletics performances using a database-derived reference system.

OTRI's goal is different.

The fundamental OTRI score should remain generated from the OTRI model itself, not inherit a hidden dependency on another organization's competitive population.

World Athletics can therefore be used as a **benchmark for mathematical behavior**, not as an input to the OTRI score.

---

# 25. Why Not Use VDOT?

VDOT provides an excellent example of a universal performance coordinate and equivalent-performance concept. citeturn711197search1turn711197search2

But it incorporates running-speed and duration relationships connected to physiological assumptions and was designed around standard running events.

OTRI does not need to estimate VO₂max or simulate physiology.

The transferable idea is simply:

```text
one performance coordinate
↔ equivalent performances
```

OTRI can recreate that mathematical property from its own course-demand model.

---

# 26. Why Not Critical Speed?

Critical speed is a useful scientific framework, but it is explicitly linked to physiological intensity domains and finite capacity above critical speed. The literature continues to discuss how best to estimate and model it. citeturn411322search13

That is unnecessary complexity for the core OTRI goal.

OTRI is not trying to answer:

> What physiological ceiling does this runner have?

It is trying to answer:

> What score does this time represent on this course?

Therefore critical speed should remain background research rather than become a required OTRI input.

---

# 27. Proposed OTRI Fundamental Formula

The current best research candidate is:

```text
1. Convert GPX to segments

2. Calculate gradient-dependent course demand

   D = Σ [d_i × R(g_i)]

3. Calculate course-normalized performance

   Q = D^b / T

4. Convert performance coordinate to OTRI

   OTRI = A + B × ln(Q / Q₀)
```

Subject to future confirmation of:

```text
R(g)
```

```text
b
```

```text
Q₀
```

```text
A
```

```text
B
```

None of these unresolved constants should be hidden.

---

# 28. A Possible Normalized Form

For implementation, it may be cleaner to define the score around an explicit anchor:

```text
OTRI = 500 + K × ln(Q / Q₅₀₀)
```

where:

```text
Q₅₀₀ = declared performance rate corresponding to OTRI 500
```

and `K` controls how many points correspond to a multiplicative performance change.

This has a particularly attractive interpretation:

```text
Q / Q₅₀₀ = 1.00 → OTRI 500
```

```text
Q / Q₅₀₀ > 1.00 → OTRI > 500
```

```text
Q / Q₅₀₀ < 1.00 → OTRI < 500
```

The exact values of `Q₅₀₀` and `K` remain design parameters.

---

# 29. Score Meaning

Under this system, OTRI scores should be interpreted as **relative performance coordinates within the published OTRI mathematical model**, not as:

- percentile rankings
- race positions
- physiological measurements
- VO₂max estimates
- probability of winning
- statements about athlete quality

For example:

```text
OTRI 600
```

would mean:

> This performance is 100 points above the defined OTRI 500 reference on the OTRI mathematical scale.

The precise performance ratio associated with those 100 points would be specified by `K`.

---

# 30. A Useful Property of the Log Scale

Under:

```text
OTRI = 500 + K × ln(Q / Q₅₀₀)
```

an increase of `Δ` points corresponds to a fixed multiplicative change in `Q`:

```text
Q₂ / Q₁ = exp(Δ / K)
```

This makes the scale interpretable as a ratio-based performance coordinate rather than an arbitrary linear point accumulation.

That is potentially a major advantage for OTRI.

---

# 31. Example Only

These are **illustrative values**, not proposed final OTRI standards.

Suppose:

```text
Q₅₀₀ = 10
K = 100
```

Then:

```text
Q = 10.0 → OTRI 500
Q = 11.05 → OTRI ≈ 510
Q = 12.21 → OTRI ≈ 520
Q = 13.50 → OTRI ≈ 530
```

The key idea is not those numbers.

The key idea is that the score represents a **multiplicative performance ratio**.

---

# 32. Validation Strategy

The score scale should be tested against real race data, but real race data should not define it.

Validation should ask:

```text
Does one OTRI score correspond to broadly comparable performance levels
across very different GPX profiles?
```

Test combinations such as:

```text
short / low elevation
short / high elevation
medium / rolling
medium / steep
long / low elevation
long / high elevation
ultra / mountain
```

The key output is model error and consistency, not field-relative ranking.

---

# 33. Validation Without Back-Fitting the Score

Suppose the model predicts:

```text
OTRI 600
→ 02:40 on Course A
```

and observed races produce times around 02:45.

The response should **not** be:

```text
change Course A's hidden coefficient
```

Instead investigate:

```text
Is the GPX wrong?
Is the elevation processing wrong?
Is the gradient-cost function wrong?
Is course demand misrepresented?
Is the universal exponent inappropriate?
```

A model change should become a new OTRI version.

---

# 34. Guardrails

The score model should enforce:

### Determinism

Same inputs → same score.

### Monotonicity

Faster time → higher score.

### Continuity

Small time changes → small score changes.

### Course sensitivity

Materially different GPX profiles should be allowed to generate different time standards.

### No field dependence

No competitor results required.

### No runner dependence

No individual physiological inputs required.

### Versionability

Every formula and parameter has a version.

---

# 35. Recommended Research Decision

Based on the reviewed literature and the OTRI design constraints, the current research recommendation is:

## Use a three-layer foundation

```text
LAYER 1
Physical course demand

GECI-style gradient integration
```

```text
LAYER 2
Universal performance rate

power-law normalized course demand / time
```

```text
LAYER 3
Human-readable score

logarithmic transformation to 0–1000
```

This is preferable to:

- competitor-relative regression
- race-field normalization
- physiological athlete models
- neural-network scoring
- black-box statistical adjustment
- direct copying of ITRA/UTMB/VDOT values

---

# 36. What Is Still Unknown

The following should remain open research questions:

1. The final gradient-energy function used by OTRI.
2. The exact GPX smoothing and segmentation method.
3. Whether `D^b / T` needs an exponent at all.
4. The appropriate value of `b` if it does.
5. The internal reference value `Q₅₀₀`.
6. The score scaling constant `K`.
7. Whether the 0–1000 range should be symmetric around its anchor.
8. Whether very long races require a different mathematical treatment.
9. Whether the course-demand model needs explicit structural terms beyond integrated gradient cost.

These must be investigated rather than guessed.

---

# 37. Final Proposed Research Formula

For OTRI V0.x, the leading candidate is:

```text
Course Demand:

D = Σ [d_i × R(g_i)]

Performance Coordinate:

Q = D^b / T

Score:

OTRI = 500 + K × ln(Q / Q₅₀₀)
```

with all terms explicitly published.

The inverse relationship is:

```text
T = D^b / [Q₅₀₀ × exp((OTRI - 500) / K)]
```

This gives the desired property:

```text
TARGET SCORE → TARGET TIME
```

and:

```text
ACTUAL TIME → SCORE
```

using exactly the same mathematical relationship.

---

# 38. Why This Is a Strong Candidate for OTRI

It gives OTRI a clean chain of reasoning:

```text
                    GPX
                     │
                     ▼
              gradient profile
                     │
                     ▼
             physical course demand
                     │
                     ▼
             course-normalized time
                     │
                     ▼
            universal performance rate
                     │
                     ▼
              logarithmic score
                     │
                     ▼
                 OTRI 0–1000
```

There is no need for:

```text
other runners
race field
previous results
runner VO₂max
heart-rate data
fatigue simulation
machine learning
```

That is exactly the direction OTRI has been designed around.

---

# 39. Research Conclusion

A universal OTRI score should not be created by asking which statistical transformation best reproduces historical scores.

It should be created by defining a transparent mathematical performance coordinate first and then mapping that coordinate to a convenient score scale.

The literature provides several useful foundations:

- power-law and logarithmic distance-time relationships are established approaches for describing running performance; citeturn417108search0turn417108search2
- universal performance coordinates are practical in systems such as VDOT, although their underlying physiology is not appropriate as a required OTRI input; citeturn711197search1turn711197search2
- critical-speed models provide another mathematical performance framework but introduce physiological concepts unnecessary to OTRI's fundamental objective; citeturn411322search13
- formal athletic scoring systems demonstrate that bounded numerical scales can be built mathematically, although their parameters may be population-derived and therefore should not simply be imported into OTRI. citeturn711197search0turn711197search4turn711197search48

Therefore the current leading OTRI design is:

> **GPX-derived course demand → universal course-normalized performance rate → logarithmic 0–1000 score.**

The final numeric constants remain a research problem.

They should be determined openly, stress-tested mathematically, and released only after independent validation.

---

## References

1. Katz JS, Katz L. *Power laws and athletic performance.* Journal of Sports Sciences. 1999;17(6):467–476. DOI: 10.1080/026404199365777. citeturn417108search2
2. Vandewalle H. *Modelling of Running Performances: Comparisons of Power-Law, Hyperbolic, Logarithmic, and Exponential Models in Elite Endurance Runners.* BioMed Research International. 2018. DOI: 10.1155/2018/8203062. citeturn417108search0turn417108search4
3. Ward-Smith AJ. *A mathematical theory of running, based on the first law of thermodynamics, and its application to the performance of world-class athletes.* Journal of Biomechanics. 1985. DOI: 10.1016/0021-9290(85)90289-1. citeturn417108search1
4. Drake JP, et al. *Modelling human endurance: power laws vs critical power.* European Journal of Applied Physiology. 2023. DOI: 10.1007/s00421-023-05274-5. citeturn411322search9
5. Zinoubi B, Vandewalle H, Driss T. *Modeling of Running Performances in Humans: Comparison of Power Laws and Critical Speed.* Journal of Strength and Conditioning Research. 2017. citeturn417108search5
6. Patoz A, et al. *Critical speed estimated by statistically appropriate fitting procedures.* 2021. citeturn411322search12
7. *The Measurement and Application of Critical Speed and D' in Running: A Scoping Review.* Sports Medicine. 2026. DOI: 10.1007/s40279-026-02410-x. citeturn411322search13
8. World Athletics. *Scoring Tables of Athletics.* Current technical documentation / 2025 update. citeturn711197search0turn711197search4
9. Grammaticos, Meloun & Purdy. *Scoring athletic performances.* 2023. citeturn711197search48
10. Daniels-style VDOT reference framework. Used here as a conceptual comparison for equivalent-performance scales, not as an OTRI parameter source. citeturn711197search1turn711197search2
