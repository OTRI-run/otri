# API

The OTRI public API — races, scored results, and the organizer submission workflow, built on `ingestion/`, `scoring/`, and `course/`.

**Persisted in PostgreSQL** (`api/db.py`). Races, results, and organizer accounts survive a server restart. Uploaded result files are still always re-validated and re-scored from the raw file before being stored — an organizer can never supply a score directly (`HANDBOOK.md` "Validation and anti-gaming").

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | App status. |
| POST | `/auth/register` | Organizer sign-up (email + password, min. 8 characters). Returns an access token immediately (auto-login) and sends a verification email. 400 if the email already has an account or the password is too short. Rate-limited. |
| POST | `/auth/login` | Organizer sign-in. Returns an access token. 401 on wrong email/password. Rate-limited. |
| POST | `/auth/verify-email` | Confirm an organizer's email using the token from the verification email. 400 if the token is invalid/expired. |
| POST | `/auth/request-password-reset` | Request a password reset email. Always returns 200 with the same message whether or not the email exists (prevents account enumeration). Rate-limited. |
| POST | `/auth/reset-password` | Set a new password using a reset token, returns a fresh access token. 400 if the token is invalid, expired, or already used. Rate-limited. |
| GET | `/races` | List all races. |
| GET | `/races/{race_id}` | Race detail, 404 if unknown. |
| POST | `/races` | **Requires an organizer bearer token.** Race registration, persisted immediately. 401 without a valid token, 409 if the race ID already exists, 422 if distance/elevation are invalid. |
| GET | `/races/{race_id}/results` | Scored results for a race already on file, 404 if unknown race or no results submitted yet. |
| POST | `/races/{race_id}/results` | **Requires an organizer bearer token.** Upload a CSV/XLSX result file. Always validates first, then re-scores from the raw file — **the organizer can never supply a score directly** (`HANDBOOK.md` "Validation and anti-gaming"). A successful submission replaces any previously stored results for that race. 401 without a valid token. Returns `is_valid`, `errors`, `warnings`, and `scores` (empty if invalid). |
| POST | `/gpx/analyze` | Upload a `.gpx` file, optionally with `finish_time_seconds`. Returns parsed course features and, if a time was given, an **illustrative** score estimate (`scoring.estimator`) — not a calibrated prediction. See `docs/gpx-predictor.md`. |

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

Organizer accounts live in the `organizers` table (PostgreSQL), passwords hashed with `bcrypt`. `POST /races` and `POST /races/{race_id}/results` require an `Authorization: Bearer <token>` header, obtained from `/auth/register`, `/auth/login`, or `/auth/reset-password` (see `api/auth.py`).

**Set `OTRI_API_JWT_SECRET`** for any deployment that should survive a restart:

```powershell
$env:OTRI_API_JWT_SECRET = "<a long random value>"
```

If unset, a random secret is generated per process (logged as a warning) — safe, but every organizer session is invalidated whenever the server restarts. Generate a real one with:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

**Email verification and password reset** are sent via Resend (`api/email.py`). Without `RESEND_API_KEY` set, emails are printed to the console instead — useful for local dev, but you'll need a real key (and a verified sending domain) before real organizers can receive these emails.

There is currently no runner-facing login — race/result viewing (`GET` endpoints) stays fully public. Runner accounts (athlete profiles) are future work, not yet scoped.

## CORS

Configurable via `OTRI_API_ALLOWED_ORIGINS` (comma-separated), e.g.:

```powershell
$env:OTRI_API_ALLOWED_ORIGINS = "https://otri.run,https://www.otri.run"
```

Defaults to `http://localhost:5173` (the Vite dev server) if unset.

## Run it locally

1. Install PostgreSQL and create a database (see `docs/operations/` for a production setup guide; for local dev, `createdb otri` after installing PostgreSQL is enough).
2. `pip install -r requirements-dev.txt`
3. `python scripts/seed_demo_data.py` — creates the schema and loads the synthetic demo races/results.
4. `uvicorn api.app:app --reload`

Then open `http://127.0.0.1:8000/docs` for interactive Swagger docs (generated automatically by FastAPI).

## Known gaps (intentional, for now)

- Organizer accounts use a hand-rolled JWT scheme, not a battle-tested auth provider (e.g. no refresh tokens — a session just expires after 12h) — fine for a prototype, not for real production use.
- Rate limiting is in-process/in-memory (`api/rate_limit.py`) — correct for a single worker, but not shared across multiple gunicorn/uvicorn worker processes. A real deployment with multiple workers needs a shared store (Redis, per `HANDBOOK.md`'s recommended stack).
- No database migration tool — the schema is created with `CREATE TABLE IF NOT EXISTS` (`api/db.py`), fine while the schema is small and stable, but will need a real migration tool (e.g. Alembic) once it needs to evolve without downtime.
- GPX score estimates are illustrative only (average pace across synthetic demo races), not calibrated.

These are necessary before any real public deployment and are tracked as future roadmap work, not silently assumed solved.

