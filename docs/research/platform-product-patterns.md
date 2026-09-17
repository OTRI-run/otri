# Platform Product Pattern Research

**Research date:** 2026-09-17  
**Purpose:** Capture useful public product patterns for OTRI while keeping OTRI's methodology, branding, terminology, data model and software independent.

## 1. Research rule

Established trail-running and endurance platforms can be useful references for product design, but they are not specifications for OTRI.

OTRI should reuse general product patterns only when they are independently justified. OTRI must define its own scoring, terminology, database, rights model and software.

## 2. Organizer patterns

Useful patterns include:

- verified organizer accounts;
- organizations with team permissions;
- an event as the parent container for one or more races;
- dated editions that preserve historical relationships;
- renewal or duplication of previous editions;
- structured result templates;
- explicit supported-race types;
- course metadata collected before results;
- automated validation before submission;
- explicit approval before verified publication;
- clear correction/version history.

### OTRI product requirement

Use the workflow pattern, not another service's exact interface or form fields:

```text
Account
  ↓
Organization
  ↓
Event
  ↓
Race
  ↓
Course
  ↓
Results
  ↓
Validation
  ↓
Review
  ↓
Approval
  ↓
Publication
```

## 3. Course and GPX patterns

GPX should be treated as a first-class course input, but a race should not become impossible to list simply because a GPX is unavailable.

OTRI should support:

- organizer-provided GPX;
- runner-uploaded GPX for personal analysis;
- explicitly licensed public GPX sources;
- permission-based course submissions;
- derived course measurements stored separately from organizer-declared values;
- raw-source hashes and provenance;
- rights status and source history;
- review for unclear rights.

Public discoverability is not by itself permission to reproduce or redistribute a file. OTRI should track the legal/permission basis for every stored course source and should not silently assume that a web-accessible GPX is reusable.

## 4. Results patterns

Use structured uploads and immediate validation.

Recommended validation stages:

```text
File/schema checks
      ↓
Identity/duplicate checks
      ↓
Time/rank/status checks
      ↓
Course/event consistency
      ↓
Rights/provenance checks
      ↓
Review
```

Keep raw source files immutable and create new versions for corrections.

## 5. Runner/index patterns

Useful product patterns to evaluate include:

- one headline runner index;
- supporting distance/category views;
- a rolling time window;
- selecting a limited set of recent/best eligible performances;
- recency weighting;
- explicit evidence depth;
- a visible list of the performances that contribute to the headline number;
- separate race score and overall runner index objects.

These are research hypotheses and UX patterns, not final OTRI equations.

## 6. OTRI adaptation

OTRI should make every important state inspectable:

```text
Race/course
  ↓
Course model version
  ↓
Performance input
  ↓
Scoring model version
  ↓
Score
```

The user should be able to inspect the inputs, versions and calculation explanation behind a published score.

## 7. What OTRI must not copy

Do not copy another service's:

- visual identity;
- logos or endorsement language;
- proprietary datasets;
- proprietary scores;
- proprietary ranking labels;
- exact equations;
- exact thresholds or category boundaries without independent justification.

## 8. Product principle

```text
Simple outside.
Deep inside.

One question per screen.
One obvious action.
One transparent explanation.
```
