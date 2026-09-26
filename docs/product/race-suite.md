# The race suite

**Status:** first increment built 2026-09-26, on the `race-suite` branch. Admin preview: only admin accounts see it (`OTRI_SUITE_OPEN=1` on the API opens it to every organizer on their own races). The scoring tool stays the first door; the suite is what the home page promised as "a trail running suite, coming soon".

## What it is

Everything a small trail race needs to run its day, from one place, on the phones people already have, for nothing:

| Part | What the organizer does | Where |
| --- | --- | --- |
| **Course plan** | Lists the start, checkpoints, aid stations and finish in course order, with distance from the start, a cut-off (minutes after the gun), what is served (water, food, medical, drop bags, crew access), a supplies line for the shopping list and notes for the crew. | Suite → Course plan; `/suite/races/{id}/checkpoints` |
| **Runners and bibs** | Pastes the entry list from any spreadsheet (the columns are matched by name in several languages), or adds runners one by one; assigns bib numbers; prints bibs, two per A4 page, each with a QR code. | Suite → Runners & bibs; `/suite/races/{id}/participants`, `…/import`, `…/assign-bibs` |
| **Stations** | Each checkpoint has a station link (and QR). Opened on a volunteer's phone it becomes that checkpoint's scanner: camera or a typed bib number, with the roster loaded once so it keeps working without signal. Passings are queued on the phone and sent when the network is there; a resend never stores anything twice. | `#/station/{key}`; `/suite/stations/{key}` |
| **Race day** | Presses Start (the gun); watches the board: who is on course, who passed which station, who is overdue against a cut-off, finishers ranked; records a passing by hand from a radio call; finishes the race (whoever is still out is a DNF), reopens if that was early, resets after a rehearsal. | Suite → Race day; `/suite/races/{id}/board`, `…/start`, `…/finish` |
| **Runner's page** | A runner scans their own bib and sees their splits: first name, bib, each checkpoint's time. Nothing about anyone else. | `#/bib/{token}`; `/suite/bibs/{token}` |
| **Results** | Downloads the finish list as an OTRI results file, or sends it to scoring with one press: validated and scored exactly like an upload, replacing the race's stored results. Publishing the race page stays a separate, deliberate step. | Suite → Results; `/suite/races/{id}/results.csv`, `…/results/submit` |
| **Plugins** | Switches on extras per race. Built in: a **webhook** (every event as signed JSON to a URL: Zapier, Make, n8n, Slack, Discord, a Google Apps Script) and an **announcer** (a live list of sentences for the microphone). | Suite → Plugins; `/suite/plugins`, `/suite/races/{id}/plugins/{key}` |

## Design decisions

- **A passing is a fact, not a time.** What is stored is "participant P was seen at checkpoint C at T by device D". Every time shown is computed from those facts and the gun: gun time by default, net time from the runner's own start-line scan when the race asks for it. A second scan of the same runner at the same checkpoint within two minutes is a double scan and is not stored; the earliest passing per checkpoint is the split.
- **Phones are not trusted clocks.** A station page measures the offset between the phone and the server when it loads and stamps every scan with the corrected time; the server keeps its own receipt time beside it and clamps anything from the future to now. It is not chip timing, and the suite does not claim to be: for a village 25K it is well inside what the results need.
- **No account for volunteers or runners.** A station key (128 random bits, in the link) permits recording passings at one checkpoint and nothing else; rotating it kills the old link. A bib's QR token identifies one runner and opens only that runner's own splits. Organizers and admins keep their sessions.
- **Personal data stays where it was given.** An emergency contact and notes never leave the suite: not to plugins, not to the results file, not to the runner's page. The results file carries what OTRI's results files carry (`docs/RESULT-FILES.md`), and the runner's page carries a first name.
- **Plugins cannot change a time.** They listen (`race.started`, `race.finished`, `passing.recorded`, `participant.finished`, `participant.dnf`) and act elsewhere; a failing plugin is logged and the scan is stored all the same. Handlers run off the request thread.
- **Nothing is required.** A race can use the plan alone as a checklist, the bibs alone, or the stations without the plugin tab. The suite leaves the race's existing course and results steps untouched until the organizer sends the finish list.

## Writing a plugin

A plugin is one Python file in `api/suite_plugins/`. The registry imports every module in the package at start and keeps one instance of each `Plugin` subclass, keyed by `key`; that is the whole installation.

```python
from . import ConfigField, Plugin, PluginContext, SuiteEvent

class Sms(Plugin):
    key = "sms"
    name = "SMS to the crew"
    description = "Text a number when a runner leaves the last aid station."
    data_note = "Sends the bib and first name to the SMS provider you configure."
    events = ("passing.recorded",)
    fields = (
        ConfigField("number", "Phone number", required=True),
        ConfigField("api_key", "Provider API key", secret=True, required=True),
    )

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:
        if event.checkpoint["kind"] != "aid":
            return
        ...  # call the provider; raise on failure and the suite logs it
        ctx.log("on_event", "ok", f"texted {ctx.config['number']}")

    def panel(self, ctx: PluginContext) -> dict | None:
        return {"title": "SMS", "lines": ["…"]}  # shown on the race-day page
```

- `fields` draws the settings form in the suite's UI; `validate(config)` (the default checks required fields, numbers, selects and URLs) returns what is stored per race in `suite_plugins`. A `secret` field is shown as a password field and never echoed back; sending the mask back keeps the stored value.
- `on_event` receives a `SuiteEvent`: the name, the race (`race_id`, `event_name`, `course_name`, `event_date`, `status`, `started_at`), and where they apply the participant (`participant_id`, `bib`, `family_name`, `first_name`, `gender`, `club`, `status`), the checkpoint (`checkpoint_id`, `name`, `kind`, `position`, `distance_km`, `cutoff_minutes`) and the passing (`passing_id`, `recorded_at`, `elapsed_seconds`, `source`). `event.as_dict()` is the webhook's JSON.
- `ctx.board()` is the live board (counts, checkpoints with distances and cut-offs, every runner's splits, last passing and next checkpoint), computed when asked; `ctx.race` the race as the events describe it; `ctx.participant(id)` the stored row of a runner, contacts included, for a plugin that writes to the runner and says so in its `data_note`.
- `ctx.log(hook, status, detail)` writes to `suite_plugin_log`, shown under "Show log" on the plugin's card; the newest 500 lines per race and plugin are kept.
- Keep secrets out of code: a URL, a token, a number belong in `fields` and live in the database per race.
- Tests: set `api.suite_plugins.SYNC = True` so handlers run inline (see `tests/unit/test_suite.py`).

The webhook's requests carry `X-OTRI-Event` and, with a secret set, `X-OTRI-Signature` (hex HMAC-SHA256 of the raw body). With "Chat message" as the payload shape the body is `{"text": "…"}`, which Slack and Discord incoming webhooks take as is.

## Storage

Six tables in `api/suite_db.py`, all hanging off `races.race_id` and deleted with the race: `suite_races` (status, gun, settings), `suite_checkpoints` (with the station key), `suite_participants` (with the QR token), `suite_passings` (`UNIQUE (race_id, client_id)` is what makes a resend idempotent), `suite_plugins` (per race and plugin: enabled, config) and `suite_plugin_log`. Created by the idempotent baseline at start; nothing to migrate.

## Limits

5,000 participants per race (`OTRI_SUITE_MAX_PARTICIPANTS`), 60 checkpoints, 500 passings per station batch, 120 station posts a minute per address, 60 station and bib page loads a minute per address.

## Spectators, registration, laps, and the plan from the course

Built on 2026-09-26 as well, all behind the same admin gate:

- **A live page for spectators** (`#/live/{race_id}`, `GET /suite/public/{id}/live`), on only when the organizer ticks "Live page for spectators". Names, bibs, clubs, where each runner was last seen, finishers in order, a search box, the course profile with its stations. No birth years, no contacts, no station keys. Refreshes itself every 15 s while the race is live.
- **Registration with pay-by-link** (`#/register/{race_id}`, `POST /suite/public/{id}/register`). The organizer opens registration, sets the places, the fee as text, their own payment link (Stripe payment link, PayPal.me, PromptPay page) and instructions, and which questions to ask. The runner sees the course, the stations and cut-offs, enters, and gets their private link (the page their bib's QR will open) and how to pay with a reference the organizer can match; a Stripe link gets the reference attached as `client_reference_id`. The organizer marks the fee paid, waived or refunded on the runner list. OTRI moves no money and holds no card data. The same person twice is refused; a full race is refused.
- **Lap courses** (`laps` in the settings). The finish checkpoint is the lap line: each passing there completes a lap, the last one the race, and each intermediate checkpoint's k-th passing belongs to lap k. The board and the live page show laps done; cut-offs apply to the final lap. A double scan is still two scans within two minutes.
- **A plan suggested from the GPX** (`POST /suite/races/{id}/checkpoints/suggest`, the "Suggest a plan" card on the course plan). From the stored measurement: aid stations at the natural places (the lowest point within a kilometre, then the highest), spaced every 6, 9 or 12 km by distance (or as asked), with cut-offs from a slow pace on the flat plus a climbing allowance, rounded to the quarter hour, and a reason for each. Preview first; apply, or replace an existing plan on purpose.
- **Bibs with the course on them.** 190 × 135 mm, two per A4, the race's colour band, the number as large as the paper allows in a monospace, the first name and club, the elevation profile with every station marked and the cut-offs as clock times when a planned start is set, the QR code that opens the runner's own splits, the mandatory-kit line, whom to call if found alone, four corners for the pins. `GET /suite/races/{id}/profile` serves the thinned profile.

## Integrity: nothing added unseen, nothing started unready, nothing changed unrecorded

- **Every field is cleaned, and the correction is said** (`api/suite_fields.py`, and its twin `src/lib/suiteFields.js` in the browser). ALL CAPS and all-lower-case names are re-cased with particles and Mc/O' kept, mixed case is left as somebody's own spelling; "Female", "weiblich", "homme", "W" become F or M; a year of birth is read out of a full date and refused when the age is implausible; "Thailand", "fr" and "GER" become THA, FRA and DEU; "007" and "7" are one bib; emails are lower-cased and checked; "4h30", "4:30" and "90 min" are minutes, "18,5" and "18500 m" are kilometres. In the forms the correction appears under the field the moment it is left; on import it is listed.
- **An import is previewed before it is added.** "Read the list" cleans the sheet and shows it as it would be stored, with the corrections, the rows skipped (no name, the same bib or the same person twice in the sheet) and the rows that clash with the current list. Only then "Add N runners".
- **The plan keeps its rules.** One start, at km 0, without a cut-off; one finish, at the end of the course when no distance is given; nothing beyond the course; a new checkpoint slots in by distance. The readiness check flags distances or cut-offs out of order and a finish away from the course's end.
- **Readiness before the gun** (`GET /suite/races/{id}/readiness`, the checklist on the overview, a dot on every step). Blockers stop the start: no runners, a runner without a bib, not exactly one start and one finish. Warnings stop it until "Start anyway": runners without an emergency contact, fees pending, station links never opened on a phone (each station page reports itself when it loads), no organizer phone on the bibs, registration still open, distances or cut-offs out of order, a finish without a cut-off. Starting over a warning is written to the log with the organizer's name.
- **An integrity log** (`GET /suite/races/{id}/audit`, on the results tab): every change made by hand, with who made it. A passing typed or removed, a status or a fee set, the gun, a finish, a reopen, a reset with how many passings it deleted, an import, results sent to scoring. Scans by the stations are the record itself and are exported whole (`GET /suite/races/{id}/passings.csv`: bib, runner, checkpoint, recorded and received time, source, device, client id).

## The plugins that come with it

| Plugin | What it does | What leaves the server |
| --- | --- | --- |
| **Webhook** | Every event as signed JSON to a URL: Zapier, Make, n8n, a Google Apps Script, your own server; or as a `{"text": …}` chat message for Slack and Discord. | Bib, name, gender, club, checkpoint, time, to the URL you give. |
| **Telegram** | The gun, every finish and DNF (and every passing if asked) posted to a group or channel by a bot you made with @BotFather. Free, and no phone numbers handed out. Passings post silently. | Bib, name, club, checkpoint, time, to Telegram under your bot. |
| **Finish email** | Each runner gets their time, their splits, their own page and a line from you as they cross the line. Runners without an address are skipped and logged. | The runner's own result, to the runner's own address. |
| **Announcer** | A live list of sentences for the microphone: who finished in what time, and every passing if asked. | Nothing. |
| **Pace watch** | Runners late against their own pace, before any cut-off says so (expected arrival from the pace they have run, or the field's median before their first split), and the next arrivals to expect at each station. | Nothing. |
| **Split check** | What does not add up: a checkpoint skipped but a later one passed (a short-cut, or a missed scan), a leg faster than anyone runs (a wrong bib or scan, or a lift), a passing stamped before the gun (a phone's clock). Listed with the numbers; the organizer decides. | Nothing. |
| **Age categories** | Podiums by gender and age group in the race's year, for the prize giving, updating as runners finish; groups are yours to define (40-49, 60+). | Nothing. |

## Rehearsal: run the race before the race

Any race can be run through in five minutes, with the real entry list, a synthetic field, or both (`POST /suite/races/{id}/rehearsal`, the "Rehearse this race" card on the race-day tab). The gun goes; a clock the organizer moves forward (`…/rehearsal/advance`, +15 min, +1 h, or to the end) makes every runner pass every station at a believable pace (a spread around 6 min/km for a 10 km, 9 for a 50 km, two minutes at each aid station, a fixed share dropping out along the way; a seed gives the same race twice), and the passings are recorded as passings, `source = rehearsal`, so the board, the station pages, the live page, every plugin, the finish and the results file behave exactly as on the day. Only "send to scoring" refuses: made-up times never leave. Ending the rehearsal (`DELETE …/rehearsal`, or the ordinary reset) removes every rehearsal passing and every synthetic runner and puts the race back in planning; both ends are in the integrity log. Synthetic runners are marked `registered_via = synthetic` and never mix with the entry list beyond the rehearsal.

Also on paper: **station sheets** (`#/suite/{id}/sheets`, "Print the station sheets" on the plan), one A4 page per checkpoint with the plan, what is served, the supplies, the cut-off as a clock time, the station link's QR, and the roster with blank time columns, so a station keeps working with a dead phone and the times are typed in afterwards.

## Not built yet

GPS tracking, waiting lists and refunds beyond a status, automatic payment confirmation (a webhook from the payment provider could set the status; the webhook plugin goes the other way), category and age-group rankings on the live page (the race page does that from the results file), and printing on anything but paper or Tyvek sheets.
