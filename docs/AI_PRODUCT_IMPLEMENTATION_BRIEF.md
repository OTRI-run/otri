# OTRI AI Product Implementation Brief

**Audience:** Any AI/software agent tasked with implementing the OTRI website and product flows  
**Status:** Design contract / product specification  
**Date:** 2026-09-17  
**Rule:** Do not change production code merely by reading this document. This file defines what should be built when implementation is explicitly requested.

## 1. Mission

Build an OTRI product that is:

- extremely easy for runners;
- extremely easy for race organizers;
- visually premium;
- scientifically transparent;
- reproducible;
- independent from proprietary competitor methodologies and branding;
- simple at the surface and deep underneath.

Existing OTRI documentation identifies transparency, reproducibility, data provenance, privacy, organizer cooperation and scientific rigor as core project values. fileciteturn297file2L529-L555

## 2. Product split

Build two major guided experiences.

### Runner

```text
CALCULATE SCORE
   ↓
Choose race
   ↓
Choose edition/course
   ↓
Enter target finish time
   ↓
ANALYSE PERFORMANCE
   ↓
Projected OTRI race score
   ↓
WHY THIS SCORE?
```

### Organizer

```text
ORGANIZER SPACE
   ↓
Create organization
   ↓
Create event
   ↓
Add race
   ↓
Add course
   ↓
Upload results
   ↓
Validate
   ↓
Submit
   ↓
Review
   ↓
Publish
```

## 3. Mandatory UX principles

### One thing at a time

Do not put a 30-field form on a single screen when the same information can be collected with a progressive wizard.

### Progressive disclosure

Show only what matters for the current decision. Advanced scientific or administrative details appear on demand.

### Persistent context

Always show a small summary:

```text
Event: Chiang Mai Trail
Race: 50K
Edition: 2027
```

### Autosave

Saving is automatic. A browser refresh must not destroy work.

### Explicit state

Every process must have visible status:

```text
Draft
Ready
Submitted
Checking
Needs changes
Approved
Published
```

### Explain before asking

When a field is unusual, show a one-line explanation.

### Never hide important failure

Do not display a green success state when data still requires review.

## 4. Visual system

Respect the current OTRI brand: deep navy, blue, white and grey, with blue gradients where useful. Do not redesign the canonical logo.

Design language:

```text
premium data product
+
trail-running energy
+
scientific instrumentation
```

Use:

- generous whitespace;
- strong typography hierarchy;
- subtle gradients;
- restrained glass/blur effects only where they improve hierarchy;
- clean data visualizations;
- smooth short motion.

Avoid:

- busy dashboards;
- endless rounded cards;
- fake 3D effects;
- meaningless animated numbers;
- neon overload;
- copied competitor styling.

## 5. Runner home experience

Primary CTA on the website:

> Calculate your OTRI score

Secondary:

> Find a race

Tertiary:

> Understand OTRI

The primary runner experience should reach the race selector within one click.

## 6. Runner calculator exact flow

### Screen 1 — Race/course source choice

The runner must choose how to provide the course:

```text
What are you racing?

[ Search existing race ]

or

[ Upload GPX ]
```

Search results show:

- race name;
- location;
- edition;
- distance;
- D+;
- course status.

For GPX upload:

```text
UPLOAD YOUR COURSE

[ Drop GPX here ]

We'll analyse the track and build a temporary course model
for your calculation.
```

The system must distinguish between an OTRI-approved course and a user-supplied course.

### Screen 2 — Course confirmation

Show the course map/elevation as visual confirmation.

```text
2027 · Chiang Mai 50K
51.8 km · 2,900 m D+
✓ Verified course
```

For uploaded GPX:

```text
YOUR GPX
51.4 km · 2,870 m D+
Course status: User supplied
```

Primary button:

> Continue

### Screen 3 — Target time

Large time input:

```text
YOUR TARGET

04:55:00

5:41 / km
```

Primary CTA:

> Analyse performance

### Screen 4 — Analysis

Animate actual computational stages, never invented progress.

```text
READING COURSE
✓ distance
✓ elevation
✓ terrain

SIMULATING
✓ segment demand
✓ pacing states
✓ fatigue response

CALCULATING
✓ performance
✓ score transformation
```

Use the elevation profile as the central visual object.

### Screen 5 — Result

Hero number:

```text
OTRI
684

04:55:00
```

Supporting:

```text
Course        51.8 km / 2,900 m+
Score version OTRI-v0.x
Evidence      Model-based projection
```

Then:

> Why this score?

### Screen 6 — Explain

First layer for runners:

```text
Your score comes from two things:

COURSE
What the course demands.

PERFORMANCE
How fast you completed the course.

OTRI converts that combination into one score.
```

Then advanced layer:

```text
View technical calculation
```

That layer exposes model inputs, equations/transformations, parameters, version and reproducibility metadata.

### Screen 7 — Explore targets

Show a slider and editable table:

```text
04:45 → [score]
04:55 → 684
05:05 → [score]
05:15 → [score]
```

No hard-coded example score values should be shipped unless they are generated by the real model.

## 7. Runner post-race continuity

The runner profile should connect prediction and verified result.

```text
PRE-RACE
04:55:00 → 684

RACE RESULT
04:55:00 → 684

MATCHED
✓ Exact same course/time/version
```

When different:

```text
Projected 684
Actual 672

12 points below projection
```

Do not frame the difference as a moral judgement.

## 8. Overall runner index

The profile needs one headline OTRI Index plus supporting views.

Proposed initial model:

```text
36-month rolling window
up to 5 best eligible race scores
recency weighting
robust low-outlier handling
visible evidence depth
category views
```

These are product defaults pending statistical validation. They are OTRI product hypotheses and must be validated independently before becoming final methodology.

The UI must show exactly which races count.

## 9. Overall index screen

```text
YOUR OTRI INDEX

684

Peak 701
Recent 676
5 qualifying races

[Why 684?]
```

Then:

```text
COUNTED RESULTS

Race                 Score   Age
Chiang Mai 50K       701     2 mo
Phuket Trail 30K     694     5 mo
Doi Inthanon 50K     682    10 mo
Laguna Trail 25K     674    15 mo
Khao Lak 40K         666    20 mo
```

Then score history.

## 10. Organizer dashboard

Dashboard header:

```text
ORGANIZER SPACE

[+ Add event]
```

Main cards:

```text
MY EVENTS

Doi Suthep Trail
2027 edition
2 races
1 awaiting results

[Open]
```

And:

```text
ACTION REQUIRED

2 result files need review

[Review]
```

Never overwhelm the dashboard with statistics before operational tasks.

## 11. Organizer wizard implementation

The authoritative detailed workflow is in `docs/product/organizer-onboarding.md`.

The implementing AI should follow that exact logical sequence:

```text
Account
→ Organization
→ Event
→ Race
→ Course
→ Result source
→ Results
→ Validation
→ Provenance
→ Review
→ Approval
→ Publication
```

Support annual duplication:

```text
2026 Event
    ↓
[Start 2027 edition]
```

Never overwrite last year's published edition.

## 12. Results importer UX

When a results file is uploaded, do not send the organizer straight to a giant raw table.

First show a health summary:

```text
RESULT CHECK

✓ File readable
✓ Columns recognized
✓ 642 rows
✓ 639 finishers
✓ 3 DNF
⚠ 7 identity warnings
⚠ 2 missing fields

[Fix issues]
```

Then provide an issue-focused table.

## 13. Course UX

Course is a first-class product object.

The course page should show:

- map;
- elevation profile;
- distance;
- D+ / D-;
- course version;
- verification status;
- data sources;
- last update;
- rights/provenance status.

For GPX-enabled courses, show both organizer-declared and GPX-derived measurements where useful.

## 14. Race page UX

Race page should be visually useful even before results exist.

```text
CHIANG MAI TRAIL 50K

51.8 km   2,900 m+
2027 edition

[Calculate my score]

COURSE
[Elevation profile]

RESULTS
Not yet published
```

Once results arrive:

```text
RESULTS
639 finishers
[View results]
```

## 15. Score explainability architecture

Every visible score should have:

```text
score
score version
course version
input summary
calculation explanation
```

The existing OTRI handbook requires scores to be traceable, reproducible, explainable, versioned, statistically defensible and legally sourced. fileciteturn297file8L1523-L1537

## 16. Product pattern research

Research should focus on generic, reusable product patterns rather than copying another service.

Evaluate:

- organizer account → organization → event → race workflows;
- reusable annual editions;
- structured result upload;
- pre-publication approval;
- separate race score and aggregate runner index;
- recent/best-result aggregation patterns;
- transparent score explanations;
- visible calculation state and evidence.

OTRI must decide each rule independently and publish the resulting methodology.

## 17. AI coding constraints

Before implementing any UI or backend logic, the AI must read:

- `README.md`
- `HANDBOOK.md`
- `METHODOLOGY.md`
- `DATA_POLICY.md`
- `docs/organizer-upload.md`
- `docs/product/organizer-onboarding.md`
- `docs/product/pre-race-score-calculator.md`
- `docs/methodology/overall-runner-index.md`
- `docs/research/platform-product-patterns.md`
- the authoritative current scoring methodology/version if one exists.

Do not invent missing model math.

Do not silently alter scoring definitions while building UI.

If the methodology says a value is unknown or provisional, reflect that in the UI.

If a product behavior is not defined, add an explicit TODO/spec decision rather than creating hidden logic.

## 18. Definition of done

### Runner

A new runner can calculate a projected score in one guided flow, understand the result, and inspect the model explanation.

### Organizer

A race organizer can create a reusable event, add one or more races, provide course data, upload official results, fix validation issues and submit the dataset for review without technical assistance.

### Index

A runner can see their current OTRI Index, exactly which races count, why each race counts, the time window, the weighting/version, and category views.

### Trust

The user can trace every score to:

```text
course version
+
performance input
+
model version
+
calculation
```

That is the standard the implementation should meet.
