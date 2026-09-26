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
- `ctx.log(hook, status, detail)` writes to `suite_plugin_log`, shown under "Show log" on the plugin's card; the newest 500 lines per race and plugin are kept.
- Keep secrets out of code: a URL, a token, a number belong in `fields` and live in the database per race.
- Tests: set `api.suite_plugins.SYNC = True` so handlers run inline (see `tests/unit/test_suite.py`).

The webhook's requests carry `X-OTRI-Event` and, with a secret set, `X-OTRI-Signature` (hex HMAC-SHA256 of the raw body). With "Chat message" as the payload shape the body is `{"text": "…"}`, which Slack and Discord incoming webhooks take as is.

## Storage

Six tables in `api/suite_db.py`, all hanging off `races.race_id` and deleted with the race: `suite_races` (status, gun, settings), `suite_checkpoints` (with the station key), `suite_participants` (with the QR token), `suite_passings` (`UNIQUE (race_id, client_id)` is what makes a resend idempotent), `suite_plugins` (per race and plugin: enabled, config) and `suite_plugin_log`. Created by the idempotent baseline at start; nothing to migrate.

## Limits

5,000 participants per race (`OTRI_SUITE_MAX_PARTICIPANTS`), 60 checkpoints, 500 passings per station batch, 120 station posts a minute per address, 60 station and bib page loads a minute per address.

## Not built yet

A public live page for spectators (the board is the organizer's), lap courses (a runner passing the same checkpoint twice is a double scan today), categories and age-group rankings (OTRI's race page does that from the results file), registration and payment (paste the list from wherever you take entries), GPS tracking, and printing on anything but paper or Tyvek sheets. The plan does not yet suggest checkpoints from the race's GPX.
