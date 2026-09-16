# Candidate Paper 01 — Gradient Energy Cost Index (GECI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Course-only scoring model

## Abstract

The Gradient Energy Cost Index (GECI) evaluates a trail course by integrating a published gradient-dependent running energy-cost function over a cleaned GPX track. Each course is transformed into a reproducible physical-demand value. A separate, explicitly defined time-to-score function converts the resulting course demand and finish time into an OTRI performance score.

The fundamental score does not use competitors, historical race results, field strength, runner profiles, or race-specific statistical adjustments. Real results can be used to validate the model but do not define an individual race's coefficient.

## Scientific basis

Minetti et al. measured walking and running energy cost over gradients from approximately -45% to +45% and fitted a fifth-order polynomial to running cost as a function of slope. Their reported running-cost curve has a level-running value around 3.6 J/kg/m and shows strongly asymmetric uphill and downhill behavior. citeturn561822search0turn561822search1

In well-trained trail runners, energy cost has also been measured at -15%, 0%, and +15%, with substantially different values across the three gradients. citeturn523951search6

## Course representation

The official GPX is converted into segments of fixed target length, for example 20 m. The implementation should test 10 m, 20 m, and 50 m resolutions for stability before selecting a standard.

For each segment `i` store:

- horizontal distance `d_i`
- elevation change `Δh_i`
- grade `g_i = Δh_i / d_i`
- smoothed grade `g*_i`
- cumulative ascent/descent
- course position

The elevation-processing pipeline must be deterministic and versioned.

## Core equation

Let `C(g)` be the metabolic energy cost of running at gradient `g`, expressed in J·kg⁻¹·m⁻¹.

A direct Minetti-based candidate is:

```text
C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6
```

where `g` is a decimal grade, e.g. `0.10` for +10%. citeturn561822search1

Normalize against flat running:

```text
R(g) = C(g) / C(0)
```

Then calculate course demand:

```text
D_GECI = Σ [ d_i × R(g_i) ]
```

The units can be interpreted as **flat-equivalent distance under the model**. This is not yet an OTRI score.

## Why this is attractive

- Entirely course based.
- Uses a published physical relationship rather than field strength.
- Uphill and downhill are inherently asymmetric.
- The effect of every segment can be displayed.
- Deterministic and straightforward to reproduce.

## Major limitation

The Minetti relationship was measured on treadmills and assumes a running gait. Very steep trail sections may involve hiking, and technical terrain is not represented by grade alone. The research itself shows that terrain conditions can alter oxygen cost and movement mechanics. citeturn523951search7

Therefore, GECI should not extrapolate indefinitely beyond its evidence base. The implementation should define a supported gradient range and a documented treatment for values outside that range.

## From course demand to OTRI

The course demand `D_GECI` must be converted into a course-specific time standard.

One candidate form is:

```text
T(S, D) = T_flat(S) × F(D)
```

where:

- `S` = OTRI score
- `D` = course demand
- `T_flat(S)` = reference flat-course time associated with score `S`
- `F(D)` = dimensionless course-demand transformation

The research task is to define `T_flat(S)` and `F(D)` independently and publish both.

## Pre-race use

For any desired score `S`, calculate:

```text
TargetTime = T(S, D_GECI)
```

For a completed race:

```text
Score = inverse_T(FinishTime, D_GECI)
```

The same mathematical curve is used before and after racing.

## Validation plan

Use a held-out set of official GPXs and results. Measure:

- median absolute error in predicted time standards
- mean absolute error
- bias
- stability under GPX resampling
- stability under small elevation perturbations
- error by distance range
- error by elevation profile shape
- error by gradient exposure

Do not fit a hidden race coefficient from the validation results.

## Failure cases to investigate

- noisy or incorrect GPX elevation
- long steep sections where walking is common
- technical terrain with little elevation change
- runnable descents where Minetti overstates or understates achievable speed
- courses with substantial aid-station or congestion time

## Research status

GECI is a physically grounded candidate, not an approved OTRI formula. Its main research question is whether an energy-cost integral alone can create a stable cross-course time standard without importing competitor-relative information.

## References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. Energy Cost of Running in Well-Trained Athletes: Toward Slope-Dependent Factors. 2021. DOI: 10.1123/ijspp.2021-0047. citeturn523951search6
3. Effect of ground technicity on cardio-respiratory and biomechanical parameters in uphill trail running. 2021. citeturn523951search7
