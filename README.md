# Open Trail Running Index (OTRI)

**The open-source performance layer for trail running.**

OTRI is an open calculator and scoring tool for trail running: a course and a results file in, an explained, reproducible score for every finisher out. It is independent, its methodology is public and versioned, and it is not an approval body: a race can score itself for free with no account, and publish the results as a race page with one click ([the direction](docs/product/open-scoring-tool.md)).

## Why OTRI?

Trail performances cannot be compared fairly from finish time alone. Distance, elevation, terrain, course design, altitude and other factors matter.

OTRI makes trail-performance scoring:

- **Open** — source code and methodology are public.
- **Transparent** — every score explains itself, down to the maths.
- **Reproducible** — the same inputs and scoring version produce the same result.
- **Traceable** — datasets record provenance and permissions.
- **Privacy-conscious** — collect and publish only what is necessary.
- **Independent** — OTRI develops its own methodology and data infrastructure.

## Core idea

```text
Course GPX + results file
          ↓
       Validation
          ↓
   Course measurement (course/)
          ↓
   OTRI scoring engine (scoring/)
          ↓
      OTRI score, with its explanation
          ↓
 Scored result list / race page / API / embedded calculator
```

Try it: **Score my race** at [otri.run/#score](https://otri.run/#score), the calculator at [otri.run/#calculator](https://otri.run/#calculator), or as one call:

```bash
curl -X POST https://api.otri.run/score -F "results=@results.csv" -F "gpx=@course.gpx"
```

## What is where

```text
.
├── index.html, organizer/, embed/   # the three pages Vite builds: the site, the organizer app, the embeddable calculator
├── prototype/                       # the web app's code (React): pages, the organizer app, the API client
├── src/                             # shared components, styles, brand geometry and small libraries
├── public/                          # static files served as they are: icons, brand kit, badge, redirects, robots, sitemap
├── api/                             # the FastAPI backend: accounts, events, races, results, scoring calls, admin
├── course/                          # GPX parsing and course measurement (distance, climb, gradients, terrain data)
├── scoring/                         # OTRI model 0.1.0: course demand, terrain factor, the score curve, the runner index
├── ingestion/                       # reading and validating organizer result files (CSV, TSV, XLSX)
├── data/                            # schemas, the synthetic demo dataset, calibration records; caches (git-ignored)
├── docs/                            # methodology, governance, operations, product direction, user guides
├── scripts/                         # deploy scripts, seeding, migrations, brand kit builds, diagnostics
├── tests/                           # the pytest suite (unit/) and its fixtures
└── .github/                         # CI: the site build and deploy, the Python tests, Dependabot, templates
```

## Documentation

Start with [`docs/README.md`](docs/README.md), the index of everything under `docs/`.

Project-wide:

- [`HANDBOOK.md`](HANDBOOK.md) — what OTRI is and is not, data principles, scoring philosophy, governance, research discipline
- [`DATA_POLICY.md`](DATA_POLICY.md) — data provenance, licensing, privacy and sourcing principles
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute, and what a scoring change has to bring
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`SECURITY.md`](SECURITY.md) — how to report a vulnerability
- [`TERMS.md`](TERMS.md) and [`PRIVACY.md`](PRIVACY.md) — the terms for organizer accounts and what personal data OTRI keeps, published on the site as /terms/ and /privacy/
- [`CHANGELOG.md`](CHANGELOG.md) — what changed, and why

The model and how it is used:

- [`docs/methodology/0.1.0/HOW-OTRI-SCORES.md`](docs/methodology/0.1.0/HOW-OTRI-SCORES.md) — the plain-language explanation of the scoring model
- [`docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`](docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md) — the specification of the model in production, in one page
- [`docs/product/open-scoring-tool.md`](docs/product/open-scoring-tool.md) — the product direction: a scoring tool, not a governing body

Each module documents itself: [`api/README.md`](api/README.md), [`course/README.md`](course/README.md), [`scoring/README.md`](scoring/README.md), [`ingestion/README.md`](ingestion/README.md), [`prototype/README.md`](prototype/README.md), [`scripts/deploy/README.md`](scripts/deploy/README.md), [`data/README.md`](data/README.md).

## Frontend

The website uses React, Vite, Tailwind CSS and Lucide icons. GitHub Actions builds it and deploys it to GitHub Pages on every push to `main`; the API runs on its own server ([`docs/operations/digitalocean-deployment.md`](docs/operations/digitalocean-deployment.md)).

## Independence

OTRI is an independent open-source project. It is **not affiliated with any commercial trail-running ranking organization**.

OTRI must not copy proprietary scores, rankings, databases, or restricted datasets. The project builds its own data supply chain through organizers, licensed providers, explicitly reusable public datasets, and appropriate athlete submissions.

## About

OTRI is a community-driven, volunteer project. It started from a simple idea: local trail races and small organizers shouldn't need a closed, expensive ranking system just to give runners a fair way to compare performances — so OTRI is being built as free, open-source software for runners and organizers alike, especially local races running on a small budget.

We're always looking for contributors and testers: developers, methodology/data reviewers, race organizers willing to share results, and runners willing to test the model against real races. See [`CONTRIBUTING.md`](CONTRIBUTING.md) to get involved.

## Status

**Working product, model 0.1.0, pre-launch.**

The scoring tool, the organizer workflow, the public race pages and the API are built and tested. The scoring model is deliberately not treated as final: it is published, versioned and explained, and it will be refined against real race data. A change to how scores are computed is always a new scoring version; a score once given replays byte-for-byte.

## License

OTRI software is released under the **MIT License**. See [`LICENSE`](LICENSE).

Brand assets, documentation, datasets, and other non-code material may have different terms where explicitly stated. Check the applicable file or directory documentation before reusing non-code assets.
