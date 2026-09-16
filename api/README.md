# API

The OTRI public API — events, race distances, scored results, and the organizer workflow, built on `ingestion/`, `scoring/`, and `course/`.

**Persisted in PostgreSQL** (`api/db.py`). Events, race distances (with optional GPX), results, and organizer accounts survive a server restart. Uploaded result files are still always re-validated and re-scored from the raw file before being stored — an organizer can never supply a score directly (`HANDBOOK.md` "Validation and anti-gaming").

## Data model

An **event** (e.g. "Phuket Mountain Trail Weekend") is owned by one organizer and has a name + date. Each event can have one or more **race distances** under it (e.g. "50K", "25K"), each with its own course stats, a selectable **scoring model** (`scoring_version`, see `scoring/README.md` — defaults to the no-competitor "Course Standard" model), and, optionally, an attached GPX file — attaching a GPX recomputes `distance_km`/`elevation_gain_m` from the real parsed course, making the GPX authoritative. Results are submitted per race distance.

Every event/race mutation (create/edit/delete, GPX attach, result submission) requires the requesting organizer to own the event — enforced server-side, 403 otherwise. `GET` endpoints (list/detail races, events, results) stay fully public.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | App status. |
| POST | `/auth/register` | Organizer sign-up (email + password, min. 8 characters). Creates an **unverified** account and sends a verification email — does **not** return an access token. 400 if the email already has an account or the password is too short. Rate-limited. |
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
| GET | `/races` | List all race distances across all events. |
| GET | `/races/{race_id}` | Race distance detail, 404 if unknown. |
| GET | `/scoring/models` | List every available scoring algorithm (`version`, `name`, `description`, `uses_competitors`) a race distance can be configured to use — see `scoring/README.md`. |
| POST | `/events/{event_id}/races` | **Requires ownership of the event.** Add a race distance. Optional `scoring_version` (defaults to the Course Standard model), 422 if unknown, if `course_name` is blank, or if distance/elevation are invalid. |
| PATCH | `/races/{race_id}` | **Requires ownership.** Partial update of `course_name`/`distance_km`/`elevation_gain_m`/`scoring_version`. 422 on an unknown `scoring_version`. |
| DELETE | `/races/{race_id}` | **Requires ownership.** Deletes the race distance, cascading to its results. |
| POST | `/races/{race_id}/gpx` | **Requires ownership.** Attach/replace a GPX file for a race distance — recomputes `distance_km`/`elevation_gain_m` from the parsed course. 422 on an unparseable GPX. |
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

Organizer accounts live in the `organizers` table (PostgreSQL), passwords hashed with `bcrypt`. Every mutating event/race/GPX/result endpoint requires an `Authorization: Bearer <token>` header, obtained from `/auth/login` or `/auth/reset-password` (see `api/auth.py`). **Registering does not log you in** — organizers must verify their email (via the link sent by `/auth/register`) before `/auth/login` will succeed.

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

- Organizer accounts use a hand-rolled JWT scheme, not a battle-tested auth provider (e.g. no refresh tokens — a session just expires after 12h) — fine for a prototype, not for real production use.
- Rate limiting is in-process/in-memory (`api/rate_limit.py`) — correct for a single worker, but not shared across multiple gunicorn/uvicorn worker processes. A real deployment with multiple workers needs a shared store (Redis, per `HANDBOOK.md`'s recommended stack).
- No database migration tool — the schema is created with `CREATE TABLE IF NOT EXISTS` (`api/db.py`), fine while the schema is small and stable, but will need a real migration tool (e.g. Alembic) once it needs to evolve without downtime.
- `GET /events`/`GET /races` compute `race_count`/joins with one query per event (N+1) — acceptable at prototype scale, would need optimizing for a large number of events.
- The Course Standard scoring model implements `docs/methodology/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md`; its course-demand engine is grounded in published gradient-cost research (Minetti et al.), but the `Q_500`/`Q_1000` scale anchors (`scoring.course_standard`) are explicit OTRI design choices, not yet validated against real race results.
- Races whose GPX contains a segment grade outside the model's supported ±45% domain fail explicitly (422) rather than being silently approximated — by design (spec section 13), but it means genuinely extreme courses currently can't be scored under Course Standard until reviewed.

These are necessary before any real public deployment and are tracked as future roadmap work, not silently assumed solved.

