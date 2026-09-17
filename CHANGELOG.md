# Changelog

All notable OTRI releases and material methodology changes will be documented here.

## Unreleased

- Establish professional repository structure.
- Add MIT licensing metadata.
- Formalize documentation, data, test, script, and source-code areas.
- Organizer accounts now require email verification before signing in.
- Organizers manage events with multiple race distances (full create/edit/delete), each with an optional attached GPX file, instead of a single flat race record.
- Scoring is now pluggable: a new default "Course Standard" model (`docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md` — Minetti gradient-cost course demand + a logarithmic 0-1000 scale clipped at two published reference points) scores runners purely on course and finish time, with no dependency on competitors; the previous field-relative model is kept selectable per race distance.
- Recalibrated the Course Standard model's default scale anchors (`1.1.0-course-standard`: 500 points at 3.5 demand-km/h, 1000 points at 10.5 demand-km/h) after real-world testing showed the spec's own literal anchors (15.0/22.5 demand-km/h) implied absurdly fast absolute finish times (~70 minutes for 500 points) regardless of course length, clustering realistic multi-hour trail finishes at 0. The spec-literal curve remains selectable as `1.0.0-course-standard` for spec-fidelity comparisons.
