"""Pace watch: who is late against their own pace, and who arrives next at each station.

A cut-off says when the slowest runner may still pass. This says when *this* runner should have
passed: from the pace they have run so far (or the field's median pace before their first
split), the next checkpoint's distance gives an expected arrival, and a runner well past it is
listed first, for the sweeper and the radio. The same arithmetic gives every station the next
runners to expect, which is what a volunteer with a cup of water wants to know.

Nothing leaves the server; the panel is on the race-day page.
"""

from __future__ import annotations

from datetime import timedelta
from statistics import median

from . import ConfigField, Plugin, PluginContext


def _minutes(seconds: float) -> str:
    minutes = int(round(abs(seconds) / 60))
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60}h{minutes % 60:02d}"


class PaceWatch(Plugin):
    key = "pace_watch"
    name = "Pace watch"
    description = "Runners late against their own pace, before any cut-off says so, and the next arrivals expected at each station."
    data_note = "Stays on OTRI's server; shown only on this race's race-day page."
    events = ()
    fields = (
        ConfigField("tolerance", "Minutes late before a runner is listed", type="number", default=30, help="Past the arrival their own pace predicts."),
        ConfigField("eta", "Show the next arrivals at each station", type="bool", default=True),
    )

    def validate(self, config: dict) -> dict:
        cleaned = super().validate(config)
        cleaned["tolerance"] = float(min(600, max(5, cleaned.get("tolerance") or 30)))
        return cleaned

    def panel(self, ctx: PluginContext) -> dict | None:
        board = ctx.board()
        if not board or board.get("status") != "live":
            return {"title": "Pace watch", "lines": [], "empty": "Predictions start with the gun."}
        now = board["now"]
        laps = board.get("laps") or 1
        course = ctx.race.get("distance_km") or 0
        distance = {c["checkpoint_id"]: c.get("distance_km") for c in board["checkpoints"]}
        names = {c["checkpoint_id"]: c["name"] for c in board["checkpoints"]}

        def where(split: dict) -> float | None:
            d = distance.get(split["checkpoint_id"])
            if d is None:
                return None
            return d + (split.get("lap", 1) - 1) * course if laps > 1 else d

        # Seconds per km of everyone with a split and a distance: the field's pace for runners
        # who have none of their own yet.
        paces = []
        for row in board["participants"]:
            last = row.get("last")
            if last and last.get("elapsed_seconds") and (d := where(last)):
                paces.append(last["elapsed_seconds"] / d)
        field_pace = median(paces) if paces else None

        late: list[tuple[float, str]] = []
        arrivals: dict[str, list[tuple[float, str]]] = {}
        for row in board["participants"]:
            if row["status"] != "started" or not row.get("next_checkpoint"):
                continue
            nxt = row["next_checkpoint"]
            if nxt.get("kind") == "start":
                # Nobody is predicted at the start line: the first station after it is the target.
                after = [c for c in board["checkpoints"] if c["position"] > nxt["position"]]
                if not after:
                    continue
                nxt = {**after[0], "lap": nxt.get("lap") or 1}
            d_next = distance.get(nxt["checkpoint_id"])
            if d_next is None:
                continue
            d_next += ((nxt.get("lap") or 1) - 1) * course if laps > 1 else 0
            last = row.get("last")
            if last and last.get("elapsed_seconds") and (d_last := where(last)):
                pace = last["elapsed_seconds"] / d_last
                from_when = last["recorded_at"]
                from_km = d_last
            else:
                pace = field_pace
                from_when = row.get("start_at")
                from_km = 0.0
            if pace is None or from_when is None:
                continue
            expected = from_when + timedelta(seconds=pace * max(0.0, d_next - from_km))
            gap = (now - expected).total_seconds()
            who = f"#{row.get('bib') or '?'} {row.get('first_name') or ''} {row.get('family_name') or ''}".strip()
            if gap > ctx.config.get("tolerance", 30) * 60:
                late.append((gap, f"{who}: expected at {names.get(nxt['checkpoint_id'], '?')} {_minutes(gap)} ago by their own pace, not seen"))
            arrivals.setdefault(nxt["checkpoint_id"], []).append((gap, who))

        lines = [text for _, text in sorted(late, key=lambda pair: -pair[0])]
        if ctx.config.get("eta", True):
            for checkpoint in board["checkpoints"]:
                queue = sorted((pair for pair in arrivals.get(checkpoint["checkpoint_id"], []) if pair[0] < 5 * 60), key=lambda pair: -pair[0])[:3]
                if queue:
                    lines.append(f"Next at {checkpoint['name']}: " + ", ".join(f"{who} in {_minutes(-gap)}" if gap < 0 else f"{who} any moment" for gap, who in queue))
        return {"title": "Pace watch", "lines": lines, "empty": "Nobody is late against their own pace, and no arrivals to predict yet."}
