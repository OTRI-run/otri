# OTRI Prototype

A separate, working demonstration of the full pipeline built so far — kept apart from the production marketing site (`index.html`) so that finished design never gets disturbed by in-progress feature work, while reusing the same visual design system (colors, type, Tailwind classes).

## What it wires together

- **`ingestion/`** — validates the synthetic demo race/result files.
- **`scoring/`** — computes each finisher's OTRI score (baseline model, `scoring_version 0.1.0`).
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

## Why the Races tab is static, not a live API call

`otri.run` is static GitHub Pages hosting — by default nothing runs the Python `api/` service for it. So instead of calling the API at runtime for the main race list, [`scripts/build_prototype_data.py`](../scripts/build_prototype_data.py) runs the real `ingestion` → `scoring` → `course` pipeline once and writes the result to [`data/races.json`](data/races.json), which this page imports directly. The GPX tester and organizer tabs, by contrast, *do* call a live API — point them at a real deployed backend (see `docs/operations/digitalocean-deployment.md`) to make them fully functional in production.

Regenerate the static snapshot after changing demo data, the scoring model, or course features:

```powershell
python scripts/build_prototype_data.py
```

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

