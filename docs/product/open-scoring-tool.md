# OTRI as an open scoring tool

**Status:** direction adopted 2026-09-19. First increment built: `POST /score`, the Score my race page, the API page, the embeddable calculator, open CORS on the tool endpoints.

## The decision

OTRI is an open calculator and scoring tool, not a global approval organization. A race can score itself; nobody has to be approved, listed or ranked by OTRI for a score to mean something, because a score depends only on the course, the runner's own time and a published, versioned model.

This is a choice about where the project's effort goes. ITRA and UTMB are membership bodies with a catalogue of every race and a say over who counts. OTRI does not compete on that ground. It competes on a number anyone can compute, inspect and reproduce.

### Focus

| Area | What it means | Where it lives |
| --- | --- | --- |
| GPX course analysis | A course file measured the same way every time, against pinned terrain data where installed | `course/`, `POST /gpx/analyze` |
| Transparent scores | Every score explains itself: course demand, human ceiling, every intermediate | `scoring/`, the calculator's explanation, the methodology docs |
| Results-file validation | Row and field level errors and warnings, header aliases in several languages | `ingestion/`, `POST /score` |
| Self-service race pages | An organizer account, a race page, publish when ready. No approval step in the way | `prototype/organizer/` |
| Automated quality and confidence warnings | The model says where it runs out of evidence: Low confidence with reasons, uphill-only courses listed without a score | `scoring/course_standard.py` (`confidence_for`, `not_scored_reason`) |
| API and embeddable calculator | The tool as HTTP calls any site may use, and the calculator as an iframe | `POST /score`, `/gpx/analyze`, `/scoring/models`, `prototype/embed/`, the `#api` page |

### Not now

- Manually approving organizers and races.
- Maintaining every race worldwide.
- Resolving ownership and runner-identity disputes.
- Acting as an official qualification or governing body.
- Global rankings before the model is validated.

## Score my race (`POST /score`)

The whole product in one call: a course and a results file in, the validated and scored result list out.

- **Course:** a GPX file (`gpx`), required, measured like any OTRI course. There is no scoring from an official distance and climb here: a score rests on where the climbing is, and a tool whose whole claim is a measured, explainable number should not hand out guesses.
- **Results:** `results`, CSV or Excel, the same validation as the organizer upload. An invalid file answers `200` with `is_valid: false` and the issues; nothing is scored.
- **Answer:** `ScoreRaceResult`: `course` (figures, source, confidence, quality flags, `not_scored_reason`), `summary`, `errors`, `warnings`, `scores`, the `measurement`, and `stored: false`. `?format=csv` returns the list as a download; cells that a spreadsheet would run as a formula are made text.
- **Nothing is kept.** Both uploads are written to temporary files and deleted before the answer is sent. No event, race, result or runner row is written, and `runner_id` is always null. The only trace is the course-measurement cache shared with `/gpx/analyze`: a derived profile keyed by the file's hash, 64 entries, no file and no names.
- **It is the same computation** as a published race: `_scored_rows` in `api/app.py` serves both the stored leaderboard and this call.
- **Abuse:** 10 calls a minute per address, 20 MB per request, 50,000 rows; nginx adds its own per-address budget.

## From a scored race to a published race page

Scoring without an account is the front door; keeping the race is one click further, and nothing is uploaded twice.

1. After a valid result, the Score my race page invites: **Publish this race**. It says what the organizer gets (leaderboard, course map, target times, the embed), that it is free, that nobody approves anything and that nothing is public until they press Publish.
2. The press writes the two files and the course figures to the browser's IndexedDB (`prototype/publishHandoff.js`) and opens the organizer app at `#/publish`. Nothing is sent by this step. The hand-over is deleted once the race page exists, after a day, or on "Forget this race".
3. Signed out, `#/publish` shows what is waiting and offers "Create my free account" or "I already have an account". Creating the account signs the organizer in at once and lands back on `#/publish`: **the email confirmation does not stand in the way of building the race.** An unconfirmed account can create events and races, attach courses and upload results; only `POST /races/{id}/publish` and `POST /races/{id}/listing` answer 403 until the address is confirmed, an unconfirmed address is never an admin, and a bar in the organizer app says so with "Send it again". A password reset confirms the address too.
4. Signed in, one form asks for what the files do not say: the event name (prefilled), the race date, the distance name (prefilled from the measured distance), and optionally place and country. **Build my race page** then creates the event and the race, attaches the course and submits the results through the normal endpoints, showing each step; a failure can be retried without creating anything twice.
5. It ends on the race's review page. Publishing stays a separate, deliberate press: the results carry runners' names.

## Open to any origin

`/score`, `/gpx/analyze` and `/scoring/models` answer every origin with `Access-Control-Allow-Origin: *` and no credentials (`_open_cors` in `api/app.py`). They carry no session and keep nothing, so there is nothing for a hostile page to reach. Every other route stays on the `OTRI_API_ALLOWED_ORIGINS` allow-list, and OTRI's own pages keep their credentialed answer on the open routes too.

## The embedded calculator

`prototype/embed/` is a fourth build entry: the score calculator without the site around it, for an `<iframe>`. `?race=<race_id>` opens a race published on OTRI, `?gpx=<share_id>` a course shared from the calculator, `&t=` a target time. The frame posts its content height to the host page (`{type: 'otri:height', height}`) and nothing else. The snippet is on the `#api` page.

## What this means for what is already built

**Retired (2026-09-19), code deleted:** everything that made OTRI a catalogue or an arbiter of who owns a race.

- OTRI-compiled ("unclaimed") listings: `POST /admin/listings`, the CSV import, the bulk course upload and the permission note on a course nobody owned.
- "I'd like scores" requests and "Ask your organizer" (`POST /races/{id}/score-requests`).
- Claims: the public "I organize this race" form, the claim step in the create-event form (`GET /events/matches`, `POST /events/{id}/claim`), and the admin hand-over (`POST /admin/events/{id}/assign`).
- "Suggest a race" and its admin "Create listing" step: a suggestion's only outcome was an unclaimed listing.

The columns and the `score_requests` table stay, unused, so nothing in production is destroyed. A listed race that nobody owns is never public (`db.list_races`); an admin deletes such leftovers under Admin → Events & races.

**Kept:**

- **An organizer's own listing.** They can show their race before it has results, which is also what the embedded calculator's `?race=` opens.
- **The calendar view and the `.ics` feed**, now showing only races their organizers listed. It is a view over self-service pages, not a calendar OTRI curates.
- **The runner index**, labelled provisional and not promoted. It is a view over published races, not a ranking OTRI stands behind as official.
- **Reports** for corrections and removals, and **organizer verification** as an internal flag against abuse, not a badge of approval.

## Next

1. Score my race: keep the result open in the page across a reload (browser storage only), and a printable result sheet.
2. A column-mapping step for results files whose headers are not recognised, instead of an error.
3. `POST /score` with several distances in one call (one file per distance).
4. API terms: attribution, fair use, and a stability policy once the contract is 1.0.
