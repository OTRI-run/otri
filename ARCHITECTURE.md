# OTRI Architecture

OTRI is organized into distinct layers:

1. **Data** — legitimately obtained race and course data, provenance, schemas, and validation.
2. **Research** — statistical methods, calibration, experiments, and methodology versions.
3. **Domain logic** — deterministic scoring and course/performance calculations.
4. **API** — future machine-readable public interfaces.
5. **Web** — the public website and user-facing applications.
6. **Operations** — deployment, monitoring, release, and maintenance tooling.

The repository structure is intentionally prepared for these layers before the scoring engine is implemented. This keeps the early website work from becoming tightly coupled to future data and model infrastructure.
