# Candidate Paper 05 — Time Standard Curve Index (TSCI)

**Status:** Research candidate  
**Version:** 0.1  
**Purpose:** Make the course-specific time↔score curve the primary OTRI object

## Abstract

The Time Standard Curve Index (TSCI) reverses the usual order of trail scoring. Instead of first calculating a race score from a results population, OTRI first constructs a deterministic **time standard curve** for the exact course. The score is then simply the inverse mapping from observed finish time to that curve.

This candidate is deliberately agnostic about the internal course-demand metric. The curve can be generated from an energy-cost model, an equivalent-distance model, a structural course model, or a future combination of these.

## Core principle

For every fixed course version:

```text
T = F(course, score)
```

and therefore:

```text
score = F^-1(course, time)
```

The curve, not the race field, is the scoring object.

## Course input

The course model can produce a scalar `D` or a richer course representation `X`.

Examples:

```text
D = equivalent flat distance
D = integrated gradient energy cost
D = hybrid physical + structural demand
```

Then:

```text
T_course(S) = T_reference(S) × H(X)
```

where `H(X)` is a transparent course transformation.

## Alternative parametric score mapping

A simple monotonic family is:

```text
S = A - B × ln(T / T0(course))
```

where:

- `S` is OTRI score
- `T` is finish time
- `T0(course)` is a course-specific reference time
- `A`, `B` define the global score scale

Another candidate is a power relationship:

```text
T_course(S) = T0(course) × exp[-k(S - S0)]
```

The exact family must be selected by mathematical properties, interpretability and validation rather than by fitting whichever formula gives the best historical correlation.

## Why this candidate matters

Most of the intellectual effort becomes concentrated in two transparent questions:

1. How do we calculate course demand?
2. How should score units map to time?

Once both are defined, pre-race and post-race calculations are naturally symmetric.

## Required properties

The score function must be:

- monotonic in time;
- deterministic;
- continuous unless a documented boundary is intentional;
- numerically stable;
- invertible or cheaply solvable;
- independent of competitor results.

## Reference-scale question

The most difficult unresolved issue is what OTRI score values mean.

A score of 600 cannot be defined merely because another trail index uses 600.

Possible research approaches include:

```text
A. Calibrate score to an explicit flat-running reference standard.
B. Define score from percentiles of a synthetic mathematical standard.
C. Define score from a reference time-performance curve derived from established running performance equations.
```

These options require separate study.

## Pre-race calculation

A runner selects a target score:

```text
S = 600
```

OTRI returns:

```text
T_course(600)
```

A runner can then compare targets without racing.

## Post-race calculation

The official finish time is inserted into exactly the same curve:

```text
S = F^-1(course, finish_time)
```

No second race-specific algorithm should be necessary.

## Advantages

- Clean conceptual model.
- Excellent explainability.
- Naturally supports pre-race target planning.
- No need to store a statistical race coefficient.
- Historical results can remain entirely outside the fundamental score computation.

## Risks

The curve is only as credible as the course transformation and the global score scale. If the flat-reference scale is arbitrary, a mathematically elegant curve can still have arbitrary score meaning.

## Research recommendation

TSCI should be treated as the **scoring architecture**, while one of the other candidates supplies the course-demand engine.

## References

1. ITRA describes a 0–1000 performance scale, illustrating the usefulness of a bounded score but not prescribing OTRI's meaning or formula. citeturn234967search8
2. UTMB publicly documents a race-specific regression approach in which speed is converted into a score through a race-specific coefficient; TSCI intentionally removes the competitor-derived race coefficient and instead requires the course model itself to generate the curve. citeturn234967search3
3. Runner discussion indicates that users value a trail score partly because it can serve as a personal performance target independent of race placing. citeturn523951reddit71
