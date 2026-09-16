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

The initial organizer-compatible XLSX layout uses one row per participant and the following columns:

| Column | Required | Description |
|---|---|---|
| Ranking | Yes | Finish rank or `DNF` |
| Time | Yes for finishers | Finish time; blank for DNF |
| Family name | Yes | Participant family/surname |
| First Name | Yes | Participant given name |
| Gender | Yes | OTRI normalized gender value |
| Birthdate | Optional | Date of birth if the organizer has the right to provide it |
| Nationality | Optional/Recommended | ISO-style country code |
| Bib Number | Recommended | Race bib |
| City | Optional | City supplied by organizer |
| Team | Optional | Team/club |

The initial format deliberately resembles a widely used organizer-style result spreadsheet layout. OTRI does not copy any other organization's database or scoring system; the compatibility is limited to a practical file-ingestion format.

## DNF and DNS

For a DNF:

```text
Ranking = DNF
Time = blank
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
