# Open Trail Running Index (OTRI)

**The open-source performance layer for trail running.**

OTRI is an independent, transparent, reproducible trail-running performance index built from legitimately obtained race-result data and a publicly documented methodology.

## Why OTRI?

Trail performances cannot be compared fairly from finish time alone. Distance, elevation, terrain, course design, field strength, weather, altitude, and other factors matter.

OTRI aims to make trail-performance data and scoring:

- **Open** — source code and methodology are public.
- **Transparent** — scores can be inspected and explained.
- **Reproducible** — the same inputs and scoring version produce the same result.
- **Traceable** — datasets record provenance and permissions.
- **Privacy-conscious** — collect and publish only what is necessary.
- **Independent** — OTRI develops its own methodology and data infrastructure.

## Core idea

```text
Race results + course data
          ↓
       Validation
          ↓
   OTRI scoring engine
          ↓
      OTRI score
          ↓
 Rankings / profiles / API / analytics
```

A major planned capability is the **GPX Target Performance Predictor**: upload a GPX course and estimate the finish time needed to target a chosen OTRI score, with uncertainty rather than false precision.

## Repository

- `HANDBOOK.md` — project strategy, architecture, governance, scoring, data, and roadmap
- `METHODOLOGY.md` — scoring principles and research direction
- `DATA_POLICY.md` — data provenance, licensing, privacy, and sourcing principles
- `CONTRIBUTING.md` — how to contribute
- `docs/gpx-predictor.md` — GPX prediction design

## Frontend

The website uses React, Vite, Tailwind CSS, Lucide icons, and responsive modern typography. GitHub Actions builds and deploys the site to GitHub Pages.

## Independence

OTRI is an independent open-source project. It is **not affiliated with ITRA, UTMB, or any other commercial trail-running ranking organization**.

OTRI must not copy proprietary scores, rankings, databases, or restricted datasets. The project should build its own data supply chain through organizers, licensed providers, explicitly reusable public datasets, and appropriate athlete submissions.

## Status

**Early design / MVP development — deployment refresh.**

The scoring model is deliberately not treated as final. The first goal is to establish clean data provenance, a reliable result schema, validation, reproducible calculations, and a baseline model that can be tested against real race data.
