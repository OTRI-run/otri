# OTRI Prototype

A separate, working demonstration of the full pipeline built so far — kept apart from the production marketing site (`index.html`) so that finished design never gets disturbed by in-progress feature work, while reusing the same visual design system (colors, type, Tailwind classes).

## What it wires together

- **`ingestion/`** — validates the synthetic demo race/result files.
- **`scoring/`** — computes each finisher's OTRI score under OTRI model 0.1.0 (`docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`).
- **`course/`** — parses a sample GPX file and extracts distance/elevation features.
- **`src/components/CourseMap.jsx`** — renders that GPX as a map + elevation profile (Phase 3 component, now actually used somewhere).
- **`api/`** — the live FastAPI backend, called directly by the "GPX tester" and "Organizer upload" tabs below.

## Three tabs

1. **Races** — static, pre-computed leaderboards (see "Why it's static" below).
2. **Calculate score** — the guided runner pre-race calculator from `docs/AI_PRODUCT_IMPLEMENTATION_BRIEF.md` section 6: pick a course (search races with a verified/attached GPX via the live API, or upload your own), confirm it, enter a target finish time, watch the real computation stages, then see the projected OTRI score with a "why this score" explain layer and a nearby-times table — every number comes from real `POST /gpx/analyze` calls, nothing is hardcoded.
3. **Organizer upload** — a full organizer dashboard against the live API: register + verify an email, create events, add one or more race distances per event, edit/delete either, attach a GPX to a distance, and submit a result file (`POST /races/{race_id}/results`) — shows validation errors/warnings or the computed leaderboard.

The calculator and organizer tabs need the API running locally (or wherever `VITE_OTRI_API_BASE_URL` points — see `.env.example`):

```powershell
pip install -r requirements-dev.txt
uvicorn api.app:app --reload
```

## Where the races come from

The Races page and every leaderboard read the live API (`GET /races` lists races their organizers have
published; `GET /races/{id}/results` is public once published). Nothing is baked into the site at build
time. The synthetic demo races belong to a flagged demo account seeded by `scripts/seed_demo_data.py`
(run by the deploy script) and are labelled DEMO DATA. Organizers publish and unpublish from the race
wizard's review step; accounts listed in `OTRI_ADMIN_EMAILS` see every event under "Admin · all events"
in the organizer app and can take a race down.

## Data

All races are synthetic (`data/demo/`), spanning very different distances/elevations on purpose — a flat 10K, a rolling half, the original 30K/50K/80K set, and a 100-mile ultra with DNFs — to exercise the pipeline across a realistic range rather than just one race shape.

## Run it locally

```powershell
npm install
npm run dev
```

Then open the printed local URL and navigate to `/prototype/`. Start the API too (see above) if you want the calculator / organizer tabs to work.

## Known limitations

- The organizer "create race" endpoint appends to a demo CSV file on the server — not a real database, and not safe under concurrent writes. See `api/README.md`.
- Calculator scores are **illustrative/provisional projections** — not a calibrated cross-race prediction (see `scoring/estimator.py`'s disclaimer, also shown in the UI).
- The sample GPX course shown on the Races tab is illustrative, not any listed race's real course.
- "Search existing race" only lists races that already have a GPX attached (`has_gpx`); races without one aren't calculable yet.

