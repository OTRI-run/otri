# Scoring

OTRI model 0.1.1: a runner's score depends only on the course and their own finish time. The complete definition, every constant's provenance and the evidence are in [`docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`](../docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md), and [`docs/methodology/0.1.1/OTRI-MODEL-0.1.1.md`](../docs/methodology/0.1.1/OTRI-MODEL-0.1.1.md) says the one thing 0.1.1 changed: the curve exponent, 0.692 for 0.85 ([OEP-004](../docs/governance/oep/OEP-004-curve-exponent-0-692.md)). The plain-language version is [`HOW-OTRI-SCORES.md`](../docs/methodology/0.1.1/HOW-OTRI-SCORES.md).

There are **two models in the code**: 0.1.1 (build id `0.11.0-course-standard-model-0.1.1`), the default for every new race and estimate, and 0.1.0 (`0.10.0-course-standard-vertical`), kept so that a score published under it can be reproduced. The development builds before 0.1.0 were removed in September 2026 (they are in git history, and the 0.1.0 specification's section 14 says what each contributed). Every score names its `scoring_version`.

| Module | What it holds |
| --- | --- |
| `course_standard.py` | The model: the human-ceiling reference (`ENDURANCE_REFERENCE`), the power curve (`MODEL_CURVE`, score = 1000 x fraction of the ceiling ** 0.692; `MODEL_0_1_0_CURVE` with 0.85), confidence and its reasons (`confidence_for`), the refusal to score uphill-only courses (`not_scored_reason`), and `score_race_course_standard`. |
| `course_demand.py` | The Minetti gradient-cost polynomial, the `CourseDemand` result, and the coarse fallback from an official distance and climb (`demand_from_totals`). |
| `measured_demand.py` | Course demand integrated over 50 m segments of the shared course measurement (`course/measurement.py`), with the two terrain inputs measured off the same segments. |
| `terrain.py` | What the gradient integral does not price: sustained steep ground and altitude. |
| `estimator.py` | One finish time on one course, with every intermediate of the score (`POST /gpx/analyze`). The same functions as race scoring, so a target time predicts exactly the score that time will earn. |
| `registry.py` | `score_race(...)` and the list of models (0.1.1, and 0.1.0 so that its scores can be reproduced). An unknown or retired `scoring_version` is refused, never silently rescored. |
| `runner_index.py` | The provisional runner index over published scores ([`RUNNER-INDEX-v1.md`](../docs/methodology/runner-index/RUNNER-INDEX-v1.md)). |
| `model.py` | `ScoreBreakdown` and `RunnerScore`: a score is a breakdown, not a bare number. |

## Properties the tests hold it to

- **No competitor dependency.** Adding or removing finishers never changes anyone's score (`tests/unit/test_scoring_curve.py`).
- **Length-invariant.** The same fraction of the human ceiling scores the same on a 5 km and on a 100-mile course; published world bests, including the held-out ones, land at 920 to 1000.
- **Honest about its limits.** `High` confidence only with terrain-verified elevation on a reproducible track inside the evidenced gradient and distance range; an uphill-only course is listed with finish times and no score (`tests/unit/test_scoring_domain_gated.py`, `test_scoring_dem_gated.py`).
- **Deterministic.** No randomness or wall-clock reads: the same results, course measurement and version always give the same scores.

## Usage

```python
from ingestion import race_records, result_records
from scoring import score_race

race = race_records("data/demo/races.csv")[0]
results = result_records("data/demo/results/OTRI-DEMO-001.csv")
print(score_race(race, results)[0].to_dict())
```

Changing a formula or constant needs an OEP (`docs/governance/`) and a new `scoring_version`: never an edit in place.
