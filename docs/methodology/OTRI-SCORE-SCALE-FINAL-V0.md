# OTRI Score Scale — V0 Curved Proposal

**Status:** Proposed OTRI V0 foundation  
**Version:** 0.2  
**Scope:** Universal time-to-score scale  
**Principle:** Course-relative, deterministic, competitor-independent

## 1. V0 decision

OTRI V0 uses:

1. A GPX-derived **course demand** based on segment-by-segment gradient energy cost.
2. A direct **performance rate** equal to course demand divided by finish time.
3. A **curved 0–1000 score** with explicit internal OTRI scale anchors.

No runner physiology, fatigue model, Monte Carlo runner population, competitor results, placing, winner time, field strength or race-relative adjustment is part of the fundamental score.

The model is intentionally a course-to-time standard rather than a race-ranking algorithm.

---

## 2. Course demand

The GPX is cleaned and divided into deterministic **50 m target segments**. For each segment `i`, calculate:

```text
d_i = horizontal segment distance
h_i = processed elevation change
g_i = h_i / d_i
```

The physical candidate uses the published Minetti running-cost relationship:

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

`D` is the modeled course-demand distance used by the OTRI time-to-score model.

The underlying research found strong asymmetric changes in running energy cost with gradient, supporting separate treatment of uphill and downhill terrain rather than a simple distance-plus-elevation equation.

Reference: Minetti et al., *Energy cost of walking and running at extreme uphill and downhill slopes*, Journal of Applied Physiology, 2002, DOI 10.1152/japplphysiol.01177.2001.

---

## 3. Performance rate

For a finish time `T` in hours:

```text
Q = D / T
```

`Q` is the OTRI-defined performance coordinate, expressed as modeled demand-km/hour.

No athlete identity or history is needed.

---

## 4. Why V0 is now curved

The earlier logarithmic scale treated every equal point increase as the same percentage increase in `Q`.

That made the upper half of the 0–1000 scale too easy to climb relative to the intended meaning of a very high score.

V0.3 therefore uses a **curved performance standard**:

```text
lower/middle scores → moderate increases in required Q
higher scores       → progressively larger increases in required Q
```

The purpose is practical as well as mathematical: ordinary trail performances should have useful room in the approximately 200–400 region, while 500+ represents clearly stronger performance and the upper tail becomes progressively harder to reach.

This is a scale-design hypothesis and must be tested against independent real-world results. It is not a claim about population percentiles.

---

## 5. V0.3 scale anchors

The current public scale uses three explicit anchors:

```text
OTRI 200  → Q = 11.0 demand-km/hour
OTRI 500  → Q = 15.0 demand-km/hour
OTRI 1000 → Q = 30.0 demand-km/hour
```

These are OTRI design conventions, not averages, percentiles, records, ITRA values or UTMB values.

The resulting performance-rate increases are deliberately asymmetric:

```text
200 → 500:
11.0 → 15.0  = +36.4%

500 → 1000:
15.0 → 30.0  = +100.0%
```

That means the top 500 points require almost twice the modeled performance rate again, rather than merely another 36–40% increase.

---

## 6. Curved score equation

Instead of a single logarithm, V0.3 defines the performance rate required for a continuous score `S` as:

```text
Q(S) = exp(A + B·S + C·S²)
```

with fixed constants:

```text
A = 2.2351808956091976
B = 0.0007254607359190918
C = 0.0000004405557501338660
```

These constants are selected so that:

```text
Q(200)  = 11.0
Q(500)  = 15.0
Q(1000) = 30.0
```

within floating-point tolerance.

Because the quadratic term is positive, the required `Q` rises progressively faster toward the upper end of the scale.

---

## 7. Reference scale table

| OTRI | Required Q (demand-km/h) |
|---:|---:|
| 0 | 9.35 |
| 100 | 10.10 |
| **200** | **11.00** |
| 300 | 12.09 |
| 400 | 13.41 |
| **500** | **15.00** |
| 600 | 16.93 |
| 700 | 19.28 |
| 800 | 22.14 |
| 900 | 25.66 |
| **1000** | **30.00** |

For a flat course, `Q` is numerically the same as km/h.

Therefore, on a perfectly flat 10 km course, the anchors correspond to approximately:

```text
OTRI 200   → 54:33
OTRI 500   → 40:00
OTRI 1000  → 20:00
```

These flat-course times are mathematical consequences of the scale only. They are not claims about what an average runner, elite runner or world-record holder runs.

---

## 8. Score from finish time

Given:

```text
D = course demand
T = finish time in hours
```

calculate:

```text
Q = D / T
```

Then solve:

```text
ln(Q) = A + B·S + C·S²
```

for the upper/positive root:

```text
S_raw = (-B + sqrt(B² - 4C(A - ln(Q)))) / (2C)
```

Finally:

```text
OTRI = round(clamp(S_raw, 0, 1000))
```

Only the displayed score is rounded. The implementation should retain:

```text
course_demand
performance_rate
otri_raw
```

for audit and research.

---

## 9. Desired score → target time

For a desired score `S` between 0 and 1000:

```text
Q(S) = exp(A + B·S + C·S²)
```

Then:

```text
T_hours(S) = D / Q(S)
```

and:

```text
T_seconds(S) = 3600 × D / Q(S)
```

This is the exact inverse of the forward score curve.

Example:

```text
Course GPX
    ↓
Course demand D
    ↓
Target OTRI 600
    ↓
Required Q(600) = 16.93
    ↓
Target time
```

---

## 10. Score interpretation

The scale should be interpreted as a **modeled performance standard**, not as a percentile ranking.

A rough conceptual reading is:

```text
0–199     lower performance-rate region
200–399   broad ordinary/recreational region
400–599   stronger competitive region
600–799   very strong region
800–999   exceptional upper tail
1000      scale ceiling
```

These labels are descriptive design guidance, not validated population boundaries. They must not be presented as official percentiles until independent data supports them.

The important mathematical property is that the exact same score always corresponds to the exact same `Q` requirement in a given model version.

---

## 11. No competitor-relative inputs

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

## 12. No athlete physiology in the score

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

## 13. Course demand and score are separate

OTRI should expose both:

```text
Course Demand D
```

and:

```text
OTRI Performance Score
```

This lets a runner inspect the course independently of the performance.

The conceptual chain is:

```text
GPX
 ↓
Course reconstruction
 ↓
50 m segmentation
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
Curved OTRI Score
```

---

## 14. Clipping

The official public score is bounded:

```text
S_raw < 0        → 0
0 ≤ S_raw ≤ 1000 → rounded S_raw
S_raw > 1000     → 1000
```

The raw score remains stored internally.

A result faster than the 1000 anchor does not redefine the scale; it simply clips at 1000 while retaining its raw value for research.

---

## 15. Why 1000 should be hard to reach

The V0.3 curve explicitly separates the meaning of the upper score band from the middle of the scale.

For example:

```text
OTRI 200 → Q 11.0
OTRI 500 → Q 15.0
OTRI 800 → Q 22.14
OTRI 1000 → Q 30.0
```

The model therefore does not treat:

```text
200 → 300
```

and:

```text
900 → 1000
```

as equivalent amounts of required performance improvement.

This is intentional. A 1000 should represent a rare, high-end performance standard rather than something reached routinely by a good recreational runner.

Again, the **rarity statement is a design objective until validation confirms it**.

---

## 16. Why not use a population percentile

A percentile system would make the score depend on the distribution of runners in the reference population.

That would create exactly the dependency OTRI is designed to avoid:

```text
same course + same time
→ potentially different score
```

because the reference population could change.

V0 instead fixes the score curve mathematically and uses race populations only for validation.

---

## 17. Why not keep the old pure logarithmic curve

A pure log curve has the useful property:

```text
equal percentage increase in Q
→ equal score increase
```

but it also means every equal point interval is equally demanding in percentage terms.

For OTRI's intended interpretation, the upper tail should be more compressed so that moving from 900 toward 1000 requires substantially more performance than moving from 200 toward 300.

V0.3 keeps the mathematical transparency of an analytic formula while introducing this controlled curvature.

---

## 18. Validation requirements

Before OTRI V0 is released as an official scoring system, the complete model must be tested on an independent dataset of high-quality GPXs and official results.

Validation must measure:

- course-demand stability
- 50 m vs 20 m segmentation sensitivity
- elevation-processing sensitivity
- consistency across course shapes
- systematic bias by gradient distribution
- steep-uphill behavior
- steep-downhill behavior
- score/time monotonicity
- pre-race/post-race inversion accuracy
- score distribution in ordinary runners
- upper-tail behavior near 800–1000

The key scale question is:

> Does the curved scale leave useful space around 200–400 for ordinary performances while making 800–1000 increasingly difficult to reach without introducing undesirable compression or distortion?

That question must be answered empirically.

---

## 19. Implementation requirements

A reference implementation should expose:

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

The score-curve constants must exist in one shared module. Do not duplicate the curve equation across the API, estimator and frontend.

---

## 20. Reference implementation

```python
import math

CURVE_A = 2.2351808956091976
CURVE_B = 0.0007254607359190918
CURVE_C = 0.0000004405557501338660


def q_for_score(score: float) -> float:
    if not 0 <= score <= 1000:
        raise ValueError("score must be between 0 and 1000")
    return math.exp(CURVE_A + CURVE_B * score + CURVE_C * score * score)


def score_for_q(q: float) -> float:
    if q <= 0 or not math.isfinite(q):
        raise ValueError("performance rate must be positive and finite")
    discriminant = CURVE_B**2 - 4.0 * CURVE_C * (CURVE_A - math.log(q))
    if discriminant < 0:
        raise ValueError("performance rate outside model domain")
    return (-CURVE_B + math.sqrt(discriminant)) / (2.0 * CURVE_C)


def score_from_time(course_demand_km: float, finish_seconds: float) -> dict:
    if course_demand_km <= 0 or finish_seconds <= 0:
        raise ValueError("course demand and finish time must be positive")

    q = course_demand_km / (finish_seconds / 3600.0)
    raw = score_for_q(q)
    score = round(max(0.0, min(1000.0, raw)))

    return {
        "course_demand": course_demand_km,
        "performance_rate": q,
        "score_raw": raw,
        "score": score,
    }


def time_from_score(course_demand_km: float, score: float) -> float:
    if course_demand_km <= 0:
        raise ValueError("course demand must be positive")
    q = q_for_score(score)
    return 3600.0 * course_demand_km / q
```

---

## 21. Versioning

Changing any of the following requires a new score-model version:

```text
curve constants
curve equation
score anchors
clipping rules
course-demand formula
segment resolution
```

Historical scores must not silently change.

---

## 22. Final V0 statement

> **OTRI is a deterministic course-relative performance index. The course is modeled from its GPX using a transparent gradient-demand function. A finish time is converted into a course-normalized performance rate, and that rate is mapped to a fixed curved 0–1000 scale. The curve is intentionally designed so the middle of the scale remains useful while the highest scores require progressively larger performance-rate increases. Competitor performances do not define the score.**

The result remains fully deterministic:

```text
same course
+
same finish time
+
same model version
=
same OTRI
```
