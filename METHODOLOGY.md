# OTRI Methodology

**Status:** Research / pre-1.0

This document describes the principles and research direction for the Open Trail Running Index. It is intentionally not a final scoring formula. The formula should emerge from testing against legitimately obtained data and should be versioned once released.

## 1. Objective

Estimate the relative strength of a trail-running performance while accounting for meaningful differences between races and courses.

The goal is prediction and comparability — not replication of any other proprietary system.

## 2. Core inputs

Potential variables include:

- finish time;
- course distance;
- elevation gain and loss;
- elevation distribution;
- gradient distribution;
- terrain/technicality indicators where reliable;
- altitude;
- environmental conditions where reliable;
- field strength;
- repeated-runner observations;
- completion/DNF information.

Not every variable should automatically enter the model. Each feature must demonstrate useful predictive value and acceptable data quality.

## 3. Course model

OTRI should maintain a separate course-difficulty model. A course is represented by measurable characteristics rather than a single subjective label.

The course model may use GPX-derived features such as distance, climbing, descending, gradient distribution, altitude, and route geometry.

Course versions must be preserved when routes materially change.

## 4. Performance model

The performance model should transform an observed race result into an OTRI score after accounting for course and field effects.

Candidate statistical approaches include hierarchical models, robust regression, mixed-effects models, and carefully validated machine-learning models.

Model selection must prioritize:

1. predictive accuracy;
2. stability;
3. interpretability;
4. resistance to manipulation;
5. reproducibility.

A more complex model is not automatically a better model.

## 5. Field strength

Field strength can be estimated from independently observed performances and repeat participants. Avoid circular logic where a race's score is used to prove that the race's field was strong and then used again to calculate the score.

Field adjustments should be regularized and uncertainty-aware, especially for small fields.

## 6. Repeat runners

Runners who participate in multiple races create valuable calibration links between courses. Identity resolution must be privacy-conscious and should avoid relying on unnecessary personal information.

Repeat-runner evidence should strengthen the model without allowing a single athlete or race to dominate it.

## 7. Scaling

OTRI should use a clearly defined numerical scale. The scale and interpretation must be documented independently of other trail indexes.

Avoid implying that an OTRI value is equivalent to another organization's proprietary score or index value.

## 8. Confidence

A score should have an associated confidence or reliability measure based on factors such as:

- amount of race data;
- field size;
- course-data quality;
- number of repeat-runner links;
- model uncertainty;
- whether the course is well calibrated.

## 9. GPX prediction

The model should eventually support both directions:

### Target score → time

Given a GPX and target OTRI, estimate the finish-time range associated with that target.

### Time → score

Given a GPX and projected finish time, estimate the expected OTRI range.

Predictions must include uncertainty. A new course should generally produce a wider interval than a heavily calibrated course.

## 10. Avoiding overfitting

Use held-out races and temporal validation. Do not randomly split correlated results in a way that leaks information between training and test sets.

Important tests include:

- unseen race;
- unseen course;
- new race edition;
- different geographic region;
- different distance band;
- small field;
- large field;
- unusual elevation profile.

## 11. Versioning

Every published model receives a version identifier. Historical scores should remain reproducible using the model version under which they were calculated.

A methodology change should not silently rewrite history.

## 12. Benchmarking

Benchmark against future outcomes and repeat-runner evidence. External indexes may be studied as contextual reference points, but the target should be accurate, fair, and independently justified OTRI scoring.

## 13. Research discipline

Every major formula change should include:

- hypothesis;
- dataset description;
- methodology;
- alternatives considered;
- validation results;
- error analysis;
- known limitations;
- reproducibility information.

Until enough data exists, OTRI should prefer a simple transparent baseline over an impressive-looking but poorly validated model.
