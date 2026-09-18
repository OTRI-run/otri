# Runner index v1 — one number per runner

**Status:** Implemented (`runner-index-v1`, `scoring/runner_index.py`), 2026-09-18
**Depends on:** per-race scores from the current scoring model (V0.8); nothing else
**Audience:** runners asking "why is my index this number", and anyone auditing the rule

---

## 1. The rule

A runner's index is the **recency-weighted mean of their best 3 race scores from the last 24 months**, built only from results their organizers have published.

| parameter | value | why |
|---|---|---|
| window | 24 months | long enough that an injury season or one race-free year does not erase a runner; short enough to be about the runner as they are now |
| results counted | best 3 by score | trail runners typically race two to six times a year; three good results are reachable for a regular racer and reward consistency over one lucky day |
| recency weight | 1.0 for 12 months after the race, then a straight line to 0.0 at 24 months | a result fades out rather than falling off a cliff on its anniversary |
| combination | weighted mean, divided by the sum of the weights | an old result loses *influence* without dragging the *level* down |
| fewer than 3 results | index still computed, marked **provisional** | an honest number now beats no number; the label says how much evidence is behind it |

Nothing is summed. Racing more often never raises the index by itself; only better scores do. Position in the field, category, and who else raced play no part, exactly as with the race score.

Every profile shows, for each result: its weight today, whether it is one of the three that count, the date its weight starts to fade and the date it expires. The index is recomputed from those results on every request, for the date of the request, so it is reproducible for any date by anyone with the same results.

## 2. What was compared

The question every ranking system answers is the same: how to turn a set of dated performances into one current number, without punishing people who compete rarely or rewarding people who merely compete a lot.

| system | window | what counts | recency | takeaway |
|---|---|---|---|---|
| Official World Golf Ranking | 2 years (104 weeks) | points ÷ events played, minimum divisor 40, maximum 52 | full value 13 weeks, then linear decrements over 91 weeks | the fade is the right idea; the minimum divisor punishes low-volume players, which does not suit trail |
| World Athletics road rankings | 18 months | average of the best 5, 3 or 2 scores depending on event (2 for the marathon) | none inside the window | fewer results for longer, rarer events; an average, not a sum |
| Tennis (ATP) | 52 weeks | sum of the best 18 results | hard drop at 52 weeks | sums reward volume; the "defending points" cliff is what the fade avoids |
| Orienteering (IOF, FootO) | 24 months | best 5 scores | none | a 24-month window for a sport with a similar race frequency |
| a trail-running performance index | 36 months | weighted mean of up to 5 best | full for 12 months, then stepped down every 6 months, also weighted toward the best result | a longer window and more results than most trail runners have; the extra weight on the best result makes one day matter more |

Sources: [OWGR: how the ranking works](https://www.owgr.com/how-the-ranking-works), [OWGR FAQ](https://www.owgr.com/faq), [World Athletics: basics of the world rankings](https://worldathletics.org/world-ranking-rules/basics), [World Athletics: road running rules](https://worldathletics.org/world-ranking-rules/road-running-2024), [ATP rankings](https://en.wikipedia.org/wiki/ATP_rankings), [IOF world ranking](https://ranking.orienteering.org/About), [IOF ranking rules update](https://orienteering.sport/world-ranking-rules-and-system-updated-part-2/).

V1 takes the fade from golf, the "average of the best few" from athletics, the 24-month window from orienteering, and deliberately leaves out volume rewards and best-result weighting.

## 3. Identity: which results are the same runner

Results files carry names, gender and, usually, a birthdate or year of birth and a nationality. OTRI stores the **year** of birth and the country code, never the full date. Matching:

1. Same normalised family name, first name and gender **and** the same birth year → same runner.
2. A result without a birth year attaches to the one existing runner with that name and gender (and a compatible nationality) if there is exactly one; otherwise it becomes a new runner.
3. A result with a birth year adopts an existing same-name runner whose birth year is unknown, if there is exactly one.

Two people with the same name, gender and birth year would be merged; a runner whose organizers spell their name differently would be split. Both are fixed by a claim-and-merge step that is not built yet. The matching is deterministic in submission order and is re-run whenever an organizer re-submits a race.

## 4. What the index does not know

1. **Gender.** Race scores are a share of the human world-best rate, which is a men's rate; women's scores sit lower by construction. The index inherits that. Runner search therefore lists women and men separately; a gender-specific ceiling is a candidate model change on its own.
2. **Course confidence.** A result measured at Low confidence counts like any other. Profiles show the flag.
3. **Model versions.** Scores under different scoring versions are averaged together. In practice every published race today is scored under the current default; if that changes, the profile shows each result's version.
4. **Unpublished results.** They do not exist for the index. A runner's index can change when an organizer publishes or withdraws a race.

## 5. Versioning

Any change to the window, the count, the weighting, the combination or the identity rules is a new version (`runner-index-v2`, …) with its own note, per the policy in [`OTRI-MODEL-0.1.0.md`](../0.1.0/OTRI-MODEL-0.1.0.md) §13. The API reports the version with every index.
