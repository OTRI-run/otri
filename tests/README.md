# Tests

Automated tests are organized by scope:

- `unit/` — isolated logic and calculations
- `integration/` — interactions between components and data pipelines
- `fixtures/` — small synthetic or explicitly redistributable test inputs

Never add private athlete data to test fixtures.

`fixtures/gpx/phuket-trail-2026-pkt15.gpx` is the one exception to "synthetic": it's a real course file (geometry only, no athlete/performance data) used as a regression fixture for the elevation gain/loss algorithm in `course/features.py`, since synthetic fixtures don't reproduce the noise characteristics of real device/DEM elevation data.
