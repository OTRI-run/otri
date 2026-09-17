# OTRI Endurance-Referenced Curve — V0.4

**Status:** Current default scoring model
**Model identifier:** `0.4.0-course-standard-endurance-referenced`
**Supersedes:** [`../v0.3/OTRI-DURATION-SCALED-CURVE.md`](../v0.3/OTRI-DURATION-SCALED-CURVE.md) (V0.3 remains selectable and reproducible)
**Depends on:** [`../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) — the course-demand engine, the exclusions, the determinism and versioning policy, and V0.1's three real score anchors all still apply unchanged.

## 1. The problem this fixes

A score should say **how good the run was**. Under V0.1 and V0.3 it also said **how long the race was**, and it said it loudly in both directions.

Scoring the published world-best performance at each distance — the same calibre of run every time, by definition the best a human has ever done — should produce the same score at every distance. It did not:

| performance | course demand | V0.1 | V0.3 | V0.4 |
|---|---:|---:|---:|---:|
| 5000 m WR (12:35.36) | 5.000 | 1000 | 1000 | 1000 |
| 10000 m WR (26:11) | 10.000 | 1000 | 1000 | 1000 |
| Half marathon WR (57:30) | 21.098 | 1000 | 1000 | 1000 |
| Marathon WR (2:00:35) | 42.195 | 1000 | 1000 | 1000 |
| 100 km road WR (6:05:35) | 100.000 | 925 | 990 | 969 |
| 100 miles road WR (10:51:39) | 160.934 | 846 | 928 | 971 |
| UTMB 2026 winner (18:16:29) | 218.671 | 702 | 783 | 889 |
| 24-hour road WR (319.614 km) | 319.614 | 771 | 877 | 1000 |

Two separate defects produced that spread, and V0.3 only addressed the first one.

### 1.1 The long-race defect: the duration correction was far too weak

V0.3 already identified the cause — sustainable performance rate necessarily drops as an event gets longer — and corrected for it with Riegel's published exponent `b = 1.06`.

But `b = 1.06` was derived from a survey whose "endurance range" was roughly 3.5–230 minutes. Fitting `b` segment by segment to world-best performances shows it is not a constant at all: it stays near 1.06 from 1500 m to the marathon, then climbs steeply into the ultra range. V0.3's own limitations section flagged exactly this risk. Applying the 4-hour-and-under exponent to an 18-hour race leaves most of the correction unmade, which is why the UTMB winner still only reached 783.

### 1.2 The short-race defect: the top of the scale was invented, and saturated

V0.1's anchor table tops out at `Q = 17.940` demand-km/h for score 1000, and the V0.1 spec is explicit that this number is **"upper-scale continuation"** — an extrapolation, never an observation. Real world-class performances comfortably exceed it, so under V0.1 and V0.3 the top of the scale simply clipped:

| course demand | time needed to score 1000 under V0.3 | time needed under V0.4 |
|---|---:|---:|
| 5 km | 0:15:06 | 0:12:35 |
| 10 km | 0:31:28 | 0:26:14 |
| Half marathon | 1:09:26 | 0:57:52 |
| Marathon | 2:24:46 | 2:00:35 |
| 100 km | 6:01:20 | 5:46:58 |
| 218.671 demand-km | 13:48:07 | 15:04:37 |
| 319.614 demand-km | 20:38:17 | 24:00:00 |

Under V0.3 a **15:06 5 km scored 1000** — a good club run, not a world best — while on a 218.671 demand-km course 1000 required 13:48:07, roughly four and a half hours faster than the fastest such run in history. The same number meant two wildly different things. Raising `b` alone could never have fixed this: the short end was broken by the anchor, not by the exponent.

## 2. The fix: reference the curve to the human ceiling

V0.4 keeps V0.1's course-demand engine and its three **real** score anchors (349, 544, 692) exactly as published. It changes two things, both derived from the same idea:

> A score measures what fraction of the best humanly-possible performance on a course of *this size* the runner achieved.

### 2.1 The reference rate `rate(D)`

`rate(D)` is the world-best performance rate on a course of course demand `D`, defined as a piecewise power law in log-log space through three published reference observations — the same interpolation idiom V0.1 already uses for its score curve:

| reference performance | course demand `D` | `Q` (demand-km/h) |
|---|---:|---:|
| 5000 m track, 12:35.36 | 5.000 | 23.8297 |
| marathon road, 2:00:35 | 42.195 | 20.9954 |
| 24-hour road, 319.614 km | 319.614 | 13.3172 |

These are flat courses, where course demand and physical distance agree to within about a percent, so `D` is the event distance. Between and beyond the anchors:

```text
rate(D) = Q1 * (D / D1)^p        p = ln(Q2/Q1) / ln(D2/D1)
```

with the end segments' exponents continued outside the observed range.

Only three anchors are used, chosen for depth of competition and wide spacing. Everything else is held out as validation (§4).

### 2.2 The scaling factor and the new top anchor

```text
factor(D)   = rate(D_ref) / rate(D)              D_ref = 27.560 demand-km
adjusted_Q  = Q_observed * factor(D)
score       = score_from_q(adjusted_Q)           # V0.1 anchor table, 1000-anchor replaced
```

and the inverse, for target times:

```text
Q_required_at_D = required_q(score) / factor(D)
T               = D / Q_required_at_D * 3600
```

The new 1000-anchor is the measured human ceiling at the reference course size, replacing V0.1's invented `17.940`:

```text
Q_1000 = rate(D_ref) = 21.5331347785 demand-km/h
```

`factor(D_ref) = 1` by construction, so **below score 692 V0.4 still reduces to V0.1 exactly at the reference course size** — a required test (§5).

`performance_rate` in output and API responses stays the **raw, unscaled** `Q = D / T_hours`, a plain physical quantity. Only the score lookup is scaled.

### 2.3 Why this makes race length stop mattering

Substituting `factor(D)` into the lookup:

```text
adjusted_Q = Q_observed * rate(D_ref) / rate(D)
           = (Q_observed / rate(D)) * rate(D_ref)
```

The only course-dependent term left is `Q_observed / rate(D)` — the runner's **fraction of the human ceiling for a course of that size**. Race length cannot influence the score except through that fraction. Scoring one runner held at a fixed 80% of the ceiling:

| course demand | finish time | V0.1 | V0.3 | V0.4 |
|---|---:|---:|---:|---:|
| 5.000 | 0:15:44 | 1000 | 964 | **873** |
| 27.560 | 1:35:59 | 965 | 965 | **873** |
| 42.195 | 2:30:44 | 944 | 965 | **873** |
| 100.000 | 7:13:42 | 797 | 853 | **873** |
| 218.671 | 18:50:47 | 683 | 762 | **873** |
| 319.614 | 30:00:00 | 634 | 721 | **873** |

V0.1 spread the same run across 366 points of the scale and V0.3 across 244. V0.4 is flat, by construction rather than by calibration.

## 3. The emergent Riegel exponent

The equivalent Riegel exponent is a derived, published, checkable property of the reference curve rather than an input:

```text
b(D) = 1 - d ln rate(D) / d ln D
```

| segment | `b` |
|---|---:|
| 5.000 → 42.195 demand-km | **1.059370** |
| 42.195 → 319.614 demand-km | **1.224833** |

The short segment was built only from the 5000 m and marathon world bests, with no reference to Riegel's work — and lands on **1.059**, reproducing Riegel's own published `1.06` to three decimal places over exactly the range his data covered. That is independent corroboration that the short end of the curve has the right shape, and it makes precise what V0.3 got wrong: the ultra range genuinely needs `b ≈ 1.22`, not `1.06`.

`b` is non-decreasing in course demand, a physical requirement (fatigue decay cannot get gentler as races get longer) and what guarantees `factor(D)` stays monotone. Both are required tests.

## 4. Validation against held-out records

None of the following were used to build the curve:

| world record | course demand | observed `Q` | `rate(D)` | % of reference | V0.4 score |
|---|---:|---:|---:|---:|---:|
| 1500 m track (3:26.00) | 1.500 | 26.214 | 25.595 | 102.4% | 1000 |
| 3000 m track (7:20.67) | 3.000 | 24.508 | 24.563 | 99.8% | 999 |
| 10000 m track (26:11.00) | 10.000 | 22.915 | 22.869 | 100.2% | 1000 |
| Half marathon (57:30) | 21.098 | 22.015 | 21.877 | 100.6% | 1000 |
| 50 km road (2:42:07) | 50.000 | 18.505 | 20.209 | 91.6% | 948 |
| 6-hour road (97.200 km) | 97.200 | 16.200 | 17.404 | 93.1% | 957 |
| 100 km road (6:05:35) | 100.000 | 16.412 | 17.293 | 94.9% | 969 |
| 100 miles road (10:51:39) | 160.934 | 14.818 | 15.539 | 95.4% | 971 |
| 12-hour road (177.410 km) | 177.410 | 14.784 | 15.202 | 97.3% | 983 |

From 1500 m to the half marathon the curve reproduces records it never saw to within 2.4%, and mostly within 1%. The ultra records sit at 92–97% of the reference rather than at 100%, which is expected and is not a fit error: those events are contested by far smaller fields than the marathon, so their records genuinely sit further below the human ceiling. They score 948–983 — high, not saturated, and correctly ordered.

### 4.1 Worked example — the 2026 UTMB winning performance

```text
D = 218.671 demand-km
T = 18:16:29 (65,789 s)

Q            = 11.9657632735         # unchanged from V0.1
rate(D)      = 14.5035676248
rate(D_ref)  = 21.5331347785
factor(D)    = 1.4846784829
adjusted_Q   = 17.7653112642

fraction of the human ceiling: 82.50%

V0.1 score:  702
V0.3 score:  783
V0.4 score:  889
```

## 5. Required tests

- **Reference-size equivalence:** for any score up to 692, `target_time_seconds(D_ref, S, ENDURANCE_REFERENCED_CURVE) == target_time_seconds(D_ref, S, OFFICIAL_CURVE)` within floating-point tolerance, and the shared anchors must be identical objects of value.
- **Scaling is a no-op at the reference size:** `factor(D_ref) == 1`.
- **Riegel corroboration:** the short segment's `b` is `1.06 ± 0.01`.
- **Monotone fatigue:** `b(D)` is non-decreasing in `D` and always greater than 1; `rate(D)` is strictly decreasing in `D`.
- **Every world best scores near the top:** all reference *and held-out* world bests in §4 score between 940 and 1000.
- **Length-independence:** a runner at a fixed fraction of the ceiling scores within 1 point of the same value for course demands from 5 to 700 demand-km.
- **No short-course saturation:** a 15:06 5 km scores under 950 (it scored exactly 1000 under V0.3).
- **The raw reported rate is unscaled** and identical across curves.
- **Monotonicity:** for a fixed course, faster always scores higher (V0.1 §18), checked at several course sizes.
- **Inverse symmetry:** `score → target_time → score` round-trips within tolerance across course-demand sizes from 3 to 700 demand-km.
- **Out-of-range courses are flagged,** not silently extrapolated, and the flag reaches the scored output.
- **V0.3 and V0.1 remain reproducible:** their published scores for the worked example are asserted exactly.

## 6. Explicit limitations

- **The reference observations are road and track performances.** Course demand normalises gradient cost, but not technical footing, altitude, night running, cumulative descent damage, or self-sufficiency. A mountain ultra therefore has a structurally lower achievable fraction of the road-referenced ceiling, which is most of why the UTMB winner lands at 889 rather than near 1000. That gap belongs to the course-demand model, not to this curve, and closing it needs a terrain/technicality term that OTRI does not yet have data for. Until then, 889 should be read as "82.5% of the road-equivalent human ceiling", not as "11% off a perfect run".
- **Courses beyond 319.614 demand-km extrapolate the 24-hour exponent.** Multi-day mountain ultras include sleep stops, so their true rate decay is steeper than the continued exponent and this model under-credits them. These courses receive a `course_demand_above_reference_range` quality flag. The same applies below 5 demand-km, with a matching flag.
- **Three anchors is a deliberately small basis.** The held-out validation in §4 is what justifies it; a larger, OTRI-owned dataset would justify more.
- **The reference observations are frozen constants of model version `0.4.0`.** When a record falls, refreshing the table is a new model version, never an edit in place (V0.1 spec §21). Historical scores are never silently rewritten.
- **This is not calibrated against, or intended to reproduce, any third-party proprietary index.** OTRI's independence from competitor methodologies applies here as everywhere else.
- **The score curve's shape between 0 and 692 is still V0.1's demo/test calibration.** V0.4 fixes what 1000 means and fixes how course size enters the score; it does not re-derive the middle of the scale, which remains the weakest-evidenced part of the model.

## 7. What would make this non-provisional

Real finish times on real GPX courses with known course demand, across a spread of course sizes *and* a range of relative performance levels — not just winners — would let the 0–692 portion of the curve be re-derived from OTRI's own data instead of inherited from V0.1's demo race, and would let the terrain gap in §6 be measured rather than acknowledged.
