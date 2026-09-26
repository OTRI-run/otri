"""Telegram: race events as messages in a group or channel, from a bot.

The free channel for a race with no budget: Telegram bots cost nothing, a group holds the crew,
a channel holds the families, and neither needs a phone number given out. Make a bot with
@BotFather, add it to the group or channel, paste its token and the chat id here.

Checkpoint passings are sent silently (no notification sound); finishes and the start and the
end of the race ring.
"""

from __future__ import annotations

import httpx

from . import ConfigField, Plugin, PluginContext, SuiteEvent
from .webhook import sentence

TIMEOUT_SECONDS = 6.0


class Telegram(Plugin):
    key = "telegram"
    name = "Telegram"
    description = "Post the gun, every finish and, if you like, every checkpoint passing to a Telegram group or channel through a bot you own."
    data_note = "Sends the runner's bib, name and club, the checkpoint and the time to Telegram's servers, under your bot."
    events = ("race.started", "race.finished", "participant.finished", "participant.dnf", "passing.recorded")
    fields = (
        ConfigField("bot_token", "Bot token", secret=True, required=True, help="From @BotFather. Add the bot to your group, or make it an admin of your channel."),
        ConfigField("chat_id", "Chat id", required=True, help="The group's id (a negative number, e.g. -1001234567890) or the channel's @name."),
        ConfigField(
            "only",
            "Send",
            type="select",
            default="finish",
            options=(("finish", "Finishes, DNFs, the start and the end"), ("all", "Every event, checkpoint passings included")),
        ),
    )

    def validate(self, config: dict) -> dict:
        cleaned = super().validate(config)
        if ":" not in cleaned["bot_token"]:
            from . import ConfigError

            raise ConfigError("Bot token does not look like one from @BotFather (123456:ABC-…)")
        return cleaned

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:
        if event.name == "passing.recorded" and ctx.config.get("only") != "all":
            return
        response = httpx.post(
            f"https://api.telegram.org/bot{ctx.config['bot_token']}/sendMessage",
            json={"chat_id": ctx.config["chat_id"], "text": sentence(event), "disable_notification": event.name == "passing.recorded"},
            timeout=TIMEOUT_SECONDS,
        )
        if response.status_code >= 400:
            ctx.log("on_event", "error", f"{event.name}: Telegram answered {response.status_code}")  # never the token
        else:
            ctx.log("on_event", "ok", f"{event.name}: posted")
