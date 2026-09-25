# Scoring lab

A quick bench for seeing how courses score: open it, drop GPX files in and read the scores in an
HTML report with charts. Nothing here writes to the database, calls the network or changes the
model. It is local tooling beside `scoring/`, not part of the API or the site.

## Start it

**Double-click `scoring_lab/Scoring Lab.bat`.** The lab opens in your browser (a small server on your
own computer, `127.0.0.1` only; close its window to stop it). Then:

- **+ Add GPX**, or drop GPX files anywhere on the page: they are saved to `scoring_lab/courses/` and
  scored straight away;
- type a time in **Try a time** under a course, and **Save time** keeps it as a finish time for that
  course (`×` removes it again);
- **Remove** moves a course to `scoring_lab/courses/_removed/` (nothing is deleted);
- files copied into the folder in Explorer appear by themselves within a few seconds.

Tip: right-click `Scoring Lab.bat` > *Send to* > *Desktop (create shortcut)* to start it from the desktop.
`npm run lab` does the same from a terminal.

### Without the app

`python -m scoring_lab --open` (`npm run lab:report`) writes the same report as a file,
`scoring_lab/reports/report.html`, with `latest.json` (everything, for scripts) and `results.csv`
beside it. Both `courses/` and `reports/` are git-ignored.

## Finish times

Every course gets its time ladder: the finish time for each score from 1000 down to 300. To score
actual times as well:

- add a `times.csv` next to the GPX files (see `courses/times.example.csv`): `gpx,time,label`, with
  the time as `h:mm:ss`, `mm:ss` or seconds;
- a GPX with timestamps (a recorded run) is scored at its elapsed time automatically, unless that
  time is implausible for the course (route-planner files often carry made-up times; the course
  says why the time was skipped).

In the report, **Try a time** under each course scores any time you type, for every model shown.

## Models

`--models` picks which to run (default `all`; production is always included). Scores quoted further down this
page were computed while production was model 0.1.0 (exponent 0.85); production is 0.1.1 since 25 September
2026, and the `0.1.0` lab model reproduces those numbers:

| key | what it changes |
| --- | --- |
| `prod` | nothing: the production model, as the site scores (OTRI model 0.1.1 since 25 September 2026: curve exponent 0.692) |
| `0.1.0` | the model before 0.1.1, as the site scored until 25 September 2026: exponent 0.85 (644 -> 583 at 53% of the ceiling), production's altitude rule |
| `0.1.2` | production up to 990, then bends towards 1100 and never reaches it: a world best scores ~994, 1000 needs 2% faster than the world best, 1050 about 25% faster |
| `0.1.3` | compared with the best humans over the runner's own finish time, and a plain percentage: see *Why 0.1.3* below |
| `0.1.4` | tuned by feel on three results: exponent 0.70 lifts the middle, and above 900 the score bends towards 1000 and never reaches it (road world bests ~971) |
| `0.1.5` | 0.1.4 with room above 1000: the top bends towards 1100 instead (softness 250). Same scores as 0.1.4 below 900; road world bests ~966; 1000 takes 11% faster than the road world bests |
| `0.1.7` | smooth same-duration reference, linear score, no cap; evidence-informed experimental candidate (method and limitations below) |
| `0.1.6` | production's curve on a course demand built from published evidence only: descents priced by measured pace, no steep-ground coefficient. See *Why 0.1.6* |
| `no-terrain` | no steep-ground or altitude factor: the gradient-cost integral alone |
| `no-altitude` | altitude coefficient 0 |
| `no-vertical-rule` | uphill-only courses get the ordinary steep coefficient |
| `linear` | exponent 1.0 instead of 0.85 |
| `totals` | measured distance and climb as one average grade (a race with no course file) |

In the report, the **Model** menu picks the one the table, tiles and ladders show, and **Compare**
overlays up to two more on the charts. To try an idea, add a `LabModel` to `scoring_lab/models.py`
(built with `dataclasses.replace` from the production curve); the report picks it up with no other
change. Variants carry a `lab-` version, so a lab number can never pass for a published one.

**Altitude in every lab model.** Production prices altitude at 7 % per 1,000 m above 1,500 m. Every
lab model instead uses the measured loss in *acclimatised* athletes: Pühringer et al. (2022) tested
128 acclimatised mountain guides at 600 m and 2,000 m and found VO2max 5 % lower at 2,000 m in the
fit ones, and unchanged in the less fit. That is 3.6 % per 1,000 m above 600 m. The acute figure is
about twice that (Wehrlin & Hallén 2006, 6.3 % per 1,000 m from 300 m, sea-level athletes in a
chamber), but the runners near the top of a mountain race live and train at altitude, and it is
their scores an altitude rule decides. `prod` and `0.1.0` keep production's rule so the two can be compared;
`no-terrain` and `no-altitude` price no altitude at all.

## Why 0.1.3

Model 0.1.3 is a same-duration comparison hypothesis. It has not been demonstrated to be the
fairest model on independent runner results. It changes two things and adds no new constant.

**1. The same time, not the same course.** Production compares a runner with the best humans over
the same course: a 4-hour marathoner against a 2-hour effort. But what limits a body is how long it
works at what intensity. The sustainable share of aerobic power falls with the duration of the
effort (the power-duration relationship: Hill 1925, Monod and Scherrer 1965, Péronnet and Thibault
1989). Daniels and Gilbert (1979), the performance-equivalence tables runners of every level use,
model that fatigue as a function of time. The slower runner is out longer and is judged against a
ceiling they never had to hold for that long. 0.1.3 asks: *in the time you took, how far do the
best humans go?* It uses the same ceiling curve through the same three world bests, read by time.

**2. A plain percentage.** OTRI's course demand already rests on Minetti's energy cost per metre,
which does not depend on speed. So metabolic power is proportional to speed, and the share of the
ceiling's speed *is* the share of its power. That makes `score = 1000 x share` a ratio scale with a
limited interpretation: 500 is half the modelled equivalent speed at that duration, not a measured
fraction of a runner's physiological power or effort. The 0.85 exponent was a judgement (spec section 6.1), and
it gives the back of the field a boost the physics doesn't. The duration matching does part of that
job for a reason instead.

```text
X     = the flat-equivalent km the human ceiling covers in your finish time
score = 1000 x (your course's scored km) / X
```

**What it does:** world bests still score 1000 at every distance. Longer and slower efforts score a
little more than in production (the spec's 245 km calibration course in 46 h: 437 -> 452; a 4:00
marathon: 557 -> 570), and short fast road races a little less (a 50:00 10 km: 578 -> 544).
Fairness is not the same as higher.

**The test it was chosen on:** one runner should score about the same at every distance.
Non-elite runners slow down over distance more than the elites the ceiling is built on (Riegel's
1.06 is a population figure). For a runner whose own exponent is 1.10 to 1.15, 0.1.3 keeps their
5 km to marathon scores within 33 to 83 points of each other, against 36 to 112 in production. For
a runner who slows exactly like the world bests (1.06), production is perfectly consistent by
construction and 0.1.3 is not.

**Known limit:** the ceiling is two straight pieces in log-log, with a change in slope at the marathon
benchmark (2:00:35). The score is continuous: there is no sudden points jump at that time.
A smooth curve through the same three records would remove the derivative kink, but
it reproduces the records it was not built from worse (10 km and half marathon at 96-97 % instead
of 100 %), so the evidenced ceiling stays and the kink is documented. Real field data, not
more theory, is what would settle both the fatigue and the scale.

## Why 0.1.6

0.1.3 was my answer for the curve. 0.1.6 is my answer for the other half of the model, the course
demand, and it keeps production's curve so the two questions stay separate. The rule is the one
good modelling practice gives: keep what is published, drop what was fitted to one data point,
and say what is left unpriced. Two changes of its own, plus the altitude rule every lab model has:

**1. Descents are priced by pace, not by metabolic cost.** Minetti's polynomial is the right model
for climbing, where the metabolic cost sets the pace. Going downhill is not metabolically limited:
braking, impact and footing set the speed, and the polynomial credits a -20 % descent at 0.50 flat
km per km, a pace no one runs. Measured pace says what a descent is really worth. Strava's
grade-adjusted pace, refitted to heart-rate effort on millions of runs (Robb 2017), gives at most
0.88 flat km per km, at -9 %, and a full flat km again from -18 % down. Townshend et al. (2010)
measured the same asymmetry on a hilly time trial: 23 % slower on the climbs, only 13.8 % faster on
the descents. 0.1.6 uses that shape; uphill stays Minetti, as in production.

**2. No steep-ground coefficient.** Production's 0.5951 (and the vertical 0.1169) is set so that one
performance scores 970. That is one data point per constant and no published counterpart, and it is
applied to every steep course whatever its footing, from a runnable alpine race to a technical
100-miler. 0.1.6 leaves it out and says so in every course's flags (`steep_ground_not_priced`).

**3. Altitude for acclimatised athletes**, 3.6 % per 1,000 m above 600 m, as in every lab model
(see *Altitude in every lab model* above). An earlier 0.1.6 used the acute figure, 6.3 % from
300 m, and that alone lifted the Sierre-Zinal record from 971 to 1077.

**What it does to the courses in this folder:** on Sierre-Zinal the dropped steep coefficient
(-10 %) is largely paid back by the descents (+6 %) and the altitude (+4.9 % against production's
+3.7 %), so the record moves from 1030 to about 1010; on Phuket the two unevidenced pieces were
cancelling each other, and the scores move by less than ten points. The point of the model is not
that it moves these scores; it is that every number in it can be traced to a paper.

**Sierre-Zinal, checked against terrain data.** The course file is not the reason it scores high.
Remeasured from the Copernicus terrain model (the data production uses), it is slightly *steeper*:
2,251 m of climb against the file's 2,232 m (official: 2,200 m), 18 % of the distance at 20 % or
more. The record, 2:25:35, is one of the outliers of the sport: nobody else has run under 2:29.
The better calibration point is 10th place, about 2:40: under production it scores 960-974, and
10th at the Berlin marathon (~2:06) scores 963, so production's course demand is well calibrated on
this course. Whether the record itself belongs above 1000 is a judgement: a score over 1000 means
faster, in metabolic terms, than the road reference ceiling for a course of this size. Note also
that the file's timestamps are one fixed step of 3 s per point, generated on export; the lab no
longer reads such times as a finish time.

**What it cannot fix:** *Phuket reads low* because of heat, which is well quantified and not in a
GPX. Ely et al. (2007): marathon performance slows about 10 % for 3-hour finishers, and more for
slower ones, as WBGT rises from 10 to 25 °C, and Phuket in September is hotter than that. A
cool-weather 1:33:40 on that course would be worth roughly 650-700, which is about where 0.1.4 put
it by feel. Pricing that needs the race date and a climate source, which is a design change outside
the course model.

Sources: [Wehrlin & Hallén 2006](https://link.springer.com/article/10.1007/s00421-005-0081-9),
[Pühringer et al. 2022](https://journals.sagepub.com/doi/full/10.1089/ham.2021.0081),
[Robb 2017, an improved GAP model](https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3),
[Townshend, Worringham & Stewart 2010](https://pubmed.ncbi.nlm.nih.gov/20010117/),
[Ely et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17473775/),
[Minetti et al. 2002](https://journals.physiology.org/doi/full/10.1152/japplphysiol.01177.2001).

## Why 0.1.7

An evidence-informed candidate for transparent **absolute performance** comparisons. It is not
proven to be the fairest model, does not measure effort, and is not age- or sex-graded.

`score = 1000 × adjusted course demand / reference distance in the runner's elapsed time`

Like 0.1.3, it compares equal durations and uses a linear ratio. Unlike 0.1.3, the reference is a
monotone cubic Hermite interpolant in log(distance), log(time). Interior slopes are weighted
harmonic means of the adjacent secants; endpoint slopes equal their adjacent secants. Outside
the observations those endpoint power laws continue. All three frozen production benchmarks
still score exactly 1000, with a continuous first derivative at every join. Benchmark times are
12:35.36, 2:00:35 and 24 hours; these are versioned observations, not a claim about current records.
Smoothing is a numerical modelling choice, not a newly established physiological law.

Course measurement and terrain adjustments are inherited from production. Faster finishes on
the same course always score higher. Equal shares of reference distance at equal durations score
equally; no field strength, popularity, subjective score exponent or upper cap enters the result.
A new reference-beating performance can exceed 1000. All 0.1.7 results are marked experimental
and Low confidence; saved finishes outside the observed time range also carry an extrapolation flag.
The model description warns about extrapolation for interactive trial times too.

### Evidence and tradeoffs

- [Minetti et al. (2002)](https://pubmed.ncbi.nlm.nih.gov/12183501/) supports using gradient-dependent
  energy cost as a starting point. Laboratory slope measurements do not validate every trail surface.
- [Blythe and Király (2016)](https://pubmed.ncbi.nlm.nih.gov/27336162/) found runner-specific
  performance relationships. One reference curve cannot fully capture individual endurance or specialization.
- [Long-duration model validation (2024)](https://pubmed.ncbi.nlm.nih.gov/37847189/) illustrates that
  extrapolation error depends on duration and endurance. It does not validate this scoring formula.

The following checks use frozen observations already documented in OTRI, not new fitting data:

| Performance | Production | 0.1.3 | 0.1.7 |
| --- | ---: | ---: | ---: |
| Held-out 10 km, 26:11 | 1002 | 1002 | 991 |
| Held-out half marathon, 57:30 | 1005 | 1006 | 983 |
| Example marathon, 4:00 | 557 | 570 | 558 |
| Example 245.626 demand-km, 46 hours | 437 | 452 | 452 |

Smoothing improves continuity of the derivative but worsens agreement with those two held-out
records. That tradeoff is explicit; this is an additional lab candidate, not a production promotion.
Before promotion, freeze the model and evaluate independent repeated performances, holding out
both athletes and races. Report score drift by duration, gradient, surface, sex, age and ability;
compare with production and 0.1.3, and quantify uncertainty using athlete/race clustered resampling.
Weather, technical terrain, gait, stops and personal endurance remain incompletely represented.
Do not claim demographic fairness or attach invented confidence intervals without that data.

Select **Model 0.1.7 (lab): smooth duration reference** in the Model menu after restarting the lab,
or build only its comparison with `python -m scoring_lab --models 0.1.7`.

## Faster loops

- Measurements are cached by file content, measurement version and elevation source
  (`scoring_lab/.cache/`), so a re-run with a new model only rescores. New files are measured in
  parallel (`--jobs`). `--no-cache` re-measures, `--clear-cache` empties the cache.
- `--watch` rebuilds the report file whenever a GPX or `times.csv` changes (the app does this by itself).
- `--save-baseline` keeps this run as the baseline. Later reports show changes against it in the
  table (scored km, scores), which is how to see what a model change does to every course at once.

## Elevation

The lab measures from the Copernicus terrain tiles, as production does: the tiles a course needs
are fetched on first use into `scoring_lab/.dem/` (about 40 MB per 1° tile, from the same public
bucket the site uses) and pinned there, so a lab number is the number the calculator gives for the
same course and time. Without a network, or for a course no tile covers, the course is measured from
its own elevations at `Low` confidence, and its card says which. `--no-dem` measures every course
from the file's own elevations (the site does the same where it has no tile; the two differ by a few
percent on mountain courses), and `--dem-manifest path/to/manifest.json` uses tiles installed
elsewhere.

`python -m scoring_lab --help` lists every option. The tests are in `tests/unit/test_scoring_lab.py`.
They hold the lab to the estimator's numbers and the report's curve to `score_for_time`.
