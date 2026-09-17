"""OTRI public API — events, race distances, scored results, and the organizer workflow.

Data model: an **event** (owned by an organizer) has one or more **race
distances** under it, each with its own course data and, optionally, an
attached GPX file. Races, results, and organizer accounts are persisted in
PostgreSQL (``api/db.py``). Organizer result submissions are always
re-validated and re-scored from the raw uploaded file — an organizer can
never supply a score directly (``HANDBOOK.md`` "Validation and anti-gaming").

Every event/race mutation requires the requesting organizer to own the
event (``_require_event_owner`` / ``_require_race_owner``), and organizers
must verify their email before they can log in at all.

Run locally with: ``uvicorn api.app:app --reload``
"""

from __future__ import annotations

import gzip
import json
import os
from dataclasses import asdict
from hashlib import sha256
from datetime import datetime, timezone
import re
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, Response, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool

from course import GpxParseError, extract_features, parse_track_points, read_track_points
from course.measurement import Measurement, measure_course
from course.features import features_from_measurement
from course.elevation import configured_provider
import logging

_log = logging.getLogger("otri.api")
if not os.environ.get("OTRI_DEM_MANIFEST"):
    _log.warning(
        "OTRI_DEM_MANIFEST is not set: courses are measured from uploaded elevations and every "
        "V0.7 score will report Low confidence. See scripts/deploy/06-install-dem.sh."
    )
from ingestion import result_records, validate_result_file
from scoring import available_scoring_models, estimate_score, get_scoring_model_info, score_race
from scoring.course_standard import MEASURED_DEMAND_VERSIONS

from . import db
from .auth import (
    AuthError,
    EmailNotVerifiedError,
    Organizer,
    authenticate_organizer,
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_access_token,
    register_organizer,
    request_email_verification,
    reset_password,
    verify_email,
)
from .email import send_password_reset_email, send_verification_email
from .rate_limit import enforce_rate_limit
from .schemas import (
    SharedCourseOut,
    EmailVerificationRequest,
    EventCreate,
    EventDetail,
    EventSummary,
    EventUpdate,
    GpxAnalysis,
    IllustrativeEstimateOut,
    MessageResponse,
    OrganizerCredentials,
    PasswordResetConfirm,
    PasswordResetRequest,
    RaceCreate,
    RaceSummary,
    RaceUpdate,
    ResendVerificationRequest,
    RunnerScoreOut,
    ScoringModelOut,
    SubmissionResult,
    TokenResponse,
    ValidationIssueOut,
)

REPO_ROOT = Path(__file__).resolve().parents[1]


@asynccontextmanager
async def _lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(
    title="OTRI API",
    description="Open Trail Running Index — events, race distances, scored results, and the organizer workflow.",
    version="0.1.0",
    lifespan=_lifespan,
)

# Captured once at process/worker start — the practical "last restarted at" for this API
# instance (a deploy restarts the systemd service, spawning a fresh process).
_STARTED_AT = datetime.now(timezone.utc)


# Configurable via OTRI_API_ALLOWED_ORIGINS (comma-separated), e.g.
# "https://otri.run,https://www.otri.run" in production. Defaults to the
# local Vite dev server so `npm run dev` + `uvicorn api.app:app` work together
# out of the box.
_allowed_origins = os.environ.get("OTRI_API_ALLOWED_ORIGINS", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"name": "OTRI API", "status": "in development", "docs": "/docs", "started_at": _STARTED_AT.isoformat()}


_bearer_scheme = HTTPBearer(auto_error=False)


def require_organizer(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> Organizer:
    """FastAPI dependency: requires a valid 'Authorization: Bearer <token>' header."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        return decode_access_token(credentials.credentials)
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


def _optional_organizer(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> Organizer | None:
    """Like require_organizer, but returns None instead of raising when no/invalid token is given."""
    if credentials is None:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except AuthError:
        return None


def _require_event_owner(event: db.Event, organizer: Organizer) -> None:
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="you do not have permission to modify this event")


def _require_race_owner(race: db.Race, organizer: Organizer) -> None:
    if race.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="you do not have permission to modify this race")


# --- Auth ------------------------------------------------------------------


@app.post("/auth/register", response_model=MessageResponse, status_code=201)
def register(payload: OrganizerCredentials, request: Request) -> MessageResponse:
    """Creates an unverified account and emails a verification link. No access token yet —
    organizers can't log in until they verify their email (see /auth/login)."""
    enforce_rate_limit(request, max_requests=5)
    try:
        organizer = register_organizer(payload.email, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    token = create_email_verification_token(organizer)
    send_verification_email(organizer.email, token)

    return MessageResponse(message="account created — check your email to verify it before signing in")


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: OrganizerCredentials, request: Request) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    try:
        organizer = authenticate_organizer(payload.email, payload.password)
    except EmailNotVerifiedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


@app.post("/auth/verify-email", response_model=MessageResponse)
def confirm_email(payload: EmailVerificationRequest) -> MessageResponse:
    try:
        verify_email(payload.token)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return MessageResponse(message="email verified — you can sign in now")


@app.post("/auth/resend-verification", response_model=MessageResponse)
def resend_verification(payload: ResendVerificationRequest, request: Request) -> MessageResponse:
    enforce_rate_limit(request, max_requests=5)
    result = request_email_verification(payload.email)
    if result is not None:
        organizer, token = result
        send_verification_email(organizer.email, token)
    # Same response either way — don't leak which emails have accounts / are already verified.
    return MessageResponse(message="if that email needs verifying, a new link has been sent")


@app.post("/auth/request-password-reset", response_model=MessageResponse)
def request_password_reset(payload: PasswordResetRequest, request: Request) -> MessageResponse:
    enforce_rate_limit(request, max_requests=5)
    result = create_password_reset_token(payload.email)
    if result is not None:
        organizer, token = result
        send_password_reset_email(organizer.email, token)
    # Always return the same response whether or not the email exists, so this
    # endpoint can't be used to enumerate registered organizer accounts.
    return MessageResponse(message="if that email has an account, a reset link has been sent")


@app.post("/auth/reset-password", response_model=TokenResponse)
def confirm_password_reset(payload: PasswordResetConfirm, request: Request) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    try:
        organizer = reset_password(payload.token, payload.new_password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


# --- Events ------------------------------------------------------------------


def _race_summary(race: db.Race) -> RaceSummary:
    return RaceSummary(
        race_id=race.race_id,
        event_id=race.event_id,
        event_name=race.event_name or "",
        event_date=race.event_date,
        course_name=race.course_name,
        distance_km=race.distance_km,
        elevation_gain_m=race.elevation_gain_m,
        has_gpx=race.has_gpx,
        scoring_version=race.scoring_version,
        measurement_version=race.measurement_version,
        measurement_status=race.measurement_status,
    )


def _validate_scoring_version(scoring_version: str | None) -> None:
    if scoring_version is None:
        return
    try:
        get_scoring_model_info(scoring_version)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/scoring/models", response_model=list[ScoringModelOut])
def list_scoring_models() -> list[ScoringModelOut]:
    """Every scoring algorithm a race distance can be configured to use — see scoring/registry.py."""
    return [ScoringModelOut(**vars(model)) for model in available_scoring_models()]


@app.get("/events", response_model=list[EventSummary])
def list_events(mine: bool = False, organizer: Organizer | None = Depends(_optional_organizer)) -> list[EventSummary]:
    """By default lists every event (public). Pass ?mine=true with a bearer token to list only
    events owned by the requesting organizer."""
    events = db.list_events()
    if mine:
        if organizer is None:
            raise HTTPException(status_code=401, detail="missing bearer token")
        events = [event for event in events if event.organizer_id == organizer.id]
    return [
        EventSummary(
            event_id=event.event_id,
            event_name=event.event_name,
            event_date=event.event_date,
            race_count=len(db.list_races_for_event(event.event_id)),
        )
        for event in events
    ]


@app.get("/events/{event_id}", response_model=EventDetail)
def get_event(event_id: str) -> EventDetail:
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    races = db.list_races_for_event(event_id)
    return EventDetail(
        event_id=event.event_id,
        event_name=event.event_name,
        event_date=event.event_date,
        race_count=len(races),
        races=[_race_summary(race) for race in races],
    )


@app.post("/events", response_model=EventSummary, status_code=201)
def create_event(payload: EventCreate, organizer: Organizer = Depends(require_organizer)) -> EventSummary:
    """Requires a valid, verified organizer bearer token."""
    if not payload.event_name.strip():
        raise HTTPException(status_code=422, detail="event_name is required")
    event = db.create_event(payload.event_name.strip(), payload.event_date, organizer.id)
    return EventSummary(event_id=event.event_id, event_name=event.event_name, event_date=event.event_date, race_count=0)


@app.patch("/events/{event_id}", response_model=EventSummary)
def edit_event(event_id: str, payload: EventUpdate, organizer: Organizer = Depends(require_organizer)) -> EventSummary:
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    _require_event_owner(event, organizer)

    updated = db.update_event(event_id, event_name=payload.event_name, event_date_=payload.event_date)
    return EventSummary(
        event_id=updated.event_id,
        event_name=updated.event_name,
        event_date=updated.event_date,
        race_count=len(db.list_races_for_event(event_id)),
    )


@app.delete("/events/{event_id}", status_code=204)
def remove_event(event_id: str, organizer: Organizer = Depends(require_organizer)) -> Response:
    """Deletes the event and cascades to its races and their results."""
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    _require_event_owner(event, organizer)
    db.delete_event(event_id)
    return Response(status_code=204)


# --- Races (distances under an event) ---------------------------------------


@app.get("/races", response_model=list[RaceSummary])
def list_races() -> list[RaceSummary]:
    return [_race_summary(race) for race in db.list_races()]


@app.get("/races/{race_id}", response_model=RaceSummary)
def get_race(race_id: str) -> RaceSummary:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    return _race_summary(race)


@app.post("/events/{event_id}/races", response_model=RaceSummary, status_code=201)
def add_race(event_id: str, payload: RaceCreate, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Add a race distance (e.g. "50K") to an event. Requires ownership of the event."""
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    _require_event_owner(event, organizer)

    if not payload.course_name.strip():
        raise HTTPException(status_code=422, detail="course_name is required")
    if payload.distance_km <= 0 or payload.elevation_gain_m < 0:
        raise HTTPException(status_code=422, detail="distance_km must be > 0 and elevation_gain_m must be >= 0")
    _validate_scoring_version(payload.scoring_version)

    race = db.create_race(
        event_id,
        payload.course_name.strip(),
        payload.distance_km,
        payload.elevation_gain_m,
        scoring_version=payload.scoring_version,
    )
    return _race_summary(race)


@app.patch("/races/{race_id}", response_model=RaceSummary)
def edit_race(race_id: str, payload: RaceUpdate, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)

    if race.has_gpx and (payload.distance_km is not None or payload.elevation_gain_m is not None):
        raise HTTPException(status_code=422, detail='Replace the GPX to change measured distance or elevation')

    if payload.distance_km is not None and payload.distance_km <= 0:
        raise HTTPException(status_code=422, detail="distance_km must be > 0")
    if payload.elevation_gain_m is not None and payload.elevation_gain_m < 0:
        raise HTTPException(status_code=422, detail="elevation_gain_m must be >= 0")
    _validate_scoring_version(payload.scoring_version)

    updated = db.update_race(
        race_id,
        course_name=payload.course_name.strip() if payload.course_name else None,
        distance_km=payload.distance_km,
        elevation_gain_m=payload.elevation_gain_m,
        scoring_version=payload.scoring_version,
    )
    return _race_summary(updated)


@app.delete("/races/{race_id}", status_code=204)
def remove_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> Response:
    """Deletes the race distance and cascades to its results."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    db.delete_race(race_id)
    return Response(status_code=204)


# --- GPX attachment ----------------------------------------------------------


# --- Measurement cache -------------------------------------------------------------------------
#
# Measuring a course from the DEM is the expensive step (geodesics for every edge, a raster
# lookup for every 10 m of course). The prototype asks for the same file several times - on load,
# for the first score, and on every slider settle - so the measurement is cached on disk, keyed by
# the file's content hash and the terrain manifest it was measured against. Disk rather than
# memory because gunicorn runs several workers on a 1 GB box. Bounded by count; entries are the
# same JSON snapshot the API already persists per race, so a cache hit is a `Measurement(**...)`.
_MEASUREMENT_CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache" / "measurements"
_MEASUREMENT_CACHE_MAX_ENTRIES = 64


def _manifest_fingerprint(provider) -> str:
    if provider is None:
        return "no-dem"
    try:
        st = os.stat(provider.path)
        return sha256(f"{provider.path.resolve()}|{st.st_mtime_ns}|{st.st_size}".encode()).hexdigest()[:16]
    except OSError:
        return "dem-unknown"


def _measurement_cache_key(path, provider) -> Path:
    digest = sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return _MEASUREMENT_CACHE_DIR / f"{digest.hexdigest()}-{_manifest_fingerprint(provider)}.json"


def _measurement_cache_get(path, provider):
    key = _measurement_cache_key(path, provider)
    try:
        snapshot = json.loads(key.read_text(encoding="utf-8"))
        key.touch()  # keep recently used entries when trimming
        return Measurement(**snapshot)
    except (OSError, ValueError, TypeError):
        return None


def _measurement_cache_put(path, provider, measurement) -> None:
    try:
        _MEASUREMENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = _measurement_cache_key(path, provider)
        tmp = key.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(measurement)), encoding="utf-8")
        os.replace(tmp, key)
        entries = sorted(_MEASUREMENT_CACHE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for stale in entries[:-_MEASUREMENT_CACHE_MAX_ENTRIES]:
            stale.unlink(missing_ok=True)
    except OSError:
        pass  # a cache that cannot be written just means measuring again next time


def _measure_gpx_path(path):
    points = read_track_points(path)
    provider = configured_provider()
    cached = _measurement_cache_get(path, provider)
    if cached is not None:
        return points, cached
    measurement = measure_course(points, provider)
    _measurement_cache_put(path, provider, measurement)
    return points, measurement


@app.post("/races/{race_id}/gpx", response_model=RaceSummary)
async def attach_race_gpx(
    race_id: str, file: UploadFile, organizer: Organizer = Depends(require_organizer)
) -> RaceSummary:
    """Attach (or replace) a GPX file for a race distance. Recomputes distance_km/elevation_gain_m
    from the real parsed course data — the GPX becomes the authoritative source once attached."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)

    suffix = Path(file.filename or "").suffix or ".gpx"
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path)
        features = features_from_measurement(measurement)
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        temp_path.unlink(missing_ok=True)

    updated = db.attach_gpx(
        race_id,
        filename=file.filename or "course.gpx",
        content=contents.decode("utf-8", errors="replace"),
        distance_km=features.distance_km,
        elevation_gain_m=features.elevation_gain_m,
        measurement={**measurement.to_dict(), "raw_sha256": sha256(contents).hexdigest(), "processed_at": datetime.now(timezone.utc).isoformat(), "snapshot": asdict(measurement)},
    )
    return _race_summary(updated)


@app.get("/races/{race_id}/measurement")
def get_race_measurement(race_id: str) -> dict:
    result = db.get_measurement(race_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No versioned measurement stored; reattach GPX to measure it")
    return {key: value for key, value in result.items() if key != "snapshot"}


@app.get("/races/{race_id}/gpx")
def get_race_gpx(race_id: str) -> Response:
    result = db.get_gpx_content(race_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"no GPX file attached to race {race_id!r}")
    _filename, content = result
    return Response(content=content, media_type="application/gpx+xml")


# --- Results ------------------------------------------------------------------


def _score_results(race: db.Race, results: list) -> list[RunnerScoreOut]:
    gpx_points = None
    stored_gpx = db.get_gpx_content(race.race_id)
    if stored_gpx is not None:
        _filename, content = stored_gpx
        gpx_points = parse_track_points(content)
    stored_measurement = db.get_measurement(race.race_id)
    if gpx_points is not None and race.scoring_version in MEASURED_DEMAND_VERSIONS and stored_measurement is None:
        raise ValueError('reattach the GPX to save a versioned measurement before using measured scoring')
    measurement = Measurement(**stored_measurement["snapshot"]) if stored_measurement else None
    scores = score_race(race.to_race_record(), results, model_version=race.scoring_version, gpx_points=gpx_points, measurement=measurement)
    return [RunnerScoreOut(**score.to_dict()) for score in scores]


@app.get("/races/{race_id}/results", response_model=list[RunnerScoreOut])
def get_race_results(race_id: str) -> list[RunnerScoreOut]:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")

    if not db.has_results(race_id):
        raise HTTPException(status_code=404, detail=f"no results on file for race {race_id!r}")

    try:
        return _score_results(race, db.get_results(race_id))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/races/{race_id}/results", response_model=SubmissionResult)
async def submit_race_results(
    race_id: str, file: UploadFile, organizer: Organizer = Depends(require_organizer)
) -> SubmissionResult:
    """Organizer submission workflow. Requires ownership of the race's event.

    Always validates then re-scores from the raw uploaded file — the
    organizer can never supply a score directly (HANDBOOK.md "Validation and
    anti-gaming"). A successful submission replaces any previously stored
    results for this race.
    """
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)

    suffix = Path(file.filename or "").suffix or ".csv"
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        report = validate_result_file(temp_path)
        if not report.is_valid:
            return SubmissionResult(
                is_valid=False,
                errors=[ValidationIssueOut(**issue.to_dict()) for issue in report.errors],
                warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
                scores=[],
            )

        results = result_records(temp_path)
        db.replace_results(race_id, results)

        try:
            scores = _score_results(race, results)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        return SubmissionResult(
            is_valid=True,
            errors=[],
            warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
            scores=scores,
        )
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/gpx/analyze", response_model=GpxAnalysis)
async def analyze_gpx(file: UploadFile, finish_time_seconds: int | None = Form(default=None)) -> GpxAnalysis:
    """Parse an uploaded GPX file and, optionally, predict its Course Standard score for a given time.

    Uses the exact same formula as the real post-race scorer (no competitor
    assumption needed) — see ``scoring.estimator``'s module docstring and
    ``docs/gpx-predictor.md``.
    """
    suffix = Path(file.filename or "").suffix or ".gpx"
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path)
        features = features_from_measurement(measurement)
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        temp_path.unlink(missing_ok=True)

    estimate = None
    if finish_time_seconds is not None:
        try:
            estimate = IllustrativeEstimateOut(**estimate_score(finish_time_seconds, gpx_points=points, measurement=measurement).to_dict())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    return GpxAnalysis(features=features.to_dict(), estimate=estimate, measurement={**measurement.to_dict(), "raw_sha256": sha256(contents).hexdigest()})


# ----------------------------------------------------------------------------- shared courses
# A calculator share link needs the course file to still exist when someone opens the link.
# Verified races are referenced by race id; an uploaded GPX is stored here only when the user
# explicitly clicks "Share", under an id derived from its content (the same file shares one id).
# Guardrails, because the route is public: a per-IP rate limit, a per-file size cap (real GPX
# files are 0.1-3 MB), gzip on disk (~10x smaller), and a total cap with oldest-first eviction
# so worst-case growth is bounded — an abuser can push out old links, never fill the disk.
_SHARED_COURSE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache" / "shared-courses"
_SHARE_ID_RE = re.compile(r"^[0-9a-f]{16}$")
_SHARED_COURSE_MAX_FILE_BYTES = 10_000_000
_SHARED_COURSE_MAX_TOTAL_BYTES = int(float(os.environ.get("OTRI_SHARED_COURSES_MAX_MB", "2048")) * 1_000_000)


def _shared_course_path(share_id: str) -> Path:
    return _SHARED_COURSE_DIR / f"{share_id}.gpx.gz"


def _shared_course_meta_path(share_id: str) -> Path:
    return _SHARED_COURSE_DIR / f"{share_id}.json"


def _shared_course_meta(share_id: str) -> dict:
    try:
        return json.loads(_shared_course_meta_path(share_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _evict_shared_courses(budget_bytes: int) -> None:
    """Delete the oldest shared courses until the folder fits the budget."""
    try:
        entries = sorted(_SHARED_COURSE_DIR.glob("*.gpx.gz"), key=lambda path: path.stat().st_mtime)
        total = sum(path.stat().st_size for path in entries)
        for path in entries:
            if total <= budget_bytes:
                break
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            _shared_course_meta_path(path.name[: -len(".gpx.gz")]).unlink(missing_ok=True)
            total -= size
    except OSError:
        pass


@app.post("/gpx/share", response_model=SharedCourseOut)
async def share_gpx(request: Request, file: UploadFile, name: str | None = Form(default=None)) -> SharedCourseOut:
    """Store an uploaded GPX so a calculator link can reopen it. The uploader consents by sharing."""
    enforce_rate_limit(request, max_requests=10)
    contents = await file.read(_SHARED_COURSE_MAX_FILE_BYTES + 1)
    if len(contents) > _SHARED_COURSE_MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"A shared course may be at most {_SHARED_COURSE_MAX_FILE_BYTES // 1_000_000} MB")
    try:
        points = parse_track_points(contents.decode("utf-8"))
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if len(points) < 2:
        raise HTTPException(status_code=422, detail="The GPX has fewer than two track points")

    share_id = sha256(contents).hexdigest()[:16]
    path = _shared_course_path(share_id)
    created = not path.exists()
    if created:
        _SHARED_COURSE_DIR.mkdir(parents=True, exist_ok=True)
        packed = gzip.compress(contents, compresslevel=6)
        # Make room first so the new file is never the one evicted.
        _evict_shared_courses(max(0, _SHARED_COURSE_MAX_TOTAL_BYTES - len(packed)))
        path.write_bytes(packed)
        clean_name = (name or Path(file.filename or "").stem or "").strip()[:120] or None
        _shared_course_meta_path(share_id).write_text(
            json.dumps({"name": clean_name, "filename": file.filename, "created_at": datetime.now(timezone.utc).isoformat()}),
            encoding="utf-8",
        )
    else:
        # Touch, so an actively shared course is evicted after the ones nobody reshares.
        try:
            path.touch()
        except OSError:
            pass
    meta = _shared_course_meta(share_id)
    return SharedCourseOut(share_id=share_id, name=meta.get("name"), created=created)


@app.get("/gpx/shared/{share_id}")
def get_shared_gpx(share_id: str) -> Response:
    """The GPX behind a share link, exactly as uploaded."""
    if not _SHARE_ID_RE.match(share_id):
        raise HTTPException(status_code=404, detail="No shared course with that id")
    path = _shared_course_path(share_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="No shared course with that id")
    try:
        contents = gzip.decompress(path.read_bytes())
    except (OSError, EOFError, gzip.BadGzipFile) as error:
        raise HTTPException(status_code=404, detail="No shared course with that id") from error
    return Response(content=contents, media_type="application/gpx+xml")
