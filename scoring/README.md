# Scoring

The OTRI baseline scoring engine — intentionally simple, versioned, and fully explainable (`METHODOLOGY.md` §13: prefer a simple transparent baseline over an impressive-looking, poorly validated model).

## What v0.1 (`SCORING_VERSION`) does

- Converts each race's distance + elevation gain into an "equivalent flat distance" using a fixed, documented constant (`ELEVATION_KM_PER_100M`).
- Scores every finisher's pace **relative to the fastest finisher in that same race** — the winner always scores exactly `SCALE_MAX` (1000).
- Returns a full breakdown per runner (`ScoreBreakdown`): base performance, course/field/environmental adjustments, confidence, and the scoring version — never a bare number.

## What it deliberately does not do yet

- **No cross-race calibration.** A score is only meaningful relative to its own race's field, not yet comparable across races. `course_adjustment` and `field_adjustment` are always `0.0` until Phase 2/4 exist (`docs/roadmap.md`).
- **No environmental factors** (weather, altitude, terrain/technicality).
- **No repeat-runner or field-strength adjustment.**

## Reproducibility

`score_race()` only takes typed, already-validated input (`ingestion.RaceRecord` / `ingestion.ResultRecord`) and contains no randomness or wall-clock reads, so the same input and `SCORING_VERSION` always produce byte-identical output — see `tests/unit/test_scoring_model.py`.

## Usage

```python
from ingestion import race_records, result_records
from scoring import score_race

race = race_records("data/demo/races.csv")[0]
results = result_records("data/demo/results/OTRI-DEMO-001.csv")
scores = score_race(race, results)
print(scores[0].to_dict())
```
