# Methodology

Published scoring-model specifications, validation studies and versioned methodology decisions, one folder per subject. Draft work stays clearly marked as research until it is adopted into a published version.

## [`0.1.0/`](0.1.0/) — the scoring model in production

- **New to OTRI scoring, or checking whether to trust it?** Read [`HOW-OTRI-SCORES.md`](0.1.0/HOW-OTRI-SCORES.md) first: a plain-language explanation of the model, then the provenance of every constant, the evidence, the honest list of what it does not know, and straight answers to the hard questions.
- **The specification:** [`OTRI-MODEL-0.1.0.md`](0.1.0/OTRI-MODEL-0.1.0.md) is the complete, self-contained definition of **OTRI model 0.1.0**: every formula, every constant and where it came from, the worked example, the tests that pin it, its limits and the versioning rule. It is the source of truth for `scoring/course_demand.py`, `scoring/terrain.py` and `scoring/course_standard.py`. The public name is `0.1.0`; the API's build id for it is `0.10.0-course-standard-vertical` (and `0.8.0-course-standard-power` before it, with identical scores).

The next public model gets its own folder (`0.2.0/`) with its own pair of pages; this folder stays as published. The eight development builds that led to 0.1.0 are listed in the specification's §14 with what each contributed; their individual papers were removed in September 2026 because everything the model uses is on that one page (every build id still runs in `scoring/registry.py`, and the papers are in git history: `git log --all -- docs/methodology/v0.8`).

## [`course-measurement/`](course-measurement/) — how a GPX becomes a measured course

- [`REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md): geodesic distance, terrain-model elevation, denoising, prominence, quality flags, the benchmarking programme that has not yet been run, and as an appendix the validation of the pipeline on real courses.

## [`runner-index/`](runner-index/) — one number per runner

- [`RUNNER-INDEX-v1.md`](runner-index/RUNNER-INDEX-v1.md): the rule in production (`runner-index-v1`): the recency-weighted mean of the best 3 published scores of the last 24 months, and the research behind it.
