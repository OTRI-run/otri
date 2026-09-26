"""Age categories: the podiums for the prize giving, by gender and age group.

Age is the runner's age in the race's year (year of the event minus year of birth), which is
how most federations group trail runners; the groups are the organizer's to define. Runners
without a year of birth are listed apart so nobody is left off a podium by an empty cell.

Nothing leaves the server; the panel is on the race-day page and grows as runners finish.
"""

from __future__ import annotations

import re
from datetime import date

from . import ConfigError, ConfigField, Plugin, PluginContext
from .webhook import hms

_GROUP = re.compile(r"^\s*(\d{1,3})\s*(?:-\s*(\d{1,3})|\+)\s*$")


def parse_groups(text: str) -> list[tuple[int, int | None, str]]:
    groups = []
    for part in (text or "").split(","):
        part = part.strip()
        if not part:
            continue
        match = _GROUP.match(part)
        if not match:
            raise ConfigError(f"“{part}” is not an age group: write 40-49 or 60+")
        lo = int(match.group(1))
        hi = int(match.group(2)) if match.group(2) else None
        if hi is not None and hi < lo:
            raise ConfigError(f"“{part}” ends before it begins")
        groups.append((lo, hi, part.replace(" ", "")))
    if not groups:
        raise ConfigError("Give at least one age group, e.g. 18-39,40-49,50-59,60+")
    return groups


class Categories(Plugin):
    key = "categories"
    name = "Age categories"
    description = "Podiums by gender and age group for the prize giving, updated as runners finish."
    data_note = "Stays on OTRI's server; shown only on this race's race-day page."
    events = ()
    fields = (
        ConfigField("groups", "Age groups", default="18-39,40-49,50-59,60+", help="Comma-separated, by age in the race's year. 40-49 or 60+."),
        ConfigField("by_gender", "Separate women and men", type="bool", default=True),
        ConfigField("top", "Places per podium", type="number", default=3),
    )

    def validate(self, config: dict) -> dict:
        cleaned = super().validate(config)
        parse_groups(cleaned.get("groups") or "")
        cleaned["top"] = int(min(10, max(1, cleaned.get("top") or 3)))
        return cleaned

    def panel(self, ctx: PluginContext) -> dict | None:
        board = ctx.board()
        if not board:
            return None
        groups = parse_groups(ctx.config.get("groups") or "18-39,40-49,50-59,60+")
        top = int(ctx.config.get("top") or 3)
        by_gender = ctx.config.get("by_gender", True)
        try:
            year = date.fromisoformat(ctx.race.get("event_date")).year
        except (TypeError, ValueError):
            year = date.today().year
        finishers = [r for r in board["participants"] if r["status"] == "finished" and r.get("finish_seconds") is not None]
        finishers.sort(key=lambda r: r["finish_seconds"])
        podiums: dict[tuple[str, str], list[str]] = {}
        no_year: list[str] = []
        for row in finishers:
            who = f"#{row.get('bib') or '?'} {row.get('first_name') or ''} {row.get('family_name') or ''}".strip()
            gender = (row.get("gender") if by_gender else "all") or "X"
            birth = row.get("birth_year")
            if not birth:
                no_year.append(who)
                continue
            age = year - birth
            group = next((label for lo, hi, label in groups if lo <= age and (hi is None or age <= hi)), None)
            if group is None:
                group = "other"
            key = (gender, group)
            podium = podiums.setdefault(key, [])
            if len(podium) < top:
                podium.append(f"{len(podium) + 1}. {who} {hms(row['finish_seconds'])}")
        lines = []
        order = {label: i for i, (_, _, label) in enumerate(groups)}
        for (gender, group), podium in sorted(podiums.items(), key=lambda item: ({"F": 0, "M": 1, "all": 2}.get(item[0][0], 3), order.get(item[0][1], 99))):
            label = f"{'' if gender == 'all' else gender + ' '}{group}"
            lines.append(f"{label}: " + " · ".join(podium))
        if no_year:
            lines.append("No year of birth, not placed in a group: " + ", ".join(no_year))
        return {"title": "Age categories", "lines": lines, "empty": "Podiums appear as runners finish."}
