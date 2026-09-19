# Data workspace

`raw/` is reserved for legitimately obtained source data that may be stored under its applicable license.

`processed/` is reserved for derived datasets and reproducible intermediate outputs.

`schemas/` contains versioned machine-readable data schemas.

`demo/` and `calibration/` contain synthetic (fictional) races/results/GPX for prototype demos and scoring-model calibration testing, respectively — see each folder's own README for why real race data isn't used there.

Do not commit secrets, private athlete data, or third-party data that cannot legally be redistributed.

## Demo data (`demo/`)

All data in this directory is fictional and exists only for development/testing.

The XLSX result file intentionally follows an organizer-style result layout with:

`Ranking, Time, Family name, First Name, Gender, Birthdate, Nationality, Bib Number, City, Team`

The synthetic dataset includes runners who appear in multiple races. This is intentional: repeated-runner links will later let us test course calibration and field-strength methods.

No real race or athlete results are represented here.
