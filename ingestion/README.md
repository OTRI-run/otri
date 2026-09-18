# Ingestion

Format-agnostic readers and deterministic validators for organizer race and result files (CSV or XLSX), matching the published contracts in [`data/schemas/`](../data/schemas).

- `reader.py` — reads a CSV or XLSX file into plain row dictionaries, normalizing native spreadsheet dates/times to text.
- `schema.py` — canonical field names, organizer header aliases, required/optional flags, and per-field validation rules. Mirrors `data/schemas/race.schema.json` and `data/schemas/result.schema.json`.
- `validate.py` — `validate_race_file()` and `validate_result_file()`, returning a deterministic `ValidationReport` (errors block ingestion, warnings do not).

One intentional gap between the two layers: the published JSON Schema treats `gender` as a strict `M`/`F`/`X` enum, while the Python validator accepts other values as a **warning**, since real organizer exports are not always pre-cleaned.

`rank` also accepts the non-finisher codes `DNF`, `DNS`, and `DSQ` (and their usual spellings: "Did not finish", "Abandon", "DQ" …) instead of a number, and an optional `status` column may carry the code instead when the rank cell is empty. `finish_time` is only required when `rank` is an actual finishing position; fractional seconds and `MM:SS` are accepted. Gender values such as `Male`/`Female`/`Woman` are normalised to `M`/`F`. Header names follow common timing exports (see the alias lists in `schema.py`), and a file whose race/distance column holds several values is rejected: one file per race distance.

## Usage

```python
from ingestion import validate_race_file, validate_result_file

report = validate_result_file("data/demo/results/OTRI-DEMO-001.csv")
print(report.is_valid, report.errors, report.warnings)
```

Run `pytest tests/unit` from the repository root to exercise these against the demo dataset in [`data/demo/`](../data/demo).
