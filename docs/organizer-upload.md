# OTRI Organizer Upload Specification

## Goal

The organizer workflow should feel familiar to race organizers already working with established trail-result systems.

OTRI accepts a standardized race result file and calculates OTRI scores after validation. Organizers do **not** submit OTRI scores.

## Workflow

```text
Organizer account
      ↓
Create event
      ↓
Add race/course
      ↓
Enter race metadata
      ↓
Upload XLSX or CSV results
      ↓
Automatic validation
      ↓
Fix errors / review warnings
      ↓
Submit official results
      ↓
OTRI processing
      ↓
Results + OTRI scores published
```

## Race metadata

A race submission should contain:

- event name;
- race name;
- event date;
- country;
- location;
- distance in km;
- positive elevation gain in metres;
- negative elevation loss where available;
- start location;
- finish location;
- course version;
- GPX file where available;
- organizer identity;
- timing/result provider where applicable.

## Result file

Upload the export you already have: from your timing company, or the sheet you send to ITRA or UTMB. One file per race distance (CSV, TSV or XLSX; the old `.xls` must be saved as `.xlsx` first), one row per participant.

**Only a finish time and a name are needed.** Everything else is read where the file has it, and what OTRI did with your file is shown after every upload ("How your file was read": the column each field came from, and the columns left alone).

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

**What stops an upload** is only what a score cannot be made without: a finisher with no readable time, a runner with no name, no time or name column at all, or several race distances in one file. Everything else odd about the file (a position given twice with different times, a time faster than the position ranked before it, the same bib twice, an unknown country) is a warning for you to judge; the score always uses the time.

If OTRI picks the wrong column of your export, or does not recognise one, open an issue with the column names: adding them is a one-line change in `ingestion/schema.py`.

A file whose `Race` / `Distance` / `Event` column holds more than one value is rejected: results for a 50K and a 30K must be uploaded to their own race distances, because each is scored against its own course.

The format deliberately resembles the result spreadsheets organizers already produce for other services. OTRI does not copy any other organization's database or scoring system; the compatibility is limited to a practical file-ingestion format.

## DNF and DNS

For a DNF, either of these works:

```text
Rank = DNF          Time = blank
Rank = blank        Status = DNF   (or "Did not finish", "Abandon")
```

DNS participants should not appear in the official finisher-results table. If OTRI later accepts start-list data, DNS records may be stored separately for participation statistics.

## Validation

Validation should distinguish:

### Errors

The file cannot be submitted until fixed.

Examples:

- missing participant name;
- invalid finish time;
- malformed gender value;
- duplicate result row;
- impossible ranking;
- invalid date.

### Warnings

The organizer may submit after reviewing them.

Examples:

- missing nationality;
- missing bib number;
- unusually fast/slow time;
- unusual duplicate name;
- missing GPX.

## External IDs

OTRI should never require an external organization's athlete ID. Organizer files may contain external IDs in future versions, but they are stored as external references rather than used as OTRI's internal identity.

OTRI creates its own internal identifiers:

- `otri_athlete_id`
- `otri_event_id`
- `otri_race_id`
- `otri_course_id`
- `otri_result_id`

## Important rule

**Organizer data in → OTRI calculation out.**

The organizer cannot manually enter or edit an OTRI score.
