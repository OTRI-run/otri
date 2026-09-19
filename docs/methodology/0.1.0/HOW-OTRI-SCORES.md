# How an OTRI score is calculated — and how to question it

**Status:** Explainer for **OTRI model 0.1.0**, the model running in production — specified in [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) (internal build id `0.9.0-course-standard-domain-gated`, measurement `course-measurement-v3`)
**Audience:** Runners, race organizers, and anyone who wants to check whether the number deserves trust
**Source of truth:** [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) and the code in `scoring/` and `course/`; the development builds it consolidates are listed in its §14. If this page and the code disagree, the code wins — and that is a bug in this page.

---

## Part 1 — The short version

**Your OTRI score is your speed, as a share of the fastest a human has ever covered a course as hard as yours, raised to a fixed power.** Nothing about who else raced goes in. Only the course and your time.

Read a score like this:

| score | means roughly |
|---:|---|
| **1000** | the world-best rate for a course of that size |
| **984** | the 2026 calibration performance — an alpine 100-mile win, 18:16:29 — 98% of the ceiling |
| **274** | 6:30 on a 22 km mountain course — 22% |

Three things follow from the definition, and each is tested in the code:

1. **A long race is never scored worse for being long.** The "ceiling" already accounts for the fact that nobody can hold their 5 km pace for 20 hours. Two runners at the same share of their respective ceilings get the same score whether the course is 10 km or 170 km.
2. **A hillier course is never scored worse for being hilly.** The course is first converted to "flat-equivalent kilometres" using a published model of how much energy each gradient costs, plus a correction for sustained steep ground and altitude.
3. **The scale has a real top.** 1000 is not "the winner". It is the best performance a human has produced on a course of that demand, so a 5 km world record and a 24-hour world record both score 1000, and a mid-pack finisher at a big race lands where a mid-pack finisher belongs.

### What goes in, step by step

1. **The course is measured** from the GPX: distance along the WGS84 ellipsoid, and — where terrain data is installed — elevation read from the Copernicus GLO-30 terrain model (30 m grid) rather than from your watch. The map on every course page says which of the two it used. The track is checked for one thing you can fix: if it was recorded too sparsely (a point less often than every 30 m on average), switchbacks get cut short and the course measures shorter than it is, and the score says so.
2. **The course becomes "flat-equivalent km"** ("course demand"): every 50 m is weighed by how much harder its gradient is than flat running (Minetti et al. 2002). Sustained steep ground (≥ 20%) and altitude above 1,500 m add a further factor.
3. **Your rate** = flat-equivalent km ÷ hours.
4. **The ceiling** for that course size is read from a curve through three public world-best performances (5000 m, marathon, 24 hours) — the fastest rate ever sustained over that much demand.
5. **Score** = 1000 × (your rate ÷ ceiling)^0.85.
6. **A confidence label** (`High`/`Low`) says whether another device recording the same route would have produced the same number. `High` needs terrain-model elevation, a dense enough track, and a course inside what the model was checked on (not mostly steeper than 45 %, not shorter than 1.5 flat-km).
7. **Vertical races get no score yet.** On an uphill-only course (more than half of it at 20 % or steeper) the steep-ground factor, tuned on mountain courses with descents, over-scores by about 60 %. Those races are listed with finish times only and do not count toward a runner index.

---

### And the runner index?

One number per runner, from their best three published race scores of the last 24 months, recency-weighted so results fade rather than vanish. It is a separate, versioned rule: [`RUNNER-INDEX-v1.md`](../runner-index/RUNNER-INDEX-v1.md).

## Part 2 — For the skeptical

The right question to ask of any index is: *which numbers were measured, which were taken from the literature, which were calibrated, and which were simply chosen?* Here is every constant in the model, sorted by that question.

### 2.1 Where each constant comes from

| constant | value | origin | how much weight it carries |
|---|---:|---|---|
| Gradient energy cost | Minetti 2002 polynomial | **published** (treadmill, −45…+45%) | the core of course demand |
| Ceiling anchors | 5000 m 12:35.36; marathon 2:00:35; 24 h 319.614 km | **public world bests** | defines what 1000 means |
| Ceiling shape | piecewise power law through those three | derived | its short segment reproduces Riegel's published exponent (1.059 vs 1.06) without using it — the model's one independent corroboration |
| Altitude cost | 7% per 1,000 m above 1,500 m | **physiology literature** | small (the reference 100-miler: +1.7%) |
| Steep-terrain cost | 0.5951 per unit share of ≥ 20% ground | **calibrated to one strong trail performance**: a 2026 alpine 100-mile win in 18:16:29 was set to score 970 (V0.5) | material (the reference 100-miler: +10.9%) — the model's weakest constant |
| Curve exponent | 0.85 | **chosen** — between "percentage of world best" (1.0) and the earlier 0.692 | shapes the whole scale below the top |
| Sparse-track gate | median spacing > 30 m | **from data** on four real courses (error ≤ 3% below it, 4–8% above) | affects trust, not the number |
| Measurement details | 10 m grid, ±10 m smoothing, 8 m prominence, 50 m segments | **chosen**, sensitivity documented, not field-validated | affects every ascent figure |
| Terrain data | Copernicus GLO-30 (30 m) | **public dataset**, pinned by checksum | replaces watch elevation where installed |

Nothing in the model is fitted to a field of results, and nothing is referenced to any other index. That is a deliberate policy ([`DATA_POLICY.md`](../../../DATA_POLICY.md)), and it is also why the calibration basis is thin: OTRI does not yet hold licensed real result sets to fit against.

### 2.2 Evidence that the shape is right

- **Length-invariance.** With three anchors chosen for depth of competition, nine other world records the curve never saw land at 92–102% of it: 1500 m to half marathon within 2.4%; the 100 km, 100-mile, 6-hour and 12-hour records at 92–97% (softer events, as expected) — [`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) §5.3.
- **Riegel corroboration.** The 5 km → marathon segment of the ceiling, built only from those two records, has an exponent of 1.059. Riegel's 1981 survey found 1.06. The model did not use his number.
- **Route-invariance, bounded.** The same real course thinned to simulate coarser recording: within ~2–3% of full-density demand while median spacing stays ≤ 30 m; 4–13% short beyond it — which is why the gate sits at 30 m and why sparser tracks are labelled rather than scored silently ([`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) §7.1).
- **Elevation source matters, and the model says so.** On the reference 100-miler the terrain model reads 10,311 m of ascent against 9,592 m from the file and 9,890 m official. On an 80 km Chiang Mai course whose watch file carried 3,844 implausible jumps, the file said 7,525 m, the terrain model 4,549 m, and heavier smoothing of the file converged on the terrain model. On a Phuket trail the two agree to the metre. Production uses the terrain model; the note records both figures.
- **Determinism.** Three repeat runs of the same file are bit-identical. Changing the arithmetic engine (v2 → v3) moved every number by less than 3e-8 m and no score by a point — and still triggered a new processing version, because the hashes changed.

### 2.3 What the model does not know — the honest list

1. **Technical footing is invisible.** A GPX cannot see rock, roots, mud or exposure. Two courses with the same gradient profile get the same steep-terrain factor whether one is a fire road and the other an alpine scramble. This is the single largest reason a mountain-ultra winner sits at 98% of a *road-referenced* ceiling rather than 100%.
2. **One constant is calibrated to one performance.** The steep-terrain coefficient was set so that one strong, real trail performance (a 2026 alpine 100-mile win, 18:16:29) scored 970. Calibrating to a good trail run rather than a road record is deliberate: the constant exists to price mountain ground. Calibrating to a single one is provisional by definition.
3. **The curve exponent is a judgement.** 0.85 was chosen, not measured. Its consequence is stated plainly: the further from the top, the larger the relative drop compared with the previous shape.
4. **The terrain model is a surface model.** GLO-30 includes tree canopy and buildings; on forested alpine ground it can read ascent high. `High` confidence means *reproducible against a named dataset*, not *validated against the ground*. The benchmarking programme in [`REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`](../course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md) has not been run.
5. **Terrain coverage is per region.** A course outside the installed tiles is measured from its own file, at `Low` confidence, and says so.
6. **A sparse recording still cannot be fixed.** The gate labels it; only route-snapping could rebuild the missing switchbacks, and that is not built.
7. **No conditions.** Heat, mud, snow, night — none of it enters. Two editions of the same race in different weather are not comparable, by design.
8. **Courses beyond 320 flat-km extrapolate** the 24-hour segment of the ceiling, which is conservative for multi-day events with sleep stops. They are flagged.
9. **Scores changed during development.** Model 0.1.0 is the consolidation of eight development builds. Those builds were prototypes and have been removed from the code; every race is scored with model 0.1.0, every stored measurement replays byte-for-byte, and from here on a change to the scoring is a new version beside this one. This is policy ([`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) §13), not an accident.

### 2.4 Hard questions, answered straight

**"My other index gives me a different number."** It should. OTRI is not calibrated to any other index and never will be; sameness would be a coincidence. What you can check is *consistency within OTRI*: the same course, time and version give the same score anywhere, and the reasons for the number are all on the page.

**"Why did my score drop today?"** Because the model changed. Under the development builds before 0.1.0 the middle of the scale was concave — 53% of the ceiling scored 643; under model 0.1.0 it scores 581. Your performance did not change; the scale did, and the old number is still reproducible under the old build id. The next such change will be model 0.2.0, announced in `CHANGELOG.md`.

**"Is 1000 achievable?"** By definition, only by matching the best rate ever sustained over that much demand. A 5 km world record scores 1000; so does the 24-hour record. A mountain 100-mile winner scores 984 because the ceiling is road-referenced and a mountain course costs more than its gradient says (limitation 1).

**"Why is my friend's score different on the same route?"** If both tracks are dense and terrain elevation is installed for the region, they will agree to within ~3% — that is the tested claim. If one file is sparse or terrain data is missing, one of them is labelled `Low` and tells you which.

**"Isn't comparing a 10 km trail and a 100-miler meaningless?"** Comparing *times* is. Comparing *shares of what is humanly possible over that demand* is exactly what the ceiling makes possible, and the nine held-out world records are the evidence the ceiling has the right shape.

**"Who decided 0.85?"** The maintainers, on the record, with the alternatives stated ([`OTRI-MODEL-0.1.0.md`](OTRI-MODEL-0.1.0.md) §6.1). It will be revisited only when licensed field data exists, and never to track another index.

**"Can I reproduce a score?"** Yes. Every API response carries the scoring version, the measurement version, the elevation source, and a hash of the measured profile; the code is public, and a published model version never changes its output. Reproducing it needs nothing but the GPX and the finish time.

**"What would change your mind about the model?"** Real, licensed finish data across course sizes and ability levels — enough to fit the steep-terrain coefficient and the exponent instead of choosing them — and a same-route benchmark of terrain elevation against a bare-earth model and calibrated barometric traversals. Both are written down as the next steps.
