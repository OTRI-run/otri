# Result files: what OTRI reads

Upload the export you already have: from your timing company, or the sheet you send to other services. One file per race distance (CSV, TSV or XLSX; an old `.xls` must be saved as `.xlsx` first), one row per participant. OTRI calculates every score itself from the times in the file; a file never carries a score.

**Only a finish time and a name are needed.** Everything else is read where the file has it, and what OTRI did with your file is shown after every upload ("How your file was read": the column each field came from, and the columns left alone). The rules live in `ingestion/` (`schema.py` for the columns and their other names, `normalize.py` for what is made of them, `validate.py` for what stops an upload); this page is the reader's version.

## Columns

| Column | Needed | What is accepted | Also recognised as |
|---|---|---|---|
| Time | Yes | `H:MM:SS` (fractional seconds allowed), `MM:SS` for short races, `12h34m56s`, `12h34'56''`, `1d 02:03:04`, a spreadsheet time cell. Blank, `DNF` or `Abandon` for non-finishers | Finish time, Chip time, Net time, Official time, Temps, Zeit, Tiempo, Tempo, Tijd, เวลา |
| Name | Yes | Two columns, or one: `WALMSLEY Jim`, `Walmsley, Jim`, `Jim Walmsley`. A single-word name is accepted | Last name + First name, Family name, Surname, Runner, Athlete, Participant, Nom + Prénom, Name, ชื่อ + นามสกุล |
| Rank | Recommended | Finishing position (`12`, `12.`, `12th`, `12/250`), or `DNF` / `DNS` / `DSQ`. Without it, or when the column turns out to be a category ranking, positions are worked out from the times (equal times share a position). A "Category rank" column is never taken for it | Ranking, Position, Place, Overall, Pos, Clt, Classement, Platz, อันดับ |
| Gender | Recommended | `M`, `F` or `X`; `Male` / `Female`, `H` / `F` and common translations. Otherwise read from a category such as `SEH`, `V1F`, `M40-44`, `F 35-39`, `W35`. Runners with none are scored and left out of the women's and men's rankings | Sex, Sexe, Geschlecht, Category, Cat, Age group, AK, เพศ |
| Status | Optional | `Finisher`, `DNF`, `DNS`, `DSQ` (also "Did not finish", "Abandon", "DQ" …). A row with no time and no position counts as DNF | Result status, Statut |
| Bib | Optional | Race bib as printed; letters allowed | Bib number, Race number, Start number, Dossard, Stnr |
| Nationality | Optional | `FRA`, `FR`, `France`, `Frankreich` or the Olympic `GER`: stored as the ISO 3-letter code | Country, Nat, Pays, Land, สัญชาติ |
| Birthdate / year | Optional | Any date layout or a four-digit year. Only the year is kept. Provide it only if you have the right to | Date of birth, DOB, YOB, Jahrgang |
| City, Team | Optional | Read, not stored | Town, Ville, Club, Verein |

Also absorbed: semicolon- or tab-separated files (a spreadsheet in a European locale), UTF-8, UTF-16 and Windows-1252 text, a title and blank lines above the header, blank and sub-total rows, a unit in a header (`Time (hh:mm:ss)`).

## Non-finishers

For a DNF, either of these works:

```text
Rank = DNF          Time = blank
Rank = blank        Status = DNF   (or "Did not finish", "Abandon")
```

Non-finishers are listed on the race page without a score. Runners who did not start (`DNS`) are read the same way; a results file need not carry them.

## What stops an upload, and what only warns

**Errors** are only what a score cannot be made without: a finisher with no readable time, a runner with no name, no time or name column at all, or several race distances in one file (a `Race` / `Distance` / `Event` column with more than one value: a 50K and a 30K go to their own race distances, because each is scored against its own course).

Everything else odd about the file is a **warning** for you to judge, and the score always uses the time: a position given twice with different times, a time faster than the position ranked before it, the same bib twice, an unknown country, a gender value that is neither `M`, `F` nor `X`. A message repeated on many rows is listed fifteen times and then counted.

If OTRI picks the wrong column of your export, or does not recognise one, [open an issue](https://github.com/OTRI-run/otri/issues/new?template=results-file-not-read.md) with the column names: adding them is a one-line change in `ingestion/schema.py`. The shapes of export this is tested against (an ITRA / UTMB sheet, RaceResult, LiveTrail, a Thai spreadsheet, a bare finisher list) are in `tests/unit/test_ingestion_exports.py`.

## What OTRI never asks for

No other organization's athlete ID, no licence number, no address, no full date of birth (only the year is kept, and only where you have the right to give it). The format deliberately resembles the result sheets organizers already produce for other services; the compatibility ends at the file. OTRI does not copy any other organization's database or scoring system, and its identifiers are its own.
