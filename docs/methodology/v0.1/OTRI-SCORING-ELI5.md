# OTRI Scoring — ELI5

**Status:** Historical — explains the V0.1 model; the model in production today is explained in [`../HOW-OTRI-SCORES.md`](../HOW-OTRI-SCORES.md)
**Audience:** Runners, race organizers, anyone who doesn't want to read a spec
**Source of truth:** [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md). If anything here disagrees with that spec or the code, the spec/code wins.

## The short version

Your OTRI score depends only on **the course** and **your finish time** — never on who else raced.

## Why not just compare finish times?

5 hours on a flat road and 5 hours up a mountain aren't the same effort. OTRI turns every course into a single "how hard is this?" number first, so times from different races can be compared fairly.

## How it works — 3 steps

**1. Score the course's difficulty ("course demand").**
Walk the GPX file in 50 m steps. Each step's steepness (uphill or downhill) is run through a published running-cost formula (Minetti et al.), so steep uphill costs more and steep downhill costs more too — never free. Add up every step and you get **course demand**, in "demand-km." A flat 10 km course has demand close to 10; a mountain course can have demand well above its real distance.

**2. Turn course demand + finish time into a rate.**

```
performance rate = course demand ÷ finish time (in hours)
```

**3. Turn the rate into a 0–1000 score.**
A fixed curve converts performance rate into your score. Faster time on the same course always means a higher score — never lower.

## What this means in practice

- Same course + same finish time = same score, no matter who else was racing.
- Nobody else's result changes your score.
- You can predict your score before the race from a GPX file and a goal time (and work backwards from a target score to a target time).
- Same course + same finish time + same model version always gives the same score. No randomness, no hidden inputs.

## What OTRI ignores, on purpose (for now)

Field strength, finishing position, age, sex, weight, heart rate, VO2max, weather, subjective terrain difficulty, and past results. These might become separate, clearly-labeled layers someday (see `docs/roadmap.md`), but they're never folded into the core score.

## Where to look for the real math

- [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) — the exact specification this page summarizes.
- `scoring/course_demand.py` — GPX → course-demand engine.
- `scoring/course_standard.py` — course-demand + finish-time → 0–1000 score curve.
