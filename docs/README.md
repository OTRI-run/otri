# Documentation

Everything under `docs/` is about the product as it runs today. Documents that only served the build (roadmaps, phase plans, specifications for things since built) were removed in September 2026; the decisions they carried live on in the governance records and the changelog.

## For people using OTRI

- [`WHAT-IS-A-GPX.md`](WHAT-IS-A-GPX.md) — what a course file is, where to get one, what makes a good one. Linked from the site.
- [`RESULT-FILES.md`](RESULT-FILES.md) — what OTRI reads from a results file: the columns it recognises, what stops an upload and what only warns.
- [`methodology/0.1.0/HOW-OTRI-SCORES.md`](methodology/0.1.0/HOW-OTRI-SCORES.md) — how a score is made, in plain language, with the model's limits and the hard questions. Linked from the site.

## The model

- [`methodology/README.md`](methodology/README.md) — the index of the methodology folder.
- [`methodology/0.1.0/OTRI-MODEL-0.1.0.md`](methodology/0.1.0/OTRI-MODEL-0.1.0.md) — the specification of OTRI model 0.1.0: every formula and constant, the worked example, the tests that pin it, its versioning.
- [`methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md) — how a GPX becomes a measured course, and the research behind it.
- [`methodology/runner-index/RUNNER-INDEX-v1.md`](methodology/runner-index/RUNNER-INDEX-v1.md) — the one-number-per-runner rule.

## Decisions

- [`governance/README.md`](governance/README.md) — how a change to the model is proposed and recorded, and the index of OTRI Enhancement Proposals.
- [`product/open-scoring-tool.md`](product/open-scoring-tool.md) — the product direction: an open scoring tool, not a governing body, and what that decides.

## Running it

- [`operations/digitalocean-deployment.md`](operations/digitalocean-deployment.md) — the production API: server, hardening, service, proxy and TLS, backups, updates, maintenance mode.
- [`../scripts/deploy/README.md`](../scripts/deploy/README.md) — the scripts that do most of that.
- [`../api/README.md`](../api/README.md) — the API: endpoints, environment, authentication, limits.

The module guides for the code are beside the code: [`../course/README.md`](../course/README.md), [`../scoring/README.md`](../scoring/README.md), [`../ingestion/README.md`](../ingestion/README.md), [`../prototype/README.md`](../prototype/README.md), [`../data/README.md`](../data/README.md).
