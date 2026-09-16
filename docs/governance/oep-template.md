# OEP-XXX: <Title>

- **Status:** Draft | Proposed | Accepted | Rejected | Superseded
- **Author(s):**
- **Date:**
- **Affects:** (e.g. `scoring_version`, a `data/schemas/*.json` contract, course-difficulty model)

Copy this file to `docs/governance/oep/OEP-<number>-<short-slug>.md`, fill it in, and open a pull request. Every section below is required (`CONTRIBUTING.md` "Scoring changes").

## 1. Problem

What is not working, missing, or wrong today? Be specific — reference real data or feedback where possible.

## 2. Hypothesis

What do you believe will improve, and why?

## 3. Mathematical / statistical rationale

The actual method: formula, model, or algorithm change. Show your work, not just the conclusion.

## 4. Data used

What data was used to develop and test this proposal? Note provenance and any limitations (small sample, single race type, etc.), per `DATA_POLICY.md`.

## 5. Alternatives considered

What else was tried or considered, and why was this approach chosen instead?

## 6. Before / after results

Concrete comparison — old output vs. new output on the same inputs. Reference `tests/fixtures/` where applicable.

## 7. Tests and validation

What automated tests cover this change? Link to them. Reproducibility must hold: same input + same version = same output.

## 8. Known limitations

What does this proposal *not* solve? What could go wrong? Be honest — this is not marketing copy.

## 9. Versioning impact

Does this bump `scoring_version` (or another versioned contract)? Are old scores still reproducible under their original version after this change ships?
