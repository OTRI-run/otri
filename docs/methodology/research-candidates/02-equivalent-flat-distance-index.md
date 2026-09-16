# Candidate Paper 02 — Equivalent Flat Distance Index (EFDI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Convert a trail GPX into an intuitive flat-equivalent course length

## Abstract

The Equivalent Flat Distance Index (EFDI) reduces a trail course to a single, intuitive quantity: the distance a runner would have to cover on an ideal flat course to experience the modeled course demand. It is then possible to define an OTRI score by comparing finish time with a fixed reference time curve over equivalent flat distance.

EFDI is deliberately simpler than a full physiological model. It does not model an individual runner, fatigue, previous results, or competitor strength.

## Scientific basis

Gradient-dependent energy cost is well established. Minetti et al. measured running cost across a wide range of slopes and produced a fifth-order polynomial describing the relationship. citeturn561822search0turn561822search1

## Calculation

Split the GPX into segments `i`.

For each segment:

```text
C_i = C(g_i)
R_i = C_i / C_flat
EFD_i = d_i × R_i
```

Then:

```text
EFDI = Σ EFD_i
```

where `C_flat = C(0)`.

The result is expressed in kilometres of modeled flat-equivalent distance.

## Example

A 30 km trail may produce:

```text
Raw distance:            30.0 km
Elevation gain:        1,450 m
Elevation loss:        1,420 m
EFDI:                   47.8 km
```

The 47.8 km number is not claimed to be the real physical distance. It is the output of an explicit course-demand model.

## Score calculation

Define a reference flat-course time function `T_flat(S)` for OTRI score `S`.

The simplest EFDI transformation is:

```text
T_course(S) = T_flat(S) × (EFDI / D_ref)^β
```

where:

- `EFDI` = modeled equivalent flat distance
- `D_ref` = reference flat distance represented by the score curve
- `β` = published transformation exponent

A linear alternative is:

```text
T_course(S) = pace_flat(S) × EFDI
```

where `pace_flat(S)` is the reference pace corresponding to score `S`.

The research program should determine whether linear distance scaling is sufficient or whether the relationship changes by race duration.

## Advantages

- Extremely easy to explain.
- The GPX becomes one understandable quantity.
- Easy to compute and cache.
- Naturally supports pre-race target-time calculations.
- No competitor-relative information is required.

## Weaknesses

The main risk is that reducing a highly structured course to one number may discard information. Two courses can have identical EFDI while having very different distributions of steep climbing and descending.

EFDI also inherits limitations from the underlying gradient-cost function and does not directly represent technical terrain or surface.

## Research questions

1. Does EFDI preserve enough information to distinguish materially different course structures?
2. Should uphill and downhill equivalent-distance contributions have separate exponents?
3. Does a long sustained climb require a structural correction beyond the integral of gradient cost?
4. Does EFDI behave reasonably for ultra distances where course speed is not a simple linear function of distance?

## Optional asymmetry extension

A richer version could use:

```text
EFDI = EFD_up + EFD_flat + EFD_down
```

and then:

```text
CourseDemand =
    w_up × EFD_up +
    w_flat × EFD_flat +
    w_down × EFD_down
```

with all weights publicly defined and subjected to validation.

## Validation

Compare EFDI-based target times against held-out race outcomes and against the simpler distance-plus-elevation baseline.

The comparison should focus on error and robustness, not on fitting hidden coefficients to individual races.

## References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. Osgnach C, Koren K, Šimunič B, Ušaj A, di Prampero PE. *Energy cost of running uphill as compared to running on the level with impeding horizontal forces.* European Journal of Applied Physiology. 2025;125:61–69. DOI: 10.1007/s00421-024-05587-z. citeturn523951search0
