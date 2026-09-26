"""Webhook: every suite event as a JSON POST to a URL of the organizer's choosing.

The universal plugin for a race with no budget: point it at a Zapier, Make or n8n hook, a Google
Apps Script, a Slack or Discord incoming webhook, or your own server, and build the rest there:
a live spreadsheet, an announcer channel, an SMS to the crew when their runner leaves an aid
station. Nothing else needs to be written in OTRI.

Each request carries ``X-OTRI-Event`` and, when a secret is set, ``X-OTRI-Signature``: the
hex HMAC-SHA256 of the raw body under that secret, so the receiver can tell a real event from a
forged one. Failures are logged and not retried: a hook that is down misses events rather than
delaying scans, and the log on the plugins tab says so.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import httpx

from . import ConfigField, Plugin, PluginContext, SuiteEvent

TIMEOUT_SECONDS = 6.0


class Webhook(Plugin):
    key = "webhook"
    name = "Webhook"
    description = "Send every race event (start, finish, each checkpoint passing) as JSON to a URL: Zapier, Make, n8n, Slack, Discord, Google Sheets or your own server."
    data_note = "Sends the runner's bib, name, gender and club, the checkpoint and the time to the URL you give. Nothing else leaves OTRI."
    events = ("race.started", "race.finished", "passing.recorded", "participant.finished", "participant.dnf")
    fields = (
        ConfigField("url", "Webhook URL", type="url", required=True, help="Where to POST. Use https:// unless you are testing on your own machine."),
        ConfigField("secret", "Signing secret", type="text", secret=True, help="Optional. Each request is signed with HMAC-SHA256 so your receiver can check it came from OTRI."),
        ConfigField(
            "only",
            "Send",
            type="select",
            default="all",
            options=(("all", "Every event"), ("finish", "Finishes and the race start/finish only"), ("passings", "Checkpoint passings only")),
        ),
        ConfigField("format", "Payload shape", type="select", default="otri", options=(("otri", "OTRI event JSON"), ("slack", "Chat message: {\"text\": \"…\"} for Slack and Discord"))),
    )

    def _wanted(self, config: dict, event: SuiteEvent) -> bool:
        only = config.get("only", "all")
        if only == "finish":
            return event.name in ("race.started", "race.finished", "participant.finished")
        if only == "passings":
            return event.name == "passing.recorded"
        return True

    def _body(self, config: dict, event: SuiteEvent) -> dict:
        if config.get("format") == "slack":
            return {"text": sentence(event)}
        return event.as_dict()

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:
        if not self._wanted(ctx.config, event):
            return
        body = json.dumps(self._body(ctx.config, event), separators=(",", ":"), default=str).encode()
        headers = {"Content-Type": "application/json", "X-OTRI-Event": event.name, "User-Agent": "OTRI-suite-webhook/1"}
        secret = (ctx.config.get("secret") or "").encode()
        if secret:
            headers["X-OTRI-Signature"] = hmac.new(secret, body, hashlib.sha256).hexdigest()
        response = httpx.post(ctx.config["url"], content=body, headers=headers, timeout=TIMEOUT_SECONDS, follow_redirects=False)
        if response.status_code >= 400:
            ctx.log("on_event", "error", f"{event.name}: the URL answered {response.status_code}")
        else:
            ctx.log("on_event", "ok", f"{event.name}: sent, answered {response.status_code}")


def hms(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    total = int(round(seconds))
    return f"{total // 3600}:{total % 3600 // 60:02d}:{total % 60:02d}"


def sentence(event: SuiteEvent) -> str:
    """One line a person can read, for a chat channel or a PA announcer."""
    race = f"{event.race.get('event_name') or ''} {event.race.get('course_name') or ''}".strip()
    who = None
    if event.participant:
        p = event.participant
        who = f"#{p.get('bib') or '?'} {p.get('first_name') or ''} {p.get('family_name') or ''}".strip()
        if p.get("club"):
            who += f" ({p['club']})"
    if event.name == "race.started":
        return f"{race}: the race has started."
    if event.name == "race.finished":
        return f"{race}: the race is over."
    if event.name == "participant.finished":
        return f"{who} finished {race} in {hms((event.passing or {}).get('elapsed_seconds'))}."
    if event.name == "participant.dnf":
        return f"{who} did not finish {race}."
    if event.name == "passing.recorded":
        checkpoint = (event.checkpoint or {}).get("name", "a checkpoint")
        return f"{who} reached {checkpoint} at {hms((event.passing or {}).get('elapsed_seconds'))}."
    return f"{race}: {event.name}"
