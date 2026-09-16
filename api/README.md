# API

The OTRI public API — races, scored results, and the organizer submission workflow, built on `ingestion/`, `scoring/`, and `course/`.

**Stateless for now.** Races and results are read from `data/demo/` on every request; nothing is persisted to a database. Adding real persistence (PostgreSQL, per `HANDBOOK.md`'s recommended stack) is a separate, future decision — this package establishes the request/response contract first (`HANDBOOK.md`: "start small").

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | App status. |
| POST | `/auth/register` | Organizer sign-up (email + password, min. 8 characters). Returns an access token immediately (auto-login). 400 if the email already has an account or the password is too short. |
| POST | `/auth/login` | Organizer sign-in. Returns an access token. 401 on wrong email/password. |
| GET | `/races` | List all races. |
| GET | `/races/{race_id}` | Race detail, 404 if unknown. |
| POST | `/races` | **Requires an organizer bearer token.** Race registration. Appends to the demo `races.csv` and re-validates the whole file, rolling back on failure. 401 without a valid token, 409 if the race ID already exists, 422 if the new row fails validation. **Prototype-only persistence** — see "Known gaps". |
| GET | `/races/{race_id}/results` | Scored results for a race already on file, 404 if unknown race or no result file. |
| POST | `/races/{race_id}/results` | **Requires an organizer bearer token.** Upload a CSV/XLSX result file. Always validates first, then re-scores from the raw file — **the organizer can never supply a score directly** (`HANDBOOK.md` "Validation and anti-gaming"). 401 without a valid token. Returns `is_valid`, `errors`, `warnings`, and `scores` (empty if invalid). |
| POST | `/gpx/analyze` | Upload a `.gpx` file, optionally with `finish_time_seconds`. Returns parsed course features and, if a time was given, an **illustrative** score estimate (`scoring.estimator`) — not a calibrated prediction. See `docs/gpx-predictor.md`. |

## Authentication

Organizer accounts are stored in a local SQLite file (`data/organizers.db`, gitignored), passwords hashed with `bcrypt`. `POST /races` and `POST /races/{race_id}/results` require an `Authorization: Bearer <token>` header, obtained from `/auth/register` or `/auth/login` (see `api/auth.py`).

**Set `OTRI_API_JWT_SECRET`** for any deployment that should survive a restart:

```powershell
$env:OTRI_API_JWT_SECRET = "<a long random value>"
```

If unset, a random secret is generated per process (logged as a warning) — safe, but every organizer session is invalidated whenever the server restarts. Generate a real one with:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

There is currently no runner-facing login — race/result viewing (`GET` endpoints) stays fully public. Runner accounts (athlete profiles) are future work, not yet scoped.

## CORS

Configurable via `OTRI_API_ALLOWED_ORIGINS` (comma-separated), e.g.:

```powershell
$env:OTRI_API_ALLOWED_ORIGINS = "https://otri.run,https://www.otri.run"
```

Defaults to `http://localhost:5173` (the Vite dev server) if unset.

## Run it

```powershell
pip install -r requirements-dev.txt
uvicorn api.app:app --reload
```

Then open `http://127.0.0.1:8000/docs` for interactive Swagger docs (generated automatically by FastAPI).

## Known gaps (intentional, for now)

- No database for race/result data — every request re-reads and re-validates files from disk. `POST /races` appends to a CSV file, which is not safe under concurrent writes.
- Organizer accounts use a hand-rolled JWT scheme over SQLite, not a battle-tested auth provider — fine for a prototype, not for real production use.
- No rate limiting or abuse protection (login/register are unthrottled, so brute-forcing is possible).
- No password reset flow, no email verification.
- Submitted result files are validated/scored in a temp file and then discarded — nothing is saved.
- GPX score estimates are illustrative only (average pace across synthetic demo races), not calibrated.

These are necessary before any real public deployment and are tracked as future roadmap work, not silently assumed solved.
