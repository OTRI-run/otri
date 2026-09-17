# OTRI Scoring — The Math, Explained Simply

**Status:** Explainer — a plain walkthrough of the actual equations
**Audience:** Anyone who wants the "why" behind the numbers without reading the full spec
**Source of truth:** [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md). If anything here disagrees with that spec or the code, the spec/code wins.

There are only three steps: turn the course into a difficulty number, turn difficulty + time into a rate, then turn that rate into a 0–1000 score.

## 1. How hard is the course? → Course Demand (D)

Split the GPX into 50 m chunks. For each chunk, look at its slope (grade) and work out how much extra effort that costs compared to flat ground, using the Minetti et al. running-cost formula:

$$C(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6$$

Divide by $3.6$ (the flat-ground cost) so flat ground always equals 1.0:

$$R(g) = C(g) / 3.6$$

So `R(0) = 1` (flat costs "1x"), uphill (e.g. `R(+0.10)`, a 10% grade) costs more than 1x, and downhill (`R(-0.10)`) costs a bit more than flat too — running down a steep hill isn't free.

Each chunk's demand is its length times its cost multiplier. Add every chunk up:

$$D = \sum_i d_i \times R(g_i)$$

A flat 10 km course → $D \approx 10$. A hilly course → $D$ can be much bigger than the real distance.

## 2. How fast did you move through that demand? → Performance Rate (Q)

$$Q = \frac{D_{km}}{T_{hours}}$$

Example: $D = 27.56$ demand-km, finish time $3{:}05{:}04 = 3.0844$ hours:

$$Q = 27.56 / 3.0844 \approx 8.935$$

Higher `Q` means you covered more "demand" per hour — a better performance, independent of who else raced.

## 3. Turn Q into a 0–1000 score

The curve is built from 4 known anchor points (score ↔ required Q):

| Score | Required Q |
|---|---|
| 0 | 1.000 |
| 349 | 4.240 |
| 544 | 8.935 |
| 692 | 11.769 |
| 1000 | 17.940 |

Between any two neighboring anchors, the relationship is a **power law** — a straight line if you plotted it on a log-log graph:

$$Q(S) = Q_1 \times (S / S_1)^p, \qquad p = \frac{\ln(Q_2 / Q_1)}{\ln(S_2 / S_1)}$$

`p` is just "the slope of that segment" measured in log-space, computed once per segment from its two surrounding anchors. It's what makes the curve pass through both anchors exactly.

Going the other way (Q → score) is the same formula solved for `S`:

$$S = S_1 \times (Q / Q_1)^{1/p}$$

So the whole "score curve" is really 4 small power-law segments stitched end to end, each pinned to a real anchor point. The exact same formula, inverted, is also how a target finish time is predicted from a target score.

## Putting it together

```text
GPX file
  → 50 m chunks, each with a signed grade
  → Minetti cost model per chunk (R(g))
  → sum of (chunk length × R(g)) = Course Demand D
  → D ÷ finish time (hours) = Performance Rate Q
  → fit Q onto the 4-anchor power curve = OTRI score (0–1000)
```

Nothing here depends on other runners, past results, or any physiological measurement — only the course shape and one finish time.

## Where the real numbers live

- [`OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`](OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md) — the exact constants, formulas, and edge cases.
- `scoring/course_demand.py` — computes `D` from a GPX file.
- `scoring/course_standard.py` — computes `Q` and the final score curve.
