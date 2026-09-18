# Scoring

The OTRI scoring engine — pluggable and versioned (`METHODOLOGY.md` §13: prefer a simple transparent baseline over an impressive-looking, poorly validated model). More than one scoring algorithm can be selected at once (`scoring.registry`); each race distance picks which one scores its results (`Race.scoring_version` in `api/db.py`).

## Available models

### Course Standard V0.1 (`0.1.0-course-standard-calibrated`) — retained

`scoring/course_standard.py` + `scoring/course_demand.py`. Its course-demand engine is specified in [`docs/methodology/OTRI-MODEL-0.1.0.md`](../docs/methodology/OTRI-MODEL-0.1.0.md) §3, and its retired demo-anchor curve is listed in that page's §14; this README only summarizes it.

- **No competitor dependency at all.** A runner's score is a pure function of the course and their own finish time — never the field's winner, size, or strength. Removing or adding other finishers never changes anyone's score (see `tests/unit/test_scoring_course_standard.py::test_score_race_does_not_depend_on_other_finishers`).
- **Course demand** comes from integrating Minetti et al.'s published gradient-cost polynomial over fixed-length GPX segments (`SEGMENT_LENGTH_M = 50` — chosen over the spec's own 20 m suggestion since, on real unevenly-sampled GPX data, 20 m segments could let short-but-real technical trail pitches average out to just past the model's evidenced domain; see `scoring/course_demand.py`'s module comments), after a fixed elevation-denoising pipeline (remove non-finite values → remove isolated spikes → rolling median → rolling mean, all using a **distance-based** window since real GPX points are often very unevenly spaced), reduced to a single "course demand" coordinate (km). Grades outside the polynomial's evidenced ±45% domain are **clamped to ±45% for that segment and recorded in `quality_flags`** (spec section 9.1) rather than silently ignored — a course is never hard-rejected just for having one very steep pitch, but the notice is always surfaced. Falls back to a coarser constant-average-grade approximation (`equivalent_flat_distance_from_totals`) when no GPX has been attached yet.
- **Piecewise power-law scale, clipped to 0–1000.** `OFFICIAL_CURVE` interpolates through demo/test race reference anchors (6:29:58→349, 3:05:04→544, 2:20:30→692, on a ~27.560 demand-km course) using log-log (power-law) interpolation between anchors; the final segment extrapolates the same exponent up to Q≈17.94 at score 1000 (`ScoreCurve.curve_type == "piecewise_power"`). The unclipped raw value (`otri_raw`) is always retained for audit. **1000 is a real, reachable score**, not an asymptotic ceiling.
- **Legacy logarithmic curves still selectable.** `CALIBRATED_CURVE` (`1.1.0-course-standard`) and `SPEC_CURVE` (`1.0.0-course-standard`, the original spec's literal `Q_500=15.0`/`Q_1000=22.5` anchors) remain selectable via `model_version` for historical reproducibility — neither is the default.
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

## Course Standard V0.2 — default for new races and GPX prediction

`0.2.0-course-standard-measured` uses the shared `course-measurement-v1` profile for physical features and the 50 m Minetti demand integral. Displayed ascent and demand diagnostics use the same prominence total; metabolic cost still integrates grades, not an ascent-only formula. It reuses the V0.1 score curve, with a new version because measured geometry and elevation change its inputs. The curve has not been recalibrated against new field evidence.

Persisted races use their saved measurement snapshot. Existing V0.1/legacy races retain their previous scoring algorithm. Quality flags are propagated to estimates and scores. A scoring-domain clamp never changes the measured elevation profile. See [course measurement](../course/README.md).
