# Candidate Paper 04 — Course Structure Difficulty Index (CSDI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Model course difficulty from how gradients are arranged, not only their totals

## Abstract

The Course Structure Difficulty Index (CSDI) treats trail difficulty as a function of the **shape and distribution** of a course profile. Instead of reducing a race to distance and total elevation, CSDI measures the segmentation, steepness, duration, and sequencing of uphill and downhill sections.

The index can be combined with a separate physical gradient-cost term to create a time-performance curve.

## Motivation

Two courses can have identical distance and total ascent but very different profiles. Runner discussions repeatedly highlight this practical problem: runners want to know whether elevation is concentrated in a few long climbs, distributed across many rolling sections, and where steep downhill exposure occurs. citeturn743386reddit25

## Course features

After segmenting the GPX, calculate:

```text
distance
ascent
 descent
grade distribution
mean absolute grade
95th/99th percentile grade
longest uphill section
longest downhill section
number of meaningful climbs
number of meaningful descents
share of distance above grade thresholds
share of distance below grade thresholds
gradient variability
climb fragmentation
```

## Proposed calculation

First create a normalized physical cost:

```text
D_physical = Σ d_i × M(g_i)
```

Then calculate structure descriptors.

Example:

```text
L_max_up       = longest continuous climb
L_max_down     = longest continuous descent
G90_up        = 90th percentile positive grade
G90_down      = 90th percentile absolute negative grade
F_steep_up    = fraction of course above a defined steepness threshold
F_steep_down  = fraction below a negative threshold
V_grade       = normalized gradient variability
```

A transparent structure multiplier could then be:

```text
M_structure =
    1
  + a1 × Z(L_max_up)
  + a2 × Z(F_steep_up)
  + a3 × Z(L_max_down)
  + a4 × Z(F_steep_down)
  + a5 × Z(V_grade)
```

where each coefficient is fixed by published research or a formally approved calibration study.

The final course demand becomes:

```text
D_CSDI = D_physical × M_structure
```

The coefficients must never be silently estimated from the specific race being scored.

## Why structure matters

An integral of gradient cost can produce the same total demand for profiles that differ substantially in shape. CSDI explicitly tests whether profile structure adds explanatory power after physical gradient cost is already known.

## Possible new concept: climb concentration

Define:

```text
ClimbConcentration =
    area under the largest X% of uphill sections
    ---------------------------------------------
    area under all uphill sections
```

A course with 80% of its ascent concentrated in a few major climbs would therefore differ from a course where ascent is evenly distributed.

This is mathematically transparent and can be calculated from the GPX alone.

## Possible new concept: steepness exposure

Instead of maximum grade alone:

```text
SteepExposure_up = Σ distance_i where grade_i > threshold
SteepExposure_down = Σ distance_i where grade_i < -threshold
```

This captures how much of the course is actually steep, rather than using one extreme GPS point.

## Advantage

CSDI can explain why two courses with the same distance and elevation totals can receive different difficulty ratings.

## Risk

The more structure variables are added, the easier it becomes to overfit a historical dataset. OTRI should therefore add features only when they have a defensible physical interpretation or independent scientific support.

## Validation experiment

Create matched course pairs:

```text
same distance
same ascent
same descent
```

but deliberately different:

```text
gradient distribution
climb concentration
steepness exposure
```

Test whether CSDI separates the expected time standards more sensibly than a distance-plus-elevation baseline.

## References

1. Minetti AE et al. *Energy cost of walking and running at extreme uphill and downhill slopes.* 2002. DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. Trail-running GPX-preparation discussion showing runner interest in climb structure, gradient steepness and course segmentation. citeturn743386reddit25
3. Osgnach C et al. *Energy cost of running uphill as compared to running on the level with impeding horizontal forces.* 2025. DOI: 10.1007/s00421-024-05587-z. citeturn523951search0
