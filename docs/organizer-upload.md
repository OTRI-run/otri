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

One file per race distance (CSV or XLSX), one row per participant. The layout is the one timing companies already export; header names are matched case- and punctuation-insensitively, and the variants below are all recognised. Extra columns (category, age group, splits, chip id) are ignored.

| Column | Required | Description | Also accepted as |
|---|---|---|---|
| Rank | Yes | Finishing position (`12`, `12.`, `12th`), or `DNF` / `DNS` / `DSQ` | Ranking, Position, Place, Overall, Pos |
| Time | Finishers | `H:MM:SS`, fractional seconds allowed; `MM:SS` for short races; blank for non-finishers | Finish time, Net time, Chip time, Official time, Gun time, Result |
| Last name | Yes | Family name | Family name, Surname, Lastname |
| First name | Yes | Given name | Firstname, Given name, Forename |
| Gender | Yes | `M`, `F` or `X`; `Male` / `Female` / `Man` / `Woman` and common translations are normalised | Sex |
| Status | Optional | `Finisher`, `DNF`, `DNS`, `DSQ` (also "Did not finish", "Abandon", "DQ" …). A non-finisher status may replace the rank | Result status |
| Bib | Recommended | Race bib as printed; letters allowed | Bib number, Race number, Start number |
| Nationality | Optional | 3-letter country code | Country, Nat |
| Birthdate | Optional | `YYYY-MM-DD`, only if the organizer has the right to provide it | Date of birth, DOB |
| Year of birth | Optional | Four-digit year, when a full date is not shared | YOB |
| City | Optional | City supplied by organizer | Town |
| Team | Optional | Team or club | Club |

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
