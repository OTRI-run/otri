# OTRI Pre-Race Score Calculator — Product & UX Specification

**Status:** Design specification for implementation by another AI/developer  
**Scope:** Runner flow for calculating an OTRI score before a race, based on a planned finish performance  
**Important:** This is a product/UI specification. Do not change production code while using this document for planning.

## 1. Product goal

The runner should be able to answer one very simple question:

> "If I run this race in X, what OTRI score would that performance earn?"

The experience should feel dramatically more useful than a generic pace calculator.

The core interaction is:

```text
Choose race
   ↓
Confirm course
   ↓
Enter target finish time
   ↓
Analyse
   ↓
Watch the model build the answer
   ↓
OTRI score
   ↓
Understand exactly why
   ↓
Test another time
```

This is aligned with OTRI's newer model direction: the race/course determines the demand and the runner's performance determines the score. The same course + same finish time + same scoring version must return the same score. This should be treated as a critical reproducibility invariant, consistent with the existing OTRI documentation's requirement that identical inputs under the same scoring version produce identical outputs. fileciteturn297file1L333-L352

## 2. Primary page: "Calculate your OTRI"

Recommended navigation label:

> Calculate score

Avoid overly technical labels such as "Simulation Engine" in the main navigation.

Hero copy:

> Know your score before you race.

Supporting copy:

> Choose a course, enter a finish time, and see what the OTRI model predicts for that performance.

Primary CTA:

> Calculate my score

Secondary link:

> How OTRI scoring works

## 3. Step 1 — Choose the race

The first screen should offer:

### Search

```text
Search races
[ Chiang Mai Trail __________________ ]
```

Also offer:

- recent races;
- popular races;
- race URL lookup;
- browse by country.

Search results should show only the information needed to disambiguate:

```text
Chiang Mai Trail 50K
2027 · Chiang Mai, Thailand
51.8 km · 2,900 m D+
Course status: Verified
```

Do not make the user open five race pages before finding the correct edition.

### Edition selector

Race and race edition must be distinct.

```text
Chiang Mai Trail 50K

Edition
[ 2027 ▾ ]

Course
✓ Verified
```

If multiple course versions exist, show them explicitly.

## 4. Step 2 — Confirm course inputs

Before calculating, show a compact course card.

```text
COURSE

51.8 km
2,900 m D+
2,850 m D-
Technicality: modelled
Altitude: 420–1,420 m

Course version: 2027.1
Status: Verified

[Use this course]
```

A small "Why this matters" link can explain that OTRI models the course itself rather than assuming every 50K is equivalent.

Do not expose every technical variable by default.

Advanced details can be opened:

```text
Course model details ▾

Segment count
Gradient distribution
Altitude profile
Technical terrain inputs
Course-data confidence
```

## 5. Step 3 — Enter target performance

The main input should be finish time.

```text
What time do you think you can run?

[ 04 : 55 : 00 ]

Target finish time
```

Immediately show derived pace only as secondary context:

```text
Average pace
5:41 / km
```

Optional alternative:

> Enter pace instead

Do not ask runners for VO2max, threshold HR, weight, shoes, weather, or race position in the core flow. Those are not necessary for the fundamental pre-race question if the score is defined from course demand + finish time.

## 6. Step 4 — Optional conditions

The core score should not require weather input.

The UI can offer an optional context section:

```text
Race-day context (optional)

Temperature [ 18 °C ]
Humidity    [ 75 % ]

These inputs are shown as context and sensitivity analysis.
They do not silently change the published OTRI score unless
that behavior is explicitly defined in the scoring methodology.
```

This separation is important. The runner should not be surprised because a weather toggle secretly changes their official score.

## 7. Step 5 — Analyse experience

This is the signature moment of the product.

Button:

> ANALYSE PERFORMANCE

On click, do not simply show a spinner.

Show a short staged animation that communicates what the model is doing.

### Stage A — Reading the course

```text
ANALYSING COURSE

✓ Distance
✓ Elevation profile
✓ Gradient demand
✓ Descent demand
✓ Terrain / technical inputs

Building course demand...
```

Visual:

- animated elevation profile drawing from left to right;
- small moving marker following the course;
- live segment counters.

### Stage B — Simulating performance

```text
SIMULATING PERFORMANCE

Splitting course into segments...
Running virtual pacing scenarios...
Testing fatigue states...
```

Visual:

- several thin animated paths/lines;
- virtual runner marker;
- progress counter such as `1,000 → 10,000 → 100,000 simulated states` only if the actual implementation really does that much work. Never fake a simulation count.

### Stage C — Finding the score

```text
SOLVING SCORE

Target time       04:55:00
Course demand     Loaded
Performance model Running

Finding the score that matches this performance...
```

Then a sharp transition to the result.

## 8. Step 6 — Result screen

The result should have one unmistakable hero number.

Example layout:

```text
YOUR PROJECTED OTRI SCORE

                684

04:55:00 target finish
51.8 km · 2,900 m D+

████████████████░░░░

Course demand        High
Model confidence     High
Scoring version      v0.x
```

Do not use unexplained colors or badges such as "Elite" unless the final methodology explicitly defines them.

## 9. The most important control: time ↔ score slider

Immediately below the score, provide an interactive sensitivity control.

```text
Target time

04:45 ─────────●──────── 05:15

Score: 701
```

Dragging the time should smoothly update the projected score.

Also allow manual exact entry.

The UI should make the relationship obvious:

```text
04:45 → 701
04:55 → 684
05:05 → 668
05:15 → 652
```

This is the "I can plan my race" moment and should be one of the strongest features on the site.

## 10. "Why this score?" explainer

The result page must have a very prominent button/card:

> WHY THIS SCORE?

Subheading:

> See what went into the calculation.

Clicking it opens a transparent explanation.

Suggested first layer:

```text
WHY 684?

1. COURSE
Your selected course has a defined physical and terrain demand.

2. PERFORMANCE
You asked OTRI to model a 04:55:00 finish.

3. SIMULATION
The model evaluates how that performance moves through the course.

4. SCALE
The resulting performance is mapped to the OTRI scoring scale.

Scoring version: v0.x
```

Then an advanced mathematical layer:

```text
Model inputs
Model parameters
Segment calculations
Score transformation
Version / commit
```

The default explanation must be understandable to a normal runner. The advanced layer exists for scientists and developers.

## 11. "What makes this course hard?"

Show the course contribution separately from the athlete performance.

Example visualization:

```text
COURSE DEMAND

Distance          51.8 km
Climbing          2,900 m
Descending        2,850 m
Steep climbing    14.2 km
Technical terrain 18.7 km
Altitude          420–1,420 m

[View course demand]
```

These fields are illustrative. Only display variables actually supported by the model.

## 12. Pre-race planning section

Add a useful second card:

> What does my target mean?

Allow multiple target times.

```text
Your targets

04:45   701
04:55   684   ← current target
05:05   668
05:15   652
```

Do not describe one number as universally "good" or "bad". Let the runner interpret the number using OTRI's documented scale and future reference material.

## 13. Exact reproducibility guarantee

The interface should communicate an important OTRI promise:

> Same course. Same finish time. Same scoring version. Same score.

After the race, if the verified result matches the same course edition and exact finish time used in the calculator, the runner's generated race score should equal the pre-race calculation, subject only to explicitly documented differences such as a changed course version or scoring-version change.

This should be tested automatically.

## 14. Post-race reconciliation

After a race result is imported, a runner should see:

```text
PRE-RACE PROJECTION
Target: 04:55:00
Projected OTRI: 684

ACTUAL RESULT
Finish: 04:55:00
Official OTRI: 684

✓ Your prediction matched exactly.
```

If actual time differs:

```text
Target: 04:55:00 → 684
Actual: 05:03:12 → 671
```

This creates a strong product loop between planning and racing.

## 15. Share card

The result should be shareable as a visually strong social card.

Suggested content:

```text
OTRI
PRE-RACE ANALYSIS

Chiang Mai Trail 50K
Target 04:55:00

OTRI 684

Course + performance
Open. Transparent. Reproducible.
otri.run
```

Do not include competitor-relative language unless the final product explicitly supports it.

## 16. Mobile UX

The entire calculator should work comfortably on a phone.

Primary layout:

```text
Step 1 / 4
Choose race

[search]

[Race card]

      ↓

Step 2 / 4
Confirm course

[course card]

      ↓

Step 3 / 4
Target time

[ 04:55:00 ]

      ↓

ANALYSE
```

Keep the main CTA fixed/visible near the bottom on mobile only when it does not obscure content.

## 17. Visual design direction

OTRI's existing brand direction is blue / deep navy / white / grey, with gradients allowed. Keep the canonical logo unchanged.

The calculator should feel:

- scientific;
- premium;
- athletic;
- data-driven;
- calm;
- fast;
- transparent.

Avoid:

- generic fitness-app neon overload;
- cartoonish gamification;
- excessive cards;
- huge amounts of text before the calculation;
- fake loading percentages;
- fake simulation counts.

Use motion to explain computation, not to decorate it.

## 18. Error states

Every important error needs a recovery action.

Examples:

```text
This race does not have a verified course model yet.

You can still view the race profile.

[Choose another race]
```

```text
We need an official course version before calculating this score.

[View race details]
```

```text
Target time is outside the supported model range.

[Choose another time]
```

Do not show internal stack traces to runners.

## 19. AI implementation rules

The implementing AI must not invent model inputs or mathematical coefficients.

If the scoring methodology does not define a variable, the UI must not imply that the variable affects the score.

If the model exposes an uncertainty or confidence value, explain its source.

If the model cannot support a requested scenario, say exactly why instead of fabricating a result.

The existing OTRI handbook identifies auditability and explainability as central differentiators and gives the example that a score should be decomposable into understandable components with a scoring version. fileciteturn297file1L286-L307

## 20. Definition of done

A first-time runner should be able to complete the core calculation without reading methodology documentation.

The path should be:

```text
Find race → select edition → enter time → Analyse → see score → understand score
```

A technically curious user should be able to go one level deeper and inspect the exact model/version inputs behind the same result.
