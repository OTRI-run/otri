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

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from ingestion import result_records, validate_result_file
from ingestion.normalize import split_name

from . import db, suite_db
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
    nationality: str | None = Field(default=None, max_length=3)
    club: str | None = Field(default=None, max_length=120)
    emergency_contact: str | None = Field(default=None, max_length=200)
    status: str = Field(default="registered", pattern="^(registered|dns|started|finished|dnf|dsq)$")
    notes: str | None = Field(default=None, max_length=500)


class ParticipantUpdate(BaseModel):
    bib: str | None = Field(default=None, max_length=12)
    family_name: str | None = Field(default=None, min_length=1, max_length=120)
    first_name: str | None = Field(default=None, max_length=120)
    gender: str | None = Field(default=None, max_length=10)
    birth_year: int | None = Field(default=None, ge=1900, le=_THIS_YEAR)
    nationality: str | None = Field(default=None, max_length=3)
    club: str | None = Field(default=None, max_length=120)
    emergency_contact: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern="^(registered|dns|started|finished|dnf|dsq)$")
    notes: str | None = Field(default=None, max_length=500)
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


class ImportIn(BaseModel):
    """A pasted or uploaded list: CSV/TSV text with a header row. Recognised columns are matched by
    name in several spellings (bib, last name, first name, name, gender, birth year, nationality,
    club, emergency contact); the rest is ignored and reported."""

    text: str = Field(min_length=1, max_length=2_000_000)
    replace: bool = False


class ImportOut(BaseModel):
    added: int
    skipped: list[str]
    columns: dict[str, str]
    ignored_columns: list[str]


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


def compute_board(race: db.Race, state: dict | None, checkpoints: list[dict], participants: list[dict], passings: list[dict], now: datetime | None = None) -> dict:
    """Everything the race-day page shows, from the stored facts alone. Pure, and tested as such."""
    now = now or _now()
    settings = _settings(state)
    ordered = sorted(checkpoints, key=lambda c: c["position"])
    start_cp = next((c for c in ordered if c["kind"] == "start"), None)
    finish_cp = next((c for c in reversed(ordered) if c["kind"] == "finish"), None)
    first = _first_passings(passings)
    live = (state or {}).get("status") == "live"

    rows = []
    through: dict[str, int] = {c["checkpoint_id"]: 0 for c in ordered}
    for participant in participants:
        pid = participant["participant_id"]
        start = _start_time_for(pid, state, settings, start_cp, first)
        splits = []
        for checkpoint in ordered:
            passing = first.get((pid, checkpoint["checkpoint_id"]))
            if passing is None:
                continue
            through[checkpoint["checkpoint_id"]] += 1
            splits.append(
                {
                    "checkpoint_id": checkpoint["checkpoint_id"],
                    "name": checkpoint["name"],
                    "kind": checkpoint["kind"],
                    "position": checkpoint["position"],
                    "recorded_at": passing["recorded_at"],
                    "elapsed_seconds": _elapsed(start, passing["recorded_at"]),
                    "source": passing["source"],
                }
            )
        last = splits[-1] if splits else None
        finish = next((s for s in splits if finish_cp and s["checkpoint_id"] == finish_cp["checkpoint_id"]), None)
        status = participant["status"]
        if finish is not None and status not in ("dsq",):
            status = "finished"
        on_course = live and status == "started"
        # Where they are heading, and whether the cut-off there has passed without them.
        next_cp = None
        if on_course:
            after = last["position"] if last else 0
            next_cp = next((c for c in ordered if c["position"] > after), None)
        overdue = False
        if on_course and next_cp is not None and next_cp.get("cutoff_minutes") is not None and start is not None:
            overdue = now > start + timedelta(minutes=next_cp["cutoff_minutes"])
        rows.append(
            {
                **_participant_dict(participant),
                "status": status,
                "birth_year": participant.get("birth_year"),
                "nationality": participant.get("nationality"),
                "start_at": start,
                "last": last,
                "next_checkpoint": _checkpoint_dict(next_cp) if next_cp else None,
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
            return (1, -(last["position"] if last else 0), last["recorded_at"].timestamp() if last else 0)
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
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = 'started', updated_at = now() WHERE race_id = %s AND status = 'registered'", (race_id,))
    state = suite_db.update_state(race_id, status="live", started_at=started_at)
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
    state = suite_db.get_state(race_id)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


@router.post("/races/{race_id}/reset", response_model=SuiteRaceOut)
def reset_suite_race(race_id: str, organizer: Organizer = Depends(require_suite)) -> SuiteRaceOut:
    """Back to planning: every passing is deleted and every participant is registered again. For
    the rehearsal the day before, not for race day; the plan and the field stay."""
    race = _race_for(race_id, organizer)
    suite_db.ensure_state(race_id)
    suite_db.delete_all_passings(race_id)
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = 'registered', updated_at = now() WHERE race_id = %s AND status <> 'dns'", (race_id,))
    state = suite_db.update_state(race_id, status="planning", clear_times=True)
    return _race_out(race, state, suite_db.race_overview([race_id]).get(race_id))


# --- Checkpoints ----------------------------------------------------------------------------------


@router.get("/races/{race_id}/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(race_id: str, organizer: Organizer = Depends(require_suite)) -> list[CheckpointOut]:
    _race_for(race_id, organizer)
    return [_checkpoint_out(row, with_key=True) for row in suite_db.list_checkpoints(race_id)]


@router.post("/races/{race_id}/checkpoints", response_model=CheckpointOut, status_code=201)
def add_checkpoint(race_id: str, payload: CheckpointIn, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    _race_for(race_id, organizer)
    if len(suite_db.list_checkpoints(race_id)) >= MAX_CHECKPOINTS_PER_RACE:
        raise HTTPException(status_code=409, detail=f"a race can have at most {MAX_CHECKPOINTS_PER_RACE} checkpoints")
    return _checkpoint_out(suite_db.create_checkpoint(race_id, payload.model_dump()), with_key=True)


@router.post("/races/{race_id}/checkpoints/reorder", response_model=list[CheckpointOut])
def reorder_checkpoints(race_id: str, payload: ReorderIn, organizer: Organizer = Depends(require_suite)) -> list[CheckpointOut]:
    _race_for(race_id, organizer)
    return [_checkpoint_out(row, with_key=True) for row in suite_db.reorder_checkpoints(race_id, payload.checkpoint_ids)]


@router.patch("/checkpoints/{checkpoint_id}", response_model=CheckpointOut)
def edit_checkpoint(checkpoint_id: str, payload: CheckpointUpdate, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    _checkpoint_for(checkpoint_id, organizer)
    values = payload.model_dump(exclude_none=True, exclude={"clear_distance", "clear_cutoff"})
    if payload.clear_distance:
        values["distance_km"] = None
    if payload.clear_cutoff:
        values["cutoff_minutes"] = None
    row = suite_db.update_checkpoint(checkpoint_id, values)
    return _checkpoint_out(row, with_key=True)


@router.post("/checkpoints/{checkpoint_id}/rotate-key", response_model=CheckpointOut)
def rotate_checkpoint_key(checkpoint_id: str, organizer: Organizer = Depends(require_suite)) -> CheckpointOut:
    """A new station link; the old one stops working at once (a phone lost, a link shared too far)."""
    _checkpoint_for(checkpoint_id, organizer)
    return _checkpoint_out(suite_db.rotate_station_key(checkpoint_id), with_key=True)


@router.delete("/checkpoints/{checkpoint_id}", status_code=204)
def remove_checkpoint(checkpoint_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    _checkpoint_for(checkpoint_id, organizer)
    suite_db.delete_checkpoint(checkpoint_id)
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
    "emergency_contact": ("emergencycontact", "emergency", "ice", "icephone", "emergencyphone", "contacturgence", "notfallkontakt"),
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
    for line_no, row in enumerate(table[1:], start=2):
        family, first = cell(row, "family_name"), cell(row, "first_name")
        if not family and "name" in index_of:
            family, first = split_name(cell(row, "name"))
        if not family and first:
            family, first = first, ""
        if not family:
            skipped.append(f"row {line_no}: no name")
            continue
        gender = cell(row, "gender").upper()[:1]
        if gender in ("H", "W"):  # homme, Weiblich/women
            gender = "M" if gender == "H" else "F"
        birth_year: int | None = None
        raw_year = cell(row, "birth_year")
        if raw_year:
            match = re.search(r"(18|19|20)\d{2}", raw_year)
            if match:
                birth_year = int(match.group(0))
                if not 1900 <= birth_year <= _THIS_YEAR:
                    birth_year = None
        rows.append(
            {
                "bib": cell(row, "bib") or None,
                "family_name": family[:120],
                "first_name": first[:120],
                "gender": gender if gender in ("M", "F", "X") else "X",
                "birth_year": birth_year,
                "nationality": (cell(row, "nationality")[:3].upper() or None),
                "club": cell(row, "club")[:120] or None,
                "emergency_contact": cell(row, "emergency_contact")[:200] or None,
                "notes": cell(row, "notes")[:500] or None,
            }
        )
    return rows, skipped, columns, ignored


@router.post("/races/{race_id}/participants/import", response_model=ImportOut)
def import_participants(race_id: str, payload: ImportIn, organizer: Organizer = Depends(require_suite)) -> ImportOut:
    """Paste the entry list. With ``replace``, the current list goes first (and its passings with it)."""
    _race_for(race_id, organizer)
    rows, skipped, columns, ignored = parse_participant_sheet(payload.text)
    if payload.replace:
        suite_db.delete_all_participants(race_id)
    _room_for(race_id, len(rows))
    added = 0
    for row in rows:
        try:
            suite_db.create_participant(race_id, row)
            added += 1
        except suite_db.BibTaken:
            skipped.append(f"{row['first_name']} {row['family_name']}: bib {row['bib']} is already taken")
    return ImportOut(added=added, skipped=skipped[:200], columns=columns, ignored_columns=ignored)


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
    if payload.status == "dnf" and participant["status"] != "dnf":
        _emit("participant.dnf", race, suite_db.get_state(race.race_id), participant=row)
    return _participant_out(row)


@router.delete("/participants/{participant_id}", status_code=204)
def remove_participant(participant_id: str, organizer: Organizer = Depends(require_suite)) -> Response:
    _participant_for(participant_id, organizer)
    suite_db.delete_participant(participant_id)
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
    if checkpoint["kind"] == "start" and participant["status"] in ("registered", "dns"):
        new_status = "started"
    elif checkpoint["kind"] == "finish" and participant["status"] in ("registered", "started", "dnf"):
        new_status = "finished"
    if new_status:
        suite_db.set_participant_status(participant["participant_id"], new_status)
        participant = {**participant, "status": new_status}
    settings = _settings(state)
    start_cp = next((c for c in suite_db.list_checkpoints(race.race_id) if c["kind"] == "start"), None) if settings.timing == "net" else None
    start = _start_time_for(participant["participant_id"], state, settings, start_cp, _first_passings(suite_db.list_passings_for_participant(participant["participant_id"])))
    passing = {"passing_id": row["passing_id"], "recorded_at": row["recorded_at"].isoformat(), "elapsed_seconds": _elapsed(start, row["recorded_at"]), "source": source}
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
    return {"passing_id": row["passing_id"], "outcome": outcome}


@router.delete("/passings/{passing_id}", status_code=204)
def remove_passing(passing_id: int, organizer: Organizer = Depends(require_suite)) -> Response:
    with db.get_connection() as connection:
        row = connection.execute("SELECT race_id FROM suite_passings WHERE passing_id = %s", (passing_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="no passing with that id")
    _race_for(row["race_id"], organizer)
    suite_db.delete_passing(passing_id)
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
    return {"finishers": sum(1 for r in results if r.is_finisher), "rows": len(results), "scored": len(scores), "warnings": [issue.to_dict() for issue in report.warnings[:20]]}
