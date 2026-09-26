"""Announcer: a running list of sentences for the person on the microphone.

Nothing leaves the server. Each finish (and, if asked, each checkpoint passing) becomes one line
in the plugin log, and the panel on the race-day page shows the latest ones, newest first:
"#12 Jane Doe (Trail Club) finished Coastal 50K in 5:12:40." Read it out, or copy it into the
race's social feed.
"""

from __future__ import annotations

from . import ConfigField, Plugin, PluginContext, SuiteEvent
from .webhook import sentence


class Announcer(Plugin):
    key = "announcer"
    name = "Announcer"
    description = "A live list of sentences to read out or post: who finished in what time, and if you like every checkpoint passing."
    data_note = "Stays on OTRI's server; shown only on this race's race-day page."
    events = ("participant.finished", "participant.dnf", "passing.recorded", "race.started")
    fields = (
        ConfigField("scope", "Announce", type="select", default="finish", options=(("finish", "Finishes only"), ("all", "Every checkpoint passing"))),
        ConfigField("keep", "Lines to keep on the panel", type="number", default=25, help="Newest first. Between 5 and 100."),
    )

    def validate(self, config: dict) -> dict:
        cleaned = super().validate(config)
        cleaned["keep"] = int(min(100, max(5, cleaned.get("keep") or 25)))
        return cleaned

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:
        if event.name == "passing.recorded":
            if ctx.config.get("scope") != "all":
                return
            if (event.checkpoint or {}).get("kind") == "finish":
                return  # participant.finished says it better
        ctx.log("announce", "line", sentence(event))

    def panel(self, ctx: PluginContext) -> dict | None:
        from .. import suite_db

        keep = int(ctx.config.get("keep") or 25)
        rows = suite_db.plugin_log(ctx.race_id, self.key, status="line", limit=keep)
        return {"title": "Announcer", "lines": [row["detail"] for row in rows if row.get("detail")], "empty": "Nothing to announce yet: lines appear as runners finish."}
