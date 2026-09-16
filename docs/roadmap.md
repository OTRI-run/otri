# OTRI development roadmap

A concrete, step-by-step breakdown of `HANDBOOK.md`'s roadmap, in PR-sized chunks. Each step lists its goal, concrete deliverables, and what "done" looks like. Steps within the same phase can usually be built in parallel; phases are ordered by hard dependencies only.

## Phase 0 — Ingestion foundation ✅ done

**Goal:** a deterministic way to know whether a race/result file is safe to score.

- [x] Publish versioned schema contracts: [`data/schemas/race.schema.json`](../data/schemas/race.schema.json), [`data/schemas/result.schema.json`](../data/schemas/result.schema.json).
- [x] Build the `ingestion/` package: format-agnostic CSV/XLSX reader, declarative field specs, `validate_race_file()` / `validate_result_file()`.
- [x] Handle real organizer messiness: mismatched header casing/aliases, DNF/DNS/DSQ rows, mixed CSV/XLSX cell types.
- [x] Unit tests proving deterministic output against the demo dataset (`tests/unit/test_ingestion_validate.py`), plus invalid-data fixtures under `tests/fixtures/`.

Run it: `pip install -r requirements-dev.txt && pytest tests/unit`.

## Phase 1 — Baseline scoring engine

**Goal:** a simple, transparent, versioned scorer — not a final formula (`METHODOLOGY.md` §13).

1. **Result → normalized performance model (`scoring/`)**
   - Input: a validated race + result set (output of Phase 0).
   - Output: a baseline OTRI score per finisher using an intentionally simple, documented formula (e.g. pace relative to course distance/elevation, no field-strength adjustment yet).
   - Every score records its `scoring_version`.
2. **Reproducibility tests**
   - Same input + same `scoring_version` → byte-identical output, run twice in CI.
   - Golden-output fixtures checked into `tests/fixtures/` (small, synthetic).
3. **Auditability**
   - Scorer returns a components breakdown (base performance, adjustments, confidence) per `HANDBOOK.md`'s "Auditability" section — not just a single number.

**Blocked by:** Phase 0 (needs validated results as input). **Blocks:** everything downstream that consumes a score.

## Phase 2 — GPX parser & course model *(parallel-safe, start anytime)*

**Goal:** turn a GPX file into course-difficulty features. Does **not** depend on Phase 1/3.

1. **GPX reader** — parse `trkpt` points (lat/lon/ele/time) from raw XML. Use a small permissive-licensed library for XML parsing only (e.g. MIT `gpxpy`/`gpxparser`); keep it isolated behind a thin wrapper so it can be swapped.
2. **Course-feature extraction (your own code, documented)** — distance, elevation gain/loss, gradient distribution, climb/descent segmentation, steep-climb/descent burden. These feed scores directly, so per the transparency principle they must live in reviewable OTRI code, not a black-box dependency.
3. **Course-difficulty model** — kept separate from the performance model (`METHODOLOGY.md` §3), so it can be calibrated independently once real race results exist.
4. **Tests** — unit tests against a handful of small, synthetic/redistributable GPX fixtures (flat loop, single climb, out-and-back) with hand-verified expected distance/elevation numbers.

**Important constraint:** a GPX→OTRI predictor cannot be calibrated until Phase 1 exists and real race results are available (`docs/gpx-predictor.md`). Build the feature extractor now; wire it to predictions later.

## Phase 3 — Map / visualization layer *(lowest priority, defer until there's a UI to fill)*

**Goal:** show a GPX route and elevation profile in the organizer-upload / predictor UI.

- **Library:** MapLibre GL JS (BSD-3, no API key required).
- **Tiles:** OpenStreetMap-based, e.g. Protomaps or self-hosted OpenMapTiles (ODbL — attribution required).
- **Elevation cross-check:** open DEM sources only (Copernicus DEM GLO-30, SRTM via OpenTopography) — never a paid elevation API as a hard dependency.
- Depends on Phase 2's parsed GPX data existing; otherwise there's nothing to render.

## Phase 4 — API & organizer submission workflow

- Machine-readable API exposing scores, races, and course data (`docs/api/`).
- Organizer upload workflow: an organizer submits results; the scoring engine — not the organizer — computes the final score (`HANDBOOK.md` "Validation and anti-gaming").
- Depends on Phases 0–1 being stable enough to expose publicly.

## Phase 5 — Ecosystem

- More organizer partners, developer integrations, scientific advisors, formal governance (OEP process), international expansion. See `HANDBOOK.md` "Phase 4 — Ecosystem" for the full list.

## Open-source constraints that apply to every phase

- No proprietary/paid APIs as hard dependencies (Google Maps, Mapbox tokens, ITRA/UTMB data) — the whole stack must be runnable by a volunteer with no budget.
- Every new dependency needs a permissive license (MIT/BSD/Apache-2.0) compatible with this project's MIT license.
- Real race data ingestion follows `DATA_POLICY.md`'s source hierarchy — synthetic demo data only until real data is secured.
