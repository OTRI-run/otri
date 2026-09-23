# Open Trail Running Index (OTRI)

**The open-source performance layer for trail running.**

OTRI is an open calculator and scoring tool for trail running: a course and a results file in, an explained, reproducible score for every finisher out. It is independent, its methodology is public and versioned, and it is not an approval body: a race can score itself for free with no account, and publish the results as a race page with one click ([the direction](docs/product/open-scoring-tool.md)).

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
 Scored result list / race page / API / embedded calculator
```

Try it: **Score my race** at [otri.run/#score](https://otri.run/#score), or as one call:

```bash
curl -X POST https://api.otri.run/score -F "results=@results.csv" -F "gpx=@course.gpx"
```

The calculator already turns a course GPX and a target time into a score, and the exact inverse (score → time); a version with uncertainty ranges rather than point estimates is planned.

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
- `CONTRIBUTING.md` — how to contribute
- `SECURITY.md` — security reporting and data-security principles
- `TERMS.md` — terms of service for organizer accounts (draft)
- `PRIVACY.md` — what personal data OTRI keeps and why (draft)
- `docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md` — the scoring model in production, in one page

## Frontend

The website uses React, Vite, Tailwind CSS, Lucide icons, and responsive modern typography. GitHub Actions builds and deploys the site to GitHub Pages.

## Independence

OTRI is an independent open-source project. It is **not affiliated with any commercial trail-running ranking organization**.

OTRI must not copy proprietary scores, rankings, databases, or restricted datasets. The project should build its own data supply chain through organizers, licensed providers, explicitly reusable public datasets, and appropriate athlete submissions.

## About

OTRI is a community-driven, volunteer project. It started from a simple idea: local trail races and small organizers shouldn't need a closed, expensive ranking system just to give runners a fair way to compare performances — so OTRI is being built as free, open-source software for runners and organizers alike, especially local races running on a small budget.

We're always looking for contributors and testers: developers, methodology/data reviewers, race organizers willing to share results, and runners willing to test the model against real races. See [`CONTRIBUTING.md`](CONTRIBUTING.md) to get involved.

## Status

**Early design / MVP development.**

The scoring model is deliberately not treated as final. The first goal is to establish clean data provenance, a reliable result schema, validation, reproducible calculations, and a baseline model that can be tested against real race data.

## License

OTRI software is released under the **MIT License**. See [`LICENSE`](LICENSE).

Brand assets, documentation, datasets, and other non-code material may have different terms where explicitly stated. Check the applicable file or directory documentation before reusing non-code assets.
