# API

The OTRI public API — races, scored results, and the organizer submission workflow, built on `ingestion/`, `scoring/`, and `course/`.

**Stateless for now.** Races and results are read from `data/demo/` on every request; nothing is persisted to a database. Adding real persistence (PostgreSQL, per `HANDBOOK.md`'s recommended stack) is a separate, future decision — this package establishes the request/response contract first (`HANDBOOK.md`: "start small").

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | App status. |
| GET | `/races` | List all races. |
| GET | `/races/{race_id}` | Race detail, 404 if unknown. |
| GET | `/races/{race_id}/results` | Scored results for a race already on file, 404 if unknown race or no result file. |
| POST | `/races/{race_id}/results` | Organizer submission: upload a CSV/XLSX result file. Always validates first, then re-scores from the raw file — **the organizer can never supply a score directly** (`HANDBOOK.md` "Validation and anti-gaming"). Returns `is_valid`, `errors`, `warnings`, and `scores` (empty if invalid). |

## Run it

```powershell
pip install -r requirements-dev.txt
uvicorn api.app:app --reload
```

Then open `http://127.0.0.1:8000/docs` for interactive Swagger docs (generated automatically by FastAPI).

## Known gaps (intentional, for now)

- No database — every request re-reads and re-validates files from disk.
- No authentication/authorization on the submission endpoint.
- No rate limiting or abuse protection.
- Submitted files are validated/scored in a temp file and then discarded — nothing is saved.

These are necessary before any real public deployment and are tracked as future roadmap work, not silently assumed solved.
