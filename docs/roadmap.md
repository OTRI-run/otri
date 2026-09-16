# OTRI development roadmap

A concrete, step-by-step breakdown of `HANDBOOK.md`'s roadmap, in PR-sized chunks. Each step lists its goal, concrete deliverables, and what "done" looks like. Steps within the same phase can usually be built in parallel; phases are ordered by hard dependencies only.

## Phase 0 — Ingestion foundation ✅ done

**Goal:** a deterministic way to know whether a race/result file is safe to score.

- [x] Publish versioned schema contracts: [`data/schemas/race.schema.json`](../data/schemas/race.schema.json), [`data/schemas/result.schema.json`](../data/schemas/result.schema.json).
- [x] Build the `ingestion/` package: format-agnostic CSV/XLSX reader, declarative field specs, `validate_race_file()` / `validate_result_file()`.
- [x] Handle real organizer messiness: mismatched header casing/aliases, DNF/DNS/DSQ rows, mixed CSV/XLSX cell types.
- [x] Unit tests proving deterministic output against the demo dataset (`tests/unit/test_ingestion_validate.py`), plus invalid-data fixtures under `tests/fixtures/`.

Run it: `pip install -r requirements-dev.txt && pytest tests/unit`.

## Phase 1 — Baseline scoring engine ✅ done

**Goal:** a simple, transparent, versioned scorer — not a final formula (`METHODOLOGY.md` §13).

- [x] **Result → normalized performance model (`scoring/`)** — `score_race()` scores each finisher's pace against an elevation-adjusted equivalent distance, relative to the fastest finisher in that race (`SCORING_VERSION = "0.1.0"`).
- [x] **Reproducibility tests** — same input twice → identical output (`tests/unit/test_scoring_model.py`), plus a hand-verified golden fixture under `tests/fixtures/scoring/`.
- [x] **Auditability** — every score is a full `ScoreBreakdown` (base performance, course/field/environmental adjustments, confidence, scoring version), never a bare number, per `HANDBOOK.md`'s "Auditability" section.

Still missing on purpose (documented in `scoring/README.md`): cross-race calibration, field-strength adjustment, environmental factors — those need real race data and Phase 2+ course modeling first.

**Blocked by:** Phase 0 (needs validated results as input). **Blocks:** everything downstream that consumes a score.

## Phase 2 — GPX parser & course model ✅ done *(was parallel-safe, built after Phase 1)*

**Goal:** turn a GPX file into course-difficulty features. Does **not** depend on Phase 1/3.

- [x] **GPX reader** (`course/gpx.py`) — parses `trkpt` points (lat/lon/elevation/time) using only the Python standard library (`xml.etree.ElementTree`); no external GPX dependency needed for this scope.
- [x] **Course-feature extraction** (`course/features.py`, your own code, documented) — distance (haversine), elevation gain/loss with GPS-noise filtering, steep-climb/steep-descent distance, max grade, min/max elevation.
- [x] **Course-difficulty model kept separate from the performance model** — `course/` has no dependency on `scoring/` or `ingestion/` (`METHODOLOGY.md` §3).
- [x] **Tests** (`tests/unit/test_course_features.py`) against synthetic GPX fixtures (flat loop, single climb with a GPS-noise blip, out-and-back) under `tests/fixtures/gpx/`, with hand-derivable expected distance/elevation numbers for the north-south fixtures.

**Known limitation, documented in `course/README.md`:** elevation-noise filtering is per-segment, not accumulating, so a very gradual multi-step climb below the noise threshold per step could be under-counted. Revisit once real GPX data exists to tune it.

**Important constraint:** a GPX→OTRI predictor cannot be calibrated until Phase 1 exists and real race results are available (`docs/gpx-predictor.md`). The feature extractor is built; wiring it to predictions is Phase 4+ work.

## Phase 3 — Map / visualization layer ✅ done

**Goal:** show a GPX route and elevation profile in the organizer-upload / predictor UI.

- [x] **Library:** [`maplibre-gl`](https://maplibre.org/) (BSD-3, no API key required) added to `package.json`.
- [x] **Component:** `src/components/CourseMap.jsx` renders the route as a map line layer plus a lightweight inline-SVG elevation profile (no charting dependency). Parsing lives in `src/lib/gpx.js` (browser-native `DOMParser`, mirrors `course/gpx.py`'s scope for rendering only — not the scoring source of truth).
- [x] **Tiles:** defaults to MapLibre's official open demo style (no key, no paid infra) via a `styleUrl` prop, so it works out of the box; swap that prop for a self-hosted OpenStreetMap-based style (Protomaps, OpenMapTiles — ODbL, attribution required) in production.
- [x] **Elevation cross-check:** not wired yet — open DEM sources (Copernicus DEM GLO-30, SRTM via OpenTopography) remain the plan once there's a backend to call them from.

**Known gap:** no self-hosted tile server exists yet, and the component is not wired into any page — there is no organizer-upload / predictor UI to place it in yet (that's Phase 4). It's a ready-to-use building block, documented in `src/components/README.md`.

Depends on Phase 2's parsed GPX data existing; otherwise there's nothing to render.

## Phase 4 — API & organizer submission workflow

- Machine-readable API exposing scores, races, and course data (`docs/api/`).
- Organizer upload workflow: an organizer submits results; the scoring engine — not the organizer — computes the final score (`HANDBOOK.md` "Validation and anti-gaming").
- Depends on Phases 0–1 being stable enough to expose publicly.

## Phase 5 — Ecosystem

- More organizer partners, developer integrations, scientific advisors, formal governance (OEP process), international expansion. See `HANDBOOK.md` "Phase 4 — Ecosystem" for the full list.

## Open-source constraints that apply to every phase

- No proprietary/paid APIs as hard dependencies (Google Maps, Mapbox tokens, other organizations' proprietary race data) — the whole stack must be runnable by a volunteer with no budget.
- Every new dependency needs a permissive license (MIT/BSD/Apache-2.0) compatible with this project's MIT license.
- Real race data ingestion follows `DATA_POLICY.md`'s source hierarchy — synthetic demo data only until real data is secured.
