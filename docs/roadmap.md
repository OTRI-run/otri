# OTRI development roadmap

A concrete, step-by-step breakdown of `HANDBOOK.md`'s roadmap, in PR-sized chunks. Each step lists its goal, concrete deliverables, and what "done" looks like. Steps within the same phase can usually be built in parallel; phases are ordered by hard dependencies only.

## Prototype ✅ done

Everything from Phases 0–4 wired together and actually demonstrated in one place: [`prototype/`](../prototype) is a separate page (same design system, kept apart from the production homepage) with three tabs — a static Races view (real `ingestion` → `scoring` → `course` output over 6 synthetic races, 10K to 100-mile ultra), a **GPX score predictor** that calls the live API (`POST /gpx/analyze`) using the exact same no-competitor formula as the real post-race scorer, and an **Organizer upload** flow with full event/distance CRUD, a selectable scoring algorithm per race distance, GPX attach, and results submission against the live API end to end. Verified working in an actual production build, not just unit tests. See [`prototype/README.md`](../prototype/README.md) and [`docs/operations/digitalocean-deployment.md`](operations/digitalocean-deployment.md) for deploying the API behind it.

## Phase 0 — Ingestion foundation ✅ done

**Goal:** a deterministic way to know whether a race/result file is safe to score.

- [x] Publish versioned schema contracts: [`data/schemas/race.schema.json`](../data/schemas/race.schema.json), [`data/schemas/result.schema.json`](../data/schemas/result.schema.json).
- [x] Build the `ingestion/` package: format-agnostic CSV/XLSX reader, declarative field specs, `validate_race_file()` / `validate_result_file()`.
- [x] Handle real organizer messiness: mismatched header casing/aliases, DNF/DNS/DSQ rows, mixed CSV/XLSX cell types.
- [x] Unit tests proving deterministic output against the demo dataset (`tests/unit/test_ingestion_validate.py`), plus invalid-data fixtures under `tests/fixtures/`.

Run it: `pip install -r requirements-dev.txt && pytest tests/unit`.

## Phase 1 — Baseline scoring engine ✅ done, superseded as default by the pluggable Course Standard model

**Goal:** a simple, transparent, versioned scorer — not a final formula (`METHODOLOGY.md` §13).

- [x] **Result → normalized performance model (`scoring/`)** — the original `score_race_field_relative()` scored each finisher's pace against an elevation-adjusted equivalent distance, relative to the fastest finisher in that race (`SCORING_VERSION = "0.1.0-field-relative"`). Kept selectable (see below) but no longer the default.
- [x] **Pluggable scoring architecture (`scoring/registry.py`)** — more than one scoring algorithm can be selected per race distance (`Race.scoring_version`):
  - **Course Standard (`1.0.0-course-standard`, default)** — implements [`docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md): a Minetti gradient-cost course-demand engine over fixed 50 m GPX segments (`scoring/course_demand.py` — 50 m chosen over the spec's own 20 m suggestion after real-world testing showed 20 m segments could let short-but-real technical trail pitches average out past the model's evidenced domain; a distance-based, not point-count-based, elevation-denoising pipeline since real GPX tracks are often very unevenly sampled; and an explicit hard error for grades outside the polynomial's evidenced ±45% domain), feeding a logarithmic score curve anchored at two published reference points (500 at 15.0 demand-km/h, 1000 at 22.5 demand-km/h), clipped to 0–1000. Has **no competitor dependency at all**: a runner's score depends only on the course and their own finish time, never the field's winner/size/strength. Pre-race GPX predictions (`POST /gpx/analyze`) and post-race scores share the exact same formula (`scoring.estimator` / `scoring.course_standard.score_for_time`), with an exact inverse (`target_time_seconds`) for score→time planning.
  - **Field Relative (`0.1.0-field-relative`, legacy)** — the original model above, kept selectable for backwards compatibility and reproducibility of historical scores (`METHODOLOGY.md` §11).
- [x] **Reproducibility tests** — same input twice → identical output (`tests/unit/test_scoring_model.py`, `tests/unit/test_scoring_course_standard.py`, `tests/unit/test_scoring_course_demand.py`, `tests/unit/test_scoring_registry.py`), plus a hand-verified golden fixture under `tests/fixtures/scoring/`.
- [x] **Auditability** — every score is a full `ScoreBreakdown` (base performance/`otri_raw`, course/field/environmental adjustments, confidence, performance rate, scoring version), never a bare number, per `HANDBOOK.md`'s "Auditability" section.

Still missing on purpose (documented in `scoring/README.md`): cross-race calibration data (the `Q_500`/`Q_1000` scale anchors are explicit OTRI design choices, not yet validated against real results), field-strength adjustment, environmental factors, and course-structure-difficulty corrections (climb concentration, steepness exposure) — deferred until real race data exists to validate them without overfitting, per `METHODOLOGY.md` §10 and the spec's own section 33 ("V0 boundaries").

**Blocked by:** Phase 0 (needs validated results as input). **Blocks:** everything downstream that consumes a score.

## Phase 2 — GPX parser & course model ✅ done *(was parallel-safe, built after Phase 1)*

**Goal:** turn a GPX file into course-difficulty features. Does **not** depend on Phase 1/3.

- [x] **GPX reader** (`course/gpx.py`) — parses `trkpt` points (lat/lon/elevation/time) using only the Python standard library (`xml.etree.ElementTree`); no external GPX dependency needed for this scope.
- [x] **Course-feature extraction** (`course/features.py`, your own code, documented) — distance (haversine), elevation gain/loss with GPS-noise filtering, steep-climb/steep-descent distance, run-averaged max climb/descent grade, min/max elevation.
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

## Phase 4 — API & organizer submission workflow ✅ done (Postgres-backed)

- [x] **Machine-readable API** (`api/`, FastAPI) exposing events, race distances, course data, and scored results (`GET /events`, `GET /events/{event_id}`, `GET /races`, `GET /races/{race_id}`, `GET /races/{race_id}/results`).
- [x] **Events & race distances data model** — an event (owned by an organizer) can hold multiple race distances (e.g. "50K", "25K"), each with independent course stats and an optional attached GPX file (`POST /races/{race_id}/gpx`, authoritative for distance/elevation once attached). Full CRUD on both (`POST`/`PATCH`/`DELETE /events/{event_id}`, `POST /events/{event_id}/races`, `PATCH`/`DELETE /races/{race_id}`), with ownership enforced server-side (403 if you don't own the event).
- [x] **Organizer upload workflow** (`POST /races/{race_id}/results`) — an organizer submits a raw result file; the endpoint always validates it (`ingestion.validate_result_file`) and then re-scores it from scratch (`scoring.score_race`). The organizer can never supply a score directly (`HANDBOOK.md` "Validation and anti-gaming"). Requires ownership of the race's event.
- [x] **Real persistence** (`api/db.py`, PostgreSQL) — events, races, results, and organizer accounts survive a server restart. Seed the demo dataset with `python scripts/seed_demo_data.py`.
- [x] **Organizer auth with mandatory email verification** (`api/auth.py`) — register/login/email verification/resend-verification/password reset, JWT sessions, passwords hashed with bcrypt. Registering does **not** log you in — `/auth/login` returns 403 until the account is verified. Verification and reset emails sent via Resend (`api/email.py`).
- [x] **Basic abuse protection** (`api/rate_limit.py`) — in-process rate limiting on auth endpoints. Known limitation: not shared across multiple worker processes yet (needs Redis for that).
- [x] Tests (`tests/unit/test_api.py`, `tests/unit/test_auth.py`) covering events, races, scoring, auth (including the verification gate and ownership checks), and email verification/reset, run against a real Postgres test database (`tests/conftest.py`).
- [x] **Organizer dashboard UI** (`prototype/OrganizerUpload.jsx`) — full event/distance CRUD, a scoring-algorithm picker per race distance (`GET /scoring/models`), GPX attach, and results submission wired to the live API, gated behind email-verified sign-in.

**Known gaps, documented in `api/README.md`:** no database migration tool yet (schema created via `CREATE TABLE IF NOT EXISTS`), rate limiting isn't multi-worker-safe, JWT sessions have no refresh token, and `GET /events`/`GET /races` compute counts/joins with one query per event (N+1, fine at prototype scale).

Depended on Phases 0–1 being stable enough to expose publicly — they were.

## Phase 5 — Ecosystem *(partially in scope for code — mostly business/community work)*

- [x] **Formal governance (OEP process)** — `docs/governance/oep-template.md` plus an OEP index at `docs/governance/oep/README.md`. Retroactively documented the Phase 1 baseline scoring model as [`OEP-001`](governance/oep/OEP-001-baseline-scoring-model.md), so the process has a real, non-hypothetical example.
- [ ] More organizer partners, developer integrations, scientific advisors, international expansion — these are business-development and community activities, not something to build in code. See `HANDBOOK.md` "Phase 4 — Ecosystem" for the full list.

## Open-source constraints that apply to every phase

- No proprietary/paid APIs as hard dependencies (Google Maps, Mapbox tokens, other organizations' proprietary race data) — the whole stack must be runnable by a volunteer with no budget.
- Every new dependency needs a permissive license (MIT/BSD/Apache-2.0) compatible with this project's MIT license.
- Real race data ingestion follows `DATA_POLICY.md`'s source hierarchy — synthetic demo data only until real data is secured.
