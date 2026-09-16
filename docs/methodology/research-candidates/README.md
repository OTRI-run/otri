# OTRI Scoring Research Candidates

This directory contains independent candidate designs for a course-based OTRI scoring system.

All candidates share the same governing principle: the fundamental score should be determined from the course model and finish time, not from the strength, identity, number, or historical performance of the competitors in that race.

These are research proposals, not approved OTRI methodology. The purpose is to compare mathematically explicit approaches, identify assumptions, and define validation experiments before OTRI 1.0.

## Candidates

1. `01-gradient-energy-cost-index.md` — integrates published gradient-dependent running energy cost over GPX segments.
2. `02-equivalent-flat-distance-index.md` — converts each course segment into a flat-equivalent distance and maps time to performance.
3. `03-grade-adjusted-time-index.md` — converts a target flat-running time standard into a course-specific target time using grade-adjusted pace.
4. `04-course-structure-difficulty-index.md` — explicitly models how climbing distribution, steepness, and sustained sections alter course demand.
5. `05-time-standard-curve-index.md` — makes the time↔score curve the primary object and treats course difficulty as the transformation between courses.
6. `06-hybrid-transparent-course-index.md` — combines physical energy cost and course-structure terms in a single published equation.

## Common research constraints

- No competitor-relative calibration in the fundamental score.
- No hidden race-specific coefficient derived from the field.
- Same course version + same finish time + same model version must produce the same score.
- Faster times must not produce lower scores on the same course.
- GPX processing must be deterministic and versioned.
- Real-world results are primarily for validation and error analysis, unless a later methodology explicitly justifies a different role.
- Every coefficient and transformation used by an accepted model must be documented and independently reproducible.

## Research basis

The candidate designs draw on published work showing that running energy cost changes strongly with gradient and differs between uphill and downhill running; Minetti et al. measured running cost over slopes from -45% to +45% and fitted a fifth-order polynomial. Later work in trained runners found materially different energy costs at -15%, 0%, and +15%. Trail-running studies also show that performance is related to course-specific and physiological factors, while recent work has demonstrated a physics-based, segment-by-segment trail model for time prediction. These papers are used here as scientific inputs to course modelling, not as evidence that any one proposed score is already validated.

## Important distinction

The purpose of these papers is not to make OTRI more complex for its own sake. Each candidate must earn its complexity by improving course representation while remaining understandable to a runner, race organiser, and independent researcher.
