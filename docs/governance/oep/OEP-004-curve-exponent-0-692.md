# OEP-004: The curve exponent returns to 0.692 (OTRI model 0.1.1)

- **Status:** Accepted (2026-09-25, by the maintainer)
- **Author(s):** the maintainer
- **Date:** 2026-09-25
- **Affects:** `scoring_version` — new build id `0.11.0-course-standard-model-0.1.1`, public name **OTRI model 0.1.1**, the default for every new race and estimate. `0.10.0-course-standard-vertical` (model 0.1.0) stays in the registry so that scores published under it can be reproduced.

## 1. Problem

Model 0.1.0 scores a runner as `1000 × f^0.85`, where `f` is the runner's share of the human-ceiling rate for a course of that size. The exponent was chosen (0.1.0 §6.1), as a middle way between `k = 1` and the 0.692 the development builds had used, and its consequence was stated: the middle of the field came down materially, 53 % of the ceiling from 643 to 583.

In use, that placed ordinary, well-trained trail performances low on the scale: a 15 km trail race in 1:33 at about 600, a 75 km mountain race in 13:25 at about 560, a road marathon in 4:00 at 557. The level names (Trained from 500, Advanced from 600) then read a full step too harsh for what the performances are. The problem is the reading of the scale, not its order: the ranking of any two performances is the same under any exponent.

## 2. Hypothesis

Returning the exponent to 0.692 lifts the whole scale below the top, most in the middle of the field, while a world best still scores 1000 and no two performances change places. The scale then reads as the level names describe it.

## 3. Mathematical / statistical rationale

```text
otri_raw = 1000 × f^0.692        f = Q_lookup / Q_1000, unchanged from 0.1.0
```

Both curves are strictly increasing in `f` with `f = 1 ↦ 1000`, so the top and the order are invariant; only the spacing below the top changes. A 0.1.0 score restates exactly: `score_0.1.1 = 1000 × (score_0.1.0 / 1000)^(0.692 / 0.85)`.

The exponent is a judgement, as 0.85 was. It is not fitted to a field of results and not referenced to any other index (`DATA_POLICY.md`). Alternatives with a physical reading were considered (§5) and left in the scoring lab.

## 4. Data used

No field data. The judgement was made on the scoring lab (`scoring_lab/`) over a folder of real course files with a few known finish times: a 15 km and a 75 km trail race in Phuket, a 31 km alpine race, a vertical kilometre, the synthetic calibration courses, and the road distances against the reference performances. Everything reported below is reproducible from the model alone.

## 5. Alternatives considered

- **Keep 0.85.** Rejected for the reason in §1.
- **`k = 1`** (the score is the share, times ten, no constant at all). The most defensible reading physically, and the scoring lab's model 0.1.3 pairs it with comparing each runner against the ceiling over their own finish time rather than over the course. Rejected for production now: it lowers the middle of the field further than 0.85 does, and its same-duration comparison shows the kink of the piecewise ceiling at the marathon record. It stays in the lab as a candidate for a future model, pending field data.
- **A hard top** (the score bends towards a cap above 990, lab models 0.1.2, 0.1.4, 0.1.5). Rejected: 0.1.0 removed the cap at 1000 for a stated reason (a score above 1000 carries information), and a cap changes what the top means without evidence for where it belongs.
- **Changing the course side instead** (lab model 0.1.6: descents priced by measured pace, altitude for acclimatised athletes, no calibrated steep coefficient). Each piece has a published source and each is a candidate for its own OEP; none addresses the reading of the scale, which is a curve question.

## 6. Before / after results

| performance | share `f` | 0.1.0 | 0.1.1 |
|---|---:|---:|---:|
| 5000 m, marathon and 24-hour world bests | 100 % | 1000 | 1000 |
| The 2026 calibration performance, 18:16:29, terrain-model elevation | 98 % | 984 | 986 |
| 100 km / 100-mile road world bests | 95 % | 957 / 960 | 965 / 967 |
| A road marathon in 3:00 / 4:00 | 67 % / 50 % | 711 / 557 | 758 / 621 |
| A road half marathon in 1:45 / 2:00 | 56 % / 49 % | 609 / 543 | 668 / 608 |
| An 80 km Chiang Mai mountain course in 12:33 | 53 % | 581 | 643 |
| A 22 km mountain course in 2:20 / 6:30 | 61 % / 22 % | 653 / 274 | 707 / 349 |
| A 15 km Phuket trail race in 1:33:40 | 55 % | 598 | 658 |
| A 75 km Phuket trail race in 13:24:40 | 50 % | 557 | 621 |

The illustrative scores on the site were restated from their 0.1.0 values by the formula in §3.

## 7. Tests and validation

`tests/unit/test_scoring_curve.py` (exponent, version, the curve identity to 1e-12, the inverse round-trip, monotonicity), `tests/unit/test_scoring_registry.py` (two models, the default, retired versions refused), `tests/unit/test_score_levels.py` (the calculator's scale copies the model's numbers; the marathon times said in words are the model's), `tests/unit/test_scoring_terrain.py` (real-course pins). Same input, same version, same output: a race under 0.1.0 replays to the last digit through `MODEL_0_1_0_CURVE`.

## 8. Known limitations

- The exponent is still a judgement. The scale's shape below the top rests on no field data, in 0.1.1 as in 0.1.0, and will be fitted only when licensed results exist.
- Scores are comparable only within a model. Every race, published ones included, was moved to 0.1.1 on 2026-09-25 so that the site shows one scale; a score published under 0.1.0 before that day restates exactly by the formula in §3.
- Nothing the curve cannot do is done: footing, heat and the other limits of 0.1.0 §12 stand.

## 9. Rollout

Migration `0012_model_0_1_1` moves every race to 0.1.1, published ones included, and sets it as the default. A published race is otherwise frozen; moving them all at once is the maintainer's one-time decision under this OEP, made because the change is a monotone restatement of one scale that moves no finisher's place and restates every 0.1.0 score exactly. The site's bands, FAQ, showcase and example race carry the restated numbers; `docs/methodology/0.1.1/` holds the specification and the explainer; the changelog announces it.
