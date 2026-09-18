# Race listings

**Status:** phase 1 built (listings, requests for scores, admin import, claim by report). Notification emails and a self-service claim flow are not built.

A listing is a race shown on the public races page before anyone has uploaded its results. It exists so runners can find their race, see that it is not scored yet, say they want scores, and nudge the organizer; and so OTRI can see which organizers are worth writing to first.

## What a listing may contain

| | source | rule |
|---|---|---|
| Race facts: name, date, place, country, distance, climb, official website | compiled by an admin, by hand or CSV | Facts, not a copied database. `source_url` records where they were checked. |
| Course file (GPX) | the organizer once they claim the race; or a file under an explicit open licence; or the organizer's written yes | **Never** a file copied from a race website or route-sharing site because it was reachable ([`pre-race-score-calculator.md`](pre-race-score-calculator.md), [`DATA_POLICY.md`](../../DATA_POLICY.md)). On an unclaimed listing the API refuses a course file without `course_permission`, and stores it with the race. |
| Results | the organizer, through the normal upload and publish steps | Unchanged. A listing never shows results. |

A runner's own GPX still works in the calculator for their own estimate; it does not become the listing's course.

## States

`RaceSummary.listing_status`:

| status | meaning |
|---|---|
| `private` | not listed, not published: only the owner and admins see it |
| `upcoming` | listed, no published results, event date in the future |
| `awaiting_results` | listed, no published results, event date today or past |
| `scored` | results published (listed or not) |

`listed_at` makes the race facts, the course and its measurement public. `published_at` still gates results: a claimed listing with uploaded, unpublished results shows no results.

## API

| method | path | who | what |
|---|---|---|---|
| POST | `/admin/listings` | admin | One event with its race distances, unowned and listed. Re-posting the same event (name and date) adds only the distances that are missing. |
| POST | `/admin/listings/import` | admin | The same from a CSV: `event_name,event_date,location,country,website,source_url,course_name,distance_km,elevation_gain_m`, one row per distance. Bad rows are skipped and reported; the rest are imported. |
| POST / DELETE | `/races/{id}/listing` | owner or admin | List a race ahead of its results, or take the listing down. Organizers can list their own upcoming race. |
| POST | `/races/{id}/gpx` (`course_permission` form field) | owner or admin | Required when the race has no owner. |
| POST | `/races/{id}/score-requests` | anyone | "I'd like scores". One per visitor: the key is a salted hash of the address plus the browser's random id, at most 25 per address per race, rate limited. Nothing personal is stored. 409 once the race is scored. |
| POST | `/reports` with `kind: "claim"` | anyone | "I organize this race". Lands in the admin reports queue and is emailed to admins. |
| POST | `/admin/events/{id}/assign` | admin | Hand the event to an organizer account (after checking the claim, e.g. the email's domain against the race website), or release it. |

`GET /races` returns scored races and listings; `request_count`, `is_listed`, `is_claimed` and `official_url` are on every summary.

## Claiming, today

1. The organizer presses "I organize this race" on the listing and leaves an email.
2. An admin checks the claim, asks them to create an organizer account if they have none, and assigns the event (Admin → Events & races → Assign to organizer).
3. The race is now theirs: course, results, publish, as for any race. Corrections to the facts are theirs to make.

## Rules of conduct

- OTRI does not email organizers in bulk. The "Ask your organizer" button gives the runner a message to send themselves; admins write personally to the organizers of the most asked-for races (Admin → Events & races → Most asked for).
- An organizer who asks for a listing to be removed gets it removed (Admin → Unlist, or delete).
- The races page sorts scored races first, so a catalogue of listings does not bury the races that have something to show.

## Not built yet

- "Tell me when it is scored": an optional email on a request, with consent text and a purge rule, and the email sent on publish.
- A self-service claim flow inside the organizer app.
- Listings on runner profiles or the home page.
