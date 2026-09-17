# OTRI Overall Runner Index — Product & Methodology Specification

**Status:** Proposed design for implementation and later statistical validation  
**Scope:** How a runner receives one overall OTRI Index from multiple race performances  
**Important:** The exact aggregation coefficients must be validated and versioned before being declared final.

## 1. Problem to solve

A single race score describes one performance. The overall OTRI Index should answer a different question:

> "What level of trail-running performance has this runner demonstrated recently?"

The overall index must combine several performances without becoming confusing, overly sensitive to one unusual race, or dominated by a single distance type.

Existing industry products provide useful general reference patterns, but OTRI should not copy any external methodology.

Useful patterns to evaluate include a weighted set of recent/best performances, category views, a rolling time window, and a single headline index. These are research inputs only, not OTRI equations.

## 2. OTRI principle

OTRI race scores should be generated independently from the other competitors in that race under the OTRI course/performance model.

The overall OTRI Index should therefore aggregate **OTRI race scores**, not raw race positions and not another organization's scores.

Conceptual chain:

```text
Course model + actual finish performance
                ↓
          OTRI race score
                ↓
      validated runner history
                ↓
      overall OTRI Index
```

Real race results remain necessary as verified evidence of the runner's performances, but one competitor's performance should not change another runner's course/time-based OTRI score under the new OTRI model.

## 3. Proposed headline index

Use:

> **OTRI Index**

Avoid creating several competing headline numbers.

Runner profile should show:

```text
OTRI INDEX
684

Peak       701
Recent     676
Confidence High
```

The exact labels and calculations must be finalized with the statistical model.

## 4. Which races count?

### 4.1 Eligibility

A race performance can contribute to the overall OTRI Index only when:

- the race is an approved OTRI race;
- the course/edition is identified and versioned;
- the result is from a trusted/verified source;
- the runner has a valid finishing result;
- an OTRI score was successfully generated under a published scoring version;
- the result is not DNF/DNS/DQ unless a future methodology explicitly defines another treatment.

A manually typed result must never automatically count as a verified OTRI performance.

This follows the existing OTRI principle that athletes may submit results for review but cannot simply enter a claimed finish time and receive a verified score. fileciteturn297file9L1766-L1793

### 4.2 Time window

**Proposed default:** 36 months rolling.

This is an initial product hypothesis chosen because a multi-year rolling window is a familiar pattern in athlete-index products. It must be validated independently and may change.

The window must be configurable in the scoring-version definition, not hard-coded into UI text.

### 4.3 Number of race scores used

**Proposed default:** use the best 5 eligible race scores within the active time window, with an explicit recency weighting.

This is a starting specification, not a claim that five is mathematically optimal. Benchmark alternatives such as 3, 5, 6 and 8 before locking the parameter.

A runner with fewer than five valid races should still receive an index, but the profile must show lower evidence depth / confidence rather than pretending the estimate has equal support.

## 5. Proposed aggregation model

Start with this conceptual structure:

```text
eligible race scores
        ↓
apply time decay
        ↓
rank by adjusted performance
        ↓
select up to N best
        ↓
apply evidence / consistency weighting
        ↓
aggregate
        ↓
round to displayed integer
```

### 5.1 Recency

Newer performances should have more influence than older performances.

Do not copy constants from another service. Define an OTRI decay function in the published model, for example a smooth monotonic decay:

```text
weight_age(t) = published_function(t)
```

where:

- `t = 0` at race date;
- weight is highest for new results;
- weight decreases continuously or at published intervals;
- weight reaches zero when the result leaves the active window.

### 5.2 Performance weighting

The best recent results should matter more than weak outliers, but the system should not let one lucky result completely define the runner.

A robust initial candidate is:

```text
race_weight = recency_weight × performance_rank_weight
```

The rank weight must be published and benchmarked. Do not use unexplained constants.

### 5.3 Evidence depth

A runner with one race has less demonstrated breadth than a runner with five or more comparable race performances.

Instead of artificially inflating or penalizing the score, OTRI should preferably separate:

```text
Index value
+
Confidence / evidence depth
```

This avoids turning "number of races" into a hidden performance bonus.

### 5.4 Consistency

A runner with highly variable results may have the same weighted mean as a consistent runner, but the certainty of the estimate is different.

Therefore expose:

```text
OTRI Index: 684
Evidence: 5 qualifying races
Consistency: High
```

The labels and thresholds should be defined by the statistical validation process.

## 6. Do not let race distance create hidden bias

The overall index should allow a runner to have performances at different distances.

However, OTRI must test whether the model naturally over-rewards one distance family.

Example failure:

```text
Runner A
20K 700
20K 698
20K 695
20K 694
20K 692

Runner B
50K 700
50K 698
50K 695
100K 694
50K 692
```

If the two runners have meaningfully different endurance profiles, a simple five-score mean may hide that distinction.

Therefore the research program should benchmark:

1. raw best-five across all distances;
2. category-balanced best-five;
3. hierarchical model that estimates an underlying trail-performance level;
4. robust estimator with distance-specific uncertainty.

Do not choose the final method by intuition alone.

## 7. Recommended profile structure

The runner profile should have one headline index and secondary category views.

```text
┌───────────────────────────────┐
│          OTRI INDEX            │
│             684               │
│                               │
│ Peak 701     Recent 676      │
│ Evidence: 5 races             │
└───────────────────────────────┘

PERFORMANCE BY CATEGORY

Short Trail     690
Trail           684
50K             688
100K            661
100M            —
```

Category labels must be based on OTRI-defined distance ranges and independently justified.

## 8. Which race should the UI show as counting?

The runner must be able to expand:

> How is my OTRI Index calculated?

and see the exact included performances.

Example:

```text
OTRI INDEX 684

Included performances

1  Chiang Mai 50K       701   2027-01-14
2  Phuket Trail 30K     694   2027-05-09
3  Doi Inthanon 50K      682   2026-11-22
4  Laguna Trail 25K      674   2026-06-17
5  Khao Lak 40K          666   2026-03-08

Older / lower results

Phuket Trail 25K        601   not used
...
```

The actual UI must show the mathematical contribution of each included race, not merely the score list.

## 9. "Why is my OTRI Index 684?"

This must be an auditable interaction.

Suggested presentation:

```text
WHY 684?

5 race scores contribute

701   × 0.XX
694   × 0.XX
682   × 0.XX
674   × 0.XX
666   × 0.XX

Recency + performance weighting

Final OTRI Index
684

Scoring version: OTRI-INDEX-v0.x
```

The exact factors become visible from the published methodology.

## 10. Peak vs current

Do not conflate these:

**OTRI Index** = current rolling estimate.  
**Peak OTRI** = highest published rolling index or strongest qualifying period under the versioned definition.

A future feature may show:

```text
Current 684
Peak    701

+17 from peak
```

This is useful for runners without changing the primary score.

## 11. Bad race / DNF behavior

The overall index should be robust to one bad performance.

A low-score result should not automatically destroy a runner's index if better recent qualifying performances already exist.

DNF should not count as a normal finishing performance unless a future methodology explicitly defines another treatment.

## 12. Race frequency and ultra-distance fairness

Do not reward a runner simply because they race every weekend.

Do not punish ultra runners simply because they race fewer times.

This is one of the strongest reasons to report:

```text
Index
Evidence depth
Category evidence
Recency
```

rather than creating hidden experience bonuses.

OTRI should research whether any explicit experience component is necessary under its own scoring philosophy and validate alternatives empirically.

## 13. Overall index vs race score

These are different objects and should use different UI language.

### Race score

> How strong was this single performance on this course?

### OTRI Index

> What level of performance has this runner demonstrated recently across qualifying races?

Never display them as interchangeable.

## 14. Pre-race prediction relationship

The pre-race calculator uses:

```text
course + target finish time → projected race score
```

The overall index uses:

```text
verified race scores → rolling OTRI Index
```

This distinction should be visually clear.

## 15. Recommended timeline visualization

The runner profile should include a simple score timeline:

```text
OTRI INDEX

710 ┤          ●
700 ┤     ●          ●
690 ┤  ●        ●
680 ┤                 ●
670 ┤
    └────────────────────────
      2026      2027      2028
```

Do not overload the graph. It should answer "am I improving, stable, or declining?" without inventing a judgment about why.

## 16. Comparison research page

OTRI may later show an informational comparison of common trail-running index concepts.

This page should describe differences factually and avoid copying another service's scores, equations, terminology, branding, thresholds or category boundaries.

The OTRI portion should explain:

```text
OTRI
Independent methodology: course/performance race score + versioned
rolling runner index.
```

Do not turn this into a ranking of which index is "best".

## 17. Testing requirements

The implementing AI must create test cases before finalizing the aggregation implementation.

Minimum cases:

```text
test_one_valid_race_gets_index()
test_two_races_aggregate_correctly()
test_sixth_race_replaces_lower_best_five()
test_old_race_expires_at_window_boundary()
test_recency_weight_is_monotonic()
test_dnf_is_not_counted()
test_duplicate_result_is_not_double_counted()
test_course_version_is_respected()
test_same_inputs_same_index()
test_category_index_uses_only_category_eligible_results()
```

## 18. Versioning

Every published runner index should expose:

- index version;
- race-score version(s);
- effective calculation date;
- included results;
- score inputs;
- rounding rule.

The existing OTRI documentation already treats scoring releases as versioned artifacts containing version number, source-code commit, methodology, model parameters, tests and changelog. fileciteturn297file1L356-L365

## 19. Final recommendation for the first implementation candidate

Build the first version with:

```text
36-month rolling window
+ up to 5 best eligible race scores
+ explicit recency weighting
+ robust handling of low outliers / DNF
+ visible evidence depth
+ category views
+ fully auditable included-race list
```

Then benchmark against alternatives before calling the method final.

The implementation AI must define OTRI arithmetic independently and must not copy another service's exact equations.
