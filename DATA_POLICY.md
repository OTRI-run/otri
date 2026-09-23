# OTRI Data Policy

OTRI depends on trustworthy, legitimately obtained race-result data. Data provenance is part of the product, not an afterthought.

## Accepted source hierarchy

1. Direct race-organizer submissions.
2. Licensed timing/result providers.
3. Public datasets with an explicit reuse license.
4. Appropriate government/open-data sources.
5. Athlete submissions where rights and privacy requirements permit.
6. Public race pages: the published course and the published facts of a race (see "Public race facts and course files").

Bulk copying of another organisation's results database or calculated scores is not on this list; see "Restricted data".

## Provenance

Each imported dataset should record, where available:

- source organization;
- source type;
- source URL or reference;
- date received/accessed;
- permission or license;
- importer/version;
- transformations performed;
- validation status.

## Restricted data

Do not scrape, mirror, extract, copy, or redistribute proprietary databases or calculated scores where doing so is prohibited. Do not bypass rate limits, access controls, robots restrictions, authentication, or other technical safeguards.

What stays restricted is the *bulk* copying of a proprietary database and the reuse of another organisation's calculated scores or index values. It is not the facts of a race.

## Public race facts and course files

A race that has been run in public has public facts: its course, its date, its distance and climb, who started, who finished, in what order and in what time. Many sites use a race's published course file, and stating who won a race is stating a fact. OTRI may use and show these facts, and a course file the race has published, without asking first, naming the race and linking the source where one exists. This is how the calculator's well-known courses work (`api/app.py`, admin calculator courses: a name, a course file and a link to where it came from), and it is how OTRI may show a real performance beside the score it would carry, as long as a score OTRI has not computed from the race's own results is labelled illustrative.

What this does not cover: personal data beyond the result itself (contact details, dates of birth, addresses), results that were never public, another organisation's calculated scores or index values, and copying a whole results database. Those follow the source hierarchy and the restrictions above.

## Privacy

Collect the minimum data required to provide the service. Avoid unnecessary publication of email addresses, phone numbers, home addresses, dates of birth, and other sensitive information.

Public athlete records should use the minimum useful fields, such as display name, race, finish time, position, category, and country where appropriate and lawful.

Provide processes for corrections, pseudonymization, and deletion where legally required.

## Organizer submissions

Where possible, obtain explicit written permission or a clear data license from race organizers before importing results at scale.

A typical provenance record may look like:

```yaml
source:
  type: organizer
  organization: Example Trail Race
  received_at: 2026-09-15
  permission: written
  license: OTRI-Data-License-1.0
```

## Corrections

Corrections should preserve an audit trail. Do not silently overwrite historical source files. Store the original source, the correction, who supplied it, when it was accepted, and the resulting dataset version where practical.

## Identity resolution

Athlete identity matching should use the minimum necessary information and should be conservative. False merges can be more damaging than duplicate profiles.

## Race listings

OTRI lists no race on anyone's behalf and keeps no catalogue of races. A race is on OTRI because its organizer put it there: they can show their own race before it has results (the facts and their own course file), and they publish the results when they choose. OTRI-compiled listings, and the course files attached to them, were retired in September 2026 (`docs/product/open-scoring-tool.md`); what they left in the database is not shown publicly and is deleted by an admin.

## Stored course files

A course file is reduced to positions and elevations before it is stored or served (`course/sanitize.py`); the measurement is identical. This is data minimisation. A course a race has published is a public fact of that race ("Public race facts and course files" above). What the uploaded file said about its origin (creator, author, copyright holder, licence, links) is kept with the race's private record, together with the SHA-256 of the original upload, so that a licence's attribution terms can be honoured and a dispute can be answered. This applies to a course an organizer attaches to a race. A course shared anonymously from the calculator publishes nothing and belongs to no race, so there is no attribution to honour and no dispute to answer: nothing about its origin is kept, and neither is the name of the file it came from.

## Licensing

Software licensing and dataset licensing are separate. Code may be open-source under a software license while individual race datasets remain under their organizer's terms.

Before publishing a dataset, confirm that OTRI has the right to redistribute it in the proposed form.

## Legal review

OTRI should obtain qualified legal advice before operating internationally at scale, particularly regarding privacy, copyright/database rights, terms of service, data licensing, and trademarks.
