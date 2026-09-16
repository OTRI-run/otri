# Scoring

The OTRI scoring engine — pluggable and versioned, per `docs/methodology/research-candidates/` (`METHODOLOGY.md` §13: prefer a simple transparent baseline over an impressive-looking, poorly validated model). More than one scoring algorithm can be selected at once (`scoring.registry`); each race distance picks which one scores its results (`Race.scoring_version` in `api/db.py`).

## Available models

### Course Standard (`1.0.0-course-standard`) — default

`scoring/course_standard.py` + `scoring/course_demand.py`. Combines the Time Standard Curve architecture (research candidate 05, TSCI) with a Minetti gradient-cost course-demand engine (candidates 01/02, GECI/EFDI):

- **No competitor dependency at all.** A runner's score is a pure function of the course and their own finish time — never the field's winner, size, or strength. Removing or adding other finishers never changes anyone's score (see `tests/unit/test_scoring_course_standard.py::test_score_does_not_depend_on_other_finishers`).
- **Course demand** comes from integrating Minetti et al.'s published gradient-cost polynomial over the GPX (resampled to fixed-length segments), reduced to a single "equivalent flat distance." Falls back to a coarser constant-average-grade approximation (`equivalent_flat_distance_from_totals`) when no GPX has been attached yet.
- **Sealed below 1000.** Score is a strictly increasing, strictly bounded function of equivalent-flat speed that approaches `SCALE_MAX` (1000) as speed goes to infinity but never reaches it for any finite speed — modeling 1000 as a theoretical ceiling nobody can actually reach, not "whoever won this race." See `REFERENCE_SPEED_SCALE_KMH`'s docstring for the (explicitly provisional, pre-calibration) constant behind this.
- **Symmetric pre-race/post-race calculation.** `scoring.estimator.estimate_score()` (used by `POST /gpx/analyze`) shares the exact same formula (`course_standard.score_for_time`), so a GPX + target time predicts the *exact* score that finish time will earn once real results are submitted for the same course — no "assumed winner" guessing required.

### Field Relative (`0.1.0-field-relative`) — legacy

`scoring/model.py`. The original baseline: the fastest finisher in a given race always scores exactly `SCALE_MAX`; everyone else is scaled off that field's own winner. Kept selectable for backwards compatibility and to keep historical scores reproducible (`METHODOLOGY.md` §11 — a methodology change must not silently rewrite history) — **not** the default for new races, since the same finish time means a different score in a different race.

## What neither model does yet

- **No cross-race calibration data.** `course_adjustment` and `field_adjustment` are always `0.0` until Phase 2/4 exist (`docs/roadmap.md`). Course Standard's course-demand engine is grounded in published physiology research, but its score-scale calibration constant (`REFERENCE_SPEED_SCALE_KMH`) is still a documented placeholder, not derived from real OTRI race results.
- **No environmental factors** (weather, altitude, terrain/technicality).
- **No repeat-runner or field-strength adjustment** (a candidate future *layer*, per `METHODOLOGY.md` §5 — deliberately separate from either model's fundamental course+time score).

## Reproducibility

`scoring.registry.score_race()` only takes typed, already-validated input (`ingestion.RaceRecord` / `ingestion.ResultRecord`) plus an explicit `model_version`, and contains no randomness or wall-clock reads, so the same input, model version, and GPX always produce byte-identical output — see `tests/unit/test_scoring_course_standard.py`, `tests/unit/test_scoring_model.py`.

## Usage

```python
from ingestion import race_records, result_records
from scoring import score_race, available_scoring_models

race = race_records("data/demo/races.csv")[0]
results = result_records("data/demo/results/OTRI-DEMO-001.csv")

scores = score_race(race, results)  # defaults to Course Standard
print(scores[0].to_dict())

for model in available_scoring_models():
    print(model.version, model.name, model.uses_competitors)
```
