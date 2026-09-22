# OTRI Data Policy

OTRI depends on trustworthy, legitimately obtained race-result data. Data provenance is part of the product, not an afterthought.

## Accepted source hierarchy

1. Direct race-organizer submissions.
2. Licensed timing/result providers.
3. Public datasets with an explicit reuse license.
4. Appropriate government/open-data sources.
5. Athlete submissions where rights and privacy requirements permit.
6. Public race-result pages only when the intended collection and reuse are permitted.

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

The fact that a result can be viewed online does not by itself establish permission for bulk extraction or republication.

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

A course file is reduced to positions and elevations before it is stored or served (`course/sanitize.py`); the measurement is identical. This is data minimisation, not a licence: removing a notice from a file does not change who may publish the course, so the permission rules above apply unchanged. What the uploaded file said about its origin (creator, author, copyright holder, licence, links) is kept with the race's private record, together with the SHA-256 of the original upload, so that a licence's attribution terms can be honoured and a dispute can be answered. This applies to a course an organizer attaches to a race. A course shared anonymously from the calculator publishes nothing and belongs to no race, so there is no attribution to honour and no dispute to answer: nothing about its origin is kept, and neither is the name of the file it came from.

## Licensing

Software licensing and dataset licensing are separate. Code may be open-source under a software license while individual race datasets remain under their organizer's terms.

Before publishing a dataset, confirm that OTRI has the right to redistribute it in the proposed form.

## Legal review

OTRI should obtain qualified legal advice before operating internationally at scale, particularly regarding privacy, copyright/database rights, terms of service, data licensing, and trademarks.
