# OTRI Course-Demand Formula — V0 Research Specification

**Status:** Proposed V0 foundation  
**Version:** 0.3  
**Scope:** Deterministic course-only difficulty calculation from GPX  
**Principle:** Course-relative, competitor-independent, reproducible

---

## 1. Decision

OTRI V0 uses a **segment-based, gradient-dependent course-demand integral** as the foundation of course difficulty.

The core quantity is a modeled demand-equivalent distance derived from the energetic cost of running at the local course gradient.

```text
D = Σ [ d_i × R(g_i) ]
```

where:

- `d_i` = horizontal distance of segment `i`
- `g_i` = processed grade of segment `i`
- `R(g_i)` = dimensionless gradient cost relative to level running
- `D` = total modeled course demand

`D` is **not** the athlete score and is not a literal measurement of total athlete energy expenditure. It is the course quantity used by the OTRI time-to-score model.

---

## 2. Why this foundation

A trail course cannot be adequately described by advertised distance and total elevation alone.

Two courses may both be:

```text
20 km
+1,000 m ascent
```

while having very different distributions of climbing and descending.

OTRI therefore models the complete signed elevation profile segment by segment.

The scientific basis is the established finding that running energy cost changes materially with gradient and that the relationship is nonlinear and asymmetric between uphill and downhill running. Minetti et al. measured running cost across approximately −45% to +45% slope. citeturn187845search0

---

## 3. Course data requirements

The preferred source is an official course GPX.

The GPX should contain at least:

```text
latitude
longitude
elevation
track order
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

## 4. GPX processing pipeline

The processing pipeline is deterministic:

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
resample to 50 m target segments
  ↓
calculate segment grade
  ↓
calculate gradient cost
  ↓
sum segment demand
```

No race-result information enters this pipeline.

---

## 5. Distance calculation

For each consecutive GPX pair, calculate horizontal surface distance from geographic coordinates.

A geodesic or equivalent WGS84 distance calculation should be used consistently.

The implementation must not mix incompatible distance definitions inside one course model.

For each segment:

```text
d_i = horizontal distance
```

The physical course distance is:

```text
D_physical = Σ d_i
```

The course-demand distance `D` is calculated separately.

---

## 6. Elevation processing

Raw GPX elevation can contain GPS/barometric noise. OTRI must therefore use a deterministic elevation-processing method.

V0 processing is:

```text
raw elevation
→ remove non-finite values
→ remove obvious isolated spikes
→ rolling median
→ rolling mean
```

The smoothing windows are fixed model parameters and recorded with the processing version. They are never tuned separately for individual races.

Raw elevation must remain available for audit.

---

## 7. Segment resolution

V0 production uses:

```text
50 m target segments
```

The course is resampled along cumulative horizontal distance. The final remainder is retained.

The practical V0 decision is 50 m rather than 20 m because 20 m segments proved too sensitive to short-lived GPX/elevation noise and local micro-pitches in practical course testing. The purpose of the 50 m resolution is to retain meaningful course structure while producing a more stable gradient signal.

20 m and 10 m remain useful **research comparison resolutions**, but they are not the production V0 resolution.

The processing implementation must report the actual segment count and preserve the original GPX for audit.

---

## 8. Grade calculation

For each segment:

```text
g_i = Δh_i / d_horizontal_i
```

where:

- `Δh_i` = processed elevation change
- `d_horizontal_i` = horizontal segment distance

Express grade as a decimal:

```text
+10% = +0.10
-10% = -0.10
```

The model must use the same grade definition everywhere.

---

## 9. Gradient-cost function

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

The model keeps the sign of the gradient, so uphill and downhill are not collapsed into `abs(g)`.

Minetti et al. measured running cost over approximately −45% to +45% and found a strongly nonlinear, asymmetric response to slope. citeturn187845search0

---

## 10. Supported gradient range

V0 supports:

```text
-45% ≤ grade ≤ +45%
```

Do not silently extrapolate the polynomial beyond this domain.

Recommended behavior:

```text
if -0.45 <= g <= +0.45:
    calculate normally
else:
    mark the course model as unsupported
```

A course with unsupported gradients should not silently receive a normal official score.

---

## 11. Segment demand

For each segment:

```text
demand_i = d_i × R(g_i)
```

Total course demand:

```text
D = Σ demand_i
```

The result is a **modeled demand-equivalent distance** under the normalized gradient-cost relationship.

Example:

```text
Physical distance = 20.0 km
Course demand     = 27.4 km
```

The second number does not mean the course is physically 27.4 km long. It is a model coordinate representing the course's integrated gradient demand.

---

## 12. Why not simply use elevation gain?

A simple model such as:

```text
D = distance + elevation_gain / constant
```

has major limitations:

1. It ignores downhill behavior.
2. It ignores how the same elevation can be distributed across different gradients.

OTRI retains the full signed gradient profile instead.

---

## 13. Why not add arbitrary steepness penalties?

Do not begin V0 with unexplained terms such as:

```text
+10% for steepness
+5% for many climbs
+15% for difficult sections
```

unless each term has a separately justified mathematical basis.

The V0 course-demand integral already applies a continuous gradient-dependent transformation to every segment.

---

## 14. Course structure diagnostics

V0 should calculate and store diagnostics such as:

```text
number of uphill segments
number of downhill segments
mean uphill grade
mean downhill grade
maximum sustained climb
maximum sustained descent
length of each climb
length of each descent
gradient variance
gradient-change rate
```

These are diagnostics for research and explanation. They are not additional score coefficients in V0.

---

## 15. Technical terrain

Technical terrain is relevant to trail performance, but V0 does not currently add a subjective technicality coefficient.

Future work may investigate objective GPX-derived or mapped variables, but any such addition requires a separate specification, measurement definition and model-version change.

---

## 16. Important limitation: energy cost is not race pace

This is the central limitation of the course model.

`C(g)` measures energy cost per unit distance. It is not itself a measured race-time multiplier.

Therefore:

```text
R(g) = C(g)/C(0)
```

is a **physically motivated course-demand transformation**, not a proven universal time multiplier.

OTRI should therefore call `D`:

> **modeled course demand**

rather than exact energetic expenditure or exact equivalent race distance.

---

## 17. Complete V0 course-demand formula

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3
     + 46.3g^2 + 19.5g + 3.6

R(g) = C(g) / 3.6

D = Σ [d_i × R(g_i)]
```

with:

```text
d_i = horizontal 50 m target-segment distance

g_i = processed decimal grade
D   = total modeled course demand
```

---

## 18. Connecting course demand to the score

The current V0.3 scoring layer is:

```text
Q = D / T_hours
```

The resulting `Q` is passed into the curved OTRI score model documented in:

```text
OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md
OTRI-SCORE-SCALE-FINAL-V0.md
```

The current score anchors are:

```text
OTRI 200  → Q 11.0
OTRI 500  → Q 15.0
OTRI 1000 → Q 30.0
```

The course-demand document deliberately does not duplicate the score-curve equation so the scoring constants have one source of truth.

---

## 19. Validation design

The course-demand model must be tested on a large independent dataset of high-quality race GPXs and official finish times.

Required comparisons include:

```text
10 m vs 20 m vs 50 m segmentation
raw vs smoothed elevation
same distance, different elevation
same elevation, different gradient distribution
uphill-heavy vs downhill-heavy courses
rolling vs sustained climbs
```

The key stability requirement is:

> Small changes in GPX sampling or reasonable elevation smoothing should not produce large unexplained changes in course demand.

---

## 20. Versioning

Changing any of the following requires a new processing/model version as appropriate:

```text
segment resolution
elevation smoothing
spike-removal rule
gradient function
course-demand formula
score-curve formula
score anchors
```

Historical course versions and historical scores must remain reproducible.

---

## 21. Final V0 course statement

> **OTRI V0 models a trail course from its GPX as a deterministic, signed-gradient demand integral using fixed 50 m target segments. The result is a transparent course-demand coordinate that is then combined with finish time to produce the OTRI performance rate and curved 0–1000 score.**

The course engine is deliberately independent of competitor performance, field strength and athlete physiology.
