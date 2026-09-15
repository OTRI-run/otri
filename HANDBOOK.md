# Open Trail Running Index (OTRI)

This handbook defines the initial product strategy, data architecture, scoring philosophy, governance, and roadmap for OTRI.

> **Core principle:** Build an independent, transparent trail-running performance index from legitimately obtained data. Do not copy proprietary ITRA or UTMB scores or databases.

## Mission

Build the most transparent, open, and community-auditable trail-running performance index.

## Vision

A runner should be able to ask **“How strong was this performance?”** without having to trust a proprietary black box.

## What OTRI is

- An independent scoring system.
- Open-source software.
- A structured trail-race dataset with provenance.
- A public methodology.
- An API and developer platform.
- A community project.

## What OTRI is not

- ITRA.
- UTMB.
- A race timing system.
- A guarantee of athletic ability.
- An official qualification system unless another organization explicitly adopts it.
- A mirror of another organization's proprietary database.

OTRI should clearly state that it is independent and unaffiliated with ITRA, UTMB, or other commercial ranking organizations.

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

One of OTRI's strongest planned features is reverse performance prediction.

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

The predictor calculates **OTRI**, not ITRA or UTMB scores. Its model, parameters, terminology, and training data must be independently developed and documented.

## Validation and anti-gaming

Use provenance, organizer verification, anomaly detection, duplicate detection, audit logs, confidence scores, and human review.

An organizer submits results; the scoring engine calculates the score. An organizer should not be able to directly edit a final score.

## Auditability

Where practical, a score should expose components such as:

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

Use OTRI Enhancement Proposals (OEPs), for example:

- OEP-001 — New Course Difficulty Model
- OEP-002 — Field Strength Adjustment
- OEP-003 — Performance Decay

## Recommended stack

- Python
- FastAPI
- PostgreSQL
- Redis where useful
- pandas / NumPy / SciPy
- scikit-learn where justified
- Next.js / TypeScript for the web application
- GitHub Actions for CI/CD

Start small. Do not build expensive distributed infrastructure before the data volume requires it.

## Initial repository structure

```text
otri/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── GOVERNANCE.md
├── DATA_POLICY.md
├── METHODOLOGY.md
├── API.md
├── HANDBOOK.md
├── docs/
├── data/
├── ingestion/
├── scoring/
├── api/
├── web/
├── notebooks/
├── tests/
└── scripts/
```

## MVP

Do not start with everything. The first usable system should be:

```text
Race database
   ↓
Result importer
   ↓
Validation
   ↓
Baseline scoring engine
   ↓
Runner profile
   ↓
Race leaderboard
   ↓
Transparent methodology
```

A strong first milestone is a working system on roughly 20 legitimate races, not a huge database assembled from questionable sources.

## Roadmap

### Phase 1 — Foundation

- Establish repository and documentation.
- Define result schema.
- Define provenance/data policy.
- Build CSV importer and validator.
- Build baseline scoring model.
- Add reproducibility tests.

### Phase 2 — Dataset

- Secure initial organizer/licensed datasets.
- Build race and course database.
- Add athlete identity resolution with privacy safeguards.
- Publish methodology and benchmark results.

### Phase 3 — Product

- Athlete profiles.
- Race leaderboards.
- API.
- GPX analysis.
- Target OTRI predictor.
- Organizer submission workflow.

### Phase 4 — Ecosystem

- More organizers.
- Developer integrations.
- Scientific advisors.
- Formal governance.
- International expansion.

## Success metrics

Track verified races, verified results, unique runners, countries, organizer partners, contributors, API users, corrections, reproducibility, and model prediction error.

A particularly important metric is the number of independent people who can reproduce a score from the published data and code.

## Fundamental rule

**Do not sacrifice credibility for growth.**

Every score should be traceable, reproducible, explainable, versioned, statistically defensible, and based on legitimately sourced data.
