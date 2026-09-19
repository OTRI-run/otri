# Governance documentation

Reserved for governance rules, decision records, maintainer responsibilities, conflicts-of-interest disclosures, and methodology-change procedures.

## OTRI Enhancement Proposals (OEPs)

Substantial methodology or scoring changes go through an OEP, per `HANDBOOK.md` "Governance": proposed publicly, discussed, tested on historical data, benchmarked against alternatives, and versioned before being adopted.

- Use [`oep-template.md`](oep-template.md) to start a new proposal.
- Accepted and draft proposals live under [`oep/`](oep); the index is below.
- An OEP is required for anything that changes `scoring_version` or the published `data/schemas/` contracts; ordinary bug fixes and refactors do not need one.

## Index

| OEP | Title | Status | Affects |
| --- | --- | --- | --- |
| [OEP-001](oep/OEP-001-baseline-scoring-model.md) | Baseline scoring model (v0.1) | Accepted | `scoring_version = "0.1.0"` |
| [OEP-002](oep/OEP-002-domain-gating-and-vertical-races.md) | Domain gating: vertical races are not scored yet, and confidence reports the model's own limits | Proposed | build id `0.9.0-course-standard-domain-gated` (still OTRI model 0.1.0) |
