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
Choose / confirm course source
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

The runner must be able to choose whether OTRI already has the course or whether they want to provide a GPX themselves. OTRI should make the easiest path the default without making the runner understand data licensing.

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

The first screen should offer two clear course paths:

```text
How do you want to get the course?

[ Search existing race ]
[ Upload GPX ]
```

### Path A — Search existing race

The default path should be searching OTRI's existing race/course database.

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

### Path B — Upload GPX

A runner who cannot find the race should be able to provide the course directly.

```text
Upload your course GPX

[ Choose .gpx file ]

or drag and drop

Accepted: GPX
Maximum file size: implementation-defined
```

After upload, immediately parse and show:

```text
COURSE FOUND

Distance          51.8 km
Elevation gain    2,910 m
Track points      4,821

[Use this course]
[Replace GPX]
```

The runner should not have to create an OTRI account just to test a GPX unless the final product requires an account for abuse prevention, saved courses, or other documented reasons.

### GPX provenance choice

When a runner uploads a GPX, capture provenance without adding friction:

```text
Where did this GPX come from?

○ I recorded it myself
○ The race organizer provided it
○ The race website provided it
○ I have permission to use it
○ Other / unsure
```

This field is for provenance and internal review. "Unsure" must not automatically mean rejection, but it should prevent OTRI from treating the file as a permanently reusable public course asset until its rights status is reviewed.

The raw uploaded GPX should be stored separately from the normalized course model, with uploader, timestamp, source note, checksum, license/permission status, and model version recorded.

## 4. Course acquisition policy — how OTRI gets GPX without creating unnecessary legal risk

OTRI should not build a system that blindly scrapes race websites and republishes whatever GPX files happen to be discoverable.

The safest product architecture is **source-aware ingestion**. Every course must have a provenance record and a documented right-to-use status before OTRI publishes or redistributes the underlying GPX.

### Preferred acquisition order

1. **Organizer-provided GPX**
   - Organizer uploads directly in OTRI Organizer Space.
   - Organizer confirms they are authorized to provide it and selects the reuse permission offered by OTRI.
   - This should be the preferred source for official race courses.

2. **Explicitly licensed public GPX**
   - Import only when the source clearly grants reuse under an identified license or permission.
   - Store the source URL, license, attribution requirements, import date, and source checksum.

3. **Direct permission from the course owner / organizer**
   - OTRI can request a course file through a simple claim/request flow.
   - Permission should be stored as a durable provenance record, not as an undocumented email sitting in a mailbox.

4. **Runner-supplied GPX**
   - Use for personal calculations when provenance is known or accepted under the product's terms.
   - Do not automatically turn every runner upload into a public downloadable OTRI GPX.

5. **Open geographic data used to reconstruct course context**
   - OTRI may use appropriately licensed open geographic datasets for map/context features and, where the license permits, for derived course data.
   - License compatibility and attribution obligations must be evaluated before ingestion.

### Sources OTRI should not automatically copy from

Do not build an automated crawler whose job is to find GPX files on arbitrary race websites, file stores, event portals, route-sharing sites, or map services and copy them into OTRI merely because the files are publicly reachable.

A public URL is not by itself proof that OTRI has permission to reproduce and redistribute the file. Database rights, copyright, contractual terms, and source-specific licenses can vary by jurisdiction and by source. The EU, for example, recognizes copyright protection for original database selection/arrangement and a separate database right based on substantial investment in obtaining, verifying, or presenting content. citeturn476910search0turn476910search2

Likewise, OpenStreetMap explicitly distinguishes open licensed geodata from other sources and warns that missing license information does not mean nobody has rights. citeturn476910search1turn476910search8

**Implementation rule:** robots.txt, a URL being visible in a browser, or the absence of a paywall must never be treated as a legal license to copy a GPX.

### Automatic race discovery vs automatic GPX copying

These are different problems.

OTRI can safely automate **discovery of candidate races** much more broadly than it can automate **copying course files**.

Recommended pipeline:

```text
Discover new race candidate
        ↓
Normalize race metadata
        ↓
Check for approved / licensed course source
        ↓
 ┌───────────────────────────────┐
 │ Authorized source found?      │
 └───────────────┬───────────────┘
                 │
        yes      │      no
         ↓       │       ↓
  Import GPX      │   Request organizer GPX
         ↓        │       ↓
  Validate GPX    │   Wait / link to upload
         ↓        │       ↓
  Build course   └──→ Review / verify
         ↓
 Publish course version
```

This lets OTRI automate the boring parts without turning "scrape the internet" into a core data strategy.

## 5. Suggested automatic discovery system for new races

OTRI should maintain a **Race Discovery Queue** rather than automatically publishing every discovered race.

### Candidate sources

The discovery service can monitor sources such as:

- organizer websites and public event calendars;
- official race registration/event feeds where available;
- structured public APIs;
- organizer-submitted race URLs;
- user-submitted race URLs;
- licensed race datasets;
- public announcements that contain enough metadata to create a candidate record.

The discovery service creates a draft candidate containing only metadata that OTRI is allowed to retain:

```text
Candidate race

Name
Date
Location
Organizer
Official website
Registration URL
Known distances
Known elevation, if published
Possible course source URL
Discovery source
First seen
```

### GPX retrieval worker

A separate worker should inspect each candidate for an approved course source.

Possible outcomes:

```text
NO COURSE FOUND
→ Ask organizer / wait for submission

COURSE LINK FOUND
→ Inspect license / permission

LICENSE CLEAR
→ Download + checksum + validate

LICENSE UNCLEAR
→ Do not publish automatically
→ Queue for review / permission request

ORGANIZER PROVIDED
→ Process directly under organizer permission
```

The system should never infer permission from a filename such as `official-course.gpx` or from wording such as "download GPX".

## 6. Course source and rights states

Every course source should have a machine-readable state.

Suggested states:

```text
self_recorded
organizer_provided
explicitly_licensed
permission_granted
open_data_derived
user_provided_unknown
rights_review_required
withdrawn
```

Also capture:

```text
source_url
source_owner
license_name
license_url
permission_reference
attribution_required
redistribution_allowed
commercial_use_allowed
imported_at
source_checksum
raw_file_retention_policy
```

The calculator only needs a valid normalized course model. It does **not** need to expose the original GPX file publicly.

## 7. Course reuse without redistributing the original GPX

A useful legal-risk reduction is to separate three things:

```text
SOURCE FILE
   ↓
NORMALIZED COURSE MODEL
   ↓
OTRI SCORE CALCULATION
```

For example, an organizer may allow OTRI to use their course file to calculate course demand but not permit OTRI to provide the original GPX as a download.

In that case OTRI can store the minimum necessary provenance and retain only the derived representation permitted by the source agreement, subject to legal review of the applicable license and jurisdiction.

Do not describe this as a universal copyright workaround. A transformation does not automatically remove third-party rights or contractual restrictions.

## 8. Step 2 — Confirm course inputs

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
Source: Organizer provided

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
Source / provenance
```

If the course came from a user upload, show a simple note:

```text
Course supplied by runner
Not yet verified by OTRI

[Use anyway]
[Find a verified course]
```

A pre-race score based on an unverified course must be visually distinguished from a verified course calculation.

## 9. Step 3 — Enter target performance

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

## 10. Step 4 — Optional conditions

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

## 11. Step 5 — Analyse experience

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

## 12. Step 6 — Result screen

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

The result must also identify the course source state somewhere in the detail view:

```text
Course source: Organizer provided
Course status: Verified
Course version: 2027.1
```

## 13. The most important control: time ↔ score slider

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

## 14. "Why this score?" explainer

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
Course source / provenance
```

The default explanation must be understandable to a normal runner. The advanced layer exists for scientists and developers.

## 15. "What makes this course hard?"

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

## 16. Pre-race planning section

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

## 17. Exact reproducibility guarantee

The interface should communicate an important OTRI promise:

> Same course. Same finish time. Same scoring version. Same score.

After the race, if the verified result matches the same course edition and exact finish time used in the calculator, the runner's generated race score should equal the pre-race calculation, subject only to explicitly documented differences such as a changed course version or scoring-version change.

This should be tested automatically.

## 18. Post-race reconciliation

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

## 19. Share card

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

## 20. Mobile UX

The entire calculator should work comfortably on a phone.

Primary layout:

```text
Step 1 / 4
Choose race

[search]

[Search existing race]
[Upload GPX]

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

## 21. Visual design direction

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

## 22. Error states

Every important error needs a recovery action.

Examples:

```text
This race does not have a verified course model yet.

You can search for another course or upload a GPX.

[Upload GPX]
[Choose another race]
```

```text
We need an official course version before calculating this score.

You can use a runner-supplied GPX for an unverified projection.

[Upload GPX]
[View race details]
```

```text
We cannot verify the reuse rights for this course file yet.

The file can be reviewed, but it will not be published as an official OTRI course until its source and permissions are resolved.

[View source status]
```

```text
Target time is outside the supported model range.

[Choose another time]
```

Do not show internal stack traces to runners.

## 23. AI implementation rules

The implementing AI must not invent model inputs or mathematical coefficients.

If the scoring methodology does not define a variable, the UI must not imply that the variable affects the score.

If the model exposes an uncertainty or confidence value, explain its source.

If the model cannot support a requested scenario, say exactly why instead of fabricating a result.

The existing OTRI handbook identifies auditability and explainability as central differentiators and gives the example that a score should be decomposable into understandable components with a scoring version. fileciteturn297file1L286-L307

For course ingestion specifically, the implementing AI must:

- preserve raw source provenance;
- never assume a publicly reachable GPX is licensed for reuse;
- keep license/permission metadata with the source record;
- separate private/user-supplied files from officially published course assets;
- make source and verification state visible in the product;
- provide a manual review path for rights-unclear sources;
- avoid automated copying from sources whose terms do not clearly permit it;
- make any automated discovery/import behavior auditable.

Legal review should be completed for OTRI's jurisdictions, source agreements, privacy policy, terms of use, retention rules, and planned redistribution behavior before production launch. This specification is a product design, not legal advice.

## 24. Definition of done

A first-time runner should be able to complete the core calculation without reading methodology documentation.

The path should be:

```text
Find race → select existing course OR upload GPX → confirm course → enter time → Analyse → see score → understand score
```

A technically curious user should be able to go one level deeper and inspect the exact model/version inputs behind the same result.

The course-ingestion system should also have a separate auditable path for:

```text
Discover race → locate possible course source → verify permission/license → ingest → validate → version → publish
```

The product should remain useful even when no reusable GPX is available: the correct response is to let the runner upload one or ask the organizer for one, not to quietly copy a file from an uncertain source.
