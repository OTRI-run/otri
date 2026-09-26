"""Split check: the passings that do not add up, for the organizer to look at before the results
go out.

A runner seen at Aid 3 who was never seen at Aid 2 either cut the course or walked past a
volunteer looking the other way; a leg run faster than any human runs it is a wrong bib, a
wrong scan or a lift; a passing stamped before the gun is a phone with the wrong clock. None
of these is decided here: they are listed, with the numbers, and the organizer decides.

Nothing leaves the server; the panel is on the race-day page.
"""

from __future__ import annotations

from . import ConfigField, Plugin, PluginContext
from .webhook import hms


class SplitCheck(Plugin):
    key = "split_check"
    name = "Split check"
    description = "Lists what does not add up: a checkpoint skipped, a leg run impossibly fast, a passing before the gun."
    data_note = "Stays on OTRI's server; shown only on this race's race-day page."
    events = ()
    fields = (ConfigField("fastest", "Fastest believable pace (min/km)", type="number", default=2.5, help="A leg faster than this is listed. World-class trail runners rarely go under 3 on flat ground."),)

    def validate(self, config: dict) -> dict:
        cleaned = super().validate(config)
        cleaned["fastest"] = float(min(10, max(1, cleaned.get("fastest") or 2.5)))
        return cleaned

    def panel(self, ctx: PluginContext) -> dict | None:
        board = ctx.board()
        if not board:
            return None
        fastest = ctx.config.get("fastest", 2.5) * 60  # seconds per km
        ordered = sorted(board["checkpoints"], key=lambda c: c["position"])
        distance = {c["checkpoint_id"]: c.get("distance_km") for c in ordered}
        laps = board.get("laps") or 1
        course = ctx.race.get("distance_km") or 0
        lines: list[str] = []
        for row in board["participants"]:
            splits = row.get("splits") or []
            if not splits:
                continue
            who = f"#{row.get('bib') or '?'} {row.get('first_name') or ''} {row.get('family_name') or ''}".strip()
            # A checkpoint skipped: on each lap, every non-start checkpoint before the furthest one
            # seen should have been seen too.
            for lap in range(1, laps + 1):
                seen = {s["checkpoint_id"] for s in splits if s.get("lap", 1) == lap}
                furthest = max((c["position"] for c in ordered if c["checkpoint_id"] in seen), default=0)
                missed = [c["name"] for c in ordered if c["kind"] != "start" and c["position"] < furthest and c["checkpoint_id"] not in seen]
                if missed:
                    lines.append(f"{who}: not seen at {', '.join(missed)}{f' on lap {lap}' if laps > 1 else ''} but seen further on: a short-cut, or a missed scan")
            # A leg faster than anyone runs.
            for a, b in zip(splits, splits[1:]):
                da, db_ = distance.get(a["checkpoint_id"]), distance.get(b["checkpoint_id"])
                if da is None or db_ is None:
                    continue
                if laps > 1:
                    da += (a.get("lap", 1) - 1) * course
                    db_ += (b.get("lap", 1) - 1) * course
                km = db_ - da
                seconds = (b["recorded_at"] - a["recorded_at"]).total_seconds()
                if km > 0.3 and seconds / km < fastest:
                    lines.append(f"{who}: {a['name']} → {b['name']} in {hms(seconds)} for {km:.1f} km ({seconds / km / 60:.1f} min/km): a wrong bib or scan, or a lift")
                elif km > 0.3 and seconds <= 0:
                    lines.append(f"{who}: {b['name']} stamped before {a['name']}: a phone's clock is wrong")
            # Before the gun.
            start_at = row.get("start_at")
            if start_at is not None:
                early = [s for s in splits if s["kind"] != "start" and s["recorded_at"] < start_at]
                if early:
                    lines.append(f"{who}: seen at {early[0]['name']} before the gun: a phone's clock is wrong, or the gun time is")
        return {"title": "Split check", "lines": lines, "empty": "Every split adds up so far."}
