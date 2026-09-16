# Changelog

All notable OTRI releases and material methodology changes will be documented here.

## Unreleased

- Establish professional repository structure.
- Add MIT licensing metadata.
- Formalize documentation, data, test, script, and source-code areas.
- Organizer accounts now require email verification before signing in.
- Organizers manage events with multiple race distances (full create/edit/delete), each with an optional attached GPX file, instead of a single flat race record.
- Scoring is now pluggable: a new default "Course Standard" model (`docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md` — Minetti gradient-cost course demand + a logarithmic 0-1000 scale clipped at two published reference points) scores runners purely on course and finish time, with no dependency on competitors; the previous field-relative model is kept selectable per race distance.
