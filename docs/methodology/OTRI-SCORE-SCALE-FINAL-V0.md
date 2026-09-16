# OTRI Score Scale — Final V0 Proposal

**Status:** Proposed OTRI V0 foundation  
**Version:** 0.1  
**Scope:** Universal time-to-score scale  
**Principle:** Course-relative, deterministic, competitor-independent

## 1. Final V0 decision

OTRI V0 uses:

1. A GPX-derived **course demand** based on segment-by-segment gradient energy cost.
2. A direct **performance rate** equal to course demand divided by finish time.
3. A **logarithmic 0–1000 score** with explicit internal OTRI anchors.

No runner physiology, fatigue model, Monte Carlo runner population, competitor results, placing, winner time, field strength or race-relative adjustment is part of the fundamental score.

The model is intentionally a course-to-time standard rather than a race-ranking algorithm.

---

## 2. Course demand

The GPX is cleaned and divided into deterministic short segments. For each segment `i`, calculate:

```text
d_i = horizontal segment distance
h_i = processed elevation change
g_i = h_i / d_i
```

The first physical candidate uses the published Minetti running-cost relationship:

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6
```

where `g` is decimal grade, e.g. `0.10` for +10%.

Normalize to level running:

```text
R(g) = C(g) / C(0)
```

Then:

```text
D = Σ [d_i × R(g_i)]
```

`D` is the modeled course-demand distance in flat-equivalent distance units.

The underlying research found strong asymmetric changes in running energy cost with gradient, supporting separate treatment of uphill and downhill terrain rather than a simple distance-plus-elevation equation.

Reference: Minetti et al., *Energy cost of walking and running at extreme uphill and downhill slopes*, Journal of Applied Physiology, 2002, DOI 10.1152/japplphysiol.01177.2001.

---

## 3. Performance rate

For a finish time `T` in hours:

```text
Q = D / T
```

`Q` is the athlete's modeled performance rate on that course.

This is the only performance quantity required by the fundamental OTRI score.

No athlete identity or history is needed.

---

## 4. OTRI 500 anchor

OTRI V0 defines:

```text
Q_500 = 15.0 demand-units/hour
```

Therefore:

> **OTRI 500 = 15.0 modeled course-demand units per hour.**

This is an explicit OTRI design convention, not an average, percentile, record or value fitted from race results.

On a flat course, where `D` equals physical distance, this corresponds to exactly:

```text
15.0 km/h
4:00/km
40:00 for 10 km
```

The value is deliberately simple and dimensionally understandable.

---

## 5. OTRI 1000 anchor

OTRI V0 defines:

```text
Q_1000 = 22.5 demand-units/hour
```

This is exactly 1.5 times the 500 reference:

```text
22.5 / 15.0 = 1.5
```

On a flat course this corresponds to:

```text
22.5 km/h
26:40 for 10 km
```

This is a scale boundary chosen by OTRI. It is **not** a claim that 1000 equals a world record or a biological maximum.

Historical athletics scoring demonstrates the usefulness of explicit reference points and progressive curves, but OTRI does not copy the numerical standards of existing systems.

---

## 6. Why the scale is logarithmic

OTRI uses:

```text
OTRI_raw = 500 + K × ln(Q / 15.0)
```

We choose `K` so that `Q = 22.5` produces exactly 1000:

```text
1000 = 500 + K × ln(22.5 / 15.0)
```

Therefore:

```text
K = 500 / ln(1.5)
K ≈ 1233.151
```

Final score equation:

```text
OTRI_raw = 500 + 1233.151 × ln(Q / 15.0)
```

The logarithm makes equal **relative changes** in modeled performance rate correspond to equal score changes.

This is consistent with the broader literature showing useful logarithmic and power-law relationships in running performance, while avoiding use of those models as hidden database calibration.

Relevant research:

- Péronnet & Thibault, *Mathematical analysis of running performance and world running records*, Journal of Applied Physiology, 1989, DOI 10.1152/jappl.1989.67.1.453.
- *Modelling of Running Performances: Comparisons of Power-Law, Hyperbolic, Logarithmic, and Exponential Models in Elite Endurance Runners*, 2018, DOI 10.1155/2018/8203062.
- Blythe & Király, *Prediction and Quantification of Individual Athletic Performance of Runners*, PLOS ONE, 2016, DOI 10.1371/journal.pone.0157257.

---

## 7. Score interpretation

The score interval is defined by multiplicative performance rates:

```text
OTRI 0      = 10.0 units/hour
OTRI 500    = 15.0 units/hour
OTRI 1000   = 22.5 units/hour
```

A 100-point increase corresponds to:

```text
1.5^(100/500) ≈ 1.08447
```

Therefore:

> **Every 100 OTRI points represents approximately an 8.45% increase in modeled course-demand performance rate.**

Examples:

```text
500 → 600     ×1.08447
600 → 700     ×1.08447
700 → 800     ×1.08447
800 → 900     ×1.08447
900 → 1000    ×1.08447
```

This gives the score a consistent mathematical meaning across the whole range.

---

## 8. Reference table

For a flat course where `D = physical distance`:

| OTRI | Performance rate | 10 km equivalent |
|---:|---:|---:|
| 0 | 10.00 km/h | 60:00 |
| 100 | 10.84 km/h | 55:21 |
| 200 | 11.75 km/h | 51:04 |
| 300 | 12.73 km/h | 47:08 |
| 400 | 13.80 km/h | 43:29 |
| **500** | **15.00 km/h** | **40:00** |
| 600 | 16.27 km/h | 36:50 |
| 700 | 17.64 km/h | 34:01 |
| 800 | 19.13 km/h | 31:22 |
| 900 | 20.74 km/h | 28:56 |
| **1000** | **22.50 km/h** | **26:40** |

These are mathematical consequences of the OTRI V0 definition, not population rankings.

---

## 9. Finish time → score

Given:

```text
D = course demand
T = finish time in hours
```

Calculate:

```text
Q = D / T
```

then:

```text
OTRI_raw = 500 + 1233.151 × ln(Q / 15.0)
```

Finally:

```text
OTRI = round(clamp(OTRI_raw, 0, 1000))
```

Only the final displayed score is rounded.

The underlying `D`, `Q` and `OTRI_raw` should remain available for audit/research.

---

## 10. Desired score → target time

For a desired OTRI score `S` between 0 and 1000:

```text
Q(S) = 15.0 × exp((S - 500) / 1233.151)
```

Then:

```text
T_hours(S) = D / Q(S)
```

and:

```text
T_seconds(S) = 3600 × D / Q(S)
```

This makes the pre-race and post-race calculations exact inverses.

Example:

```text
Course GPX
    ↓
Course demand D
    ↓
Target OTRI 600
    ↓
Required Q(600)
    ↓
Target time
```

If the runner actually finishes in that target time on the same course version, the post-race calculation returns the same OTRI score before final integer rounding.

---

## 11. Why no duration exponent in V0

Power-law running research is valuable, but OTRI V0 deliberately avoids adding a second universal exponent such as:

```text
Q = D^b / T
```

A universal `b` would add another assumption and would require choosing a value from theory or an empirical performance population.

OTRI V0 does not need that complexity to satisfy its primary purpose:

> **Determine what time on this exact GPX corresponds to a given OTRI score.**

The course demand already represents the physical cost of the route. The performance rate `D/T` keeps the core implementation transparent.

This can be reconsidered only in a future version following explicit research and independent validation.

---

## 12. No competitor-relative inputs

The following must never be inputs to the V0 fundamental score:

```text
winner time
finishing position
field strength
number of competitors
competitor historical scores
runner historical performances
race-specific coefficients
similar-race regression
```

Observed results may be used to test the model, but an observed result does not change another runner's score on the same course and time.

---

## 13. No athlete physiology in the score

The fundamental V0 score does not require:

```text
VO₂max
lactate threshold
heart rate
running economy
body mass
fatigue
training history
```

Those concepts may be useful for separate training or prediction tools, but they are outside the core OTRI performance calculation.

---

## 14. Course demand and score are separate

OTRI should expose both:

```text
Course Demand D
```

and:

```text
OTRI Performance Score
```

This allows a runner to understand the course independently of the performance.

The conceptual chain is:

```text
GPX
 ↓
Course reconstruction
 ↓
Segment gradients
 ↓
Gradient cost
 ↓
Course Demand D
 ↓
Finish Time T
 ↓
Performance Rate Q = D/T
 ↓
OTRI Score
```

---

## 15. Clipping

The official public score is bounded:

```text
OTRI < 0       → 0
0 ≤ OTRI ≤ 1000 → rounded OTRI
OTRI > 1000    → 1000
```

The raw score remains stored internally.

This means an unusually high performance does not redefine the public scale.

---

## 16. Why 500 and 1000 are conventions

The numerical anchors are **design decisions**, not scientific constants.

The scientific foundation concerns the course-demand model and the usefulness of continuous/logarithmic performance coordinates.

The choice:

```text
500 → 15.0 units/hour
1000 → 22.5 units/hour
```

exists to create a simple, bounded, portable OTRI scale without importing a competitor database or another organization's calibration.

This distinction must be stated clearly in OTRI documentation.

---

## 17. Validation requirements

Before OTRI V0 is released as an official scoring system, the complete model must be tested on an independent dataset of high-quality GPXs and official results.

Validation must measure:

- course-demand stability
- GPX segmentation sensitivity
- elevation-processing sensitivity
- consistency across course shapes
- systematic bias by gradient distribution
- steep-uphill behavior
- steep-downhill behavior
- score/time monotonicity
- pre-race/post-race inversion accuracy

Real results are a **laboratory for testing the model**, not a hidden source of race coefficients.

---

## 18. Implementation requirements

A reference implementation should expose these functions:

```text
parse_gpx()
clean_elevation()
segment_course()
calculate_grade()
calculate_gradient_cost()
calculate_course_demand()
performance_rate()
score_from_time()
time_from_score()
```

The implementation should use one shared set of constants:

```text
Q_500 = 15.0
Q_1000 = 22.5
K = 500 / ln(1.5)
```

Do not hard-code duplicated score formulas in separate parts of the application.

---

## 19. Reference implementation pseudocode

```python
Q500 = 15.0
Q1000 = 22.5
K = 500.0 / math.log(Q1000 / Q500)


def score_from_time(course_demand, finish_seconds):
    if course_demand <= 0 or finish_seconds <= 0:
        raise ValueError("course demand and finish time must be positive")

    hours = finish_seconds / 3600.0
    q = course_demand / hours
    raw = 500.0 + K * math.log(q / Q500)
    score = round(max(0.0, min(1000.0, raw)))

    return {
        "course_demand": course_demand,
        "performance_rate": q,
        "score_raw": raw,
        "score": score,
    }


def time_from_score(course_demand, score):
    if course_demand <= 0:
        raise ValueError("course demand must be positive")
    if not 0 <= score <= 1000:
        raise ValueError("score must be between 0 and 1000")

    q = Q500 * math.exp((score - 500.0) / K)
    hours = course_demand / q
    return hours * 3600.0
```

This pseudocode describes the score layer only. GPX processing and course-demand calculation remain separate modules.

---

## 20. V0 formula summary

### Segment cost

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6
```

### Relative gradient cost

```text
R(g) = C(g) / C(0)
```

### Course demand

```text
D = Σ[d_i × R(g_i)]
```

### Performance rate

```text
Q = D / T_hours
```

### Raw OTRI

```text
OTRI_raw = 500 + (500 / ln(1.5)) × ln(Q / 15.0)
```

### Public OTRI

```text
OTRI = round(clamp(OTRI_raw, 0, 1000))
```

### Target time

```text
Q(S) = 15.0 × exp((S - 500) / (500 / ln(1.5)))

T_hours(S) = D / Q(S)
```

---

## 21. Final OTRI V0 statement

> **OTRI is a deterministic course-relative performance index. The course is modeled from its GPX using a transparent gradient-demand function. A finish time is converted into a course-normalized performance rate, and that rate is mapped to a fixed logarithmic 0–1000 scale. Competitor performances do not define the score.**

The resulting system is designed to make the question possible before a race as well as after it:

> **What time on this exact course corresponds to OTRI 600?**

and:

> **I ran this exact time. What OTRI did I achieve?**

Both questions are answered by the same equation.
