"""The race suite: run a small trail race from one place, on any phone, for nothing.

Plan the course (checkpoints and aid stations with cut-offs and what is served), take the field
(participants, bibs with a QR code each), run the day (a station page per checkpoint that scans
bibs, offline if it has to, and a live board that says who is where), and hand the finish times
to OTRI scoring with one press. Plugins (``api/suite_plugins``) add what a race wants around
that: a webhook to a spreadsheet or a chat channel, an announcer feed, whatever is written next.

Who may use it: while the suite is in preview (``OTRI_SUITE_OPEN`` unset), admins only, on their
own races; ``OTRI_SUITE_OPEN=1`` opens it to every organizer on their own races. Station pages
and a runner's own bib page need no account: a station key or a QR token is the credential.

Mounted by ``api/app.py`` (``app.include_router(suite.router)``); the auth helpers are borrowed
from there at call time to avoid an import cycle.
"""

from __future__ import annotations

import csv
import importlib
import io
import os
import re
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from ingestion import result_records, validate_result_file
from ingestion.normalize import split_name

from . import db, suite_db, suite_fields
from . import suite_plugins as plugins
from .auth import Organizer
from .rate_limit import enforce_rate_limit

router = APIRouter(prefix="/suite", tags=["suite"])

_bearer = HTTPBearer(auto_error=False)

# Preview: admins only. Set OTRI_SUITE_OPEN=1 to let every organizer use it on their own races.
SUITE_OPEN = os.environ.get("OTRI_SUITE_OPEN", "").strip() == "1"

MAX_PARTICIPANTS_PER_RACE = int(os.environ.get("OTRI_SUITE_MAX_PARTICIPANTS", "5000"))
MAX_CHECKPOINTS_PER_RACE = 60
STATION_BATCH_MAX = 500
# A station posts a batch at most this often per address per minute; a phone syncing every few
# seconds is well inside it, a script is not.
STATION_POSTS_PER_MINUTE = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- Access ---------------------------------------------------------------------------------------


def require_suite(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Organizer:
    """A signed-in organizer who may use the suite: any organizer once it is open, admins before."""
    from .app import require_organizer  # at call time: api.app imports this module

    organizer = require_organizer(request, credentials)
    if not SUITE_OPEN and not organizer.is_admin:
        raise HTTPException(status_code=403, detail="The race suite is in preview and open to admins only for now.")
    return organizer


def _race_for(race_id: str, organizer: Organizer) -> db.Race:
    race = db.find_race(race_id)
    if race is None or race.calculator_only:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    if race.organizer_id != organizer.id and not organizer.is_admin:
        raise HTTPException(status_code=403, detail="you do not have permission to run this race")
    return race


def _checkpoint_for(checkpoint_id: str, organizer: Organizer) -> tuple[dict, db.Race]:
    checkpoint = suite_db.find_checkpoint(checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="no checkpoint with that id")
    return checkpoint, _race_for(checkpoint["race_id"], organizer)


def _participant_for(participant_id: str, organizer: Organizer) -> tuple[dict, db.Race]:
    participant = suite_db.find_participant(participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="no participant with that id")
    return participant, _race_for(participant["race_id"], organizer)


# --- Wire shapes ----------------------------------------------------------------------------------


class SuiteSettings(BaseModel):
    # gun: every time counts from the start signal. net: from the runner's own start-line scan when
    # there is one, else from the gun.
    timing: str = Field(default="gun", pattern="^(gun|net)$")
    # Printed on every bib: whom to call if a runner is found alone.
    organizer_phone: str | None = Field(default=None, max_length=40)
    bib_note: str | None = Field(default=None, max_length=120)
    # Bibs printed with the runner's name on them, or the number alone.
    bib_show_name: bool = True
    # The colour band on the bib; the race's own colour if it has one.
    bib_accent: str = Field(default="#0b1220", pattern="^#[0-9a-fA-F]{6}$")
    # Laps: 1 is point to point or one loop. More, and the finish line is the lap line: each
    # passing there completes a lap, the last one the race; cut-offs apply to the final lap.
    laps: int = Field(default=1, ge=1, le=50)
    # "06:00": prints the cut-offs as clock times on the bib and the spectator page.
    planned_start: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    # The spectator page (#/live/{race_id}) is public only when the organizer says so.
    live_public: bool = False
    # Public registration (#/register/{race_id}): a form runners fill in themselves.
    registration_open: bool = False
    registration_limit: int | None = Field(default=None, ge=1, le=MAX_PARTICIPANTS_PER_RACE)
    registration_note: str | None = Field(default=None, max_length=1000)
    # Pay by link: the organizer's own Stripe payment link, PayPal.me, PromptPay page or bank
    # instructions. OTRI moves no money; it records who has paid.
    fee_text: str | None = Field(default=None, max_length=60)
    payment_url: str | None = Field(default=None, max_length=500)
    payment_instructions: str | None = Field(default=None, max_length=1000)
    ask_club: bool = True
    ask_birth_year: bool = True
    ask_nationality: bool = False
    ask_email: bool = True
    require_emergency: bool = True


class SuiteRaceOut(BaseModel):
    race_id: str
    event_id: str
    event_name: str
    course_name: str
    event_date: date
    distance_km: float
    elevation_gain_m: float
    has_gpx: bool
    is_published: bool
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    settings: SuiteSettings
    participants: int
    checkpoints: int
    passings: int


class CheckpointIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = Field(default="checkpoint", pattern="^(start|checkpoint|aid|finish)$")
    distance_km: float | None = Field(default=None, ge=0, le=2000)
    cutoff_minutes: int | None = Field(default=None, ge=0, le=60 * 24 * 14)
    water: bool = False
    food: bool = False
    medical: bool = False
    drop_bag: bool = False
    crew_access: bool = False
    supplies: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    position: int | None = Field(default=None, ge=1, le=MAX_CHECKPOINTS_PER_RACE)


class CheckpointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    kind: str | None = Field(default=None, pattern="^(start|checkpoint|aid|finish)$")
    distance_km: float | None = Field(default=None, ge=0, le=2000)
    cutoff_minutes: int | None = Field(default=None, ge=0, le=60 * 24 * 14)
    water: bool | None = None
    food: bool | None = None
    medical: bool | None = None
    drop_bag: bool | None = None
    crew_access: bool | None = None
    supplies: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    # Explicitly clear the optional numbers: PATCH cannot say "null" and "unchanged" with one field.
    clear_distance: bool = False
    clear_cutoff: bool = False


class CheckpointOut(BaseModel):
    checkpoint_id: str
    race_id: str
    position: int
    name: str
    kind: str
    distance_km: float | None
    cutoff_minutes: int | None
    water: bool
    food: bool
    medical: bool
    drop_bag: bool
    crew_access: bool
    supplies: str | None
    notes: str | None
    station_key: str | None = None


class ReorderIn(BaseModel):
    checkpoint_ids: list[str] = Field(max_length=MAX_CHECKPOINTS_PER_RACE)


_THIS_YEAR = date.today().year


class ParticipantIn(BaseModel):
    bib: str | None = Field(default=None, max_length=12)
    family_name: str = Field(min_length=1, max_length=120)
    first_name: str = Field(default="", max_length=120)
    gender: str = Field(default="X", max_length=10)
    birth_year: int | None = Field(default=None, ge=1900, le=_THIS_YEAR)
    nationality: str | None = Field(default=None, max_length=60)  # a code or a country name; cleaned to ISO alpha-3
    club: str | None = Field(default=None, max_length=120)
    emergency_contact: str | None = Field(default=None, max_length=200)
    status: str = Field(default="registered", pattern="^(registered|dns|started|finished|dnf|dsq)$")
    notes: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=200)
    payment_status: str = Field(default="not_required", pattern="^(not_required|pending|paid|waived|refunded)$")


class ParticipantUpdate(BaseModel):
    bib: str | None = Field(default=None, max_length=12)
    family_name: str | None = Field(default=None, min_length=1, max_length=120)
    first_name: str | None = Field(default=None, max_length=120)
    gender: str | None = Field(default=None, max_length=10)
    birth_year: int | None = Field(default=None, ge=1900, le=_THIS_YEAR)
    nationality: str | None = Field(default=None, max_length=60)  # a code or a country name; cleaned to ISO alpha-3
    club: str | None = Field(default=None, max_length=120)
    emergency_contact: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern="^(registered|dns|started|finished|dnf|dsq)$")
    notes: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=200)
    payment_status: str | None = Field(default=None, pattern="^(not_required|pending|paid|waived|refunded)$")
    clear_bib: bool = False
    clear_birth_year: bool = False


class ParticipantOut(BaseModel):
    participant_id: str
    race_id: str
    bib: str | None
    family_name: str
    first_name: str
    gender: str
    birth_year: int | None
    nationality: str | None
    club: str | None
    emergency_contact: str | None
    status: str
    notes: str | None
    qr_token: str
    email: str | None = None
    payment_status: str = "not_required"
    payment_reference: str | None = None
    registered_via: str = "organizer"


class ImportIn(BaseModel):
    """A pasted or uploaded list: CSV/TSV text with a header row. Recognised columns are matched by
    name in several spellings (bib, last name, first name, name, gender, birth year, nationality,
    club, emergency contact); the rest is ignored and reported."""

    text: str = Field(min_length=1, max_length=2_000_000)
    replace: bool = False
    # Read and clean the sheet, report what would happen, store nothing.
    dry_run: bool = False


class ImportOut(BaseModel):
    added: int
    skipped: list[str]
    columns: dict[str, str]
    ignored_columns: list[str]
    # What the cleaners changed, per row ("row 3, Doe Jane: last name: re-cased from “DOE”").
    corrections: list[str] = []
    # The rows as they would be stored (dry run only), for a preview before anything is added.
    rows: list[dict] = []
    total_rows: int = 0


class AssignBibsIn(BaseModel):
    start: int = Field(default=1, ge=1, le=99999)
    prefix: str = Field(default="", max_length=4)
    only_missing: bool = True


class PassingIn(BaseModel):
    checkpoint_id: str
    participant_id: str
    recorded_at: datetime | None = None


class StationPassingIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=80)
    participant_id: str | None = None
    qr_token: str | None = None
    bib: str | None = Field(default=None, max_length=12)
    recorded_at: datetime
    source: str = Field(default="scan", pattern="^(scan|manual)$")
    device: str | None = Field(default=None, max_length=80)


class StationBatchIn(BaseModel):
    passings: list[StationPassingIn] = Field(max_length=STATION_BATCH_MAX)


class PluginSettingIn(BaseModel):
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


# --- Shaping --------------------------------------------------------------------------------------


def _settings(state: dict | None) -> SuiteSettings:
    raw = (state or {}).get("settings") or {}
    try:
        return SuiteSettings(**{k: v for k, v in raw.items() if k in SuiteSettings.model_fields})
    except ValueError:
        return SuiteSettings()


def _race_out(race: db.Race, state: dict | None, counts: dict | None = None) -> SuiteRaceOut:
    counts = counts or {}
    return SuiteRaceOut(
        race_id=race.race_id,
        event_id=race.event_id,
        event_name=race.event_name or "",
        course_name=race.course_name,
        event_date=race.event_date or date.today(),
        distance_km=race.distance_km,
        elevation_gain_m=race.elevation_gain_m,
        has_gpx=race.has_gpx,
        is_published=race.published_at is not None,
        status=(state or {}).get("status") or "planning",
        started_at=(state or {}).get("started_at"),
        finished_at=(state or {}).get("finished_at"),
        settings=_settings(state),
        participants=counts.get("participants") or 0,
        checkpoints=counts.get("checkpoints") or 0,
        passings=counts.get("passings") or 0,
    )


def _checkpoint_out(row: dict, *, with_key: bool) -> CheckpointOut:
    out = CheckpointOut(**{k: row.get(k) for k in CheckpointOut.model_fields if k != "station_key"})
    if with_key:
        out.station_key = row["station_key"]
    return out


def _participant_out(row: dict) -> ParticipantOut:
    return ParticipantOut(**{k: row.get(k) for k in ParticipantOut.model_fields})


def _race_dict(race: db.Race, state: dict | None) -> dict:
    return {
        "race_id": race.race_id,
        "event_name": race.event_name,
        "course_name": race.course_name,
        "event_date": race.event_date.isoformat() if race.event_date else None,
        "status": (state or {}).get("status") or "planning",
        "started_at": (state or {}).get("started_at").isoformat() if (state or {}).get("started_at") else None,
    }


def _participant_dict(row: dict) -> dict:
    return {k: row.get(k) for k in ("participant_id", "bib", "family_name", "first_name", "gender", "club", "status")}


def _checkpoint_dict(row: dict) -> dict:
    return {k: row.get(k) for k in ("checkpoint_id", "name", "kind", "position", "distance_km", "cutoff_minutes")}


def _checkpoint_public(row: dict) -> dict:
    return {k: row.get(k) for k in ("checkpoint_id", "name", "kind", "position", "distance_km", "cutoff_minutes", "water", "food", "medical", "drop_bag", "crew_access")}


# --- Plugins: dispatch ----------------------------------------------------------------------------


def _enabled_plugins(race_id: str) -> list[tuple[plugins.Plugin, plugins.PluginContext]]:
    out = []
    for key, row in suite_db.list_plugin_settings(race_id).items():
        plugin = plugins.get(key)
        if plugin is None or not row["enabled"]:
            continue
        out.append((plugin, _context(race_id, key, row["config"] or {})))
    return out


def _context(race_id: str, key: str, config: dict) -> plugins.PluginContext:
    def log(hook: str, status: str, detail: str | None) -> None:
        suite_db.write_plugin_log(race_id, key, hook, status, detail)

    return plugins.PluginContext(race_id=race_id, config=config, log=log)


def _emit(name: str, race: db.Race, state: dict | None, *, participant: dict | None = None, checkpoint: dict | None = None, passing: dict | None = None, **extra) -> None:
    enabled = _enabled_plugins(race.race_id)
    if not enabled:
        return
    event = plugins.SuiteEvent(
        name=name,
        race_id=race.race_id,
        at=_now(),
        race=_race_dict(race, state),
        participant=_participant_dict(participant) if participant else None,
        checkpoint=_checkpoint_dict(checkpoint) if checkpoint else None,
        passing=passing,
        extra=extra,
    )
    plugins.dispatch(event, enabled)


# --- Timing ---------------------------------------------------------------------------------------


def _first_passings(passings: list[dict]) -> dict[tuple[str, str], dict]:
    """The earliest passing per (participant, checkpoint): a second scan does not move a time."""
    first: dict[tuple[str, str], dict] = {}
    for row in sorted(passings, key=lambda r: (r["recorded_at"], r["passing_id"])):
        first.setdefault((row["participant_id"], row["checkpoint_id"]), row)
    return first


def _passings_in_order(passings: list[dict]) -> dict[tuple[str, str], list[dict]]:
    """Every passing per (participant, checkpoint), oldest first: on a lap course the k-th is lap k."""
    out: dict[tuple[str, str], list[dict]] = {}
    for row in sorted(passings, key=lambda r: (r["recorded_at"], r["passing_id"])):
        out.setdefault((row["participant_id"], row["checkpoint_id"]), []).append(row)
    return out


def _start_time_for(participant_id: str, state: dict | None, settings: SuiteSettings, start_checkpoint: dict | None, first: dict[tuple[str, str], dict]) -> datetime | None:
    gun = (state or {}).get("started_at")
    if settings.timing == "net" and start_checkpoint is not None:
        own = first.get((participant_id, start_checkpoint["checkpoint_id"]))
        if own is not None:
            return own["recorded_at"]
    return gun


def _elapsed(start: datetime | None, at: datetime) -> float | None:
    if start is None:
        return None
    return max(0.0, (at - start).total_seconds())


def _course_sequence(ordered: list[dict], laps: int) -> list[tuple[int, dict]]:
    """The checkpoints a runner meets, in order, lap by lap. The start line is met once."""
    sequence: list[tuple[int, dict]] = []
    for lap in range(1, laps + 1):
        for checkpoint in ordered:
            if lap > 1 and checkpoint["kind"] == "start":
                continue
            sequence.append((lap, checkpoint))
    return sequence


def compute_board(race: db.Race, state: dict | None, checkpoints: list[dict], participants: list[dict], passings: list[dict], now: datetime | None = None) -> dict:
    """Everything the race-day page shows, from the stored facts alone. Pure, and tested as such.

    With ``laps`` above one, the finish checkpoint is the lap line: a runner's k-th passing there
    ends lap k, the ``laps``-th ends the race, and each intermediate checkpoint's k-th passing
    belongs to lap k. Cut-offs apply to the final lap."""
    now = now or _now()
    settings = _settings(state)
    laps = max(1, settings.laps)
    ordered = sorted(checkpoints, key=lambda c: c["position"])
    start_cp = next((c for c in ordered if c["kind"] == "start"), None)
    finish_cp = next((c for c in reversed(ordered) if c["kind"] == "finish"), None)
    first = _first_passings(passings)
    by_lap = _passings_in_order(passings)
    sequence = _course_sequence(ordered, laps)
    live = (state or {}).get("status") == "live"

    rows = []
    through: dict[str, int] = {c["checkpoint_id"]: 0 for c in ordered}
    for participant in participants:
        pid = participant["participant_id"]
        start = _start_time_for(pid, state, settings, start_cp, first)
        splits = []
        seen: set[str] = set()
        for lap, checkpoint in sequence:
            at_checkpoint = by_lap.get((pid, checkpoint["checkpoint_id"]), [])
            index = 0 if checkpoint["kind"] == "start" else lap - 1
            if index >= len(at_checkpoint):
                continue
            passing = at_checkpoint[index]
            if checkpoint["checkpoint_id"] not in seen:
                through[checkpoint["checkpoint_id"]] += 1
                seen.add(checkpoint["checkpoint_id"])
            splits.append(
                {
                    "checkpoint_id": checkpoint["checkpoint_id"],
                    "name": checkpoint["name"] if laps == 1 else f"{checkpoint['name']} · lap {lap}",
                    "kind": checkpoint["kind"],
                    "position": checkpoint["position"],
                    "lap": lap,
                    "recorded_at": passing["recorded_at"],
                    "elapsed_seconds": _elapsed(start, passing["recorded_at"]),
                    "source": passing["source"],
                }
            )
        splits.sort(key=lambda s: s["recorded_at"])
        last = splits[-1] if splits else None
        finish = None
        completed_laps = 0
        if finish_cp is not None:
            at_finish = by_lap.get((pid, finish_cp["checkpoint_id"]), [])
            completed_laps = min(laps, len(at_finish))
            if len(at_finish) >= laps:
                finish = next(s for s in splits if s["checkpoint_id"] == finish_cp["checkpoint_id"] and s["lap"] == laps)
        status = participant["status"]
        if finish is not None and status != "dsq":
            status = "finished"
        on_course = live and status == "started"
        # Where they are heading, and whether the cut-off there has passed without them.
        next_cp = None
        next_lap = None
        if on_course:
            position = -1
            if last is not None:
                position = next((i for i, (lap, c) in enumerate(sequence) if lap == last["lap"] and c["checkpoint_id"] == last["checkpoint_id"]), -1)
            if position + 1 < len(sequence):
                next_lap, next_cp = sequence[position + 1]
        overdue = False
        if on_course and next_cp is not None and next_cp.get("cutoff_minutes") is not None and start is not None and (laps == 1 or next_lap == laps):
            overdue = now > start + timedelta(minutes=next_cp["cutoff_minutes"])
        rows.append(
            {
                **_participant_dict(participant),
                "status": status,
                "birth_year": participant.get("birth_year"),
                "nationality": participant.get("nationality"),
                "payment_status": participant.get("payment_status"),
                "start_at": start,
                "last": last,
                "lap": completed_laps,
                "next_checkpoint": {**_checkpoint_dict(next_cp), "lap": next_lap} if next_cp else None,
                "overdue": overdue,
                "finish_seconds": finish["elapsed_seconds"] if finish else None,
                "splits": splits,
                "rank": None,
            }
        )

    # Finishers ranked by time; equal times share a place.
    finishers = sorted((r for r in rows if r["status"] == "finished" and r["finish_seconds"] is not None), key=lambda r: r["finish_seconds"])
    place = 0
    for index, row in enumerate(finishers, start=1):
        if index == 1 or row["finish_seconds"] != finishers[index - 2]["finish_seconds"]:
            place = index
        row["rank"] = place

    def order_key(row: dict) -> tuple:
        # Finishers first by time, then runners on course by how far they are, then the rest.
        if row["status"] == "finished":
            return (0, row["finish_seconds"] or 0, 0)
        if row["status"] == "started":
            last = row["last"]
            progress = (last["lap"] * 1000 + last["position"]) if last else 0
            return (1, -progress, last["recorded_at"].timestamp() if last else 0)
        return (2, {"registered": 0, "dns": 1, "dnf": 2, "dsq": 3}.get(row["status"], 4), 0)

    rows.sort(key=order_key)

    counts = {status: 0 for status in suite_db.PARTICIPANT_STATUSES}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    counts["total"] = len(rows)
    counts["on_course"] = counts["started"] if live else 0
    counts["overdue"] = sum(1 for r in rows if r["overdue"])

    return {
        "race_id": race.race_id,
        "status": (state or {}).get("status") or "planning",
        "started_at": (state or {}).get("started_at"),
        "finished_at": (state or {}).get("finished_at"),
        "timing": settings.timing,
        "laps": laps,
        "now": now,
        "counts": counts,
        "checkpoints": [{**_checkpoint_dict(c), "through": through[c["checkpoint_id"]], "station_key": c["station_key"]} for c in ordered],
        "participants": rows,
    }


# --- Races ----------------------------------------------------------------------------------------


@router.get("/races", response_model=list[SuiteRaceOut])
def list_suite_races(organizer: Organizer = Depends(require_suite)) -> list[SuiteRaceOut]:
    """The caller's races (every race for an admin), each with whether the suite is in use."""
    races = [r for r in db.list_races() if not r.calculator_only and (organizer.is_admin or r.organizer_id == organizer.id)]
    overview = suite_db.race_overview([r.race_id for r in races])
    out = []
    for race in races:
        row = overview.get(race.race_id) or {}
        state = {"status": row.get("status"), "started_at": row.get("started_at")} if row.get("status") else None
        out.append(_race_out(race, state, row))
    out.sort(key=lambda r: (r.event_date, r.event_name, r.course_name), reverse=True)
    return out


@router.get("/races/{race_id}", response_model=SuiteRaceOut)
def get_suite_race(race_id: str, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


@router.patch("/races/{race_id}/settings", response_model=SuiteRaceOut)
def update_suite_settings(race_id: str, payload: SuiteSettings, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    race = _race_for(race_id, organizer)
    state = suite_db.update_state(race_id, settings=payload.model_dump())
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


class StartIn(BaseModel):
    started_at: datetime | None = None
    # Fire the gun over readiness warnings (never over blockers). Recorded in the audit log.
    force: bool = False


@router.post("/races/{race_id}/start", response_model=SuiteRaceOut)
def start_suite_race(race_id: str, payload: StartIn | None = None, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    """The gun. Every registered participant is presumed on course; mark no-shows DNS first, or later."""
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    if state["status"] == "live":
        raise HTTPException(status_code=409, detail="the race is already live")
    started_at = (payload.started_at if payload and payload.started_at else None) or _now()
    if started_at > _now() + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="the start time cannot be in the future")
    checks = readiness(race, state)
    blockers = [c for c in checks if c["level"] == "blocker" and not c["ok"]]
    warnings = [c for c in checks if c["level"] == "warning" and not c["ok"]]
    if blockers:
        raise HTTPException(status_code=409, detail="Not ready to start: " + "; ".join(c["label"] for c in blockers))
    if warnings and not (payload and payload.force):
        raise HTTPException(status_code=409, detail="Warnings to look at first: " + "; ".join(c["label"] for c in warnings) + ". Start anyway to go ahead.")
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = 'started', updated_at = now() WHERE race_id = %s AND status = 'registered'", (race_id,))
    state = suite_db.update_state(race_id, status="live", started_at=started_at)
    suite_db.audit(race_id, organizer.email, "race.started", f"gun {started_at.isoformat()}" + (f"; over warnings: {'; '.join(c['label'] for c in warnings)}" if warnings else ""))
    _emit("race.started", race, state)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


@router.post("/races/{race_id}/finish", response_model=SuiteRaceOut)
def finish_suite_race(race_id: str, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    """Close the race: whoever is still on course is marked DNF. Reopen with /reopen if that was early."""
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    if state["status"] != "live":
        raise HTTPException(status_code=409, detail="only a live race can be finished")
    board = compute_board(race, state, suite_db.list_checkpoints(race_id), suite_db.list_participants(race_id), suite_db.list_passings(race_id))
    with db.get_connection() as connection:
        for row in board["participants"]:
            # The board derives "finished" from the finish scan; write it down so it survives edits.
            if row["status"] in ("finished", "started"):
                connection.execute("UPDATE suite_participants SET status = %s, updated_at = now() WHERE participant_id = %s", ("finished" if row["status"] == "finished" else "dnf", row["participant_id"]))
    state = suite_db.update_state(race_id, status="finished", finished_at=_now())
    suite_db.audit(race_id, organizer.email, "race.finished", f"{board['counts'].get('finished', 0)} finished, {board['counts'].get('started', 0)} still out marked DNF")
    _emit("race.finished", race, state, finishers=board["counts"].get("finished", 0))
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


@router.post("/races/{race_id}/reopen", response_model=SuiteRaceOut)
def reopen_suite_race(race_id: str, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    """Back to live after an early finish: runners marked DNF by the finish go back on course."""
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    if state["status"] != "finished":
        raise HTTPException(status_code=409, detail="only a finished race can be reopened")
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = 'started', updated_at = now() WHERE race_id = %s AND status = 'dnf'", (race_id,))
        connection.execute("UPDATE suite_races SET status = 'live', finished_at = NULL, updated_at = now() WHERE race_id = %s", (race_id,))
    suite_db.audit(race_id, organizer.email, "race.reopened")
    state = suite_db.get_state(race_id)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


@router.post("/races/{race_id}/reset", response_model=SuiteRaceOut)
def reset_suite_race(race_id: str, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    """Back to planning: every passing is deleted and every participant is registered again. For
    the rehearsal the day before, not for race day; the plan and the field stay."""
    race = _race_for(race_id, organizer)
    suite_db.ensure_state(race_id)
    removed = suite_db.delete_all_passings(race_id)
    suite_db.audit(race_id, organizer.email, "race.reset", f"{removed} passings deleted")
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = 'registered', updated_at = now() WHERE race_id = %s AND status <> 'dns'", (race_id,))
    state = suite_db.update_state(race_id, status="planning", clear_times=True)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


# --- Checkpoints ----------------------------------------------------------------------------------


@router.get("/races/{race_id}/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(race_id: str, organizer: Organizer = Depends(require_suite)) -> list[CheckpointOut]:
    _race_for(race_id, organizer)
    return [_checkpoint_out(row, with_key=True) for row in suite_db.list_checkpoints(race_id)]


def _check_plan_rules(race: db.Race, existing: list[dict], values: dict, *, editing: str | None = None) -> dict:
    """The rules a plan must keep: one start, one finish, the start at km 0, nothing beyond the
    course, cut-offs that grow along the course. Returns the values with the automatic fixes."""
    others = [c for c in existing if c["checkpoint_id"] != editing]
    kind = values.get("kind")
    if kind == "start" and any(c["kind"] == "start" for c in others):
        raise HTTPException(status_code=422, detail="the plan already has a start; edit that one or change its kind")
    if kind == "finish" and any(c["kind"] == "finish" for c in others):
        raise HTTPException(status_code=422, detail="the plan already has a finish; edit that one or change its kind")
    if kind == "start":
        values["distance_km"] = 0.0
        values["cutoff_minutes"] = None
    if kind == "finish" and values.get("distance_km") is None and race.distance_km:
        values["distance_km"] = round(race.distance_km, 2)
    distance = values.get("distance_km")
    if distance is not None and race.distance_km and distance > race.distance_km * 1.05 + 0.5:
        raise HTTPException(status_code=422, detail=f"km {distance:g} is beyond the course, which measures {race.distance_km:.1f} km")
    return values


@router.post("/races/{race_id}/checkpoints", response_model=CheckpointOut, status_code=201)
def add_checkpoint(race_id: str, payload: CheckpointIn, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    race = _race_for(race_id, organizer)
    existing = suite_db.list_checkpoints(race_id)
    if len(existing) >= MAX_CHECKPOINTS_PER_RACE:
        raise HTTPException(status_code=409, detail=f"a race can have at most {MAX_CHECKPOINTS_PER_RACE} checkpoints")
    values = payload.model_dump()
    values["name"], _ = suite_fields.clean_checkpoint_name(values["name"])
    values = _check_plan_rules(race, existing, values)
    # Placed by distance when no position is asked for, so the plan reads in course order.
    if values.get("position") is None and values.get("distance_km") is not None:
        later = [c["position"] for c in existing if c["distance_km"] is not None and c["distance_km"] > values["distance_km"]]
        if later:
            values["position"] = min(later)
    if values.get("position") is None and values.get("kind") == "start" and existing:
        values["position"] = 1
    return _checkpoint_out(suite_db.create_checkpoint(race_id, values), with_key=True)


@router.post("/races/{race_id}/checkpoints/reorder", response_model=list[CheckpointOut])
def reorder_checkpoints(race_id: str, payload: ReorderIn, organizer: Organizer = Depends(require_suite)) -> list[CheckpointOut]:
    _race_for(race_id, organizer)
    return [_checkpoint_out(row, with_key=True) for row in suite_db.reorder_checkpoints(race_id, payload.checkpoint_ids)]


@router.patch("/checkpoints/{checkpoint_id}", response_model=CheckpointOut)
def edit_checkpoint(checkpoint_id: str, payload: CheckpointUpdate, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    checkpoint, race = _checkpoint_for(checkpoint_id, organizer)
    values = payload.model_dump(exclude_none=True, exclude={"clear_distance", "clear_cutoff"})
    if payload.clear_distance:
        values["distance_km"] = None
    if payload.clear_cutoff:
        values["cutoff_minutes"] = None
    if "name" in values:
        values["name"], _ = suite_fields.clean_checkpoint_name(values["name"])
    merged = {**checkpoint, **values}
    values = {**values, **{k: v for k, v in _check_plan_rules(race, suite_db.list_checkpoints(race.race_id), merged, editing=checkpoint_id).items() if k in ("distance_km", "cutoff_minutes")}}
    row = suite_db.update_checkpoint(checkpoint_id, values)
    return _checkpoint_out(row, with_key=True)


@router.post("/checkpoints/{checkpoint_id}/rotate-key", response_model=CheckpointOut)
def rotate_checkpoint_key(checkpoint_id: str, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    """A new station link; the old one stops working at once (a phone lost, a link shared too far)."""
    _checkpoint_for(checkpoint_id, organizer)
    return _checkpoint_out(suite_db.rotate_station_key(checkpoint_id), with_key=True)


@router.delete("/checkpoints/{checkpoint_id}", status_code=204)
def remove_checkpoint(checkpoint_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    checkpoint, race = _checkpoint_for(checkpoint_id, organizer)
    suite_db.delete_checkpoint(checkpoint_id)
    suite_db.audit(race.race_id, organizer.email, "checkpoint.removed", checkpoint["name"])
    return Response(status_code=204)


# --- Participants ---------------------------------------------------------------------------------


@router.get("/races/{race_id}/participants", response_model=list[ParticipantOut])
def list_participants(race_id: str, organizer: Organizer = Depends(require_suite)) -> list[ParticipantOut]:
    _race_for(race_id, organizer)
    return [_participant_out(row) for row in suite_db.list_participants(race_id)]


def _room_for(race_id: str, adding: int) -> None:
    if suite_db.count_participants(race_id) + adding > MAX_PARTICIPANTS_PER_RACE:
        raise HTTPException(status_code=409, detail=f"a race can hold at most {MAX_PARTICIPANTS_PER_RACE:,} participants in the suite")


@router.post("/races/{race_id}/participants", response_model=ParticipantOut, status_code=201)
def add_participant(race_id: str, payload: ParticipantIn, organizer: Organizer = Depends(require_suite)) -> ParticipantOut:
    _race_for(race_id, organizer)
    _room_for(race_id, 1)
    try:
        return _participant_out(suite_db.create_participant(race_id, payload.model_dump()))
    except suite_db.BibTaken as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


# Column names an organizer's sheet may use, lower-cased and squeezed; the first match wins.
_IMPORT_COLUMNS: dict[str, tuple[str, ...]] = {
    "bib": ("bib", "bibnumber", "bibno", "racenumber", "startnumber", "startnummer", "number", "dossard", "stnr", "startnr", "no", "nr"),
    "family_name": ("lastname", "familyname", "surname", "last", "nom", "nachname", "apellido", "cognome", "achternaam"),
    "first_name": ("firstname", "givenname", "first", "prenom", "prénom", "vorname", "nombre", "voornaam"),
    "name": ("name", "fullname", "runner", "athlete", "participant", "nomcomplet"),
    "gender": ("gender", "sex", "sexe", "geschlecht", "genero", "género", "m/f"),
    "birth_year": ("birthyear", "yearofbirth", "yob", "born", "jahrgang", "birthdate", "dateofbirth", "dob", "birthday", "geburtsdatum", "datedenaissance"),
    "nationality": ("nationality", "nation", "nat", "country", "pays", "land", "nationalité"),
    "club": ("club", "team", "verein", "equipe", "équipe", "association"),
    "emergency_contact": ("emergencycontact", "emergency", "ice", "icephone", "emergencyphone", "contacturgence", "notfallkontakt", "contactoemergencia"),
    "email": ("email", "e-mail", "mail", "emailaddress", "courriel"),
    "notes": ("notes", "note", "remarks", "comment", "comments"),
}


def _import_key(header: str) -> str:
    return re.sub(r"[^a-z0-9/éè]+", "", header.strip().lower())


def parse_participant_sheet(text: str) -> tuple[list[dict], list[str], dict[str, str], list[str]]:
    """Rows for :func:`suite_db.create_participant` from pasted CSV/TSV text.

    Returns (rows, skipped-row messages, column map field->header, ignored headers)."""
    text = text.lstrip("﻿")
    sample = text[:4000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = "\t" if "\t" in sample else (";" if sample.count(";") > sample.count(",") else ",")
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    table = [row for row in reader if any(cell.strip() for cell in row)]
    if not table:
        return [], ["the text has no rows"], {}, []
    headers = [h.strip() for h in table[0]]
    keys = [_import_key(h) for h in headers]
    columns: dict[str, str] = {}
    used: set[int] = set()
    for field_name, aliases in _IMPORT_COLUMNS.items():
        for index, key in enumerate(keys):
            if index in used:
                continue
            if key in aliases:
                columns[field_name] = headers[index]
                used.add(index)
                break
    if "family_name" not in columns and "name" not in columns:
        # No header row at all? Then there is nothing to match on: say so.
        return [], ["no name column found: the first row must name the columns (Last name, First name, ... or Name)"], columns, [h for h in headers if h]
    ignored = [headers[i] for i in range(len(headers)) if i not in used and headers[i]]
    index_of = {field_name: headers.index(header) for field_name, header in columns.items()}

    def cell(row: list[str], field_name: str) -> str:
        i = index_of.get(field_name)
        return row[i].strip() if i is not None and i < len(row) else ""

    rows: list[dict] = []
    skipped: list[str] = []
    seen_bibs: dict[str, int] = {}
    seen_names: dict[tuple[str, str], int] = {}
    for line_no, row in enumerate(table[1:], start=2):
        family, first = cell(row, "family_name"), cell(row, "first_name")
        if not family and "name" in index_of:
            family, first = split_name(cell(row, "name"))
        if not family and first:
            family, first = first, ""
        if not family:
            skipped.append(f"row {line_no}: no name")
            continue
        cleaned, notes = suite_fields.clean_participant(
            {
                "bib": cell(row, "bib") or None,
                "family_name": family[:120],
                "first_name": first[:120],
                "gender": cell(row, "gender"),
                "birth_year": cell(row, "birth_year") or None,
                "nationality": cell(row, "nationality") or None,
                "club": cell(row, "club") or None,
                "emergency_contact": cell(row, "emergency_contact") or None,
                "email": cell(row, "email") or None,
                "notes": cell(row, "notes") or None,
            }
        )
        who = f"{cleaned['first_name']} {cleaned['family_name']}".strip()
        # The same bib or the same person twice in one sheet is a mistake in the sheet, not two runners.
        if cleaned["bib"] and cleaned["bib"] in seen_bibs:
            skipped.append(f"row {line_no}, {who}: bib {cleaned['bib']} is also on row {seen_bibs[cleaned['bib']]}")
            continue
        name_key = (cleaned["family_name"].lower(), cleaned["first_name"].lower())
        if name_key in seen_names:
            skipped.append(f"row {line_no}, {who}: also on row {seen_names[name_key]}")
            continue
        if cleaned["bib"]:
            seen_bibs[cleaned["bib"]] = line_no
        seen_names[name_key] = line_no
        cleaned["_row"] = line_no
        cleaned["_notes"] = [f"row {line_no}, {who}: {note}" for note in notes]
        rows.append(cleaned)
    return rows, skipped, columns, ignored


@router.post("/races/{race_id}/participants/import", response_model=ImportOut)
def import_participants(race_id: str, payload: ImportIn, organizer: Organizer = Depends(require_suite)) -> ImportOut:
    """Paste the entry list. With ``replace``, the current list goes first (and its passings with it)."""
    _race_for(race_id, organizer)
    rows, skipped, columns, ignored = parse_participant_sheet(payload.text)
    corrections = [note for row in rows for note in row.pop("_notes", [])]
    if payload.dry_run:
        # What the sheet would become, bib clashes with the current list included.
        current = suite_db.list_participants(race_id) if not payload.replace else []
        taken = {p["bib"] for p in current if p["bib"]}
        names = {(p["family_name"].lower(), p["first_name"].lower()) for p in current}
        for row in rows:
            problems = []
            if row["bib"] and row["bib"] in taken:
                problems.append(f"bib {row['bib']} is already taken")
            if (row["family_name"].lower(), row["first_name"].lower()) in names:
                problems.append("already on the list")
            row["_problems"] = problems
        return ImportOut(added=0, skipped=skipped[:200], columns=columns, ignored_columns=ignored, corrections=corrections[:500], rows=[{k: v for k, v in row.items() if k != "_row"} | {"row": row["_row"]} for row in rows], total_rows=len(rows))
    if payload.replace:
        suite_db.delete_all_participants(race_id)
        suite_db.audit(race_id, organizer.email, "participants.replaced", f"{len(rows)} rows imported in place of the list")
    _room_for(race_id, len(rows))
    added = 0
    for row in rows:
        row.pop("_row", None)
        try:
            suite_db.create_participant(race_id, row)
            added += 1
        except suite_db.BibTaken:
            skipped.append(f"{row['first_name']} {row['family_name']}: bib {row['bib']} is already taken")
    if added and not payload.replace:
        suite_db.audit(race_id, organizer.email, "participants.imported", f"{added} added, {len(skipped)} skipped")
    return ImportOut(added=added, skipped=skipped[:200], columns=columns, ignored_columns=ignored, corrections=corrections[:500], total_rows=len(rows))


@router.post("/races/{race_id}/participants/assign-bibs", response_model=list[ParticipantOut])
def assign_bibs(race_id: str, payload: AssignBibsIn, organizer: Organizer = Depends(require_suite)) -> list[ParticipantOut]:
    _race_for(race_id, organizer)
    suite_db.assign_bibs(race_id, start=payload.start, prefix=payload.prefix.strip(), only_missing=payload.only_missing)
    return [_participant_out(row) for row in suite_db.list_participants(race_id)]


@router.patch("/participants/{participant_id}", response_model=ParticipantOut)
def edit_participant(participant_id: str, payload: ParticipantUpdate, organizer: Organizer = Depends(require_suite)) -> ParticipantOut:
    participant, race = _participant_for(participant_id, organizer)
    values = payload.model_dump(exclude_none=True, exclude={"clear_bib", "clear_birth_year"})
    if payload.clear_bib:
        values["bib"] = None
    if payload.clear_birth_year:
        values["birth_year"] = None
    try:
        row = suite_db.update_participant(participant_id, values)
    except suite_db.BibTaken as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if payload.status and payload.status != participant["status"]:
        suite_db.audit(race.race_id, organizer.email, "participant.status", f"#{row['bib'] or '?'} {row['first_name']} {row['family_name']}: {participant['status']} → {payload.status}")
    if payload.payment_status and payload.payment_status != participant.get("payment_status"):
        suite_db.audit(race.race_id, organizer.email, "participant.payment", f"#{row['bib'] or '?'} {row['first_name']} {row['family_name']}: {participant.get('payment_status')} → {payload.payment_status}")
    if payload.status == "dnf" and participant["status"] != "dnf":
        _emit("participant.dnf", race, suite_db.get_state(race.race_id), participant=row)
    return _participant_out(row)


@router.delete("/participants/{participant_id}", status_code=204)
def remove_participant(participant_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    participant, race = _participant_for(participant_id, organizer)
    suite_db.delete_participant(participant_id)
    suite_db.audit(race.race_id, organizer.email, "participant.removed", f"#{participant['bib'] or '?'} {participant['first_name']} {participant['family_name']}")
    return Response(status_code=204)


# --- Passings and the board -----------------------------------------------------------------------


def _record(race: db.Race, state: dict, checkpoint: dict, participant: dict, *, recorded_at: datetime, source: str, device: str | None, client_id: str | None) -> tuple[dict | None, str]:
    row, outcome = suite_db.record_passing(
        race_id=race.race_id, checkpoint_id=checkpoint["checkpoint_id"], participant_id=participant["participant_id"], recorded_at=recorded_at, source=source, device=device, client_id=client_id
    )
    if outcome != "accepted":
        return row, outcome
    # A start-line scan puts a registered runner on course; a finish-line scan finishes them.
    new_status = None
    settings = _settings(state)
    own_passings = suite_db.list_passings_for_participant(participant["participant_id"])
    if checkpoint["kind"] == "start" and participant["status"] in ("registered", "dns"):
        new_status = "started"
    elif checkpoint["kind"] == "finish" and participant["status"] in ("registered", "started", "dnf"):
        laps_done = sum(1 for p in own_passings if p["checkpoint_id"] == checkpoint["checkpoint_id"])
        if laps_done >= settings.laps:
            new_status = "finished"
    if new_status:
        suite_db.set_participant_status(participant["participant_id"], new_status)
        participant = {**participant, "status": new_status}
    start_cp = next((c for c in suite_db.list_checkpoints(race.race_id) if c["kind"] == "start"), None) if settings.timing == "net" else None
    start = _start_time_for(participant["participant_id"], state, settings, start_cp, _first_passings(own_passings))
    lap = sum(1 for p in own_passings if p["checkpoint_id"] == checkpoint["checkpoint_id"]) if settings.laps > 1 else None
    passing = {"passing_id": row["passing_id"], "recorded_at": row["recorded_at"].isoformat(), "elapsed_seconds": _elapsed(start, row["recorded_at"]), "source": source, "lap": lap}
    _emit("passing.recorded", race, state, participant=participant, checkpoint=checkpoint, passing=passing)
    if new_status == "finished":
        _emit("participant.finished", race, state, participant=participant, checkpoint=checkpoint, passing=passing)
    return row, outcome


@router.get("/races/{race_id}/board")
def get_board(race_id: str, organizer: Organizer = Depends(require_suite)) -> dict:
    """The live picture: counts, each checkpoint's throughput, each runner's last position, splits,
    overdue flags and the finishers' ranking. Plugin panels come along."""
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    board = compute_board(race, state, suite_db.list_checkpoints(race_id), suite_db.list_participants(race_id), suite_db.list_passings(race_id))
    panels = []
    for plugin, ctx in _enabled_plugins(race_id):
        try:
            panel = plugin.panel(ctx)
        except Exception as error:  # noqa: BLE001 - a panel must not take the board down
            panel = {"title": plugin.name, "lines": [], "error": str(error)[:200]}
        if panel:
            panels.append({"plugin": plugin.key, **panel})
    board["panels"] = panels
    return board


@router.post("/races/{race_id}/passings", status_code=201)
def add_passing(race_id: str, payload: PassingIn, organizer: Organizer = Depends(require_suite)) -> dict:
    """The organizer records a passing by hand: a scanner that failed, a runner reported by radio."""
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    checkpoint = suite_db.find_checkpoint(payload.checkpoint_id)
    participant = suite_db.find_participant(payload.participant_id)
    if checkpoint is None or checkpoint["race_id"] != race_id or participant is None or participant["race_id"] != race_id:
        raise HTTPException(status_code=404, detail="no such checkpoint or participant in this race")
    row, outcome = _record(race, state, checkpoint, participant, recorded_at=payload.recorded_at or _now(), source="organizer", device=None, client_id=None)
    if outcome == "duplicate":
        raise HTTPException(status_code=409, detail="that runner was recorded at this checkpoint less than two minutes ago")
    suite_db.audit(race_id, organizer.email, "passing.by_hand", f"#{participant['bib'] or '?'} {participant['first_name']} {participant['family_name']} at {checkpoint['name']} {row['recorded_at'].isoformat()}")
    return {"passing_id": row["passing_id"], "outcome": outcome}


@router.delete("/passings/{passing_id}", status_code=204)
def remove_passing(passing_id: int, organizer: Organizer = Depends(require_suite)) -> Response:
    with db.get_connection() as connection:
        row = connection.execute("SELECT race_id FROM suite_passings WHERE passing_id = %s", (passing_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="no passing with that id")
    _race_for(row["race_id"], organizer)
    gone = suite_db.delete_passing(passing_id)
    if gone:
        participant = suite_db.find_participant(gone["participant_id"]) or {}
        checkpoint = suite_db.find_checkpoint(gone["checkpoint_id"]) or {}
        suite_db.audit(row["race_id"], organizer.email, "passing.removed", f"#{participant.get('bib') or '?'} {participant.get('first_name', '')} {participant.get('family_name', '')} at {checkpoint.get('name', '?')} {gone['recorded_at'].isoformat()} ({gone['source']})")
    return Response(status_code=204)


# --- Stations: the volunteer's page, no account ---------------------------------------------------


def _station(station_key: str) -> tuple[dict, db.Race, dict]:
    if not re.fullmatch(r"[0-9a-f]{32}", station_key or ""):
        raise HTTPException(status_code=404, detail="no station with that key")
    checkpoint = suite_db.find_checkpoint_by_key(station_key)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="no station with that key: ask the organizer for a fresh link")
    race = db.find_race(checkpoint["race_id"])
    if race is None:
        raise HTTPException(status_code=404, detail="the race is gone")
    return checkpoint, race, suite_db.ensure_state(race.race_id)


@router.get("/stations/{station_key}")
def get_station(station_key: str, request: Request) -> dict:
    """What a checkpoint's phone needs: the checkpoint, the race, the server's clock and the roster
    (bib, name, QR token), so scans resolve on the phone and keep working without signal."""
    enforce_rate_limit(request, max_requests=60, scope="suite-station-get")
    checkpoint, race, state = _station(station_key)
    suite_db.touch_station(checkpoint["checkpoint_id"])
    roster = [
        {"participant_id": p["participant_id"], "bib": p["bib"], "first_name": p["first_name"], "family_name": p["family_name"], "qr_token": p["qr_token"], "status": p["status"]}
        for p in suite_db.list_participants(race.race_id)
    ]
    through = {row["participant_id"] for row in suite_db.list_passings(race.race_id) if row["checkpoint_id"] == checkpoint["checkpoint_id"]}
    return {
        "checkpoint": _checkpoint_out(checkpoint, with_key=False).model_dump(exclude={"station_key"}),
        "race": _race_dict(race, state),
        "checkpoints": [_checkpoint_dict(c) for c in suite_db.list_checkpoints(race.race_id)],
        "server_time": _now(),
        "roster": roster,
        "through": sorted(through),
    }


@router.post("/stations/{station_key}/passings")
def post_station_passings(station_key: str, payload: StationBatchIn, request: Request) -> dict:
    """A batch from a station's queue. Each item names the runner by QR token, participant id or
    bib, and carries the client's own id so a resend after a lost answer stores nothing twice."""
    enforce_rate_limit(request, max_requests=STATION_POSTS_PER_MINUTE, scope="suite-station-post")
    checkpoint, race, state = _station(station_key)
    results = []
    now = _now()
    for item in payload.passings:
        participant = None
        if item.qr_token:
            participant = suite_db.find_participant_by_token(item.qr_token)
        elif item.participant_id:
            participant = suite_db.find_participant(item.participant_id)
        elif item.bib:
            participant = suite_db.find_participant_by_bib(race.race_id, item.bib.strip())
        if participant is None or participant["race_id"] != race.race_id:
            results.append({"client_id": item.client_id, "outcome": "unknown"})
            continue
        recorded_at = item.recorded_at
        if recorded_at.tzinfo is None:
            recorded_at = recorded_at.replace(tzinfo=timezone.utc)
        # A phone's clock can be wrong by hours; a scan is never in the future and never before the
        # race was planned. Clamp to now rather than refuse: the passing happened.
        if recorded_at > now + timedelta(seconds=30):
            recorded_at = now
        row, outcome = _record(race, state, checkpoint, participant, recorded_at=recorded_at, source=item.source, device=item.device, client_id=item.client_id)
        results.append({"client_id": item.client_id, "outcome": outcome, "participant_id": participant["participant_id"], "bib": participant["bib"], "first_name": participant["first_name"], "family_name": participant["family_name"]})
    return {"results": results, "server_time": now}


# --- A runner's own bib page ----------------------------------------------------------------------


@router.get("/bibs/{qr_token}")
def get_bib(qr_token: str, request: Request) -> dict:
    """What a runner sees when they scan their own bib: their race, their bib, their splits. First
    name only, no other runner, nothing about anyone else."""
    enforce_rate_limit(request, max_requests=60, scope="suite-bib")
    if not re.fullmatch(r"[0-9a-f]{32}", qr_token or ""):
        raise HTTPException(status_code=404, detail="no bib with that code")
    participant = suite_db.find_participant_by_token(qr_token)
    if participant is None:
        raise HTTPException(status_code=404, detail="no bib with that code")
    race = db.find_race(participant["race_id"])
    if race is None:
        raise HTTPException(status_code=404, detail="the race is gone")
    state = suite_db.ensure_state(race.race_id)
    checkpoints = suite_db.list_checkpoints(race.race_id)
    board = compute_board(race, state, checkpoints, [participant], suite_db.list_passings_for_participant(participant["participant_id"]))
    me = board["participants"][0]
    return {
        "race": _race_dict(race, state),
        "bib": participant["bib"],
        "first_name": participant["first_name"],
        "status": me["status"],
        "rank": None,  # a rank needs the whole field; the public race page has it once published
        "finish_seconds": me["finish_seconds"],
        "splits": [{"name": s["name"], "kind": s["kind"], "distance_km": next((c["distance_km"] for c in checkpoints if c["checkpoint_id"] == s["checkpoint_id"]), None), "recorded_at": s["recorded_at"], "elapsed_seconds": s["elapsed_seconds"]} for s in me["splits"]],
        "checkpoints": [{"name": c["name"], "kind": c["kind"], "distance_km": c["distance_km"]} for c in checkpoints],
    }


# --- Plugins --------------------------------------------------------------------------------------


@router.get("/plugins")
def list_plugins(organizer: Organizer = Depends(require_suite)) -> list[dict]:
    """Every plugin installed on this server, with its settings form."""
    return plugins.catalogue()


def _plugin_setting_out(plugin: plugins.Plugin, row: dict | None) -> dict:
    config = dict((row or {}).get("config") or {})
    for spec in plugin.fields:
        if spec.secret and config.get(spec.key):
            config[spec.key] = "•" * 8  # set, but never echoed
    return {"plugin_key": plugin.key, "enabled": bool(row and row["enabled"]), "config": config, "updated_at": (row or {}).get("updated_at")}


@router.get("/races/{race_id}/plugins")
def list_race_plugins(race_id: str, organizer: Organizer = Depends(require_suite)) -> list[dict]:
    _race_for(race_id, organizer)
    stored = suite_db.list_plugin_settings(race_id)
    return [_plugin_setting_out(plugin, stored.get(key)) for key, plugin in plugins.registry().items()]


@router.put("/races/{race_id}/plugins/{plugin_key}")
def set_race_plugin(race_id: str, plugin_key: str, payload: PluginSettingIn, organizer: Organizer = Depends(require_suite)) -> dict:
    _race_for(race_id, organizer)
    plugin = plugins.get(plugin_key)
    if plugin is None:
        raise HTTPException(status_code=404, detail=f"no plugin called {plugin_key!r}")
    current = suite_db.list_plugin_settings(race_id).get(plugin_key)
    config = dict(payload.config)
    # A masked secret sent back unchanged keeps the stored one.
    for spec in plugin.fields:
        if spec.secret and current and config.get(spec.key) == "•" * 8:
            config[spec.key] = (current["config"] or {}).get(spec.key)
    try:
        cleaned = plugin.validate(config)
    except plugins.ConfigError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    row = suite_db.set_plugin(race_id, plugin_key, enabled=payload.enabled, config=cleaned)
    return _plugin_setting_out(plugin, row)


@router.get("/races/{race_id}/plugins/{plugin_key}/log")
def race_plugin_log(race_id: str, plugin_key: str, organizer: Organizer = Depends(require_suite)) -> list[dict]:
    _race_for(race_id, organizer)
    return suite_db.plugin_log(race_id, plugin_key, limit=50)


# --- Results: out of the suite, into OTRI scoring -------------------------------------------------


def _hms(seconds: float | None) -> str:
    if seconds is None:
        return ""
    total = int(round(seconds))
    return f"{total // 3600}:{total % 3600 // 60:02d}:{total % 60:02d}"


def results_csv(board: dict) -> str:
    """The suite's finish list in the shape ``ingestion/`` reads (docs/RESULT-FILES.md)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["Rank", "Time", "Last name", "First name", "Gender", "Bib", "Birth year", "Nationality", "Status"])
    for row in board["participants"]:
        if row["status"] == "finished" and row["finish_seconds"] is not None:
            rank, time_text, status = str(row["rank"]), _hms(row["finish_seconds"]), "Finisher"
        elif row["status"] in ("dnf", "dsq", "dns"):
            rank, time_text, status = row["status"].upper(), "", row["status"].upper()
        else:
            continue  # still on course, or never started and not marked: not a result
        writer.writerow([rank, time_text, row["family_name"], row["first_name"], row["gender"], row["bib"] or "", row["birth_year"] or "", row["nationality"] or "", status])
    return out.getvalue()


def _board_now(race: db.Race) -> dict:
    state = suite_db.ensure_state(race.race_id)
    return compute_board(race, state, suite_db.list_checkpoints(race.race_id), suite_db.list_participants(race.race_id), suite_db.list_passings(race.race_id))


@router.get("/races/{race_id}/results.csv")
def download_results(race_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    race = _race_for(race_id, organizer)
    text = results_csv(_board_now(race))
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{race.event_name or 'race'}-{race.course_name}-results").strip("-")
    return Response(content=text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@router.post("/races/{race_id}/results/submit")
def submit_results_to_scoring(race_id: str, organizer: Organizer = Depends(require_suite)) -> dict:
    """The finish list becomes the race's results: validated and scored exactly as an uploaded file
    would be, replacing whatever results the race had. Refused while the race is published."""
    _app = importlib.import_module(f"{__package__}.app")  # `from . import app` would give the FastAPI object

    race = _race_for(race_id, organizer)
    if race.published_at is not None:
        raise HTTPException(status_code=409, detail="the race is published: take it down before replacing its results")
    board = _board_now(race)
    if not any(r["status"] == "finished" and r["finish_seconds"] is not None for r in board["participants"]):
        raise HTTPException(status_code=409, detail="no finisher has a time yet")
    if board["status"] == "live":
        raise HTTPException(status_code=409, detail="finish the race first, so the list is final")
    text = results_csv(board)
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8", newline="") as handle:
        handle.write(text)
        path = Path(handle.name)
    try:
        report = validate_result_file(path)
        if not report.is_valid:
            raise HTTPException(status_code=422, detail="; ".join(issue.message for issue in report.errors[:5]) or "the finish list did not validate")
        results = result_records(path)
        try:
            _app._refuse_impossible_scores(_app._score_results(race, results))
            db.replace_results(race_id, results, max_rows_for_organizer=_app._result_row_limit(organizer))
            scores = _app._score_results(race, db.get_results(race_id))
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except db.QuotaExceeded as error:
            raise _app._no_room_for_results(organizer) from error
        except db.RacePublished as error:
            raise _app._published_conflict("results") from error
    finally:
        _app._discard_temp(path)
    suite_db.audit(race_id, organizer.email, "results.submitted", f"{sum(1 for r in results if r.is_finisher)} finishers, {len(results)} rows")
    return {"finishers": sum(1 for r in results if r.is_finisher), "rows": len(results), "scored": len(scores), "warnings": [issue.to_dict() for issue in report.warnings[:20]]}


# --- The course profile, for the bibs and the spectator page ---------------------------------------

PROFILE_POINTS = 240


def course_profile(race_id: str, points: int = PROFILE_POINTS) -> dict | None:
    """The stored measurement's profile thinned to a chart's worth of points, with the totals."""
    measurement = db.get_measurement(race_id)
    profile = (measurement or {}).get("profile") or []
    if len(profile) < 2:
        return None
    stride = max(1, -(-len(profile) // points))
    thinned = [profile[i] for i in range(0, len(profile), stride)]
    if thinned[-1] is not profile[-1]:
        thinned.append(profile[-1])
    elevations = [p["elevation"] for p in profile]
    gain = sum(max(0.0, b - a) for a, b in zip(elevations, elevations[1:]))
    return {
        "points": [{"km": round(p["distanceKm"], 3), "m": round(p["elevation"], 1)} for p in thinned],
        "distance_km": round(profile[-1]["distanceKm"], 2),
        "min_m": round(min(elevations), 1),
        "max_m": round(max(elevations), 1),
        "gain_m": round(gain),
    }


@router.get("/races/{race_id}/profile")
def get_profile(race_id: str, organizer: Organizer = Depends(require_suite)) -> dict:
    _race_for(race_id, organizer)
    profile = course_profile(race_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="the race has no measured course yet: attach its GPX first")
    return profile


# --- Checkpoints suggested from the course ---------------------------------------------------------


class SuggestIn(BaseModel):
    # Aid every this many kilometres; the default depends on the distance.
    spacing_km: float | None = Field(default=None, ge=2, le=50)
    # Slow-runner pace the cut-offs are drawn from: minutes per flat kilometre, and per 100 m of climb.
    min_per_km: float = Field(default=12, ge=4, le=40)
    min_per_100m_climb: float = Field(default=10, ge=0, le=40)
    apply: bool = False
    replace: bool = False


def _smooth(values: list[float], window: int) -> list[float]:
    if window <= 1 or len(values) < window:
        return list(values)
    half = window // 2
    out = []
    for i in range(len(values)):
        lo, hi = max(0, i - half), min(len(values), i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def suggest_checkpoints(profile: dict, *, spacing_km: float | None = None, min_per_km: float = 12, min_per_100m_climb: float = 10, laps: int = 1) -> list[dict]:
    """Where a race of this shape usually puts its aid stations, and when a slow runner reaches them.

    The rule of thumb behind it: aid every 6 km on a short course, 9 km on a long one, 12 km on
    an ultra, placed where the ground makes access likely, which is a valley or a pass rather
    than the middle of a climb. Each target kilometre is moved to the nearest low point of the
    profile within a third of the spacing, failing that to the nearest high point, failing that
    it stays. Cut-offs come from a slow pace on the flat plus a climbing allowance, rounded up to
    the quarter hour. A suggestion, for the organizer to move, rename and correct."""
    points = profile["points"]
    distance = profile["distance_km"]
    if spacing_km is None:
        spacing_km = 6 if distance <= 25 else 9 if distance <= 60 else 12
    aid_count = max(0, round(distance / spacing_km) - 1)
    targets = [distance * k / (aid_count + 1) for k in range(1, aid_count + 1)]

    kms = [p["km"] for p in points]
    ms = _smooth([p["m"] for p in points], 5)
    # Local extrema of the smoothed profile: the lowest or highest point within a kilometre either
    # way, with at least 25 m of relief to what surrounds it.
    lows, highs = [], []
    for i in range(1, len(ms) - 1):
        lo = i
        while lo > 0 and kms[i] - kms[lo - 1] <= 1.0:
            lo -= 1
        hi = i
        while hi < len(ms) - 1 and kms[hi + 1] - kms[i] <= 1.0:
            hi += 1
        window = ms[lo : hi + 1]
        if ms[i] <= min(window) and max(window) - ms[i] >= 25:
            lows.append(i)
        elif ms[i] >= max(window) and ms[i] - min(window) >= 25:
            highs.append(i)

    def nearest(candidates: list[int], km: float, tolerance: float) -> int | None:
        best = None
        for i in candidates:
            if abs(kms[i] - km) <= tolerance and (best is None or abs(kms[i] - km) < abs(kms[best] - km)):
                best = i
        return best

    def index_at(km: float) -> int:
        return min(range(len(kms)), key=lambda i: abs(kms[i] - km))

    def gain_to(index: int) -> float:
        raw = [p["m"] for p in points[: index + 1]]
        return sum(max(0.0, b - a) for a, b in zip(raw, raw[1:]))

    def cutoff(km: float, index: int) -> int:
        minutes = km * min_per_km + gain_to(index) / 100 * min_per_100m_climb
        return int(-(-minutes // 15) * 15)

    picks = []
    for target in targets:
        tolerance = spacing_km / 3
        i = nearest(lows, target, tolerance)
        reason = "a low point on the profile: a valley or a road crossing is likely" if i is not None else None
        if i is None:
            i = nearest(highs, target, tolerance)
            reason = "a high point on the profile: a pass" if i is not None else None
        if i is None:
            i = index_at(target)
            reason = f"every {spacing_km:g} km along the course"
        picks.append((i, reason))
    picks.sort(key=lambda pair: pair[0])
    # Two picks that landed on the same spot are one station.
    unique = []
    for i, reason in picks:
        if not unique or kms[i] - kms[unique[-1][0]] >= spacing_km / 3:
            unique.append((i, reason))

    suggestions = [{"name": "Start", "kind": "start", "distance_km": 0.0, "cutoff_minutes": None, "water": True, "food": False, "medical": False, "drop_bag": False, "crew_access": True, "supplies": "water, bib pick-up, drop-bag collection", "notes": None, "elevation_m": round(ms[0]), "reason": "where the course begins"}]
    previous_km = 0.0
    for number, (i, reason) in enumerate(unique, start=1):
        km = kms[i]
        food = km - previous_km >= 8 or number % 2 == 0
        suggestions.append(
            {
                "name": f"Aid {number}",
                "kind": "aid",
                "distance_km": round(km, 1),
                "cutoff_minutes": cutoff(km, i),
                "water": True,
                "food": food,
                "medical": food,
                "drop_bag": False,
                "crew_access": "low point" in (reason or ""),
                "supplies": "water, electrolytes, bananas, salty snacks" + (", hot food" if food else ""),
                "notes": None,
                "elevation_m": round(ms[i]),
                "reason": reason,
            }
        )
        previous_km = km
    last = len(points) - 1
    finish_km = distance * laps if laps > 1 else distance
    suggestions.append({"name": "Finish", "kind": "finish", "distance_km": round(distance, 1), "cutoff_minutes": cutoff(finish_km, last) if laps == 1 else int(-(-(cutoff(distance, last) * laps) // 15) * 15), "water": True, "food": True, "medical": True, "drop_bag": True, "crew_access": True, "supplies": "water, food, medical post, blankets, results desk", "notes": "the lap line" if laps > 1 else None, "elevation_m": round(ms[last]), "reason": "where the course ends"})
    return suggestions


@router.post("/races/{race_id}/checkpoints/suggest")
def suggest_race_checkpoints(race_id: str, payload: SuggestIn | None = None, organizer: Organizer = Depends(require_suite)) -> dict:
    """A plan drawn from the race's measured course: start, aid stations at the natural places,
    finish, with cut-offs from a slow pace. Preview by default; ``apply`` creates them (``replace``
    when the race already has a plan)."""
    payload = payload or SuggestIn()
    _race_for(race_id, organizer)
    profile = course_profile(race_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="the race has no measured course yet: attach its GPX first, then suggest a plan from it")
    settings = _settings(suite_db.ensure_state(race_id))
    suggestions = suggest_checkpoints(profile, spacing_km=payload.spacing_km, min_per_km=payload.min_per_km, min_per_100m_climb=payload.min_per_100m_climb, laps=settings.laps)
    applied = []
    if payload.apply:
        existing = suite_db.list_checkpoints(race_id)
        if existing and not payload.replace:
            raise HTTPException(status_code=409, detail="the race already has a plan: choose to replace it")
        for checkpoint in existing:
            suite_db.delete_checkpoint(checkpoint["checkpoint_id"])
        for item in suggestions:
            values = {k: v for k, v in item.items() if k in suite_db.CHECKPOINT_FIELDS}
            applied.append(_checkpoint_out(suite_db.create_checkpoint(race_id, values), with_key=True).model_dump())
    return {"suggestions": suggestions, "applied": applied, "distance_km": profile["distance_km"], "gain_m": profile["gain_m"]}


# --- Public pages: spectators and registration ------------------------------------------------------


def _public_race(race_id: str) -> tuple[db.Race, dict, SuiteSettings]:
    race = db.find_race(race_id)
    state = suite_db.get_state(race_id) if race is not None else None
    if race is None or race.calculator_only or state is None:
        raise HTTPException(status_code=404, detail="no such race")
    settings = _settings(state)
    if not settings.live_public and not settings.registration_open:
        raise HTTPException(status_code=404, detail="this race has no public page")
    return race, state, settings


def _public_board_row(row: dict) -> dict:
    keep = ("participant_id", "bib", "family_name", "first_name", "club", "status", "last", "lap", "next_checkpoint", "overdue", "finish_seconds", "rank", "splits")
    return {k: row.get(k) for k in keep}


@router.get("/public/{race_id}")
def public_race(race_id: str, request: Request) -> dict:
    """What a spectator or a would-be runner sees: the race, the plan, the profile, whether the
    live page is on and whether registration is open (and how many places are left)."""
    enforce_rate_limit(request, max_requests=60, scope="suite-public")
    race, state, settings = _public_race(race_id)
    count = suite_db.count_participants(race_id)
    spots_left = None if settings.registration_limit is None else max(0, settings.registration_limit - count)
    return {
        "race": {**_race_dict(race, state), "distance_km": race.distance_km, "elevation_gain_m": race.elevation_gain_m, "event_location": race.event_location, "event_country": race.event_country},
        "laps": settings.laps,
        "planned_start": settings.planned_start,
        "live_public": settings.live_public,
        "checkpoints": [_checkpoint_public(c) for c in suite_db.list_checkpoints(race_id)],
        "profile": course_profile(race_id, 160),
        "registration": {
            "open": settings.registration_open and (spots_left is None or spots_left > 0),
            "full": settings.registration_open and spots_left == 0,
            "spots_left": spots_left,
            "note": settings.registration_note,
            "fee_text": settings.fee_text,
            "fields": {"club": settings.ask_club, "birth_year": settings.ask_birth_year, "nationality": settings.ask_nationality, "email": settings.ask_email, "emergency_required": settings.require_emergency},
        },
        "participants": count,
    }


@router.get("/public/{race_id}/live")
def public_live(race_id: str, request: Request) -> dict:
    """The board for spectators: names, bibs, clubs, where each runner was last seen and the
    finishers' times. No birth years, no nationalities, no contacts, no station keys."""
    enforce_rate_limit(request, max_requests=120, scope="suite-public-live")
    race, state, settings = _public_race(race_id)
    if not settings.live_public:
        raise HTTPException(status_code=404, detail="this race has no public live page")
    board = compute_board(race, state, suite_db.list_checkpoints(race_id), suite_db.list_participants(race_id), suite_db.list_passings(race_id))
    return {
        "race": _race_dict(race, state),
        "status": board["status"],
        "started_at": board["started_at"],
        "laps": board["laps"],
        "now": board["now"],
        "counts": board["counts"],
        "checkpoints": [{k: v for k, v in c.items() if k != "station_key"} for c in board["checkpoints"]],
        "participants": [_public_board_row(r) for r in board["participants"]],
    }


class RegistrationIn(BaseModel):
    family_name: str = Field(min_length=1, max_length=120)
    first_name: str = Field(min_length=1, max_length=120)
    gender: str = Field(pattern="^(M|F|X)$")
    birth_year: int | None = Field(default=None, ge=1900, le=_THIS_YEAR)
    nationality: str | None = Field(default=None, max_length=60)  # a code or a country name; cleaned to ISO alpha-3
    club: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    emergency_contact: str | None = Field(default=None, max_length=200)
    # "I agree to the race's terms and to my name and times being shown."
    consent: bool


def _payment_link(settings: SuiteSettings, reference: str) -> str | None:
    url = settings.payment_url
    if not url:
        return None
    # Stripe payment links take the reference back in the payment's client_reference_id, so the
    # organizer's Stripe dashboard says which registration a payment settles.
    if "stripe.com" in url or "buy.stripe" in url:
        return f"{url}{'&' if '?' in url else '?'}client_reference_id={quote(reference)}"
    return url


@router.post("/public/{race_id}/register", status_code=201)
def public_register(race_id: str, payload: RegistrationIn, request: Request) -> dict:
    """A runner enters the race from the public form. Answers their private link (the same page
    the QR on their bib opens) and how to pay, with a reference the organizer can match."""
    enforce_rate_limit(request, max_requests=10, scope="suite-register")
    enforce_rate_limit(request, max_requests=40, scope="suite-register-hour", window_seconds=3600)
    race, state, settings = _public_race(race_id)
    if not settings.registration_open:
        raise HTTPException(status_code=403, detail="registration is closed")
    if not payload.consent:
        raise HTTPException(status_code=422, detail="please agree to the race's terms to register")
    if settings.require_emergency and not (payload.emergency_contact or "").strip():
        raise HTTPException(status_code=422, detail="an emergency contact is required for this race")
    if settings.ask_email and payload.email and "@" not in payload.email:
        raise HTTPException(status_code=422, detail="that email address does not look right")
    if suite_db.find_participant_by_name(race_id, payload.family_name, payload.first_name, payload.birth_year):
        raise HTTPException(status_code=409, detail="somebody with this name is already registered; if that is you, ask the organizer for your link")
    count = suite_db.count_participants(race_id)
    if settings.registration_limit is not None and count >= settings.registration_limit:
        raise HTTPException(status_code=409, detail="the race is full")
    _room_for(race_id, 1)
    fee = bool(settings.fee_text or settings.payment_url)
    values = {
        "family_name": payload.family_name,
        "first_name": payload.first_name,
        "gender": payload.gender,
        "birth_year": payload.birth_year if settings.ask_birth_year else None,
        "nationality": payload.nationality if settings.ask_nationality else None,
        "club": payload.club if settings.ask_club else None,
        "email": payload.email if settings.ask_email else None,
        "emergency_contact": payload.emergency_contact,
        "registered_via": "public",
        "payment_status": "pending" if fee else "not_required",
    }
    row = suite_db.create_participant(race_id, values)
    reference = f"{race.course_name[:3].upper()}-{row['participant_id'].split('-')[-1][-6:].upper()}"
    row = suite_db.update_participant(row["participant_id"], {"payment_reference": reference})
    return {
        "participant_id": row["participant_id"],
        "qr_token": row["qr_token"],
        "first_name": row["first_name"],
        "race": _race_dict(race, state),
        "payment": {
            "status": row["payment_status"],
            "fee_text": settings.fee_text,
            "url": _payment_link(settings, reference),
            "instructions": settings.payment_instructions,
            "reference": reference,
        },
    }


# --- Readiness: what stands between this race and its gun ------------------------------------------


def _check(key: str, ok: bool, level: str, label: str, detail: str | None = None, tab: str | None = None) -> dict:
    return {"key": key, "ok": bool(ok), "level": level, "label": label, "detail": detail, "tab": tab}


def readiness(race: db.Race, state: dict | None) -> list[dict]:
    """Every check the organizer should see before the gun, in the order they fix things.

    ``blocker``: the race cannot start (no runners, no bibs, no start or finish, two of either).
    ``warning``: the gun goes with ``force`` and the override is written to the audit log.
    ``info``: worth knowing, never in the way."""
    settings = _settings(state)
    people = suite_db.list_participants(race.race_id)
    checkpoints = suite_db.list_checkpoints(race.race_id)
    checks: list[dict] = []

    # The field.
    checks.append(_check("runners", len(people) > 0, "blocker", "Runners on the list", f"{len(people)} registered" if people else "Nobody is registered yet", "field"))
    missing_bib = [p for p in people if not p["bib"]]
    checks.append(_check("bibs", bool(people) and not missing_bib, "blocker", "Every runner has a bib", "Numbers assigned" if people and not missing_bib else f"{len(missing_bib)} without a number", "field"))
    no_ice = [p for p in people if not p["emergency_contact"]]
    checks.append(_check("emergency", not no_ice, "warning", "Every runner has an emergency contact", "All given" if not no_ice else f"{len(no_ice)} runner{'s' if len(no_ice) != 1 else ''} without one", "field"))
    no_gender = [p for p in people if p["gender"] == "X"]
    if no_gender:
        checks.append(_check("gender", False, "info", "Runners without a gender are left out of the women's and men's rankings", f"{len(no_gender)} runner{'s' if len(no_gender) != 1 else ''}", "field"))
    unpaid = [p for p in people if p.get("payment_status") == "pending"]
    if unpaid:
        checks.append(_check("fees", False, "warning", "Fees still pending", f"{len(unpaid)} runner{'s' if len(unpaid) != 1 else ''} have not been marked paid", "field"))

    # The plan.
    starts = [c for c in checkpoints if c["kind"] == "start"]
    finishes = [c for c in checkpoints if c["kind"] == "finish"]
    checks.append(_check("start_finish", len(starts) == 1 and len(finishes) == 1, "blocker", "One start and one finish on the plan", f"{len(checkpoints)} checkpoint{'s' if len(checkpoints) != 1 else ''}: {len(starts)} start, {len(finishes)} finish", "plan"))
    with_km = [c for c in checkpoints if c["distance_km"] is not None]
    in_order = all(a["distance_km"] <= b["distance_km"] for a, b in zip(with_km, with_km[1:]))
    checks.append(_check("distances", in_order, "warning", "Distances grow along the plan", "In course order" if in_order else "A checkpoint is listed before one that comes earlier on the course", "plan"))
    with_cut = [c for c in checkpoints if c["cutoff_minutes"] is not None]
    cut_order = all(a["cutoff_minutes"] < b["cutoff_minutes"] for a, b in zip(with_cut, with_cut[1:]))
    checks.append(_check("cutoffs", cut_order, "warning", "Cut-offs grow along the plan", "Each later than the one before" if cut_order else "A cut-off is earlier than the one before it", "plan"))
    if finishes and finishes[0]["distance_km"] is not None and race.distance_km:
        close = abs(finishes[0]["distance_km"] - race.distance_km) <= max(0.5, race.distance_km * 0.03)
        checks.append(_check("finish_km", close, "warning", "The finish is where the course ends", f"Finish at km {finishes[0]['distance_km']:g}, course {race.distance_km:.1f} km", "plan"))
    if finishes and finishes[0]["cutoff_minutes"] is None:
        checks.append(_check("finish_cutoff", False, "warning", "The finish has a cut-off", "Without one, nobody is ever overdue on the last stretch", "plan"))
    unseen = [c for c in checkpoints if c.get("station_seen_at") is None]
    checks.append(_check("stations", bool(checkpoints) and not unseen, "warning", "Every station link has been opened on a phone", "All opened" if checkpoints and not unseen else f"{len(unseen)} not opened yet: {', '.join(c['name'] for c in unseen[:4])}{'…' if len(unseen) > 4 else ''}", "plan"))

    # The race.
    checks.append(_check("phone", bool(settings.organizer_phone), "warning", "An organizer phone on the bibs", settings.organizer_phone or "Nobody to call if a runner is found alone", "overview"))
    checks.append(_check("planned_start", bool(settings.planned_start), "info", "A planned start time", f"Start {settings.planned_start}" if settings.planned_start else "Cut-offs print as durations, not clock times", "overview"))
    if settings.registration_open:
        checks.append(_check("registration", False, "warning", "Registration is still open", "Close it before the gun, so the list is final", "overview"))
    if race.event_date and race.event_date != date.today() and (state or {}).get("status") == "planning":
        checks.append(_check("date", False, "info", "The race is dated " + race.event_date.isoformat(), "Today is " + date.today().isoformat() + "; a rehearsal is fine, reset it afterwards", "overview"))
    if not race.has_gpx:
        checks.append(_check("gpx", False, "info", "No course file yet", "Attach the GPX for the profile on the bibs and for scoring", None))
    return checks


@router.get("/races/{race_id}/readiness")
def get_readiness(race_id: str, organizer: Organizer = Depends(require_suite)) -> dict:
    race = _race_for(race_id, organizer)
    state = suite_db.ensure_state(race_id)
    checks = readiness(race, state)
    return {
        "checks": checks,
        "blockers": sum(1 for c in checks if c["level"] == "blocker" and not c["ok"]),
        "warnings": sum(1 for c in checks if c["level"] == "warning" and not c["ok"]),
        "ready": not any(c["level"] == "blocker" and not c["ok"] for c in checks),
    }


@router.get("/races/{race_id}/audit")
def get_audit(race_id: str, organizer: Organizer = Depends(require_suite)) -> list[dict]:
    """Every hand-made change to the record, newest first: who, when, what."""
    _race_for(race_id, organizer)
    return suite_db.audit_log(race_id)


@router.get("/races/{race_id}/passings.csv")
def download_passings(race_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    """Every passing as recorded, for the record: bib, runner, checkpoint, time, source, device."""
    race = _race_for(race_id, organizer)
    people = {p["participant_id"]: p for p in suite_db.list_participants(race_id)}
    checkpoints = {c["checkpoint_id"]: c for c in suite_db.list_checkpoints(race_id)}
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["Passing", "Bib", "Last name", "First name", "Checkpoint", "Position", "Recorded at", "Received at", "Source", "Device", "Client id"])
    for row in suite_db.list_passings(race_id):
        p = people.get(row["participant_id"], {})
        c = checkpoints.get(row["checkpoint_id"], {})
        writer.writerow([row["passing_id"], p.get("bib") or "", p.get("family_name", ""), p.get("first_name", ""), c.get("name", ""), c.get("position", ""), row["recorded_at"].isoformat(), row["received_at"].isoformat(), row["source"], row["device"] or "", row["client_id"] or ""])
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{race.event_name or 'race'}-{race.course_name}-passings").strip("-")
    return Response(content=out.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})
