# Candidate Paper 06 — Hybrid Transparent Course Index (HTCI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Combine physically grounded gradient cost with explicitly measurable course structure

## Abstract

The Hybrid Transparent Course Index (HTCI) combines two types of course information: (1) a physically motivated gradient-cost integral and (2) explicit structural descriptors of the elevation profile. The objective is to preserve the simplicity and reproducibility of a GPX-based model while allowing the system to distinguish courses whose distance and total ascent are similar but whose gradient structure differs.

HTCI is not a race-results model. All course terms can be calculated before a race is run.

## Model

First calculate base gradient demand:

```text
D_base = Σ d_i × C(g_i) / C(0)
```

using a published gradient-cost function. Minetti et al. provide a fifth-degree running-cost relationship over a wide gradient range. citeturn561822search0turn561822search1

Next calculate structural descriptors:

```text
X1 = climb concentration
X2 = descent concentration
X3 = steep uphill exposure
X4 = steep downhill exposure
X5 = gradient variability
X6 = longest sustained climb / course distance
X7 = longest sustained descent / course distance
```

Create a transparent course multiplier:

```text
M_struct = exp(
    b1 X1 +
    b2 X2 +
    b3 X3 +
    b4 X4 +
    b5 X5 +
    b6 X6 +
    b7 X7
)
```

Then:

```text
D_HTCI = D_base × M_struct
```

All `b` coefficients must be published. A coefficient may only be introduced or changed through a documented research revision.

## Why the exponential form is considered

An exponential link guarantees a positive multiplier:

```text
M_struct > 0
```

and permits additive contributions in model space.

A linear multiplier is also possible:

```text
M_struct = 1 + Σ b_j X_j
```

The choice should be based on stability and interpretability rather than historical fit alone.

## Gradient cost and structure play different roles

The base term asks:

> How much grade-dependent running cost is present?

The structural term asks:

> How is that grade distributed through the course?

This prevents one scalar from having to represent every course characteristic.

## Course difficulty output

HTCI produces:

```text
D_HTCI
```

which can be converted into a normalized Course Difficulty value for display.

The display scale and the underlying physical demand should remain separate so that changing a presentation scale does not alter the underlying model.

## Time standard

The course demand can feed the OTRI time-standard curve:

```text
T_course(S) = T_reference(S) × H(D_HTCI)
```

or the model can learn a direct monotonic mapping from course demand to target time without using the race's competitors.

## Strong point

HTCI is a good candidate when OTRI wants the course profile itself to be the explanation.

A runner can inspect:

```text
Base gradient demand
+ structural difficulty
= total modeled course demand
```

## Risk

Every additional coefficient creates an opportunity for overfitting. The model therefore needs strict feature selection, independent validation data, and sensitivity analysis.

## Technical terrain extension

Technicality should not be added as a subjective score. Research has shown that technical trail terrain can alter oxygen cost and foot-acceleration variability, but a reproducible OTRI variable would need an objective measurement scheme. citeturn523951search7

Possible future inputs:

```text
terrain roughness
surface category
single-track share
obstacle density
turn density
```

These should be treated as future research features, not V1 assumptions.

## Validation

Run ablation tests:

```text
Base gradient only
Base + climb structure
Base + descent structure
Base + all structure
```

If the added structural terms do not improve out-of-sample behavior materially, they should not enter the production model.

## References

1. Minetti AE et al. 2002. *Energy cost of walking and running at extreme uphill and downhill slopes.* DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. Osgnach C et al. 2025. *Energy cost of running uphill as compared to running on the level with impeding horizontal forces.* DOI: 10.1007/s00421-024-05587-z. citeturn523951search0
3. Effect of ground technicity on cardio-respiratory and biomechanical parameters in uphill trail running. 2021. citeturn523951search7
