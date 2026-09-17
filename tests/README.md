# Tests

Automated tests are organized by scope:

- `unit/` — isolated logic and calculations
- `integration/` — interactions between components and data pipelines
- `fixtures/` — small synthetic or explicitly redistributable test inputs

Never add private athlete data to test fixtures.

`fixtures/gpx/phuket-trail-2026-pkt15.gpx` is the one exception to "synthetic": it's a real course file (geometry only, no athlete/performance data) used as a regression fixture for the elevation gain/loss algorithm in `course/features.py`, since synthetic fixtures don't reproduce the noise characteristics of real device/DEM elevation data.

## Running tests fast

Most of the suite (`test_course_features.py`, `test_ingestion_validate.py`, all `test_scoring_*.py`) is pure in-memory logic and runs in well under a second total — safe to run after every change to the file(s) you're touching, e.g. `pytest tests/unit/test_scoring_course_demand.py -q`.

`test_api.py` and `test_auth.py` are the slow ones (~100s combined): each test resets the real Postgres test DB and reseeds the demo dataset via `conftest.py`'s `clean_state` fixture (`pytest.mark.usefixtures("clean_state")`, not autouse — only these two modules opt in). Only run these (or the full `pytest tests/unit -q`) when you've actually touched `api/` or `scoring`'s public contract, or as a final check before wrapping up/deploying — not after every small edit.
