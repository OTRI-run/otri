# API

The OTRI public API — events, race distances, scored results, and the organizer workflow, built on `ingestion/`, `scoring/`, and `course/`.

GPX analysis uses a shared, versioned course measurement with a server-generated elevation profile. See [measurement setup and limitations](../course/README.md) and the [research specification](../docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md). New races use Course Standard V0.2; existing scoring versions are retained.

**Persisted in PostgreSQL** (`api/db.py`). Events, race distances (with optional GPX), results, and organizer accounts survive a server restart. Uploaded result files are still always re-validated and re-scored from the raw file before being stored — an organizer can never supply a score directly (`HANDBOOK.md` "Validation and anti-gaming").

## Data model

An **event** (e.g. "Phuket Mountain Trail Weekend") is owned by one organizer and has a name + date. Each event can have one or more **race distances** under it (e.g. "50K", "25K"), each with its own course stats, a selectable **scoring model** (`scoring_version`, see `scoring/README.md` — defaults to the no-competitor "Course Standard" model), and, optionally, an attached GPX file — attaching a GPX recomputes `distance_km`/`elevation_gain_m` from the real parsed course, making the GPX authoritative. Results are submitted per race distance.

Every event/race mutation (create/edit/delete, GPX attach, result submission) requires the requesting organizer to own the event — enforced server-side, 403 otherwise. `GET` endpoints (list/detail races, events, results) stay fully public.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | App status. |
| POST | `/auth/register` | Organizer sign-up: `email`, `password` (10–128 characters, not a common password, not built from the email), `accept_terms` (must be `true`; the acceptance time is stored) and optional `marketing_opt_in`. Creates an **unverified** account and sends a verification email — does **not** return an access token. 400 if the email already has an account, the password is rejected, or the terms are not accepted. Rate-limited. |
| POST | `/auth/login` | Organizer sign-in. Returns an access token. 403 if the email isn't verified yet, 401 on wrong email/password. Rate-limited. |
| POST | `/auth/verify-email` | Confirm an organizer's email using the token from the verification email. 400 if the token is invalid/expired. |
| POST | `/auth/resend-verification` | Resend the verification email. Always returns 200 with the same message whether or not the account exists/is already verified (prevents account enumeration). Rate-limited. |
| POST | `/auth/request-password-reset` | Request a password reset email. Always returns 200 with the same message whether or not the email exists. Rate-limited. |
| POST | `/auth/reset-password` | Set a new password using a reset token, returns a fresh access token. 400 if the token is invalid, expired, or already used. Rate-limited. |
| GET | `/events` | List all events. Pass `?mine=true` with a bearer token to list only events owned by the requesting organizer. |
| GET | `/events/{event_id}` | Event detail including its race distances, 404 if unknown. |
| POST | `/events` | **Requires an organizer bearer token.** Creates an event owned by the caller. 422 if `event_name` is blank. |
| PATCH | `/events/{event_id}` | **Requires ownership.** Partial update of `event_name`/`event_date`. 403 if not the owner, 404 if unknown. |
| DELETE | `/events/{event_id}` | **Requires ownership.** Deletes the event, cascading to its race distances and their results. 403/404 as above. |
| GET | `/races` | Public races: those with published results and listings awaiting them (`listing_status`: `scored`, `upcoming`, `awaiting_results`; `request_count`, `is_listed`, `is_claimed`, `official_url`). `?all=true` (admin) lists every race. |
| POST · DELETE | `/races/{race_id}/listing` | **Requires ownership.** Show the race publicly before it has results, or take the listing down. Results stay behind publishing (`docs/product/race-listings.md`). |
| POST | `/races/{race_id}/score-requests` | Public: a runner asks for a listed race to be scored. Optional `client_id`; counted once per visitor, capped per address, rate limited. 409 once the race is scored. |
| POST | `/admin/listings` · `/admin/listings/import` | **Admin.** Add unowned listings from race facts (JSON, or a CSV with one row per distance). Existing events and distances are skipped and reported. |
| POST | `/admin/events/{event_id}/assign` | **Admin.** Hand an event to an organizer's account (`organizer_email`), or release it with none: how a claimed listing reaches its organizer. |
| GET | `/races/{race_id}` | Race distance detail, 404 if unknown. |
| GET | `/scoring/models` | List every available scoring algorithm (`version`, `name`, `description`, `uses_competitors`) a race distance can be configured to use — see `scoring/README.md`. |
| POST | `/events/{event_id}/races` | **Requires ownership of the event.** Add a race distance. Optional `scoring_version` (defaults to OTRI model 0.1.0, build id `0.9.0-course-standard-domain-gated`), 422 if unknown, if `course_name` is blank, or if distance/elevation are invalid. |
| GET | `/health` | Database reachable, migrations applied, disk not full: `{status: ok|degraded, checks}`; 503 when degraded. |
| POST | `/auth/logout-all` | **Requires auth** + password. Invalidates every token for the account, the caller's included. |
| GET | `/auth/export` | **Requires auth.** JSON download of everything held for the account (profile, consents, events, races, result rows, emails sent). |
| DELETE | `/auth/account` | **Requires auth** + password in the body. Deletes the account with every event, race and result it owns. |
| GET | `/admin/emails?limit=50` | **Admin.** Recent sends with Resend message id, status and error, newest first. |
| GET | `/admin/newsletter` · `/admin/newsletter.csv` | **Admin.** Verified, non-demo organizers who opted in to OTRI news (email, name, organization, country, consent time), as JSON or a CSV download for a mailing tool. |
| PATCH | `/races/{race_id}` | **Requires ownership.** Partial update of `course_name`/`distance_km`/`elevation_gain_m`/`scoring_version`. 422 on an unknown `scoring_version`. |
| DELETE | `/races/{race_id}` | **Requires ownership.** Deletes the race distance, cascading to its results. |
| GET | `/races/{race_id}/measurement` | Saved cleaned profile, measurement version, source and quality status; 404 for legacy GPX attachments without a snapshot. |
| POST | `/races/{race_id}/gpx` | **Requires ownership.** Attach/replace a GPX file for a race distance — recomputes `distance_km`/`elevation_gain_m` from the parsed course. 422 on an unparseable GPX. A race nobody owns (an unclaimed listing) also needs the `course_permission` form field: the licence or the organizer's consent under which OTRI may show the file. |
| GET | `/races/{race_id}/gpx` | Raw GPX content for a race distance (`application/gpx+xml`), 404 if none attached. |
| GET | `/races/{race_id}/results` | Scored results for a race already on file (scored with whichever model the race is configured for), 404 if unknown race or no results submitted yet. |
| POST | `/races/{race_id}/results` | **Requires ownership of the race's event.** Upload a CSV/XLSX result file. Always validates first, then re-scores from the raw file using the race's configured scoring model — **the organizer can never supply a score directly** (`HANDBOOK.md` "Validation and anti-gaming"). A successful submission replaces any previously stored results for that race. Returns `is_valid`, `errors`, `warnings`, and `scores` (empty if invalid). |
| POST | `/gpx/analyze` | Standalone tool (unrelated to stored races): upload a `.gpx` file, optionally with `finish_time_seconds`. Returns parsed course features and, if a time was given, the Course Standard model's predicted score (`scoring.estimator`) — the exact score that finish time will earn once real results are submitted for the same course, since that model has no competitor dependency. 422 if the course has a grade outside the model's supported ±45% domain. See `docs/gpx-predictor.md`. |

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. | `postgresql://postgres:otri_dev_password@localhost:5432/otri` (local dev only) |
| `OTRI_API_JWT_SECRET` | Signs organizer session tokens. **Set this for any real deployment** — see "Authentication" below. | randomly generated per process (warns on startup) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for verification/password-reset emails. | unset — emails are printed to the console instead of sent (safe for local dev) |
| `OTRI_EMAIL_FROM` | "From" address for outgoing emails. | `OTRI <noreply@otri.run>` |
| `OTRI_APP_BASE_URL` | Base URL used to build verification/reset links. | `http://localhost:5173` |
| `OTRI_API_ALLOWED_ORIGINS` | CORS allow-list, comma-separated. | `http://localhost:5173` |

## Authentication

Organizer accounts live in the `organizers` table (PostgreSQL), passwords hashed with `bcrypt`. Every mutating event/race/GPX/result endpoint requires a session: either an `Authorization: Bearer <token>` header (API clients, scripts, tests; the token is in the login response body) or, for the organizer web app, the `otri_session` cookie. The app sends `X-OTRI-Client: web` on every request; login-type endpoints then set an HttpOnly, SameSite=Lax cookie (Secure behind HTTPS) and leave `access_token` empty, so page scripts never hold the token. Cookie-authenticated state-changing requests must carry that header (the CSRF guard; `POST /auth/logout` clears the cookie). **Registering does not log you in** — organizers must verify their email (via the link sent by `/auth/register`) before `/auth/login` will succeed.

**Set `OTRI_API_JWT_SECRET`** for any deployment that should survive a restart:

```powershell
$env:OTRI_API_JWT_SECRET = "<a long random value>"
```

If unset, a random secret is generated per process (logged as a warning) — safe, but every organizer session is invalidated whenever the server restarts. Generate a real one with:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

**Email verification and password reset** are sent via Resend (`api/email.py`). Without `RESEND_API_KEY` set, emails are printed to the console instead — useful for local dev, but you'll need a real key (and a verified sending domain) before real organizers can receive these emails.

There is currently no runner-facing login — race/result/event viewing (`GET` endpoints) stays fully public. Runner accounts (athlete profiles) are future work, not yet scoped.

## CORS

Configurable via `OTRI_API_ALLOWED_ORIGINS` (comma-separated), e.g.:

```powershell
$env:OTRI_API_ALLOWED_ORIGINS = "https://otri.run,https://www.otri.run"
```

Defaults to `http://localhost:5173` (the Vite dev server) if unset.

## Run it locally

1. Install PostgreSQL and create a database (see `docs/operations/` for a production setup guide; for local dev, `createdb otri` after installing PostgreSQL is enough).
2. `pip install -r requirements-dev.txt`
3. `python scripts/seed_demo_data.py` — creates the schema and loads the synthetic demo events/races/results.
4. `uvicorn api.app:app --reload`

Then open `http://127.0.0.1:8000/docs` for interactive Swagger docs (generated automatically by FastAPI).

## Known gaps (intentional, for now)

- Organizer sessions are signed JWTs (12 h, or 30 days with "remember me") carrying the account's `session_version`; a password change, turning 2FA off, "sign out everywhere" (`POST /auth/logout-all`) or deleting the account bumps it and every earlier token fails on the next request. There are no refresh tokens; a session simply expires.
- Rate limits are counted in the `rate_limits` table (`api/rate_limit.py`), so they hold across gunicorn workers and restarts; if the database is unreachable the limiter falls back to an in-process counter rather than switching off. Ten wrong passwords for one account within 15 minutes lock that account for 15 minutes (`login_failures`), whatever the source IP.
- Schema changes: the idempotent baseline in `api/db.py` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) plus numbered one-shot migrations in `api/migrations.py`, recorded in `schema_migrations` and applied on every start and by `python scripts/migrate.py upgrade`; `python scripts/migrate.py status` exits 1 while anything is pending. Older code refuses to start on a database with migrations it does not know.
- Uploads: 20 MB cap enforced before the body is read; GPX parsed with defusedxml (no entity expansion, no external entities, at most 100,000 points); results files at most 50,000 rows; temp files get a plain extension only. `/gpx/analyze` and `/gpx/share` are rate-limited per IP. Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Cache-Control: no-store` on anything personal; nginx adds HSTS and a per-IP request budget. `tests/unit/test_api_security.py` derives the list of routes from the app and fails if a new state-changing route is reachable without a session or an `/admin` route without the admin flag.
- Every email the API asks Resend to send is recorded in `email_log` with the provider's message id and any error (`GET /admin/emails`); `/health` reports the database, pending migrations and free disk (503 when degraded) for the watchdog and uptime checks; setting `SENTRY_DSN` sends unhandled exceptions to Sentry without request bodies or personal data.
- `GET /events`/`GET /races` compute `race_count`/joins with one query per event (N+1) — acceptable at prototype scale, would need optimizing for a large number of events.
- The production model is OTRI model 0.1.0 (`docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`); the API returns its build id `0.9.0-course-standard-domain-gated` as `scoring_version`. Its course-demand engine is grounded in published gradient-cost research (Minetti et al.), but the `Q_500`/`Q_1000` scale anchors (`scoring.course_standard`) are explicit OTRI design choices, not yet validated against real race results.
- Races whose GPX contains a segment grade outside the model's supported ±45% domain fail explicitly (422) rather than being silently approximated — by design (spec section 13), but it means genuinely extreme courses currently can't be scored under Course Standard until reviewed.

These are necessary before any real public deployment and are tracked as future roadmap work, not silently assumed solved.


## Measurement response and optional terrain

`POST /gpx/analyze` adds `measurement` with `version`, `parameters`, `profile` (distanceKm/elevation/segmentId), `source`, `raw_sha256`, `geometry_hash`, `profile_hash`, `coverage_fraction`, `status` and `quality_flags`. Race summaries add `measurement_version` and `measurement_status`. Missing endpoint elevations or missing intervals longer than 30 m return 422; uploads over 20 MB return 413. Short tracks return null for maximum 50 m grades.

The additive startup migration creates `races.measurement JSONB`. GPX attachment saves an immutable measurement snapshot for that attachment; V0.2 scoring reuses it. Existing GPX content is not automatically recalculated. PATCH cannot replace measured totals on a GPX race. The predictor and stored-race scoring agree when they share the same measurement and model version; legacy models intentionally preserve their previous processing.

Sign-in security: passwords must pass `api/security.py`'s policy (10 to 128 characters, not on the common-password list, not built from the email); `remember: true` on login issues a 30-day token instead of 12 hours. Two-factor: `POST /auth/2fa/totp/setup` + `/enable` (authenticator app, RFC 6238) or `POST /auth/2fa/email/start` + `/enable` (emailed codes); both issue ten hashed recovery codes (`POST /auth/2fa/recovery-codes` regenerates, `POST /auth/2fa/disable` turns it off, each with the password). With two-factor on, `POST /auth/login` returns `requires_2fa` and a 10-minute `challenge` to finish with `POST /auth/login/2fa` (5 attempts). `POST /auth/change-password`, `PATCH /auth/profile` and `GET /auth/me` complete the account API.

Publishing: a race's results, course and measurement are private to its organizer until `POST /races/{id}/publish` (needs scored results); `DELETE /races/{id}/publish` hides it again. `GET /races` lists published races only. Accounts in `OTRI_ADMIN_EMAILS` (comma-separated) become admins at sign-in: `GET /admin/overview` reports platform statistics and the API's configuration and security posture (no secrets); `GET /admin/server` reports host load, memory, disk, service states, ufw and fail2ban status (read-only, via `sudo -n … status`), 24-hour API usage parsed from the journal, and TLS expiry; `GET /admin/organizers`, `POST /admin/organizers/{id}/verify` and `DELETE /admin/organizers/{id}` manage accounts; `GET /admin/shared-courses` and `DELETE /admin/shared-courses/{id}` manage calculator share files; `GET /admin/events` lists everything with owners, `GET /races?all=true` lists every race, and admins may unpublish or delete any race. `scripts/seed_demo_data.py` owns the demo races through the flagged `demo@otri.run` account, so the site can label them DEMO DATA.

`POST /gpx/share` stores a calculator upload (with the user's consent) so a share link can reopen it: rate limited per IP, 10 MB per file, gzip on disk under `data/cache/shared-courses/`, and capped in total by `OTRI_SHARED_COURSES_MAX_MB` (default 2048) with oldest-first eviction. `GET /gpx/shared/{id}` serves it back.

Without `OTRI_DEM_MANIFEST`, elevations come from the cleaned uploaded GPX and remain provisional. To enable checksum-pinned local raster terrain correction, follow [course setup](../course/README.md). No remote DEM service or third-party upload is performed by default.
