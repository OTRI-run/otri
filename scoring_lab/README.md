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

`--models` picks which to run (default `all`; production is always included):

| key | what it changes |
| --- | --- |
| `prod` | nothing: the production model, as the site scores |
| `0.1.1` | exponent 0.692, the development builds' curve: the middle of the field scores higher (583 -> 644 at 53% of the ceiling) |
| `0.1.2` | production up to 990, then bends towards 1100 and never reaches it: a world best scores ~994, 1000 needs 2% faster than the world best, 1050 about 25% faster |
| `0.1.3` | compared with the best humans over the runner's own finish time, and a plain percentage: see *Why 0.1.3* below |
| `0.1.4` | tuned by feel on three results: exponent 0.70 lifts the middle, and above 900 the score bends towards 1000 and never reaches it (Sierre-Zinal record 1030 -> 979, Phuket 15k 1:33:40 598 -> 655, 75k 13:24:40 557 -> 618, road world bests ~971) |
| `0.1.5` | 0.1.4 with room above 1000: the top bends towards 1100 instead (softness 250). Same Sierre-Zinal (979) and Phuket (655, 618) scores; road world bests ~966; 1000 takes 11% faster than the road world bests |
| `0.1.6` | production's curve on a course demand built from published evidence only: descents priced by measured pace, altitude 6.3 % per 1,000 m from 300 m, no steep-ground coefficient. See *Why 0.1.6* |
| `no-terrain` | no steep-ground or altitude factor: the gradient-cost integral alone |
| `no-altitude` | altitude coefficient 0 |
| `no-vertical-rule` | uphill-only courses get the ordinary steep coefficient |
| `linear` | exponent 1.0 instead of 0.85 |
| `totals` | measured distance and climb as one average grade (a race with no course file) |

In the report, the **Model** menu picks the one the table, tiles and ladders show, and **Compare**
overlays up to two more on the charts. To try an idea, add a `LabModel` to `scoring_lab/models.py`
(built with `dataclasses.replace` from the production curve); the report picks it up with no other
change. Variants carry a `lab-` version, so a lab number can never pass for a published one.

## Why 0.1.3

Model 0.1.3 is the curve I would defend as the most correct and the fairest, from what OTRI already
knows. It changes two things, and adds no new constant.

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
physical meaning: 500 is half the power. The 0.85 exponent was a judgement (spec section 6.1), and
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

**Known limit:** the ceiling is two straight pieces in log-log, with a kink at the marathon world
best (2:00:35). Read by time, that kink shows: a finish just past 2 hours gains up to about 40
points over one just under it. A smooth curve through the same three records would remove it, but
it reproduces the records it was not built from worse (10 km and half marathon at 96-97 % instead
of 100 %), so the evidenced ceiling stays and the kink is documented. Real field data, not
more theory, is what would settle both the fatigue and the scale.

## Why 0.1.6

0.1.3 was my answer for the curve. 0.1.6 is my answer for the other half of the model, the course
demand, and it keeps production's curve so the two questions stay separate. The rule is the one
good modelling practice gives: keep what is published, drop what was fitted to one data point,
and say what is left unpriced. Three changes:

**1. Descents are priced by pace, not by metabolic cost.** Minetti's polynomial is the right model
for climbing, where the metabolic cost sets the pace. Going downhill is not metabolically limited:
braking, impact and footing set the speed, and the polynomial credits a -20 % descent at 0.50 flat
km per km, a pace no one runs. Measured pace says what a descent is really worth. Strava's
grade-adjusted pace, refitted to heart-rate effort on millions of runs (Robb 2017), gives at most
0.88 flat km per km, at -9 %, and a full flat km again from -18 % down. Townshend et al. (2010)
measured the same asymmetry on a hilly time trial: 23 % slower on the climbs, only 13.8 % faster on
the descents. 0.1.6 uses that shape; uphill stays Minetti, as in production.

**2. Altitude from 300 m, at the published rate.** Wehrlin and Hallén (2006): VO2max of endurance
athletes falls linearly by 6.3 % per 1,000 m between 300 m and 2,800 m. Production applies 7 % per
1,000 m only above 1,500 m, so a course at 1,200 m is priced as sea level. 0.1.6 applies 6.3 % from
300 m.

**3. No steep-ground coefficient.** Production's 0.5951 (and the vertical 0.1169) is set so that one
performance scores 970. That is one data point per constant and no published counterpart, and it is
applied to every steep course whatever its footing, from a runnable alpine race to a technical
100-miler. 0.1.6 leaves it out and says so in every course's flags (`steep_ground_not_priced`).

**What it does to the courses in this folder:** less than you might expect, and in one case the
opposite of what feels right. On Sierre-Zinal the dropped steep coefficient (-10 %) is paid back by
the descents (+4 %) and the altitude (+10.5 % instead of +3.7 %): the record goes from 1030 to 1066.
On Phuket the two unevidenced pieces were cancelling each other, and the scores move by less than
ten points. The point of the model is not that it moves these scores; it is that every number in it
can be traced to a paper.

**What it cannot fix, and why those two courses feel wrong:**

- *Sierre-Zinal reads above the road world records* because its course file measures that fast: the
  Trace de Trail elevations are flagged implausible and put 2.15 km at 30 % or steeper. Terrain-model
  elevation (`--dem-manifest`) is the fix, not a curve. Acclimatisation is the other unknown: the
  6.3 % is for acute exposure, and a mountain runner who lives at altitude loses less.
- *Phuket reads low* because of heat, which is well quantified and not in a GPX. Ely et al. (2007):
  marathon performance slows about 10 % for 3-hour finishers, and more for slower ones, as WBGT rises
  from 10 to 25 °C, and Phuket in September is hotter than that. A cool-weather 1:33:40 on that course
  would be worth roughly 650-700, which is about where 0.1.4 put it by feel. Pricing that needs the
  race date and a climate source, which is a design change outside the course model.

Sources: [Wehrlin & Hallén 2006](https://link.springer.com/article/10.1007/s00421-005-0081-9),
[Robb 2017, an improved GAP model](https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3),
[Townshend, Worringham & Stewart 2010](https://pubmed.ncbi.nlm.nih.gov/20010117/),
[Ely et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17473775/),
[Minetti et al. 2002](https://journals.physiology.org/doi/full/10.1152/japplphysiol.01177.2001).

## Faster loops

- Measurements are cached by file content, measurement version and elevation source
  (`scoring_lab/.cache/`), so a re-run with a new model only rescores. New files are measured in
  parallel (`--jobs`). `--no-cache` re-measures, `--clear-cache` empties the cache.
- `--watch` rebuilds the report file whenever a GPX or `times.csv` changes (the app does this by itself).
- `--save-baseline` keeps this run as the baseline. Later reports show changes against it in the
  table (scored km, scores), which is how to see what a model change does to every course at once.

## Elevation

By default the lab uses the elevations in the GPX files (every course is then `Low` confidence, as on
the site without terrain data). With terrain tiles set up, pass `--dem-manifest path/to/manifest.json`
(or set `OTRI_DEM_MANIFEST`) to measure as production does.

`python -m scoring_lab --help` lists every option. The tests are in `tests/unit/test_scoring_lab.py`.
They hold the lab to the estimator's numbers and the report's curve to `score_for_time`.
