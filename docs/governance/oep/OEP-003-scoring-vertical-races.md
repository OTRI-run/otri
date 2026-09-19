# OEP-003: Scoring vertical races

**Status:** Accepted (2026-09-19, by the maintainer). **Affects:** build id `0.10.0-course-standard-vertical` (still OTRI model 0.1.0). **Supersedes** the "not scored" rule of [OEP-002](OEP-002-domain-gating-and-vertical-races.md).

## Problem

OEP-002 stopped the model from scoring uphill-only courses, because the steep-terrain coefficient (0.5951, calibrated on a mountain 100-miler with 18 % of its distance steep) multiplies the demand of a course that is 70–100 % steep by 1.4 to 1.6, and a mid-pack vertical kilometre scored 1000. Refusing was correct, but vertical races are a real part of the sport and a tool that returns no number for them is of no use to their organizers.

## Change

A course whose steep share (distance at or above 20 % grade) exceeds 0.50 uses `VERTICAL_STEEP_COEFFICIENT` = 0.1169 in place of `STEEP_COEFFICIENT`. Everything else (gradient cost, altitude term, ceiling, curve) is unchanged. Such courses are always `Low` confidence, with the reason `vertical_calibration_provisional`. A vertical race entered from official figures only (average grade of 20 % or more, no course file) is still not scored, because the steep share that selects the coefficient is unknown.

**Why a smaller coefficient is the right direction, not only a convenient one:** the mountain coefficient absorbs what a treadmill cannot price, and on real courses most of that is steep *descending* on broken ground. An uphill-only course has no descent, and sustained climbing is what the gradient-cost polynomial measures best.

## Calibration

One performance: a winning 36:59 on a 3.76 km / +1,016 m vertical kilometre (steep share 0.678), measured from the file's own elevations, set to score 970. With no steep term it scores 898; with the mountain coefficient, 1227 before clipping. On that course 45:00 scores 821, 55:00 scores 692 and 1:10:00 scores 564.

## Evidence that nothing else moves

No course that goes up and down has a steep share above 0.50 (measured mountain courses: 0–0.25), so the rule cannot reach a course that was scored before. Checked rather than argued: the previous build's outputs on every course fixture, six sets of official figures and the raw curve (28 reference entries, every intermediate value) were compared with the new build's. Three differ, and all three had no score before: two uphill-only fixtures, and the wording of the refusal for official figures.

## Known weaknesses

- One calibration point and a target chosen as a product decision, exactly the weakness of §4.1 of the specification.
- A step in the terrain factor at a steep share of 0.50: a course at 0.49 gets +29 %, one at 0.51 gets +6 %. No real course is known to sit there, but the step is a patch.
- The calibration course has 13 % of its demand on segments clamped at 45 %, and was measured without terrain data; in production it is measured from the terrain model and the winner's score will differ by a few points.

## What would replace it

Vertical-race results with their course files, enough to fit the coefficient instead of choosing it, and a terrain term that prices steep ascent and steep descent separately, which removes the step. That is a new model version, not a build of 0.1.0.
