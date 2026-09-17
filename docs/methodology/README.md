# Methodology

Reserved for published scoring-model research, validation studies, calibration notes, and versioned methodology decisions.

Draft work should remain clearly marked as research until adopted into a published OTRI methodology version.

## Start here

- **New to OTRI scoring?** Read [`v0.1/OTRI-SCORING-ELI5.md`](v0.1/OTRI-SCORING-ELI5.md) first — a plain-language explanation of the model actually implemented in `scoring/`.
- **Want the math without the full spec?** [`v0.1/OTRI-SCORING-MATH-EXPLAINED.md`](v0.1/OTRI-SCORING-MATH-EXPLAINED.md) walks through the actual equations (course demand, performance rate, score curve) in plain terms.
- **Implementing or reviewing the scoring engine?** [`v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) is the exact, versioned specification and the source of truth for `scoring/course_standard.py` + `scoring/course_demand.py`.
- **How a score is computed today?** [`v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md`](v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md) documents `0.4.0-course-standard-endurance-referenced`, the **current default model**. It references the score curve to the best performance a human has achieved on a course of the same demand, so a score measures calibre rather than race length: the same-calibre run scores the same at 5 km and at 100 miles, and 1000 means world-best at every course size.
- **Why long races used to score badly?** [`v0.3/OTRI-DURATION-SCALED-CURVE.md`](v0.3/OTRI-DURATION-SCALED-CURVE.md) documents `0.3.0-course-standard-duration-scaled`, superseded by V0.4 and retained so V0.3 scores stay reproducible. Its Riegel `b=1.06` correction was derived from sub-4-hour road racing and under-corrected badly beyond it.

Each scoring-model version's spec lives in its own `docs/methodology/v<major>.<minor>/` folder so historical specs stay intact when a new version is published.

Earlier research drafts that led up to this spec (foundational-formula proposals, standalone course-demand and score-scale papers, and the original course-based candidate designs) have been retired now that the code spec above supersedes them; see git history if you need that research trail.
