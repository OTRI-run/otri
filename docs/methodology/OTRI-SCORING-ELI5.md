# OTRI Scoring — ELI5

**Status:** Explainer — describes the model actually running in the code today
**Audience:** Runners, race organizers, anyone who doesn't want to read a spec
**Source of truth:** [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) (`scoring/course_standard.py` + `scoring/course_demand.py`). If anything here disagrees with that spec or the code, the spec/code wins — this page is just a friendlier tour.

## The one-sentence version

Your OTRI score depends only on **the course you ran** and **how long it took you** — never on who else showed up.

## Why not just compare finish times?

A 5-hour finish on a flat road race and a 5-hour finish on a mountain course with 3,000 m of climbing are not the same effort. OTRI turns every course into a single "how hard is this, really?" number first, so times from completely different races can be compared fairly.

## Step 1 — turn the course into a difficulty number ("course demand")

We take the race's GPX file and walk along it in fixed 50 m chunks. For each chunk we look at the grade (how steep it is, up or down) and look up how much extra it costs to run at that grade compared to flat ground, using a published sports-science formula (Minetti et al.'s running energy-cost research). Steeper uphill costs more, and very steep downhill costs more too — running down a cliff is not "free."

Add up the cost of every chunk and you get **course demand**: a single number, in "demand-kilometers," that represents how tough the whole course is. A flat 10 km course has a course demand close to 10; a lumpy mountain course can have a course demand much higher than its actual distance.

If a course is unusually steep in a few short spots, those spots are gently capped rather than thrown out, and the fact that they were capped is recorded — the course isn't rejected just for having one gnarly pitch.

## Step 2 — turn course demand + finish time into a "performance rate"

Once we know the course demand and your finish time, we divide one by the other:

```
performance rate = course demand ÷ finish time (in hours)
```

This is your effective "demand-km per hour" — basically, how fast you moved through the difficulty of the course, not just the ground.

## Step 3 — turn the performance rate into a 0–1000 score

Finally, the performance rate is mapped onto a fixed 0–1000 scale. The mapping curve was calibrated against a handful of real, known race-finish benchmarks (for example, a ~6.5 hour finish lands around 349, a ~3 hour finish around 544, a ~2h20 finish around 692, on a course with course demand of about 27.6 demand-km), and the same curve shape continues up to 1000 for elite-level performance rates. 1000 is a real, reachable score — not a ceiling nobody can hit.

Faster time on the same course → higher performance rate → higher score. Always. There's no version of this model where running faster makes your score go down.

## What this means in practice

- **Two people on the same course with the same finish time get the same score.** It genuinely does not matter if they finished 1st and 214th.
- **Nobody else's result changes your score.** Add or remove finishers from the race and every existing score stays exactly the same.
- **You can predict your score before the race.** Given a course's GPX and a goal time, the same formula tells you the score that goal would earn — this is exactly what `POST /gpx/analyze` does. It also works backwards: give it a target score, get back the finish time you'd need.
- **Same course + same finish time + same model version always gives the same score.** No randomness, no hidden inputs, nothing that depends on the clock or on who's asking.

## What OTRI does *not* look at (on purpose, for now)

- Who won, how big the field was, or how strong the other runners were.
- Your age, sex, weight, heart rate, VO2max, or training history.
- Weather, altitude, or how "technical" the terrain feels subjectively.
- Your (or anyone else's) past race results.

These might become separate, clearly-labeled layers someday (see `docs/roadmap.md`), but they are not folded silently into the core score.

## Where to look if you want the real math

- [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) — the exact, versioned specification this page summarizes.
- `scoring/course_demand.py` — the GPX → course-demand engine (gradient-cost integration, elevation cleanup, segment handling).
- `scoring/course_standard.py` — the course-demand + finish-time → 0–1000 score curve, and its exact inverse.
- `scoring/README.md` — a developer-facing summary of the pluggable scoring engine, including the legacy field-relative model kept only for historical reproducibility.
