# Methodology

Published scoring-model specifications, validation studies and versioned methodology decisions. Draft work stays clearly marked as research until it is adopted into a published version.

## The scoring model

- **New to OTRI scoring, or checking whether to trust it?** Read [`HOW-OTRI-SCORES.md`](HOW-OTRI-SCORES.md) first: a plain-language explanation of the model in production, then the provenance of every constant, the evidence, the honest list of what it does not know, and straight answers to the hard questions.
- **The specification:** [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) is the complete, self-contained definition of **OTRI model 0.1.0**: every formula, every constant and where it came from, the worked example, the tests that pin it, its limits and the versioning rule. It is the source of truth for `scoring/course_demand.py`, `scoring/terrain.py` and `scoring/course_standard.py`. The public name is `0.1.0`; the API's build id for it is `0.8.0-course-standard-power`.

The eight development builds that led to 0.1.0 are listed in its §14 with what each contributed. Their individual papers were removed from this folder in September 2026 because everything the model uses is on that one page; every build id still runs in `scoring/registry.py`, and the papers are in git history (`git log --all -- docs/methodology/v0.8`).

## Course measurement

- [`REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](REAL-WORLD-COURSE-MEASUREMENT-SPEC.md): how a GPX becomes a measured course (geodesic distance, terrain-model elevation, denoising, prominence, quality flags) and the benchmarking programme that has not yet been run.
- [`COURSE-MEASUREMENT-V1-VALIDATION.md`](COURSE-MEASUREMENT-V1-VALIDATION.md): the validation of that pipeline on real courses.

## The runner index

- [`RUNNER-INDEX-v1.md`](RUNNER-INDEX-v1.md): one number per runner from the best 3 published scores of the last 24 months, recency-weighted; the research behind the rule.
- [`overall-runner-index.md`](overall-runner-index.md): the earlier design proposal the v1 rule grew out of, kept as research.
