# Methodology

Reserved for published scoring-model research, validation studies, calibration notes, and versioned methodology decisions.

Draft work should remain clearly marked as research until adopted into a published OTRI methodology version.

## Start here

- **New to OTRI scoring, or checking whether to trust it?** Read [`HOW-OTRI-SCORES.md`](HOW-OTRI-SCORES.md) first — a plain-language explanation of the model in production, followed by the provenance of every constant, the evidence, the honest list of what it does not know, and straight answers to the hard questions. (The older [`v0.1/OTRI-SCORING-ELI5.md`](v0.1/OTRI-SCORING-ELI5.md) describes the V0.1 model and is kept as history.)
- **Want the math without the full spec?** [`v0.1/OTRI-SCORING-MATH-EXPLAINED.md`](v0.1/OTRI-SCORING-MATH-EXPLAINED.md) walks through the actual equations (course demand, performance rate, score curve) in plain terms.
- **Implementing or reviewing the scoring engine?** [`v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) is the exact, versioned specification and the source of truth for `scoring/course_standard.py` + `scoring/course_demand.py`.
- **The model in production, in one page:** [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) specifies **OTRI model 0.1.0** — definition, inputs, every constant and its origin, confidence, limits and the versioning rule. The public name is `0.1.0`; the API's build id for it is `0.8.0-course-standard-power`.

### Development history (superseded builds, kept for reproducibility)

- [`v0.8/OTRI-POWER-CURVE.md`](v0.8/OTRI-POWER-CURVE.md) documents build `0.8.0-course-standard-power`, which model 0.1.0 consolidates: one power law, `score = 1000 × (fraction of the human-ceiling rate)^0.85`, with V0.7's measurement and gating unchanged. The last V0.1 demo anchors are retired; the top of the scale holds and everything below it is lower.
- **How far to trust a score?** [`v0.7/OTRI-DEM-GATED-MEASUREMENT.md`](v0.7/OTRI-DEM-GATED-MEASUREMENT.md) documents `0.7.0-course-standard-dem-gated`, whose measurement V0.8 uses. The curve there is V0.6's; what it changed is measurement: elevation from a pinned terrain dataset when configured, a point-spacing gate so tracks too sparse to measure the route are marked for review instead of scored short, and a confidence label (High/Low) with the reason attached to every score.
- **Why the middle of the field is no longer over-lifted?** [`v0.6/OTRI-SMOOTHED-UPPER-CURVE.md`](v0.6/OTRI-SMOOTHED-UPPER-CURVE.md) documents `0.6.0-course-standard-smoothed-upper`, whose curve V0.7 still uses: V0.5's demand and terrain adjustment with V0.1's 692 demo anchor dropped, so one power law runs from 544 to the world-best 1000 anchor and course-level corrections no longer land hardest on the middle of the field.
- **Why mountain courses are scored harder than their gradient alone?** [`v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md`](v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md) documents `0.5.0-course-standard-terrain-adjusted`, whose demand model V0.6 still uses. It keeps V0.4's score curve and adjusts *course demand* for what the gradient integral does not price — sustained steep mountain terrain and altitude, both measured from the GPX — so a mountain ultra is no longer scored as though it were a road race of the same gradient profile. Road courses are unaffected.
- **Why a score no longer depends on race length?** [`v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md`](v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md) documents `0.4.0-course-standard-endurance-referenced`, whose score curve V0.5 still uses. It references the score curve to the best performance a human has achieved on a course of the same demand, so a score measures calibre rather than race length: the same-calibre run scores the same at 5 km and at 100 miles, and 1000 means world-best at every course size.
- **Why long races used to score badly?** [`v0.3/OTRI-DURATION-SCALED-CURVE.md`](v0.3/OTRI-DURATION-SCALED-CURVE.md) documents `0.3.0-course-standard-duration-scaled`, superseded by V0.4 and retained so V0.3 scores stay reproducible. Its Riegel `b=1.06` correction was derived from sub-4-hour road racing and under-corrected badly beyond it.

Each development build's spec lives in its own `docs/methodology/v<major>.<minor>/` folder so historical specs stay intact. The public model is named by [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md); the next public version will be `0.2.0`, with its own page.

Earlier research drafts that led up to this spec (foundational-formula proposals, standalone course-demand and score-scale papers, and the original course-based candidate designs) have been retired now that the code spec above supersedes them; see git history if you need that research trail.
- [Runner index v1](RUNNER-INDEX-v1.md) — one number per runner from the best 3 published scores of the last 24 months, recency-weighted; the research behind the rule.
