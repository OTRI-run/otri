# Open Trail Running Index (OTRI)

This handbook is what OTRI stands on: what it is and is not, its data principles, scoring philosophy, governance and research discipline. What is built, and how it works, is in the module guides and under [`docs/`](docs/README.md).

> **Core principle:** Build an independent, transparent trail-running performance index from legitimately obtained data. Do not copy other organizations' proprietary scores or databases.

## Mission

Build the most transparent, open, and community-auditable trail-running performance index.

## Vision

A runner should be able to ask **“How strong was this performance?”** without having to trust a proprietary black box.

## What OTRI is

- An open calculator and scoring tool: a race can score itself, with no account and no approval ([docs/product/open-scoring-tool.md](docs/product/open-scoring-tool.md)).
- An independent scoring system.
- Open-source software.
- A structured trail-race dataset with provenance.
- A public methodology.
- An API and developer platform.
- A community project.

## What OTRI is not

- A race timing system.
- A guarantee of athletic ability.
- An official qualification system unless another organization explicitly adopts it.
- An approval or membership body: OTRI does not approve organizers or races, does not promise a complete list of the world's races, and does not arbitrate who owns a race or a result.
- A global ranking, until the model has been validated well enough to carry one.
- A mirror of another organization's proprietary database.

OTRI should clearly state that it is independent and unaffiliated with other commercial ranking organizations.

## Data principles

Preferred sources, in order:

1. Race organizers directly.
2. Licensed timing/result providers.
3. Public datasets with an explicit reuse license.
4. Government/open-data sources where relevant.
5. Appropriate athlete submissions.
6. Public race-result pages only where the intended use is permitted by terms, copyright, privacy requirements, and applicable law.

Every dataset should carry provenance, including source type, organization, receipt date, permission status, and license.

Runner data should be minimized. Avoid publishing unnecessary contact details, addresses, dates of birth, or other sensitive identifiers. Provide correction, pseudonymization, and legally required deletion mechanisms.

## Scoring philosophy

OTRI should develop its own model rather than reverse-engineer another index. Candidate factors include distance, elevation gain/loss, terrain, course geometry, altitude, environmental conditions, field strength, and repeat-runner evidence.

The model should be statistically defensible and versioned. A critical invariant is:

> **Same input + same scoring version = same output.**

Scores should be explainable and accompanied by a confidence measure where appropriate.

## Race and course identity

A race is not just a name and date. Store stable identifiers and distinguish course versions, route changes, distances, elevation profiles, and race editions. A materially changed course should be represented as a new course version rather than silently overwriting history.

## Field strength

Field strength can improve cross-race comparability, but it must be handled carefully to avoid circularity. Repeated runners and independently observed performances should help calibrate race difficulty rather than allowing an organizer to directly determine its own rating.

## GPX Target Performance Predictor

One of OTRI's strongest features is reverse performance prediction: the calculator (`#calculator`) does modes A and B below on any course; C is not built.

### User flow

```text
Upload GPX
   ↓
Extract course features
   ↓
Estimate course difficulty
   ↓
Apply calibrated OTRI model
   ↓
Predict time ↔ OTRI relationship
```

Supported modes:

**A — Target OTRI → Required time**

Example: “What time do I need on this 54.2 km / 3,400 m D+ course to target OTRI 650?”

Return a range such as **6:05–6:20**, midpoint **6:12**, with confidence rather than pretending the estimate is exact.

**B — Time → predicted OTRI**

Example: “If I run 5:55, what OTRI should I expect?”

**C — Personal target**

Combine the course model with a runner's prior performances to produce a personalized target range.

### GPX-derived features

Potential inputs include:

- distance;
- total elevation gain and loss;
- elevation distribution;
- gradient distribution;
- steep-climb burden;
- steep-descent burden;
- altitude;
- route geometry;
- repeated climbs/descents;
- technicality proxies where reliable data exists.

GPX alone is not enough to calibrate performance. Real race results are required to learn the relationship between course characteristics, finish times, and OTRI outcomes.

The course model should remain separate from the runner-performance model. This enables OTRI to estimate **Course Difficulty** independently and then combine it with athlete performance.

### Uncertainty

Prediction output should include:

- point estimate;
- realistic interval;
- confidence level;
- whether the course is calibrated or unseen;
- major factors driving uncertainty.

New or poorly mapped courses should receive wider intervals.

### Independence

The predictor calculates **OTRI**, not another organization's scores. Its model, parameters, terminology, and training data must be independently developed and documented.

## Validation and anti-gaming

Use provenance, organizer verification, anomaly detection, duplicate detection, audit logs, confidence scores, and human review.

An organizer submits results; the scoring engine calculates the score. An organizer should not be able to directly edit a final score.

## Auditability

A score exposes what went into it. The calculator's "Show the maths" and every race page's explanation do this for the model in production; illustratively, a breakdown looks like:

```text
OTRI Score: 621
Base performance: 584
Course adjustment: +31
Field adjustment: +12
Environmental factor: -4
Confidence: High
Scoring version: 1.2
```

The exact implementation may evolve; the principle is that the result should be explainable and reproducible.

## Governance

Methodology changes should be proposed publicly, discussed, tested on historical data, benchmarked against alternatives, approved through documented governance, and versioned.

Substantial changes are OTRI Enhancement Proposals (OEPs): the process, the template and the index of proposals so far are in [`docs/governance/README.md`](docs/governance/README.md).

## Research discipline

The rules the model is held to, whichever version is current (they were `METHODOLOGY.md` until the first model shipped; the model itself is specified in [`docs/methodology/`](docs/methodology/README.md)).

**A simple, transparent baseline beats an impressive-looking but poorly validated model.** A more complex model is not automatically a better one. Model selection prioritises, in order: predictive accuracy, stability, interpretability, resistance to manipulation, reproducibility. Not every plausible variable enters the model; each feature must show useful predictive value and acceptable data quality.

**Every published model has a version.** Historical scores stay reproducible under the version they were computed with; a methodology change never silently rewrites history. A change to how scores are computed is a new `scoring_version` and goes through an OEP.

**Validation is against unseen data.** Held-out races and temporal validation, never a random split of correlated results that leaks between training and test. The cases that matter: an unseen race, an unseen course, a new edition of a known race, another region, another distance band, a small field, a large field, an unusual profile.

**Field strength, if it is ever used, must not be circular**: a race's score may not prove that its field was strong and then be used again to compute the score. Field adjustments would have to be regularised and uncertainty-aware; the model in production uses none.

**Every major formula change brings** its hypothesis, the dataset, the method, the alternatives considered, the validation results, an error analysis, the known limitations and what is needed to reproduce it. That is the OEP template.

**Benchmark against outcomes, not against other indexes.** Other indexes may be studied as context, but the target is accurate, fair and independently justified OTRI scoring; an OTRI value is never presented as equivalent to another organization's number.

## Fundamental rule

**Do not sacrifice credibility for growth.**

Every score should be traceable, reproducible, explainable, versioned, statistically defensible, and based on legitimately sourced data.
