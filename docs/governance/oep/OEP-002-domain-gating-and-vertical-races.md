# OEP-002: Domain gating — vertical races are not scored yet, and confidence reports the model's own limits

- **Status:** Proposed
- **Author(s):** OTRI maintainers
- **Date:** 2026-09-18
- **Affects:** new build id `0.9.0-course-standard-domain-gated` (default for new races; still OTRI model 0.1.0), `scoring/course_standard.py`, `scoring/course_demand.py`, `RaceSummary.is_vertical`

## 1. Problem

Model 0.1.0 was built and checked on road records and on mountain courses with descents. Vertical races — a vertical kilometre, an uphill race that finishes on a summit — sit outside that in three ways, and under build `0.8.0` nothing says so.

1. **The steep-terrain term over-scores uphill-only courses.** `terrain_factor = 1 + 0.5951 × steep share + …` (model §4). The coefficient was calibrated on one alpine 100-miler with 18.4 % of its distance at or above 20 % grade. The real courses OTRI holds measure 0–25 %. A vertical kilometre is about 100 % steep, so the linear term multiplies its demand by 1.595. A 3.8 km, +1,000 m course then scores 1000 for a 50-minute finish — a mid-pack time, where the world's best run about 30 minutes. Without the term the gradient integral alone puts 30 minutes at about 103 % of the ceiling and 60 minutes at 570, which is plausible. The term is doing something it was never calibrated to do.
2. **The gradient-cost polynomial stops at ±45 %.** Steeper 50 m segments are clamped and flagged (model §3). A few such pitches are noise (0.70 % of the demand of the alpine 100-miler). On the steepest vertical kilometres most of the course is beyond the domain, and the demand figure is mostly the clamp's.
3. **The ceiling is validated down to 1,500 m only.** Its extrapolation matches the 1,500 m and 3,000 m world records (102.4 %, 99.8 %), but below that events are anaerobic and the records run away from the curve: 1,000 m 104.1 %, 800 m 107.4 %, 400 m 120.9 %.

Separately, a race entered from official figures only, with an average grade above 45 %, could not be scored at all: the totals fallback raised instead of clamping.

Low-confidence results count in the runner index like any other (`RUNNER-INDEX-v1.md` §2), so problem 1 cannot be handled with a label: the inflated scores would enter runners' indexes.

## 2. Hypothesis

Refusing to score the courses the steep-terrain term demonstrably over-scores, and labelling the two places where the evidence merely runs out, keeps every published number defensible without touching any number the model already gives. Vertical races stay publishable — finish times, ranks, the course — and become scoreable the day the terrain term is recalibrated with vertical-race data.

## 3. Mathematical / statistical rationale

No formula or constant of model 0.1.0 changes. Build `0.9.0` adds three rules on top of build `0.8.0`:

```text
not scored   steep share  > 0.50                              (measured course)
             average grade ≥ 0.20                             (official figures only; descent unknown)
Low          clamped share of demand > 0.20                   → gradient_domain_exceeded
Low          D' < 1.5 flat-km                                 → course_below_validated_range
```

- **Steep share > 0.50.** The calibration point is 0.184 and the steepest real mountain course on file is 0.246, so 0.50 is twice anything the term has been seen on and half of what a vertical race measures; nothing but an uphill-only course (or a pure downhill one) reaches it. A not-scored course returns every finisher with `otri_score = null`, `confidence = "n/a"` and one `course_not_scored: …` flag carrying the reason in plain words. The runner index skips rows without a score.
- **Clamped share of demand > 0.20.** Extrapolating the polynomial (itself a guess) puts the under-credit of a clamped segment at 8 % at 48 % grade, 13.5 % at 50 %, 18.6 % at 52 %. With a fifth of the demand clamped at about 15 %, the course-level error reaches the 3 % that `High` claims (§7.3). Share of *demand*, not of distance, because a clamped segment carries 5.4 times the demand of a flat one. The clamp notice alone still never blocks `High` (§7.2).
- **1.5 flat-km** is the shortest held-out validation point (§5.3).

The totals fallback now clamps an average grade beyond ±45 % and flags it, as the GPX path always has.

The vertical *label* (`course/discipline.py`) is descriptive and never enters a score: ascent ≥ 10 × descent and average grade ≥ 10 %; with no measured course, average grade ≥ 20 %.

## 4. Data used

Synthetic constant-grade courses (`tests/unit/test_scoring_domain_gated.py`), the public world records already listed in model §5.3 plus the 1,000 m, 800 m and 400 m records, and the steep share of the nine course files under `data/demo/gpx` (0.0–24.6 %). No vertical-race results were available; that absence is the reason for not scoring rather than re-fitting.

## 5. Alternatives considered

- **Low confidence only.** Rejected: the runner index counts Low results, so a 50-minute vertical kilometre would put 1000 into a runner's index.
- **Recalibrate or cap the steep term now** (cap the share at the calibrated range, or price climbs and descents separately). This is the real fix. It changes scores, so it is a new model (0.2.0), and there is no licensed vertical-race data to fit it on. Deferred, not dismissed.
- **Refuse vertical races at upload.** Rejected: organizers would get nothing, and the course and results are worth publishing without a score.
- **A 5 km-effort floor**, as other indexes use. Rejected: OTRI's own held-out validation supports the ceiling down to 1.5 flat-km.

## 6. Before / after results

3.8 km, +1,000 m, constant 26 % (steep share 100 %, terrain factor 1.595):

| finish | build 0.8.0 | build 0.9.0 | gradient integral alone, for reference |
|---|---:|---:|---:|
| 30 min | 1000 (raw 1565) | not scored | ≈ 1000 |
| 50 min | 1000 (raw 1014) | not scored | 666 |
| 60 min | 868 | not scored | 570 |
| 90 min | 615 | not scored | 404 |

Every course with a steep share of 0.50 or less scores identically under both builds, to the last digit (`test_v09_scores_identically_to_v08`). A 4 km course with a 600 m wall at 52 % keeps its score and goes from `High` to `Low` with `gradient_domain_exceeded`. A flat 1 km keeps its score and goes to `Low` with `course_below_validated_range`.

## 7. Tests and validation

`tests/unit/test_scoring_domain_gated.py`: identical scores across builds; the clamped share is measured; a normal steep course keeps `High`; the thresholds sit exactly at 0.20 and 1.5; a vertical race lists every finisher without a score and with the reason; build `0.8.0` replays its published numbers; the official-figures path; the calculator gets the reason (`CourseNotScoredError`); the vertical label. `tests/unit/test_api.py`: `is_vertical` on race summaries, the leaderboard of a vertical race, the calculator's 422 with the reason.

## 8. Known limitations

- The model still cannot score a vertical race. This OEP only stops it from pretending to.
- The 0.50 and 0.20 thresholds are chosen, not fitted. A very steep skyrace with a steep share between 0.25 and 0.50 is still scored with a term extrapolated beyond its calibration point; nothing on file is in that band.
- A pure downhill course also exceeds the steep share and is not scored. That is intended — the term is as uncalibrated there — but it is not what the reason text says first.
- The vertical label and the not-scored rule are different tests. An uphill road race at 12 % is labelled vertical and scored (its steep share is small); that is correct, and may surprise.
- Races already stored under build `0.8.0` keep replaying their scores. A vertical race published under `0.8.0` would need its build id changed by its organizer. None exists in production at the time of writing.

## 9. Versioning impact

New build id `0.9.0-course-standard-domain-gated`, the default for new races and for the calculator. The public model name stays `OTRI model 0.1.0`: no course and time receives a different number, some courses receive none. Build `0.8.0-course-standard-power` stays selectable and replays exactly.
