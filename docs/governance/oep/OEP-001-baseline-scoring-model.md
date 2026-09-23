# OEP-001: Baseline scoring model (v0.1)

- **Status:** Superseded. The field-relative model this accepted (`scoring_version = "0.1.0"`) was retired when OTRI model 0.1.0 (Course Standard) replaced it; the registry holds one model (`scoring/registry.py`, [`OTRI-MODEL-0.1.0.md`](../../methodology/0.1.0/OTRI-MODEL-0.1.0.md) §14). Kept as the record of the decision.
- **Author(s):** OTRI maintainers
- **Date:** 2026-09-16
- **Affects:** `scoring_version = "0.1.0"` (`scoring/model.py`)

## 1. Problem

OTRI needed a first scoring model before anything else could be built on top of it (organizer submission workflow, API, future GPX predictor). There was no way yet to turn a validated race result into an OTRI score.

## 2. Hypothesis

A deliberately simple, single-race-relative model — pace adjusted for elevation gain, scored against the fastest finisher in the same race — is more useful right now than a more sophisticated but uncalibrated model, per the research discipline in `HANDBOOK.md` (then `METHODOLOGY.md` §13): "prefer a simple transparent baseline over an impressive-looking but poorly validated model."

## 3. Mathematical / statistical rationale

1. **Equivalent distance:** `equivalent_km = distance_km + (elevation_gain_m / 100) * 1.0` — a widely used trail-running rule of thumb (~1 extra "flat" km per 100 m of climbing). Named constant: `ELEVATION_KM_PER_100M = 1.0`.
2. **Pace:** `pace = finish_time_seconds / equivalent_km` for every finisher.
3. **Score:** `base_performance = 1000 * (winner_pace / runner_pace)` — the fastest finisher in the race always scores exactly 1000; everyone else scores proportionally lower.
4. `course_adjustment`, `field_adjustment`, and `environmental_factor` are all `0.0` — not implemented yet (see §8).
5. **Confidence** is derived only from field size: `<5` finishers → "Low", `<20` → "Medium", `>=20` → "High". This reflects confidence in the *relative ranking within this race*, not cross-race comparability.

## 4. Data used

The three synthetic demo races in `data/demo/` (`OTRI-DEMO-001/002/003`, 12 finishers each, including one DNF row). No real race data exists yet — this is why the model is intentionally simple rather than fit to real-world data.

## 5. Alternatives considered

- **A cross-race calibrated model** (percentile against a global performance curve): rejected for v0.1 — there is no real multi-race dataset yet to calibrate against, and a fabricated calibration would be less honest than a clearly-labeled single-race-relative score.
- **A more detailed course-difficulty adjustment** using `course/features.py`'s gradient/steep-climb data: deferred — `course/` and `scoring/` are intentionally decoupled until there is real data to justify how they combine.

## 6. Before / after results

Before this OEP: no scoring engine existed. After: every finisher in `data/demo/results/OTRI-DEMO-001.csv` receives a score; the winner scores exactly 1000; see the golden fixture in `tests/fixtures/scoring/two-runner-result.csv` for a fully hand-verified example (winner 1000, runner-up at half the pace scores exactly 500).

## 7. Tests and validation

`tests/unit/test_scoring_model.py`: a hand-verified golden fixture, winner-always-scores-1000 on real demo data, DNF exclusion, and same-input-twice determinism. All pass.

## 8. Known limitations

- No cross-race calibration — a score is only meaningful relative to its own race's field.
- No field-strength adjustment (needs repeat-runner data across races).
- No environmental factors (weather, altitude, terrain/technicality).
- `equivalent_distance_km`'s elevation constant (`1.0`) is a rule of thumb, not fit to any data.

These are documented in `scoring/README.md` and are expected to be addressed by future OEPs once real race data exists.

## 9. Versioning impact

Establishes `scoring_version = "0.1.0"` as the first version. Any change to the formulas in §3 must bump this version and preserve the ability to reproduce a `"0.1.0"` score exactly as computed here.
