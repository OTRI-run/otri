# OTRI Prototype

A separate, working demonstration of the full pipeline built so far — kept apart from the production marketing site (`index.html`) so that finished design never gets disturbed by in-progress feature work, while reusing the same visual design system (colors, type, Tailwind classes).

## What it wires together

- **`ingestion/`** — validates the synthetic demo race/result files.
- **`scoring/`** — computes each finisher's OTRI score (baseline model, `scoring_version 0.1.0`).
- **`course/`** — parses a sample GPX file and extracts distance/elevation features.
- **`src/components/CourseMap.jsx`** — renders that GPX as a map + elevation profile (Phase 3 component, now actually used somewhere).

## Why it's static, not a live API call

`otri.run` is static GitHub Pages hosting — it cannot run the Python `api/` service. So instead of calling the API at runtime, [`scripts/build_prototype_data.py`](../scripts/build_prototype_data.py) runs the real `ingestion` → `scoring` → `course` pipeline once and writes the result to [`data/races.json`](data/races.json), which this page imports directly. The numbers on this page are genuinely computed by that pipeline, not hand-written.

Regenerate after changing demo data, the scoring model, or course features:

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

Then open the printed local URL and navigate to `/prototype/`.

## Known limitations

- No live API calls — this is a static snapshot, regenerated manually.
- Scores use the v0.1 baseline model only (no cross-race calibration) — see `scoring/README.md`.
- The sample GPX course is illustrative, not any listed race's real course.
