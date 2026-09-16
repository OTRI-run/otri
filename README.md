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

## Repository structure

```text
.
├── .github/                 # CI/CD and GitHub project configuration
├── data/                    # Data workspace and versioned schemas
│   ├── raw/                 # Legitimately obtained source data
│   ├── processed/           # Reproducible derived datasets
│   └── schemas/             # Machine-readable data schemas
├── docs/                    # Technical and project documentation
│   ├── architecture/       # System architecture
│   ├── methodology/        # Research and scoring work
│   ├── data/                # Data documentation
│   ├── governance/          # Governance and decision records
│   ├── api/                 # Future public API documentation
│   └── operations/          # Deployment and maintenance runbooks
├── media/brand/             # Canonical OTRI brand assets
├── public/                  # Static web assets
├── scripts/                 # Reproducible utilities and maintenance tools
├── src/                     # Website/application source
│   ├── components/          # Reusable UI components
│   ├── data/                # Frontend-safe data
│   └── lib/                 # Shared utilities and domain helpers
└── tests/                   # Automated tests and fixtures
    ├── unit/
    ├── integration/
    └── fixtures/
```

## Key project documents

- `HANDBOOK.md` — project strategy, architecture, governance, scoring, data, and roadmap
- `METHODOLOGY.md` — scoring principles and research direction
- `DATA_POLICY.md` — data provenance, licensing, privacy, and sourcing principles
- `ARCHITECTURE.md` — repository and system architecture
- `CONTRIBUTING.md` — how to contribute
- `SECURITY.md` — security reporting and data-security principles
- `docs/gpx-predictor.md` — GPX prediction design

## Frontend

The website uses React, Vite, Tailwind CSS, Lucide icons, and responsive modern typography. GitHub Actions builds and deploys the site to GitHub Pages.

## Independence

OTRI is an independent open-source project. It is **not affiliated with ITRA, UTMB, or any other commercial trail-running ranking organization**.

OTRI must not copy proprietary scores, rankings, databases, or restricted datasets. The project should build its own data supply chain through organizers, licensed providers, explicitly reusable public datasets, and appropriate athlete submissions.

## Status

**Early design / MVP development.**

The scoring model is deliberately not treated as final. The first goal is to establish clean data provenance, a reliable result schema, validation, reproducible calculations, and a baseline model that can be tested against real race data.

## License

OTRI software is released under the **MIT License**. See [`LICENSE`](LICENSE).

Brand assets, documentation, datasets, and other non-code material may have different terms where explicitly stated. Check the applicable file or directory documentation before reusing non-code assets.
