# Candidate Paper 03 — Grade-Adjusted Time Index (GATI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Convert a flat performance time standard into a course-specific time standard

## Abstract

The Grade-Adjusted Time Index (GATI) starts with an explicit reference relationship between OTRI score and flat-course performance. The GPX is then used to calculate how a fixed reference pace would change over every course segment because of gradient. The resulting integrated time transformation creates a course-specific target time for every score.

Unlike ordinary GAP, GATI is not primarily intended to describe an observed run. It is a **forward scoring standard**: score first, course second, target time third.

## Core idea

Let `P(S)` be the reference flat pace associated with score `S`.

For each course segment `i`, define a grade multiplier `M(g_i)`.

Then:

```text
segment_time_i = d_i × P(S) × M(g_i)
```

and:

```text
T_course(S) = Σ segment_time_i
```

The race score is the inverse function:

```text
OTRI = T_course^(-1)(FinishTime)
```

## Gradient multiplier

A physics-based starting point is:

```text
M(g) = C(g) / C(0)
```

where `C(g)` is the gradient-dependent running energy cost from Minetti et al. The published model uses a fifth-order polynomial fitted to running cost over approximately -45% to +45% grade. citeturn561822search0turn561822search1

This means the same flat reference pace is transformed differently on every segment.

## Why GATI differs from a normal GAP

Traditional GAP asks:

> What flat pace was equivalent to the effort I actually produced?

GATI asks:

> If score `S` represents a specified flat performance level, how long would that performance take on this exact GPX?

That makes GATI directly useful for pre-race score planning.

## Example

Suppose the reference flat pace for a hypothetical score is:

```text
4:30/km
```

The course engine transforms it segment by segment:

```text
0%       → approximately 4:30/km equivalent
+5%      → slower
+12%     → much slower
-5%      → faster
-15%     → faster, but with less downhill benefit than a naive linear elevation rule
```

The integrated result is the score's expected course time.

## Main advantage

The complete score curve can be generated **before the race exists as a results dataset**.

```text
Course GPX
    +
Flat score standard
    ↓
Target time for every OTRI score
```

## Main limitation

A direct metabolic multiplier assumes that course time scales cleanly from energetic cost. Real trail races contain pacing decisions, terrain constraints, technical sections and changes in achievable speed. The Minetti model itself describes metabolic cost rather than a complete trail race time model. citeturn561822search1

Therefore GATI must be tested against observed course-time relationships before adoption.

## Structural correction option

GATI could optionally distinguish sustained gradients from rapidly changing gradients:

```text
M_effective = M(grade) × S(structure)
```

where `S(structure)` is a transparent course-shape term, not a result-derived race coefficient.

This extension should only be introduced if a controlled validation study shows that the base gradient integral systematically misses course structure.

## Validation

Use races only as held-out validation data.

Compare predicted `T_course(S)` with observed finish-time distributions across courses with:

- similar distance but different elevation distributions
- similar elevation but different gradient distributions
- rolling versus sustained-climb profiles
- runnable versus steep descent profiles

## References

1. Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology. 2002;93(3):1039–1046. DOI: 10.1152/japplphysiol.01177.2001. citeturn561822search0turn561822search1
2. Osgnach C, Koren K, Šimunič B, Ušaj A, di Prampero PE. *Energy cost of running uphill as compared to running on the level with impeding horizontal forces.* European Journal of Applied Physiology. 2025;125:61–69. DOI: 10.1007/s00421-024-05587-z. citeturn523951search0
