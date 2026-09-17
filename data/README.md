# Data workspace

`raw/` is reserved for legitimately obtained source data that may be stored under its applicable license.

`processed/` is reserved for derived datasets and reproducible intermediate outputs.

`schemas/` contains versioned machine-readable data schemas.

`demo/` and `calibration/` contain synthetic (fictional) races/results/GPX for prototype demos and scoring-model calibration testing, respectively — see each folder's own README for why real race data isn't used there.

Do not commit secrets, private athlete data, or third-party data that cannot legally be redistributed.
