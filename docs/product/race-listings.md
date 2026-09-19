# Race listings

**Status:** reduced on 2026-09-19. OTRI-compiled listings, requests for scores, claims and race suggestions were retired when OTRI became an open scoring tool rather than a catalogue ([open-scoring-tool.md](open-scoring-tool.md)). This page describes what is left.

## An organizer's own listing

An organizer can show their own race publicly before it has results.

| | Path | Who | |
| --- | --- | --- | --- |
| POST | `/races/{id}/listing` | owner, admin | Show the race without results: the facts, and the course once attached. |
| DELETE | `/races/{id}/listing` | owner, admin | Take it down. |

`listed_at` makes the race facts, the course and its measurement public. `published_at` still gates results: a listed race with uploaded, unpublished results shows no results. `listing_status` on every race summary is `scored` once results are published, otherwise `upcoming` or `awaiting_results` by the date, or `private`.

A listed race with a course is what the calculator opens from the race page ("Try a target time on this course") and what the embedded calculator's `?race=` takes.

## The calendar

The races page has a Calendar view (`#races?view=calendar`) of upcoming listed races by month, each with "Add to calendar", and `GET /calendar.ics` is the same as a subscribable feed (`?country=`, `?event=`). Both show only races their organizers listed or published: OTRI adds none itself.

## Leftovers

Rows created by the retired OTRI-compiled listings (events with no owner) stay in the database and are never public (`db.list_races`). An admin deletes them under Admin → Events & races. The columns `events.website`, `events.source_url`, `races.course_permission` and the table `score_requests` are no longer written or read.
