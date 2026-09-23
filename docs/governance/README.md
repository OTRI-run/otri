# Governance documentation

How a change to the scoring model is proposed, decided and recorded. Decision records live under `oep/`; a proposal that was overtaken keeps its file, with its status saying by what.

## OTRI Enhancement Proposals (OEPs)

Substantial methodology or scoring changes go through an OEP, per `HANDBOOK.md` "Governance": proposed publicly, discussed, tested on historical data, benchmarked against alternatives, and versioned before being adopted.

- Use [`oep-template.md`](oep-template.md) to start a new proposal.
- Accepted and draft proposals live under [`oep/`](oep); the index is below.
- An OEP is required for anything that changes `scoring_version` or the published `data/schemas/` contracts; ordinary bug fixes and refactors do not need one.

## Index

| OEP | Title | Status | Affects |
| --- | --- | --- | --- |
| [OEP-001](oep/OEP-001-baseline-scoring-model.md) | Baseline scoring model (v0.1) | Superseded (model retired; see the specification's §14) | `scoring_version = "0.1.0"`, no longer in the registry |
| [OEP-002](oep/OEP-002-domain-gating-and-vertical-races.md) | Domain gating: vertical races are not scored yet, and confidence reports the model's own limits | Superseded by OEP-003 | build id `0.9.0-course-standard-domain-gated` (still OTRI model 0.1.0) |
| [OEP-003](oep/OEP-003-scoring-vertical-races.md) | Scoring vertical races with their own, provisional steep coefficient | Accepted | build id `0.10.0-course-standard-vertical` (still OTRI model 0.1.0) |
