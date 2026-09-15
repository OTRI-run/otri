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

A major planned capability is the **GPX Target Performance Predictor**:

> Upload a GPX course and ask: “What finish time would I need to target an OTRI 650?”

The system can also work in reverse: given a target finish time, estimate the expected OTRI score, with uncertainty shown rather than false precision.

## Repository

- [`HANDBOOK.md`](HANDBOOK.md) — project strategy, architecture, governance, scoring, data, and roadmap
- [`METHODOLOGY.md`](METHODOLOGY.md) — scoring principles and research direction
- [`DATA_POLICY.md`](DATA_POLICY.md) — data provenance, licensing, privacy, and sourcing principles
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute
- [`docs/gpx-predictor.md`](docs/gpx-predictor.md) — GPX prediction design

## Independence

OTRI is an independent open-source project. It is **not affiliated with ITRA, UTMB, or any other commercial trail-running ranking organization**.

OTRI must not copy proprietary scores, rankings, databases, or restricted datasets. The project should build its own data supply chain through organizers, licensed providers, explicitly reusable public datasets, and appropriate athlete submissions.

## Status

**Early design / MVP development.**

The scoring model is deliberately not treated as final. The first goal is to establish clean data provenance, a reliable result schema, validation, reproducible calculations, and a baseline model that can be tested against real race data.

## License

The software license and the license for contributed datasets are intentionally treated as separate questions. See the repository policies before contributing data.
