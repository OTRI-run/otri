"""Finish email: each runner gets their time and splits the moment they cross the line.

Sent to the address the runner gave when registering (or the organizer typed): nothing goes to
anyone else, and a runner without an address is skipped and logged. The email carries their
time, their splits, the link to their own page, and a line from the organizer.
"""

from __future__ import annotations

from .. import email as _email
from . import ConfigField, Plugin, PluginContext, SuiteEvent
from .webhook import hms


class FinishEmail(Plugin):
    key = "finish_email"
    name = "Finish email"
    description = "Email each runner their finish time and splits as they cross the line, with a line from you."
    data_note = "Sends the runner their own time and splits, to the address they gave. Nobody else is emailed."
    events = ("participant.finished",)
    fields = (
        ConfigField("message", "A line from you", type="textarea", help="Thanks, where the photos will be, when the prize giving is."),
        ConfigField("include_splits", "Include the splits", type="bool", default=True),
    )

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:
        participant = ctx.participant((event.participant or {}).get("participant_id", ""))
        if not participant:
            return
        address = (participant.get("email") or "").strip()
        if not address:
            ctx.log("on_event", "skipped", f"#{participant.get('bib') or '?'} {participant.get('first_name', '')} {participant.get('family_name', '')}: no email address")
            return
        race_label = f"{event.race.get('event_name') or ''} {event.race.get('course_name') or ''}".strip()
        finish = hms((event.passing or {}).get("elapsed_seconds"))
        paragraphs = [f"You finished {race_label} in {finish}. Well done."]
        if ctx.config.get("include_splits", True):
            board = ctx.board()
            row = next((r for r in board.get("participants", []) if r["participant_id"] == participant["participant_id"]), None)
            if row and row.get("splits"):
                paragraphs.append("Your splits: " + "; ".join(f"{s['name']} {hms(s['elapsed_seconds'])}" for s in row["splits"] if s.get("elapsed_seconds") is not None) + ".")
        if ctx.config.get("message"):
            paragraphs.append(str(ctx.config["message"]).strip())
        paragraphs.append("Times are provisional until the organizer publishes the results.")
        html, text = _email._render(
            preheader=f"{finish} at {race_label}",
            heading=f"{participant.get('first_name') or 'You'}, you finished in {finish}",
            paragraphs=paragraphs,
            cta=("Your splits", f"{_email.SITE_URL}/organizer/#/bib/{participant['qr_token']}"),
            reason=f"You receive this because you entered {race_label}, timed with OTRI.",
        )
        _email._send(address, f"{race_label}: your time, {finish}", html, text, log_subject="Race suite finish email")
        ctx.log("on_event", "ok", f"#{participant.get('bib') or '?'} {participant.get('first_name', '')} {participant.get('family_name', '')}: emailed")
