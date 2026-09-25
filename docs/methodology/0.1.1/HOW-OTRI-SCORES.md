# How an OTRI score is calculated under model 0.1.1

**Status:** Explainer for **OTRI model 0.1.1**, the model running in production since 25 September 2026 — specified in [`OTRI-MODEL-0.1.1.md`](OTRI-MODEL-0.1.1.md) (internal build id `0.11.0-course-standard-model-0.1.1`, measurement `course-measurement-v3`).
**Read first:** [`HOW-OTRI-SCORES.md` for model 0.1.0](../0.1.0/HOW-OTRI-SCORES.md). Everything it says about how the course is measured, how it becomes flat-equivalent kilometres, what the ceiling is, what confidence means and what the model does not know is still true, word for word. This page says the one thing that changed, and what it does to the numbers.

---

## What changed

**The curve.** Step 5 of the short version now reads:

> 5. **Score** = 1000 × (your rate ÷ ceiling)^**0.692**.

Under 0.1.0 the exponent was 0.85. Nothing else changed: not the measurement, not the gradient costs, not the terrain factor, not the ceiling, not the confidence rules.

## What it does

- **A world-best run still scores 1000**, and the scale is still not capped there.
- **Every score below 1000 went up**, and the further from the top, the more in points: about +3 at the level of the best trail winners, about +60 in the middle of the field, about +75 at the back. Under 0.1.0, 53 % of the ceiling scored 583; under 0.1.1 it scores 644.
- **Nobody changed places.** A faster time on the same course still scores higher, and two performances rank the same under both models, whatever the course.

Read a score like this:

| score | means roughly |
|---:|---|
| **1000** | the world-best rate for a course of that size |
| **986** | the 2026 calibration performance — an alpine 100-mile win, 18:16:29 — 98 % of the ceiling (984 under 0.1.0) |
| **644** | an 80 km mountain course in 12:33 — 53 % (583 under 0.1.0) |
| **351** | 6:30 on a 22 km mountain course — 22 % (274 under 0.1.0) |

Because the ceiling curve runs through the marathon world best (2:00:35), every score is also a time on a flat road marathon at that same share of the record: **900 is 2:20, 800 is 2:46, 700 is 3:22, 600 is 4:12, 500 is 5:28, 400 is 7:33.** The calculator's level names keep their round edges (Beginner below 300 … World class from 900) and carry these times.

## Why

The exponent is a judgement in both models: 0.1.0 §6.1 says so of 0.85, and [OEP-004](../../governance/oep/OEP-004-curve-exponent-0-692.md) says so of 0.692. 0.1.0 had brought the middle of the field down materially against the shape every development build before it used; 0.1.1 returns to that shape, on the maintainer's judgement that 0.85 placed ordinary, well-trained trail performances too low on the scale to read well. No field data went into either choice, and no other index was referenced.

## Your old scores

- **A race published under 0.1.0 keeps its scores** and says which model it was scored with. A published race is frozen; the organizer can take it down and republish it under 0.1.1.
- **A 0.1.0 score restates exactly** without the course or the time: `score_0.1.1 = 1000 × (score_0.1.0 / 1000)^(0.692 / 0.85)`. 500 becomes 569, 700 becomes 748, 900 becomes 918.
- **Scores are only comparable under the same version**, as before.

## Hard questions, answered straight

**"Why did my score go up today?"** Because the model changed, not your performance: the curve below the top is gentler. Every change that can move a score gets a new public version and a changelog entry, and the old version stays available.

**"Who decided 0.692?"** The maintainer, on the record, with the alternatives stated in OEP-004. It will be fitted only when licensed field data exists, and never to track another index.

**"Is this the development curve coming back?"** The same exponent, yes. Everything else the development builds lacked — the world-best ceiling, the terrain factor, terrain-model elevation, the confidence rules, vertical races — is model 0.1.0's, unchanged.
