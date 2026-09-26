"""Plugins for the race suite: small, optional behaviours an organizer switches on per race.

A plugin is a Python class in a module of this package. Dropping a new module here is the whole
installation: the registry imports every module in the package at start and keeps one instance
of each ``Plugin`` subclass it finds, keyed by ``Plugin.key``.

What a plugin can do:

- **Declare configuration** (``fields``): the suite's UI draws a form from it and ``validate``
  checks what the organizer typed before it is stored (``suite_plugins`` table, one row per
  race and plugin).
- **React to events** (``on_event``): the suite emits ``race.started``, ``race.finished``,
  ``passing.recorded``, ``participant.finished`` and ``participant.dnf`` with a
  :class:`SuiteEvent`. Handlers run off the request thread, after the write that caused them is
  committed, and never block a scan: an exception is logged to ``suite_plugin_log`` and the
  race goes on.
- **Show a panel** (``panel``): a small block of lines on the race-day page, computed on request.

What a plugin cannot do: change a passing or a time. The record of who passed where is the
suite's, and the same record is exported to OTRI scoring; plugins read it, act elsewhere, or
add to the picture around it.

Keep plugins free of secrets in code: a URL, a token, a phone number belong in ``fields`` and
are stored per race, never in the repository.
"""

from __future__ import annotations

import importlib
import logging
import pkgutil
import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

_log = logging.getLogger("otri.suite.plugins")

# Every event name the suite emits. A plugin lists the ones it wants in ``events``; the registry
# refuses a name outside this set so a typo is found at import, not on race day.
EVENTS = ("race.started", "race.finished", "passing.recorded", "participant.finished", "participant.dnf")

# Tests set this so handlers run inline and their effects can be asserted right after the request.
SYNC = False


@dataclass(frozen=True)
class ConfigField:
    """One question in a plugin's settings form."""

    key: str
    label: str
    type: str = "text"  # text | url | number | bool | select | textarea
    required: bool = False
    help: str = ""
    options: tuple[tuple[str, str], ...] = ()  # for select: (value, label)
    default: Any = None
    secret: bool = False  # shown as a password field, never echoed back in full

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "required": self.required,
            "help": self.help,
            "options": [{"value": value, "label": label} for value, label in self.options],
            "default": self.default,
            "secret": self.secret,
        }


@dataclass(frozen=True)
class SuiteEvent:
    """What happened, with everything a handler usually needs already looked up."""

    name: str
    race_id: str
    at: datetime
    race: dict  # race_id, event_name, course_name, event_date, status, started_at
    participant: dict | None = None  # participant_id, bib, family_name, first_name, gender, club, status
    checkpoint: dict | None = None  # checkpoint_id, name, kind, position, distance_km, cutoff_minutes
    passing: dict | None = None  # passing_id, recorded_at, elapsed_seconds, source
    extra: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "event": self.name,
            "race_id": self.race_id,
            "at": self.at.isoformat(),
            "race": self.race,
            "participant": self.participant,
            "checkpoint": self.checkpoint,
            "passing": self.passing,
            **self.extra,
        }


@dataclass
class PluginContext:
    """Handed to every hook: the race, the plugin's stored config and a way to write a log line."""

    race_id: str
    config: dict
    log: Callable[[str, str, str | None], None]  # (hook, status, detail)


class ConfigError(ValueError):
    """A setting the organizer typed that the plugin cannot use; the message is shown as typed."""


class Plugin:
    key: str = ""
    name: str = ""
    description: str = ""
    # A sentence for the organizer with no budget for surprises: what leaves the server, if anything.
    data_note: str = ""
    fields: tuple[ConfigField, ...] = ()
    events: tuple[str, ...] = ()

    def validate(self, config: dict) -> dict:
        """Return the cleaned config to store. The default checks required fields and types."""
        cleaned: dict = {}
        for spec in self.fields:
            raw = config.get(spec.key, spec.default)
            if raw is None or (isinstance(raw, str) and not raw.strip()):
                if spec.required:
                    raise ConfigError(f"{spec.label} is required")
                cleaned[spec.key] = spec.default
                continue
            if spec.type == "bool":
                cleaned[spec.key] = bool(raw)
            elif spec.type == "number":
                try:
                    cleaned[spec.key] = float(raw)
                except (TypeError, ValueError) as error:
                    raise ConfigError(f"{spec.label} must be a number") from error
            elif spec.type == "select":
                allowed = {value for value, _ in spec.options}
                if str(raw) not in allowed:
                    raise ConfigError(f"{spec.label} must be one of {', '.join(sorted(allowed))}")
                cleaned[spec.key] = str(raw)
            elif spec.type == "url":
                value = str(raw).strip()
                if not value.lower().startswith(("https://", "http://")):
                    raise ConfigError(f"{spec.label} must start with https:// or http://")
                cleaned[spec.key] = value[:2000]
            else:
                cleaned[spec.key] = str(raw).strip()[:4000]
        return cleaned

    def on_event(self, ctx: PluginContext, event: SuiteEvent) -> None:  # noqa: B027 - optional hook
        """React to one of ``self.events``. Runs off the request thread."""

    def panel(self, ctx: PluginContext) -> dict | None:
        """A block for the race-day page: ``{"title": str, "lines": [str, ...]}`` or None."""
        return None

    def describe(self) -> dict:
        return {
            "key": self.key,
            "name": self.name,
            "description": self.description,
            "data_note": self.data_note,
            "events": list(self.events),
            "fields": [spec.as_dict() for spec in self.fields],
        }


_REGISTRY: dict[str, Plugin] | None = None
_REGISTRY_LOCK = threading.Lock()


def registry() -> dict[str, Plugin]:
    """Every plugin in this package, keyed by ``key``; imported once."""
    global _REGISTRY
    if _REGISTRY is None:
        with _REGISTRY_LOCK:
            if _REGISTRY is None:
                found: dict[str, Plugin] = {}
                for module_info in pkgutil.iter_modules(__path__):
                    if module_info.name.startswith("_"):
                        continue
                    module = importlib.import_module(f"{__name__}.{module_info.name}")
                    for value in vars(module).values():
                        if isinstance(value, type) and issubclass(value, Plugin) and value is not Plugin and value.__module__ == module.__name__:
                            plugin = value()
                            if not plugin.key:
                                raise RuntimeError(f"plugin {value.__name__} has no key")
                            if plugin.key in found:
                                raise RuntimeError(f"two plugins share the key {plugin.key!r}")
                            unknown = set(plugin.events) - set(EVENTS)
                            if unknown:
                                raise RuntimeError(f"plugin {plugin.key} listens for unknown events: {sorted(unknown)}")
                            found[plugin.key] = plugin
                _REGISTRY = dict(sorted(found.items()))
    return _REGISTRY


def get(key: str) -> Plugin | None:
    return registry().get(key)


def catalogue() -> list[dict]:
    return [plugin.describe() for plugin in registry().values()]


def _run(plugin: Plugin, ctx: PluginContext, event: SuiteEvent) -> None:
    try:
        plugin.on_event(ctx, event)
    except Exception as error:  # noqa: BLE001 - a plugin must never take the race down
        _log.warning("suite plugin %s failed on %s: %s", plugin.key, event.name, error)
        try:
            ctx.log("on_event", "error", f"{event.name}: {error}"[:1000])
        except Exception:  # noqa: BLE001
            _log.exception("could not log the plugin failure")


def dispatch(event: SuiteEvent, enabled: list[tuple[Plugin, PluginContext]]) -> None:
    """Run every enabled plugin that listens for ``event.name``, off the request thread."""
    targets = [(plugin, ctx) for plugin, ctx in enabled if event.name in plugin.events]
    if not targets:
        return

    def work() -> None:
        for plugin, ctx in targets:
            _run(plugin, ctx, event)

    if SYNC:
        work()
    else:
        threading.Thread(target=work, name=f"suite-plugins-{event.name}", daemon=True).start()
