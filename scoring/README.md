# Scoring

The OTRI scoring engine — pluggable and versioned (`METHODOLOGY.md` §13: prefer a simple transparent baseline over an impressive-looking, poorly validated model). More than one scoring algorithm can be selected at once (`scoring.registry`); each race distance picks which one scores its results (`Race.scoring_version` in `api/db.py`).

## Available models

### Course Standard (`1.0.0-course-standard`) — default

`scoring/course_standard.py` + `scoring/course_demand.py`. Implements [`docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](../docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) exactly — that document is the source of truth for this model; this README only summarizes it.

- **No competitor dependency at all.** A runner's score is a pure function of the course and their own finish time — never the field's winner, size, or strength. Removing or adding other finishers never changes anyone's score (see `tests/unit/test_scoring_course_standard.py::test_score_race_does_not_depend_on_other_finishers`).
- **Course demand** comes from integrating Minetti et al.'s published gradient-cost polynomial over 20 m GPX segments (after a fixed elevation-denoising pipeline: remove non-finite values → remove isolated spikes → rolling median → rolling mean), reduced to a single "course demand" coordinate (km). Grades outside the polynomial's evidenced ±45% domain **fail explicitly** (`UnsupportedGradientError`) rather than being silently clamped or extrapolated. Falls back to a coarser constant-average-grade approximation (`equivalent_flat_distance_from_totals`) when no GPX has been attached yet — this fallback is an OTRI-app-level bridge, not part of the formal spec, which treats a missing GPX as a hard input-validation failure.
- **Logarithmic scale, clipped to 0–1000.** Anchored at two explicit, published reference points: 500 points at a performance rate of 15.0 demand-km/hour, 1000 points at 22.5 demand-km/hour (`Q_500`, `Q_1000`, `K = 500 / ln(Q_1000/Q_500)`). The unclipped raw value (`otri_raw`) is always retained for audit. **1000 is a real, reachable score** for any performance at or above the `Q_1000` reference point — it is not an asymptotic, theoretically-unreachable ceiling.
- **Symmetric pre-race/post-race calculation.** `scoring.estimator.estimate_score()` (used by `POST /gpx/analyze`) shares the exact same formula (`course_standard.score_for_time`), so a GPX + target time predicts the *exact* score that finish time will earn once real results are submitted for the same course — no "assumed winner" guessing required. `course_standard.target_time_seconds()` is the exact inverse (score → target time).

### Field Relative (`0.1.0-field-relative`) — legacy

`scoring/model.py`. The original baseline: the fastest finisher in a given race always scores exactly `SCALE_MAX`; everyone else is scaled off that field's own winner. Kept selectable for backwards compatibility and to keep historical scores reproducible (`METHODOLOGY.md` §11 — a methodology change must not silently rewrite history) — **not** the default for new races, since the same finish time means a different score in a different race.

## What neither model does yet

- **No cross-race calibration data.** `course_adjustment` and `field_adjustment` are always `0.0` until Phase 2/4 exist (`docs/roadmap.md`). Course Standard's course-demand engine is grounded in published physiology research, but the `Q_500`/`Q_1000` scale anchors are explicit OTRI design choices, not yet validated against real race results (spec section 34).
- **No environmental factors** (weather, altitude, terrain/technicality) or structural course-shape terms (climb concentration, steepness exposure) — the spec explicitly defers these to a future, separately-validated methodology (spec sections 15/27/33).
- **No repeat-runner or field-strength adjustment** (a candidate future *layer*, per `METHODOLOGY.md` §5 — deliberately separate from either model's fundamental course+time score).

## Reproducibility

`scoring.registry.score_race()` only takes typed, already-validated input (`ingestion.RaceRecord` / `ingestion.ResultRecord`) plus an explicit `model_version`, and contains no randomness or wall-clock reads, so the same input, model version, and GPX always produce byte-identical output — see `tests/unit/test_scoring_course_standard.py`, `tests/unit/test_scoring_course_demand.py`, `tests/unit/test_scoring_model.py`.

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
