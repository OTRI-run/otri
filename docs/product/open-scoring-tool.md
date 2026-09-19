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

- **Course:** a GPX file (`gpx`), measured like any OTRI course, or without one the official `distance_km` and `elevation_gain_m` (scores then carry Low confidence).
- **Results:** `results`, CSV or Excel, the same validation as the organizer upload. An invalid file answers `200` with `is_valid: false` and the issues; nothing is scored.
- **Answer:** `ScoreRaceResult`: `course` (figures, source, confidence, quality flags, `not_scored_reason`), `summary`, `errors`, `warnings`, `scores`, the `measurement`, and `stored: false`. `?format=csv` returns the list as a download; cells that a spreadsheet would run as a formula are made text.
- **Nothing is kept.** Both uploads are written to temporary files and deleted before the answer is sent. No event, race, result or runner row is written, and `runner_id` is always null. The only trace is the course-measurement cache shared with `/gpx/analyze`: a derived profile keyed by the file's hash, 64 entries, no file and no names.
- **It is the same computation** as a published race: `_scored_rows` in `api/app.py` serves both the stored leaderboard and this call.
- **Abuse:** 10 calls a minute per address, 20 MB per request, 50,000 rows; nginx adds its own per-address budget.

## Open to any origin

`/score`, `/gpx/analyze` and `/scoring/models` answer every origin with `Access-Control-Allow-Origin: *` and no credentials (`_open_cors` in `api/app.py`). They carry no session and keep nothing, so there is nothing for a hostile page to reach. Every other route stays on the `OTRI_API_ALLOWED_ORIGINS` allow-list, and OTRI's own pages keep their credentialed answer on the open routes too.

## The embedded calculator

`prototype/embed/` is a fourth build entry: the score calculator without the site around it, for an `<iframe>`. `?race=<race_id>` opens a race published on OTRI, `?gpx=<share_id>` a course shared from the calculator, `&t=` a target time. The frame posts its content height to the host page (`{type: 'otri:height', height}`) and nothing else. The snippet is on the `#api` page.

## What this means for what is already built

Nothing is removed by this decision; the emphasis moves.

- **Listings and the calendar** stay a convenience for finding a race's course, not a catalogue OTRI promises to keep complete. Bulk-importing another organization's race database is outside this direction and outside the handbook's rule against mirroring proprietary databases; listings should come from organizers, from runners' suggestions and from a small hand-checked set.
- **Claims** still pass an admin, because handing a public listing to the wrong person is worse than a delay. The fewer unclaimed listings there are, the less this matters: an organizer who creates their own event needs no approval at all.
- **The runner index** stays labelled provisional and is not promoted. It is a view over published races, not a ranking OTRI stands behind as official.
- **Organizer verification** stays an internal flag against abuse, not a badge of approval.

## Next

1. Score my race: keep the result open in the page across a reload (browser storage only), and a printable result sheet.
2. A column-mapping step for results files whose headers are not recognised, instead of an error.
3. `POST /score` with several distances in one call (one file per distance).
4. A self-service claim that needs no admin, by proving control of the race's domain.
5. API terms: attribution, fair use, and a stability policy once the contract is 1.0.
