# API

The OTRI API — scoring calls, events, races, results, organizer accounts and the admin tools — built on `ingestion/`, `scoring/` and `course/`. FastAPI, PostgreSQL, one process behind nginx ([`docs/operations/digitalocean-deployment.md`](../docs/operations/digitalocean-deployment.md)). The generated reference with every field is at `https://api.otri.run/docs`.

Every score is computed here from the raw files: an organizer can never supply a score directly (`HANDBOOK.md`, "Validation and anti-gaming"). The scoring model is OTRI model 0.1.0 ([`docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`](../docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md)); the API returns its build id, `0.10.0-course-standard-vertical`, as `scoring_version` with every score, and a race stores the one it was scored under. Courses are measured by `course/` (`course-measurement-v3`, [`course/README.md`](../course/README.md)) and the measurement is stored with the race, so a result replays byte-for-byte whatever terrain data is configured later.

## Data model

An **event** ("Phuket Mountain Trail Weekend") belongs to one organizer and has a name and a date. Each event has one or more **races** under it ("50K", "25K"), each with its own course figures, an attached GPX (which, once attached, is the authority on distance and climb), a measurement snapshot, and results. Results are uploaded per race, validated (`ingestion/`) and scored from the raw file; a new upload replaces the stored results.

Every mutation of an event or race needs the owning organizer (or an admin); `GET` endpoints are public for what has been published or listed. A race's results, course and measurement are private to its organizer until it is published; a race may be **listed** ahead of results so its page exists, and publishing runs the screening described under "Publishing" below.

## The public contract

Three calls need no account, no key and no approval, answer any origin (CORS `*`, no credentials), and are what OTRI commits to as a tool ([`docs/product/open-scoring-tool.md`](../docs/product/open-scoring-tool.md)). The human-readable version with examples is the site's API page (`#api`).

| Call | Purpose | Limit |
| --- | --- | --- |
| `POST /score` | A results file validated and scored against a course file (GPX, required). JSON, or `?format=csv`. Nothing stored. | 10 a minute, 90 an hour per address |
| `POST /gpx/analyze` | One course measured and, with `finish_time_seconds`, one time scored with its full breakdown. | 60 a minute, 600 an hour per address |
| `GET /scoring/models` | The scoring versions available; pass one to `/score` to pin it. | |

20 MB per request, 50,000 result rows; over a limit answers `429` with `Retry-After`.

Stability, pre-1.0: fields are added, not renamed or removed, on these three calls. A change to how scores are computed is always a new `scoring_version`; an existing version never changes its output (the replay tests in `tests/` hold it to that). Everything else in the API serves OTRI's own pages and may change without notice.

## Endpoints

Generated from `api/app.py` (`grep '@app\.' api/app.py`); the interactive reference at `/docs` has the request and response fields. **Organizer** means a signed-in account (bearer token or session cookie), **owner** the organizer who owns the event or race, or an admin; **admin** an account on `OTRI_ADMIN_EMAILS`.

### Status

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/` | anyone | App status with `started_at` (the last restart). |
| GET | `/health` | anyone | Database reachable, migrations applied, disk not full: `{status: ok\|degraded}`, 503 when degraded; the individual checks are shown to the watchdog on the server and to admins. |
| GET | `/site/status` | anyone | Whether the site is closed for maintenance and what the notice says. Never cached: a closed page polls it. |
| GET | `/docs` | anyone | The generated API reference. |

### Scoring (public)

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/score` | anyone | Validate a results file (`results`, CSV/TSV/XLSX) and score it against `gpx`. Optional `race_name`, `scoring_version`; `?format=csv` downloads the scored list. An invalid results file answers 200 with `is_valid: false` and the issues; an unreadable file or course answers 422. Nothing is stored. |
| POST | `/gpx/analyze` | anyone | Measure an uploaded GPX and, with `finish_time_seconds`, score that time with the full breakdown (`breakdown`, `measurement`, confidence, quality flags). |
| GET | `/scoring/models` | anyone | The scoring versions (`version`, `name`, `description`, `uses_competitors`). |
| POST | `/gpx/share` | anyone | Store a calculator upload, with the uploader's consent, so a share link can reopen it (10 MB, rate-limited per address, capped in total by `OTRI_SHARED_COURSES_MAX_MB`, oldest evicted first). |
| GET | `/gpx/shared/{share_id}` | anyone | The track behind a share link, as sanitized when shared. |

### Races, events, runners

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/races` | anyone | Published races, and races listed ahead of results (`listing_status`: `scored`, `upcoming`, `awaiting_results`); `?all=true` (admin) lists every race. |
| GET | `/races/{race_id}` | anyone / owner | A race's summary: for anyone once published or listed, before that for its owner. |
| GET | `/races/{race_id}/results` | anyone / owner | Scored results; 403 while unpublished for anyone but the owner, 404 when none were uploaded. |
| GET | `/races/{race_id}/gpx` | anyone / owner | The course file, sanitized (`?download=1` names the file). |
| GET | `/races/{race_id}/measurement` | anyone / owner | The stored measurement: profile, version, source, quality status. |
| GET | `/events` | anyone | Every event; `?mine=true` with a session lists the caller's. |
| GET | `/events/{event_id}` | anyone / owner | The event and its races: all of them for the owner, the public ones for anyone. |
| POST | `/events` | organizer | Create an event. An unconfirmed address may hold a few; more needs a confirmed one. |
| PATCH · DELETE | `/events/{event_id}` | owner | Edit the event; delete it with its races and results. |
| POST | `/events/{event_id}/races` | owner | Add a race to the event (`course_name`, figures, optional `scoring_version`). |
| PATCH · DELETE | `/races/{race_id}` | owner | Edit the race's facts (measured totals cannot be overwritten while a GPX is attached); delete it with its results. |
| POST | `/races/{race_id}/gpx` | owner | Attach or replace the course file; measures it and stores the snapshot, recomputing distance and climb. 422 on an unusable file. |
| POST | `/races/{race_id}/results` | owner | Upload the results file: validated, then scored from the raw file with the race's model. Returns `is_valid`, `errors`, `warnings`, `scores`. Replaces earlier results. |
| POST · DELETE | `/races/{race_id}/publish` | owner | Make results, course and measurement public (needs scored results, a confirmed address and `{"attest": true}`); hide them again. See "Publishing". |
| POST · DELETE | `/races/{race_id}/listing` | owner | Show the race publicly before it has results; take the listing down. Needs a confirmed address. |
| GET | `/runners` | anyone | Search runners by name (`q`), or list every runner with a published result, with the runner index. |
| GET | `/runners/{runner_id}` | anyone | A runner's published results and index. |
| POST | `/reports` | anyone | A correction or removal request from a public page (rate-limited; admins are emailed). |
| POST | `/calculator-courses/proposals` | anyone | Propose the course you uploaded for the calculator's "Pick a race": the file plus `event_name`, `course_name`, and optional `year`, `location`, `country`, `source_url`, `email`. Measured and kept for an admin; added on its own after `OTRI_COURSE_AUTO_APPROVE_HOURS`. A track already in the calculator, or already proposed, answers 409 with a pointer to it. Rate-limited. |

### The race suite (admin preview)

Run a small race's day: plan, bibs, stations, board, plugins ([`docs/product/race-suite.md`](../docs/product/race-suite.md)). **Suite** means an admin while the suite is in preview, any organizer on their own races once `OTRI_SUITE_OPEN=1`. Station and bib calls take no session: the key or token in the path is the credential.

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/suite/races` | suite | The caller's races (every race for an admin) with the suite's status and counts. |
| GET | `/suite/races/{race_id}` | suite | One race's suite state, settings and counts. |
| PATCH | `/suite/races/{race_id}/settings` | suite | `timing` (`gun` or `net`), `organizer_phone`, `bib_note`, `bib_show_name`. |
| POST | `/suite/races/{race_id}/start` · `/finish` · `/reopen` · `/reset` | suite | The gun (registered runners go on course; 409 with the readiness blockers, or the warnings until `force`); close the race (runners still out are DNF); back to live; back to planning with every passing deleted. |
| GET · POST | `/suite/races/{race_id}/checkpoints` | suite | The plan in course order; add one (`name`, `kind`: start, checkpoint, aid, finish; `distance_km`, `cutoff_minutes`, services, `supplies`, `notes`, optional `position`). Each carries its `station_key`. |
| POST | `/suite/races/{race_id}/checkpoints/reorder` | suite | `checkpoint_ids` in the new order. |
| PATCH · DELETE | `/suite/checkpoints/{checkpoint_id}` | suite | Edit (`clear_distance`, `clear_cutoff` to empty a number); delete with its passings. |
| POST | `/suite/checkpoints/{checkpoint_id}/rotate-key` | suite | A new station link; the old one stops working. |
| GET · POST | `/suite/races/{race_id}/participants` | suite | The entry list; add one runner. Each carries its `qr_token`. |
| POST | `/suite/races/{race_id}/participants/import` | suite | `text`: pasted CSV/TSV with a header row (columns matched by name in several languages); `replace` empties the list first; `dry_run` reads and cleans without storing and answers the `rows` as they would be stored. Answers what was read, corrected, skipped and ignored. |
| POST | `/suite/races/{race_id}/participants/assign-bibs` | suite | Number the runners (`start`, `prefix`, `only_missing`). |
| PATCH · DELETE | `/suite/participants/{participant_id}` | suite | Edit a runner or set their `status` (registered, dns, started, finished, dnf, dsq); remove them. |
| GET | `/suite/races/{race_id}/board` | suite | The live picture: counts, each checkpoint's throughput, each runner's status, last passing, next checkpoint, overdue flag, splits and finish rank; plugin panels. |
| POST | `/suite/races/{race_id}/passings` | suite | Record a passing by hand (`checkpoint_id`, `participant_id`, optional `recorded_at`). 409 for a double within two minutes. |
| DELETE | `/suite/passings/{passing_id}` | suite | Remove a passing. |
| GET | `/suite/stations/{station_key}` | anyone with the key | What a checkpoint's phone needs: the checkpoint, the race, the server clock, the roster (bib, name, QR token) and who is already through. |
| POST | `/suite/stations/{station_key}/passings` | anyone with the key | A batch (`passings`: `client_id`, one of `qr_token` / `bib` / `participant_id`, `recorded_at`, `source`, `device`); each answers `accepted`, `replayed`, `duplicate` or `unknown`. Idempotent on `client_id`. |
| GET | `/suite/bibs/{qr_token}` | anyone with the token | A runner's own page: first name, bib, status, splits. |
| GET | `/suite/races/{race_id}/profile` | suite | The measured course thinned to a chart: `points` (km, m), `distance_km`, `min_m`, `max_m`, `gain_m`. 404 without a GPX. |
| POST | `/suite/races/{race_id}/checkpoints/suggest` | suite | A plan from the course (`spacing_km`, `min_per_km`, `min_per_100m_climb`); `apply` creates it, `replace` when a plan exists. Preview otherwise. |
| GET | `/suite/public/{race_id}` | anyone | The race, plan, profile, whether the live page is on, and registration (open, places left, fee, questions). 404 unless the live page or registration is on. |
| GET | `/suite/public/{race_id}/live` | anyone | The spectator board: names, bibs, clubs, last seen, laps, finish times. No personal details beyond that. |
| POST | `/suite/public/{race_id}/register` | anyone | Enter the race (`family_name`, `first_name`, `gender`, optional `birth_year`, `nationality`, `club`, `email`, `emergency_contact`, `consent`). Answers the runner's `qr_token` and how to pay (`url`, `reference`, `instructions`). Rate-limited; refuses duplicates and a full race. |
| GET | `/suite/races/{race_id}/readiness` | suite | The checks before the gun: `checks` (key, ok, level blocker/warning/info, label, detail, tab), `blockers`, `warnings`, `ready`. |
| GET | `/suite/races/{race_id}/audit` | suite | Every change made by hand, newest first: at, actor, action, detail. |
| GET | `/suite/races/{race_id}/passings.csv` | suite | Every passing as recorded, for the record. |
| GET | `/suite/plugins` | suite | Every plugin on this server with its settings form. |
| GET | `/suite/races/{race_id}/plugins` | suite | The race's plugin settings (secrets masked). |
| PUT | `/suite/races/{race_id}/plugins/{plugin_key}` | suite | `enabled`, `config`; validated by the plugin, 422 with its sentence. |
| GET | `/suite/races/{race_id}/plugins/{plugin_key}/log` | suite | The plugin's newest 50 log lines. |
| GET | `/suite/races/{race_id}/results.csv` | suite | The finish list as an OTRI results file. |
| POST | `/suite/races/{race_id}/results/submit` | suite | The finish list becomes the race's results, validated and scored like an upload. 409 while live or published. |

### Accounts

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/auth/register` | anyone | `email`, `password` (10–128 characters, not common, not built from the email), `accept_terms` (must be true; the time is stored), optional `marketing_opt_in`. Creates the account, emails a confirmation link and signs the organizer in; `email_verified` is false until the link is opened. 400 when the address already has an account. |
| POST | `/auth/login` | anyone | Sign in; `remember: true` for a 30-day session instead of 12 hours. With two-factor on, answers `requires_2fa` and a `challenge`. |
| POST | `/auth/login/2fa` | anyone | The second step: an authenticator code, an emailed code or a recovery code (five tries per challenge). |
| POST | `/auth/logout` | organizer | Ends this session: clears the cookie and revokes the token. |
| POST | `/auth/logout-all` | organizer | With the password: ends every session of the account. |
| POST | `/auth/verify-email` · `/auth/resend-verification` | anyone | Confirm an address with the emailed token; ask for the email again (always 200, so addresses cannot be enumerated). |
| POST | `/auth/request-password-reset` · `/auth/reset-password` | anyone | Ask for a reset email (always 200); set a new password with its token. A completed reset ends every session of the account. |
| GET | `/auth/me` | organizer | Who the session belongs to: flags, profile, two-factor status. |
| PATCH | `/auth/profile` | organizer | Organization, website, country, bio, news opt-in. |
| POST | `/auth/change-password` | organizer | Changes the password and signs out every other device. |
| POST | `/auth/2fa/totp/setup` · `/auth/2fa/totp/enable` | organizer | Authenticator-app two-factor: a secret to scan, then the code that confirms it. Issues ten recovery codes. |
| POST | `/auth/2fa/email/start` · `/auth/2fa/email/enable` | organizer | Emailed-code two-factor, the same way. |
| POST | `/auth/2fa/recovery-codes` · `/auth/2fa/disable` | organizer | Fresh recovery codes; turn two-factor off. Each needs the password. |
| POST | `/auth/export` | organizer | Everything held for the account, as a JSON download (`PRIVACY.md`, "Your rights"). |
| DELETE | `/auth/account` | organizer | With the password: deletes the account with every event, race and result it owns. |
| GET | `/auth/providers` | anyone | Which outside sign-ins this deployment offers. |
| GET | `/auth/google/start` · `/auth/google/callback` · `/auth/google/confirm-link` · `/auth/google/pending` | anyone | "Continue with Google" (`api/oauth_google.py`), on when `OTRI_GOOGLE_CLIENT_ID` and `OTRI_GOOGLE_CLIENT_SECRET` are set. |
| GET | `/auth/unsubscribe` | anyone | The link in a news email: turns the news off, signs nobody in. |

### Admin

| Method | Path | What |
| --- | --- | --- |
| GET | `/admin/overview` | Platform statistics plus the API's configuration and security posture (no secrets). |
| GET | `/admin/server` | Host load, memory, disk, services, the watchdog's last check, backup age, firewall and fail2ban, 24-hour usage, TLS expiry. Cached 30 s. |
| GET | `/admin/traffic?days=30` | Visits, visitors and what they had in common (`api/analytics.py`: no addresses kept, nothing joins one day to the next). |
| POST | `/admin/site/maintenance` | Close the site for maintenance with a message, or open it again (`{"on": true\|false, "message": "…"}`). See the operations guide. |
| GET | `/admin/events` | Every event with its owner and each race's publish state. |
| GET | `/admin/reviews?status=open\|all` · POST `/admin/reviews/{race_id}` | Races in the publish review; decide with `{"action": "verify"\|"hold"\|"reject", "note"}` (a rejection needs a note, which the organizer receives). |
| GET | `/admin/reports?status=open\|all` · POST `/admin/reports/{id}/resolve` · DELETE `/admin/reports/{id}` | Correction and removal requests. |
| GET | `/admin/organizers` · POST `/admin/organizers/{id}/verify` · DELETE `/admin/organizers/{id}` | Accounts: list, confirm an address by hand, delete with everything it owns (never oneself). |
| DELETE | `/admin/runners/{runner_id}` | Remove a runner's profile and every result attached to it (a removal request, or a bad merge). |
| GET | `/admin/course-proposals?status=pending\|all` · POST `/admin/course-proposals/{id}` · GET `/admin/course-proposals/{id}/gpx` | Courses visitors proposed for the calculator; decide with `{"action": "approve"\|"reject", "note"}` (the proposer is emailed if they left an address); the proposed track for a look on a map. |
| GET · POST | `/admin/calculator-courses` · PATCH · DELETE `/admin/calculator-courses/{race_id}` | The courses hand-picked for the calculator's "Pick a race": a GPX, names, location, source link and the edition (`year`) the file is from. Public to try a target time on, never a race page. |
| GET | `/admin/shared-courses` · DELETE `/admin/shared-courses/{share_id}` | The calculator's share files. |
| GET | `/admin/emails?limit=50` | The last emails asked of Resend, with the provider's id and any error. |
| GET | `/admin/newsletter` · `/admin/newsletter.csv` | Verified organizers who opted in to OTRI news, as JSON or a CSV for a mailing tool. |

`POST /site/hit` (anyone) is the page-view beacon; it answers 204 whatever happens.

## Environment variables

Read once at start (`api/app.py`, `api/auth.py`, `api/db.py`, `api/email.py`, `api/oauth_google.py`, `course/`). `.env.example` at the repository root lists the ones a local run needs; the deploy script writes the production `.env`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. | `postgresql://postgres:otri_dev_password@localhost:5432/otri` (local only) |
| `OTRI_DB_POOL_MAX` | Connections in the pool. | 10 |
| `OTRI_API_JWT_SECRET` | Signs sessions. **Set it** for anything that should survive a restart; unset, a random one is generated per process and every session dies with a restart. | random per process (warns) |
| `OTRI_ADMIN_EMAILS` | Comma-separated addresses that are admins while confirmed and on the list (checked on every request). | none |
| `OTRI_API_ALLOWED_ORIGINS` | CORS allow-list for the site and the organizer app, comma-separated. The three public scoring calls answer any origin regardless. | `http://localhost:5173` |
| `OTRI_APP_BASE_URL` | Where emailed links point (the site). | `http://localhost:5173` |
| `OTRI_API_BASE_URL` | This API's own public address, for Google's redirect and emailed links. Set it behind a proxy. | read from the request |
| `OTRI_SITE_URL` | The public site, for links in emails and pages the API writes. | `https://otri.run` |
| `OTRI_ENV` | The environment label sent with Sentry events. | `production` |
| `RESEND_API_KEY` | [Resend](https://resend.com) key for account emails. Unset, emails are logged, not sent. | unset |
| `OTRI_EMAIL_FROM` · `OTRI_EMAIL_REPLY_TO` | Sender and reply-to of outgoing email. | `OTRI <noreply@otri.run>` · none |
| `OTRI_GOOGLE_CLIENT_ID` · `OTRI_GOOGLE_CLIENT_SECRET` | "Continue with Google". Either empty: the buttons do not appear and the routes answer 404. | unset |
| `OTRI_GITHUB_DISPATCH_TOKEN` · `OTRI_GITHUB_REPO` | Ask GitHub for a site build when a race is published, unpublished or listed, so its page in search is fresh (a fine-grained token with Contents: read and write). Unset, the daily schedule catches up. | unset · `OTRI-run/otri` |
| `OTRI_AUTO_VERIFY_HOURS` | How long a clean published race waits before it is marked verified on its own. | 24 |
| `OTRI_COURSE_AUTO_APPROVE_HOURS` | How long a visitor's proposed calculator course waits for an admin before it is added on its own. | 72 |
| `OTRI_RANKED_RUNNER_CEILING` | How many runners may be ranked in one `/runners` request (every runner with a published result is ranked, so the table really is by index). | 20000 |
| `OTRI_SHARED_COURSES_MAX_MB` | Disk budget for the calculator's share files. | 2048 |
| `OTRI_DEM_MANIFEST` | Manifest of local Copernicus GLO-30 tiles for terrain-corrected elevation ([`course/README.md`](../course/README.md)). Unset, elevations come from the file at Low confidence. | unset |
| `OTRI_DEM_AUTOFETCH` · `OTRI_DEM_BUDGET_MB` · `OTRI_DEM_FETCH_PER_HOUR` | Fetch the tiles a course needs on demand; keep them within a budget; cap fetches an hour. | off · 8192 · 30 |
| `OTRI_BACKUP_DIR` | Where the admin server view looks for the newest backup. | `backups/` under the repository |
| `SENTRY_DSN` | Send unhandled exceptions to Sentry (no request bodies, no personal data). | unset |

The site's own build variables (`VITE_OTRI_API_BASE_URL`, `VITE_SENTRY_DSN`, `VITE_OTRI_MAINTENANCE`) are read by Vite, not the API; see `.github/workflows/pages.yml`.

## Authentication

Organizer accounts live in the `organizers` table, passwords hashed with bcrypt and checked against `api/security.py`'s policy. Every mutating call needs a session: either `Authorization: Bearer <token>` (scripts, tests; the token is in the login body) or, for the web app, the `otri_session` cookie. The app sends `X-OTRI-Client: web` on every request; sign-in endpoints then set an HttpOnly, SameSite=Lax cookie (Secure behind HTTPS) and leave `access_token` empty, so page scripts never hold the token, and cookie-authenticated state-changing requests must carry that header (the CSRF guard).

Sessions are signed JWTs (12 hours, or 30 days with "remember me") carrying the account's `session_version`: a password change, turning two-factor off or on, "sign out everywhere" or deleting the account bumps it and every earlier token fails on the next request. `POST /auth/logout` revokes the token it is called with. There are no refresh tokens; a session simply expires.

Registering signs the organizer in at once, with `email_verified: false`: they can build a race straight away, and publishing, listing, two-factor and admin rights wait for the confirmed address. `/auth/register` says when an address already has an account (the reset and resend endpoints do not); a decision, so that a new organizer is not kept out until the address is confirmed, limited to 5 registrations a minute, 10 an hour and 30 a day per address.

Rate limits are counted in the `rate_limits` table (`api/rate_limit.py`), so they hold across workers and restarts, as sliding windows, with hourly and daily caps on what is cheap per minute and ruinous per day. Locks live in `login_failures`: ten wrong passwords in 15 minutes lock the address they came from out of the account for 15 minutes, fifty from anywhere lock the account; ten wrong second-factor codes pause the second step for an hour and the owner is emailed.

There is no runner-facing login; race, result and runner pages are public once published.

## Publishing

A race's results, course and measurement are private to its organizer until `POST /races/{id}/publish`, which needs scored results, a confirmed address and `{"attest": true}`: the organizer's word that they organize the race and may publish its results. Every publish is screened (`api/screening.py`; [`docs/product/open-scoring-tool.md`](../docs/product/open-scoring-tool.md), "Published, then verified"): a clean race is public at once with `review_status: pending` and verifies itself after `OTRI_AUTO_VERIFY_HOURS`; a race with a strong sign of being invented or copied answers `is_published: false`, `review_status: held`, with `review_flags` for its owner, and waits for an admin. Admins are emailed for every publish and decide under `/admin/reviews`.

`scripts/seed_demo_data.py` owns the demo races through the flagged `demo@otri.run` account, so the site can label them DEMO DATA; they are created unpublished unless `--publish` is given.

## Uploads and hardening

20 MB per request, enforced before the body is read (a chunked body is refused with 411); GPX parsed with defusedxml (no entity expansion, at most 100,000 points); results files at most 50,000 rows. Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a `Referrer-Policy`, and `Cache-Control: no-store` on anything personal; nginx adds HSTS and a per-address request budget. `tests/unit/test_api_security.py` derives the list of routes from the app and fails if a new state-changing route is reachable without a session or an `/admin` route without the admin flag.

Every email the API asks Resend to send is recorded in `email_log` (`GET /admin/emails`); a sign-in code is in the subject of its email and never in the log. Schema changes are the idempotent baseline in `api/db.py` plus numbered one-shot migrations in `api/migrations.py`, applied on every start and by `python scripts/migrate.py upgrade`; older code refuses to start on a database with migrations it does not know.

## Measurement and terrain

`POST /gpx/analyze` and every attached course return a `measurement` with `version`, `parameters`, `profile`, `source`, hashes, `coverage_fraction`, `status` and `quality_flags`; race summaries carry `measurement_version` and `measurement_status`. Missing endpoint elevations or gaps longer than 30 m answer 422. A course is measured at High confidence where its terrain tiles are available and from the file's own elevations at Low confidence elsewhere, with the reason shown; with `OTRI_DEM_AUTOFETCH=1` the tiles a course needs are downloaded the first time (only the tile name is requested; nothing about the course leaves the server). Details in [`course/README.md`](../course/README.md).

## Run it locally

1. Install PostgreSQL and create a database (`createdb otri`).
2. `pip install -r requirements-dev.txt`
3. `python scripts/seed_demo_data.py --publish` — creates the schema and loads the synthetic demo events, races and results (without `--publish` they stay unpublished, as in production).
4. `uvicorn api.app:app --reload`

Then open `http://127.0.0.1:8000/docs`. The tests (`pytest tests/unit -q`) use a separate `otri_test` database that `tests/conftest.py` insists on, so they never touch this one.

## Known limits

- `GET /events` and `GET /races` run one query per event for counts; fine at the present scale.
- The `Q_500`/`Q_1000` scale anchors of the model (`scoring/course_standard.py`) are OTRI design choices, calibrated on record runs, not yet validated against a large body of real race results; the specification says what it does not know.
- Courses with a segment steeper than the model's ±45 % domain are clamped and flagged, never silently approximated.
