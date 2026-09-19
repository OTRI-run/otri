# API documentation

The API implementation lives in [`api/`](../../api) (FastAPI); [`api/README.md`](../../api/README.md) lists every endpoint and how to run it. The generated reference is the API's own `/docs` (OpenAPI at `/openapi.json`).

## The public contract

Three calls need no account, no key and no approval, answer any origin (CORS `*`, no credentials), and are what OTRI commits to as a tool ([docs/product/open-scoring-tool.md](../product/open-scoring-tool.md)). The human-readable version with examples is the site's API page (`prototype/ApiDocs.jsx`, `#api`).

| Call | Purpose | Limit |
| --- | --- | --- |
| `POST /score` | A results file validated and scored against a course (GPX, or official distance and climb). JSON, or `?format=csv`. Nothing stored. | 10 a minute per address |
| `POST /gpx/analyze` | One course measured and, with `finish_time_seconds`, one time scored with its full breakdown. | 60 a minute per address |
| `GET /scoring/models` | The scoring versions available; pass one to `/score` to pin it. | |

20 MB per request, 50,000 result rows; over the limit answers `429` with `Retry-After`.

## Stability, pre-1.0

- Fields are added, not renamed or removed, on the three calls above.
- A change to how scores are computed is always a new `scoring_version`; an existing version never changes its output (the replay tests in `tests/` hold every released version to that).
- Everything else in the API serves OTRI's own pages and may change without notice.
