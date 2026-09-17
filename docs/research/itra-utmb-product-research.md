# ITRA + UTMB Research for OTRI Product Design

**Research date:** 2026-09-17  
**Purpose:** Extract useful public product patterns for OTRI while keeping OTRI's methodology, branding and software independent.

## 1. Research rule

ITRA and UTMB are reference products, not specifications for OTRI.

Existing OTRI documentation already states that OTRI should not copy ITRA/UTMB scores, proprietary rankings or proprietary databases, and should instead build an independent methodology, terminology, database and software. fileciteturn297file2L449-L478

## 2. ITRA organizer experience — useful patterns

Current ITRA organizer information says an organizer account is mandatory to add/manage races and results. It provides a free account option and an organizer space for creating events and races. It uses an **event → race** structure and tells existing organizers to renew/duplicate previous events rather than recreate them from scratch. citehttps://itra.run/Info/Contact

Current ITRA organizer guidance also says:

- trail-race eligibility has explicit rules;
- races need fixed distance and elevation gain for the normal format;
- individual finishing times are required;
- result files are structured;
- special formats such as backyard, time-limited and relay races have special rules;
- virtual races do not receive an ITRA Score / Performance Index under its stated rules. citehttps://itra.run/FAQ/Organizers

ITRA's result process uses a defined XLSX template and an upload flow inside the organizer account. citehttps://itra.run/FAQ/Organizers

### OTRI lesson

Copy the **workflow pattern**, not the exact form fields:

```text
Account
  ↓
Organization
  ↓
Event
  ↓
Race
  ↓
Results
  ↓
Validation
  ↓
Publication
```

Improve it with explicit progress, autosave, course preview, data-rights confirmation, field-level errors, immutable versions and a clear ready-for-review state.

## 3. UTMB organizer experience — useful patterns

The current UTMB Index organizer page states that organizers create an account on My UTMB, access an Organizer Space, and then create events and races. Required event data includes location and website; race data includes date, start/finish, distance, elevation gain/loss, and race type. UTMB says a GPS file is not required for the race to be listed. citehttps://utmb.world/index-organiser-info

UTMB describes Index-race eligibility for races above its stated 20 km-effort threshold and distinguishes in-person, team and relay formats; virtual and backyard-style races are excluded from the Index under the current organizer rules. citehttps://utmb.world/index-organiser-info

UTMB also states that new races need approval to appear on its Index calendar and that incomplete race information can prevent visibility. citehttps://utmb.world/index-organiser-info

### OTRI lesson

The organizer UI should clearly distinguish:

```text
Draft
Submitted
Under review
Approved
Published
Needs changes
```

A race should not appear as fully verified until the required data checks are passed.

## 4. ITRA runner index — useful patterns

ITRA's current public Performance Index page states that the general PI uses a weighted mean of up to five best race scores over the previous 36 months, regardless of distance. It also provides category-specific indexes. A runner can receive a PI with fewer than five results, including after one valid race. The current published calculation adds recency weighting and an experience weighting. citehttps://itra.run/FAQ/PerformanceIndex

The current FAQ says that a DNF does not impact PI, and that a much lower result may not be selected when better performances are already present. citehttps://itra.run/FAQ/PerformanceIndex

### OTRI lesson

The UX should expose:

```text
Current index
Peak index
Race scores
Included races
Distance/category views
Evidence depth
Score history
```

The UI should make it obvious which races actually contribute to the current number.

## 5. UTMB runner index — useful patterns

UTMB currently describes a Race Score as a score for a single performance, while the UTMB Index combines multiple Race Scores across races and categories. Its public description says the Index is based on a runner's best scores over the past three years, with higher and more recent scores carrying more influence. citehttps://utmb.world/utmb-index citehttps://utmb.world/news/Index-evolution

UTMB's current public Race Score explanation is especially relevant to OTRI UX because it presents a four-step process:

```text
1 Find similar races
2 Calculate expected score for each runner
3 Select reliable runners
4 Regression → race-specific model
```

It then shows a race-specific speed-to-score formula and a visual explanation. citehttps://utmb.world/race-score-utmb-index

### OTRI lesson

Even when the underlying mathematics is sophisticated, show a simple visual pipeline first and expose deeper mathematics on demand.

## 6. Important difference between current UTMB and proposed OTRI philosophy

UTMB's current public Race Score methodology uses results and participant performances in the race calculation; its published explanation says it predicts expected performance from past results and uses an asymmetric weighted regression for the specific race. citehttps://utmb.world/race-score-utmb-index

The proposed OTRI direction is deliberately different:

```text
OTRI course model
      +
runner performance
      ↓
OTRI score
```

Other runners can be used for model validation/research, but a runner's official score should not fundamentally depend on who else happened to enter the race if the published OTRI methodology says the score is course + performance based.

This distinction is central to product messaging.

## 7. What OTRI should copy conceptually

### From ITRA

- Event → race structure.
- Reuse/duplicate previous event editions.
- Structured result templates.
- Organizer dashboard.
- One overall runner index plus category indexes.
- Public explanation of how the index is calculated.

### From UTMB

- Organizer Space concept.
- Approval state before race-calendar publication.
- Clear race/race-type metadata.
- Race Score separate from overall Index.
- Visual explanation of score creation.
- Strong race profile / athlete profile presentation.

## 8. What OTRI should deliberately not copy

Do not copy:

- ITRA or UTMB visual identity;
- logos or endorsement language;
- proprietary result datasets;
- proprietary scores;
- proprietary ranking labels;
- their exact scoring equations;
- their exact thresholds or category boundaries without independent justification.

## 9. OTRI product opportunity

The biggest product opportunity is to combine the familiarity of the existing ecosystem with stronger transparency.

Example runner flow:

```text
Choose race
   ↓
Enter target finish time
   ↓
ANALYSE PERFORMANCE
   ↓
Course model runs
   ↓
Score appears
   ↓
WHY THIS SCORE?
   ↓
Exact inputs + exact version
```

Example organizer flow:

```text
Create account
   ↓
Create organization
   ↓
Create event
   ↓
Add race
   ↓
Add course / GPX
   ↓
Upload official results
   ↓
Automatic validation
   ↓
Review
   ↓
Publish
```

## 10. Current OTRI source limitations

The CM6 files in the project/library prove that a current data prototype contains columns such as:

```text
finish_time
finish_seconds
pace_min_per_km / physical_pace_min_per_km
performance_rate_q
otri_raw
otri_score
```

For example, the CM6 result files show monotonic Q → OTRI raw → OTRI score relationships in the supplied data. fileciteturn298file0L17-L24 fileciteturn298file6L301-L320

However, the CSVs themselves do **not** document the full mathematical derivation of `performance_rate_q`, so this research document must not invent the missing CM6/v0.5 equations. The eventual v0.5 methodology paper must be treated as the authoritative source for any exact Q formula or model coefficient.

## 11. Product principle distilled from the research

The best OTRI experience should feel as simple as today's mainstream running platforms while being substantially more inspectable underneath.

```text
Simple outside.
Deep inside.

One question per screen.
One obvious action.
One transparent explanation.
```

That is the target for both organizers and runners.
