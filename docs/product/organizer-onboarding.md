# OTRI Organizer Onboarding — Product & UX Specification

**Status:** Design specification for implementation by another AI/developer  
**Scope:** Organizer account, organization, event creation, race creation, course data, results ingestion, validation, review, publishing, corrections  
**Important:** This document specifies product behavior and UI. It does not require code changes now.

## 1. Purpose

OTRI should make adding a race feel like a guided setup wizard, not a database administration task.

The organizer should always know:

1. where they are;
2. what information is required;
3. what can be skipped and completed later;
4. why OTRI is asking for each field;
5. whether the race is ready for review;
6. what OTRI will calculate automatically.

The design should use proven general patterns for organizer onboarding, including an organizer account, organization, event containing one or more races, structured results, renewal/duplication of previous editions, and explicit publication states. OTRI must independently define its own branding, data model, scoring methodology, terminology and UI.

OTRI should improve the experience by making the workflow explicitly progressive and by validating the data before submission.

## 2. Core information architecture

Use this hierarchy:

```text
Organizer account
  └── Organization
        ├── Event
        │     ├── Race / edition
        │     ├── Course version
        │     └── Results submission(s)
        └── Team members / permissions
```

Do not model an annual race edition as a completely unrelated new race. Preserve the relationship between an enduring event and each dated edition.

Example:

```text
Doi Suthep Trail
  ├── 2026 edition
  │     ├── 50K
  │     └── 20K
  └── 2027 edition
        ├── 50K
        └── 20K
```

This allows OTRI to show course changes, historical editions, and result provenance without overwriting history.

## 3. Organizer onboarding wizard

### Step 0 — Welcome

Headline:

> Add your race to OTRI

Supporting text:

> Create your race profile, verify the course, and submit official results. OTRI handles validation and scoring.

Show a 5-step progress indicator:

```text
1 Organization → 2 Event → 3 Race → 4 Data → 5 Review
```

Also show:

- estimated completion time;
- required vs optional fields;
- save-and-return behavior;
- link to Organizer Guide;
- link to Data & Privacy Policy.

Do not force an organizer to create an event before understanding what information will be required.

### Step 1 — Create / verify organizer account

Fields:

- email;
- password or supported authentication;
- organizer name;
- job/role (optional);
- country.

Then verify email.

After verification, create or join an organization.

### Step 2 — Organization

Required:

- organization / race-series name;
- country;
- primary contact name;
- verified contact email.

Optional:

- organization website;
- logo;
- cover image;
- social links;
- timing provider.

For existing organizations, provide search first:

> Is your organization already on OTRI?

If yes, request access instead of creating a duplicate organization.

Permission model should support at least:

- Owner — organization and event administration;
- Manager — create/edit events and submit results;
- Data uploader — upload/replace result files but cannot change organization ownership;
- Viewer — read-only.

Never let an organizer edit the final calculated OTRI score directly.

### Step 3 — Create Event

Event is the parent container.

Required:

- event name;
- event country;
- event city / region;
- official website.

Optional:

- event description;
- logo;
- cover image;
- social links;
- organizer contact page.

The UI should immediately offer:

> Create your first race

For an annual event that already exists, provide:

> Duplicate previous edition

The duplicated edition must carry forward reusable metadata but create a new dated edition and new course version records rather than overwriting the old edition.

### Step 4 — Create Race

Ask the organizer to choose the race type first because later fields depend on it.

Supported initial types should include:

- standard trail race;
- stage race;
- relay;
- time-limited race;
- backyard-style race;
- other / review required.

Do not silently score unsupported formats. Route special formats into explicit validation rules.

For a standard race, required fields:

- race name;
- race date;
- start location;
- finish location;
- official distance;
- official elevation gain;
- official elevation loss where available;
- start type / timing model;
- maximum allowed race time / cut-off if applicable.

Recommended fields:

- course surface description;
- aid stations;
- GPX;
- course map;
- course record / historical metadata;
- altitude range;
- technicality information where OTRI can support it;
- race capacity.

OTRI should not make a GPX mandatory for basic race listing. GPX should be strongly encouraged for a high-quality course model.

### Step 5 — Course upload

If GPX is supplied:

1. upload GPX;
2. parse the track automatically;
3. display map and elevation profile;
4. show calculated distance and D+;
5. compare organizer-entered values with GPX-derived values;
6. flag meaningful differences;
7. let organizer confirm which official values apply;
8. store the raw file immutably with provenance and rights status.

Example UI:

```text
COURSE CHECK

Official distance     51.2 km
GPX distance          50.9 km
Difference             0.6%

Official D+           2,850 m
GPX D+                2,910 m
Difference             2.1%

✓ Within expected tolerance

[Confirm course] [Edit details]
```

Never silently rewrite the organizer's official values from GPS processing. Store both stated and measured values with provenance.

If no GPX is provided:

```text
Course model: Basic

Your race can still be listed.
Adding a GPX later can improve course analysis and future model capability.

[Continue without GPX]
```

### Step 6 — Results source

Ask:

> How will you provide official results?

Choices:

- upload results file;
- timing provider export;
- organizer API/integration (future);
- submit later.

The organizer should be allowed to publish a future race profile before results exist.

### Step 7 — Results upload

Use a drag-and-drop uploader with a sample template and visible schema requirements.

Minimum result record for a scoreable standard race should normally include:

- runner first name;
- runner last name or organizer-provided display name;
- gender if legally/operationally justified by the chosen model;
- finish time;
- rank where available;
- result status;
- category where available.

Additional fields may be accepted:

- nationality;
- birthdate/year where genuinely needed and legally permitted;
- bib;
- age group;
- checkpoint times;
- timing chip identifiers.

Never require a field merely because another index requires it. OTRI should collect the minimum data necessary for its own product.

### Step 8 — Automatic validation

Run validation immediately after upload.

Show results as:

```text
✓ File readable
✓ 642 rows detected
✓ 639 finishers
✓ 3 DNFs
✓ Finish times valid
✓ Duplicate bibs: none
⚠ 7 names need review
⚠ 2 rows have missing country
✓ Course linked to race edition

READY FOR REVIEW
```

Validation categories:

- file/schema errors;
- duplicate rows;
- duplicate runner identities within the submission;
- invalid or impossible finish times;
- missing required fields;
- impossible ranks;
- DNF/DNS/DQ handling;
- distance/course mismatch;
- duplicate event/edition detection;
- suspicious result patterns;
- privacy problems;
- provenance/license confirmation.

The organizer should be able to fix errors with a guided table rather than repeatedly re-uploading a file.

### Step 9 — Provenance and rights

Before submission, require an explicit declaration:

```text
I confirm that I am authorized to submit these results to OTRI
and that OTRI may process them for the purposes described in its
Data Policy.
```

Capture:

- source type;
- timing provider;
- person submitting;
- submission timestamp;
- permission basis;
- source filename;
- file hash;
- original immutable file;
- rights status;
- notes.

OTRI should prioritize organizer-provided or explicitly licensed data, require provenance, and avoid copying third-party proprietary databases.

### Step 10 — Review screen

This should look like a pre-flight checklist, not a generic form.

```text
YOUR RACE
Doi Suthep Trail 50K
12 October 2027

COURSE
✓ Distance
✓ Elevation
✓ GPX

RESULTS
✓ 639 finishers
✓ 3 DNF
✓ Validation passed

DATA RIGHTS
✓ Permission confirmed

MODEL
OTRI scoring version: v0.x
Course model status: ready

[Submit for OTRI review]
```

### Step 11 — Review / approval

Submission states:

```text
Draft
  ↓
Submitted
  ↓
Automated validation
  ↓
Human/data review if required
  ↓
Approved
  ↓
Published
```

Only approved data becomes part of the verified public dataset.

Reviews should expose the specific issue, not a generic "rejected" message.

Example:

> GPX elevation differs from declared elevation by 14.8%. Please confirm which course representation is official.

### Step 12 — Published race dashboard

Once approved, organizer sees:

- public race URL;
- event edition status;
- course profile;
- number of verified results;
- result processing status;
- OTRI scoring version;
- downloadable report;
- share buttons;
- result correction workflow;
- history.

Give organizers something useful back: race profiles, validated results, rankings/analytics, downloadable reports and future API access.

## 4. Post-race result workflow

The post-race experience should be extremely simple:

```text
Your race is complete.

Upload official final results
        ↓
OTRI validates
        ↓
Preview changes
        ↓
Confirm publication
        ↓
Scores generated
        ↓
Public race results
```

Never replace historical data invisibly. A corrected file creates a new submission/version with an audit trail.

## 5. Annual renewal

For an existing event, primary CTA should be:

> Start 2027 edition

not:

> Create new event

Carry forward:

- event metadata;
- organizer permissions;
- reusable race names;
- previous course version;
- common website/logo data.

Ask the organizer what changed:

```text
What changed this year?

○ Same course
○ Course changed
○ Distance changed
○ Elevation changed
○ New race added
```

Repeat organizers should be able to renew/duplicate an edition instead of rebuilding the event from scratch.

## 6. UX rules for the implementing AI

The implementation must follow these rules:

1. One decision per screen where practical.
2. Always show progress.
3. Required fields first; optional fields behind "Add more details".
4. Preserve work automatically.
5. Never make an organizer re-enter data after validation.
6. Use plain language, not statistical jargon.
7. Inline validation beats a final error dump.
8. Explain why an unusual field is requested.
9. Keep advanced controls available without making them mandatory.
10. Never let organizer-entered data directly become a score.
11. Never let organizer edit calculated scores.
12. Every published dataset must have provenance and version history.
13. Every course edition is immutable after publication; corrections create a new version.
14. Mobile should remain usable, but desktop is the primary context for bulk result upload.
15. The UI should look premium and technical without becoming complicated.

## 7. Anti-gaming requirements

The existing OTRI handbook requires provenance, organizer verification, anomaly detection, duplicate detection, audit logs, confidence and human review, and explicitly says organizers submit data while the scoring engine calculates the result. fileciteturn297file1L257-L282

Implement these safeguards in the product architecture from the beginning.

## 8. Definition of done

An organizer should be able to go from "I have a race" to "my race is submitted" without reading documentation first.

A competent organizer with their event details and a results file should be able to complete the workflow in one sitting.

At every point the organizer should be able to answer:

> What does OTRI need from me, what does OTRI do automatically, and what happens next?
