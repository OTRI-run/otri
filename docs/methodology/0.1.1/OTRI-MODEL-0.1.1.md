# OTRI scoring model 0.1.1

**Status:** The model in production since 2026-09-25. Every new race, runner profile and calculator estimate is scored under it. Every race, published ones included, was moved to it that day.
**Public name:** `OTRI model 0.1.1` · **Measurement:** `course-measurement-v3` · **Elevation:** Copernicus GLO-30 where installed
**Internal build id:** `0.11.0-course-standard-model-0.1.1` — the identifier the API returns as `scoring_version` and stores with every score, so old results replay byte-for-byte.
**Decision record:** [OEP-004](../../governance/oep/OEP-004-curve-exponent-0-692.md).
**Code:** `scoring/course_standard.py` (`MODEL_CURVE`; `MODEL_0_1_0_CURVE` beside it), `scoring/registry.py`. If this page and the code disagree, the code wins, and that is a bug in this page.

This page is the specification of model 0.1.1 as a difference from model 0.1.0. Everything not named here — the inputs and measurement, course demand, the terrain adjustment, the ceiling, confidence, the rules that hold everywhere, the required tests, the known limits — is exactly as [`OTRI-MODEL-0.1.0.md`](../0.1.0/OTRI-MODEL-0.1.0.md) specifies, with the same constants, and that page remains the complete definition of those parts.

---

## 1. The one change

```text
model 0.1.0    otri_raw = 1000 × f^0.85
model 0.1.1    otri_raw = 1000 × f^0.692          f = Q_lookup / Q_1000, as before
```

`f` is the runner's fraction of the human-ceiling rate for a course of this size (0.1.0 §5–6): unchanged in how it is measured, and unchanged in value for every course and time. Only the curve that turns the fraction into a score is different. The inverse, for target times, follows: `Q_lookup = Q_1000 × (score / 1000)^(1/0.692)`.

`otri_score = round(max(otri_raw, 0))`, with no cap at 1000, as before.

## 2. Why 0.692

The exponent is a judgement, not a measured or fitted quantity, in 0.1.0 as in 0.1.1 (0.1.0 §6.1). 0.1.0 chose 0.85 as a middle way between "the score is your percentage of the world-best rate, times ten" (`k = 1`) and the concave 0.692 that every development build before it had used. Its stated consequence was that the middle of the field came down materially: 53 % of the ceiling scored 643 before and 583 after.

0.1.1 returns to 0.692, on the maintainer's judgement that 0.85 placed ordinary, well-trained trail performances too low on the scale for the scale to read well. Two things were held fixed in making that judgement:

- **The top of the scale does not move.** A world best, `f = 1`, scores 1000 on either curve, and the model still does not cap the score at 1000. The nine held-out world records of 0.1.0 §5.3 stay at 92–102 % of the ceiling and score 940–1015.
- **The order never changes.** Both curves are strictly increasing in `f`, so any two performances rank the same under 0.1.0 and 0.1.1, on every course, at every length.

What changes is the spacing below the top. Under 0.692 a given share of the ceiling scores higher, and the gain is largest in the middle of the field:

| share of ceiling `f` | 0.1.0 | 0.1.1 | gain |
|---:|---:|---:|---:|
| 100 % | 1000 | 1000 | 0 |
| 98 % (the 2026 calibration performance, terrain-model elevation) | 983 | 986 | +3 |
| 95 % (100 km / 100-mile road world bests) | 957 | 965 | +8 |
| 90 % | 914 | 930 | +16 |
| 72 % | 756 | 797 | +41 |
| 61 % (a 22 km mountain course in 2:20) | 657 | 710 | +53 |
| 53 % (an 80 km mountain course in 12:33) | 583 | 644 | +61 |
| 49 % (a road half marathon in 2:00) | 545 | 610 | +65 |
| 38 % | 439 | 512 | +73 |
| 22 % (the 22 km course in 6:30) | 276 | 351 | +75 |

Restated on a flat road marathon, the round scores now mean: 900 is 2:20, 800 is 2:46, 700 is 3:22, 600 is 4:12, 500 is 5:28, 400 is 7:33 (under 0.1.0: 2:16, 2:37, 3:03, 3:40, 4:33, 5:54). The calculator's level names (Beginner to World class) keep their round edges and carry these times.

No field data was used to choose the exponent, and nothing was referenced to any third-party index ([`DATA_POLICY.md`](../../../DATA_POLICY.md)). That is still the position: the exponent will be fitted only when licensed field data across course sizes and ability levels exists, and never to track another index.

## 3. Restating a 0.1.0 score

Because only the curve changed, a score under 0.1.0 restates exactly, without the course or the time:

```text
score_0.1.1 = 1000 × (score_0.1.0 / 1000)^(0.692 / 0.85)
```

The illustrative scores on the site (the landing page's showcase, the example race on *Score my race*) were restated this way from the values worked out under 0.1.0.

## 4. Two models in the code

| build id | public name | used for |
|---|---|---|
| `0.11.0-course-standard-model-0.1.1` | OTRI model 0.1.1 | every new race, every estimate (`POST /gpx/analyze`), every score file, the calculator |
| `0.10.0-course-standard-vertical` | OTRI model 0.1.0 | no race any more; kept so that a score published under it before 2026-09-25 can be reproduced |

Migration `0012_model_0_1_1` moved every race to 0.1.1 on 2026-09-25, published ones included, and set 0.1.1 as the default for new races. A published race is otherwise frozen (`api/db.py`): its organizer cannot restate its results, course or model in place. Moving every published race at once was the maintainer's decision under OEP-004, made because the change is a monotone restatement of one scale (no finisher changes place, and every 0.1.0 score restates exactly by §3) and because one scale across the site reads better than two. The 0.1.0 build stays in the code so that any score published under it can be reproduced. The runner index (`runner-index-v1`) reads the score each published result carries, so every index moved with its results.

An unknown or retired `scoring_version` is still refused, never silently rescored.

## 5. Worked example

The calibration performance of 0.1.0 §6.3, from the file's own elevations: `f = 0.9513`.

```text
0.1.0    otri_raw = 1000 × 0.9513^0.85  = 958.4    otri_score 958
0.1.1    otri_raw = 1000 × 0.9513^0.692 = 966.0    otri_score 966
```

On the Copernicus terrain model the same course reads `f = 0.98`, which is why production scores it 984 under 0.1.0 and 986 under 0.1.1.

## 6. Tests

- `tests/unit/test_scoring_curve.py`: the exponent is 0.692, the version is `0.11.0-course-standard-model-0.1.1`, `otri_raw(f × Q_1000) == 1000 × f^0.692` to 1e-12, the inverse round-trips, a faster time always scores higher.
- `tests/unit/test_scoring_registry.py`: two models, 0.1.1 the default, every score names its model, retired versions refused.
- `tests/unit/test_score_levels.py`: the calculator's scale copies the model's exponent and marathon anchor, and the marathon times said in words are what the model gives.
- `tests/unit/test_scoring_terrain.py`: the real-course pins, under the new curve.

## 7. Versioning

The next change to any formula or constant is a new version and a new page, never an edit to this one (0.1.0 §13). Model 0.1.0's specification stays as published.
