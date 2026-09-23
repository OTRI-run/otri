## What this changes, and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checks

- [ ] `pytest tests/unit -q` passes (the API tests need the `otri_test` PostgreSQL database; `tests/conftest.py` insists on it).
- [ ] `npm run build` passes, if the site changed.
- [ ] Anything a score depends on is unchanged, **or** this is a new `scoring_version` with an OEP (`docs/governance/README.md`) and a `CHANGELOG.md` entry.
- [ ] No private athlete data, credentials or copied datasets (`DATA_POLICY.md`).
- [ ] The docs that describe the changed part still say what the code does.
