"""OTRI public API — races, scored results, and the organizer submission workflow.

Races, results, and organizer accounts are persisted in PostgreSQL (``api/db.py``).
Organizer submissions are always re-validated and re-scored from the raw
uploaded file before being stored — an organizer can never supply a score
directly (``HANDBOOK.md`` "Validation and anti-gaming").

Run locally with: ``uvicorn api.app:app --reload``
"""

from __future__ import annotations

import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from course import GpxParseError, extract_features, read_track_points
from ingestion import InvalidFileError, result_records, validate_result_file
from ingestion.records import RaceRecord
from scoring import estimate_illustrative_score, score_race

from . import db
from .auth import (
    AuthError,
    Organizer,
    authenticate_organizer,
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_access_token,
    register_organizer,
    reset_password,
    verify_email,
)
from .email import send_password_reset_email, send_verification_email
from .rate_limit import enforce_rate_limit
from .schemas import (
    EmailVerificationRequest,
    GpxAnalysis,
    IllustrativeEstimateOut,
    MessageResponse,
    OrganizerCredentials,
    PasswordResetConfirm,
    PasswordResetRequest,
    RaceCreate,
    RaceSummary,
    RunnerScoreOut,
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
    description="Open Trail Running Index — races, scored results, and the organizer submission workflow.",
    version="0.1.0",
    lifespan=_lifespan,
)


# Configurable via OTRI_API_ALLOWED_ORIGINS (comma-separated), e.g.
# "https://otri.run,https://www.otri.run" in production. Defaults to the
# local Vite dev server so `npm run dev` + `uvicorn api.app:app` work together
# out of the box.
_allowed_origins = os.environ.get("OTRI_API_ALLOWED_ORIGINS", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"name": "OTRI API", "status": "in development", "docs": "/docs"}


_bearer_scheme = HTTPBearer(auto_error=False)


def require_organizer(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> Organizer:
    """FastAPI dependency: requires a valid 'Authorization: Bearer <token>' header."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        return decode_access_token(credentials.credentials)
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.post("/auth/register", response_model=TokenResponse, status_code=201)
def register(payload: OrganizerCredentials, request: Request) -> TokenResponse:
    enforce_rate_limit(request, max_requests=5)
    try:
        organizer = register_organizer(payload.email, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    token = create_email_verification_token(organizer)
    send_verification_email(organizer.email, token)

    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: OrganizerCredentials, request: Request) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    try:
        organizer = authenticate_organizer(payload.email, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


@app.post("/auth/verify-email", response_model=MessageResponse)
def confirm_email(payload: EmailVerificationRequest) -> MessageResponse:
    try:
        verify_email(payload.token)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return MessageResponse(message="email verified")


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


@app.get("/races", response_model=list[RaceSummary])
def list_races() -> list[RaceSummary]:
    return [RaceSummary(**vars(race)) for race in db.list_races()]


@app.get("/races/{race_id}", response_model=RaceSummary)
def get_race(race_id: str) -> RaceSummary:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    return RaceSummary(**vars(race))


@app.post("/races", response_model=RaceSummary, status_code=201)
def create_race(payload: RaceCreate, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Organizer race registration. Requires a valid organizer bearer token."""
    if db.find_race(payload.race_id) is not None:
        raise HTTPException(status_code=409, detail=f"race {payload.race_id!r} already exists")

    race = RaceRecord(
        race_id=payload.race_id,
        race_name=payload.race_name,
        event_date=payload.event_date,
        course_name=payload.course_name,
        distance_km=payload.distance_km,
        elevation_gain_m=payload.elevation_gain_m,
    )
    if race.distance_km <= 0 or race.elevation_gain_m < 0:
        raise HTTPException(status_code=422, detail="distance_km must be > 0 and elevation_gain_m must be >= 0")

    db.insert_race(race, organizer_id=organizer.id)
    return RaceSummary(**vars(race))


def _score_results(race: RaceRecord, results: list) -> list[RunnerScoreOut]:
    return [RunnerScoreOut(**score.to_dict()) for score in score_race(race, results)]


@app.get("/races/{race_id}/results", response_model=list[RunnerScoreOut])
def get_race_results(race_id: str) -> list[RunnerScoreOut]:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")

    if not db.has_results(race_id):
        raise HTTPException(status_code=404, detail=f"no results on file for race {race_id!r}")

    return _score_results(race, db.get_results(race_id))


@app.post("/races/{race_id}/results", response_model=SubmissionResult)
async def submit_race_results(
    race_id: str, file: UploadFile, organizer: Organizer = Depends(require_organizer)
) -> SubmissionResult:
    """Organizer submission workflow. Requires a valid organizer bearer token.

    Always validates then re-scores from the raw uploaded file — the
    organizer can never supply a score directly (HANDBOOK.md "Validation and
    anti-gaming"). A successful submission replaces any previously stored
    results for this race.
    """
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")

    suffix = Path(file.filename or "").suffix or ".csv"
    contents = await file.read()
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

        return SubmissionResult(
            is_valid=True,
            errors=[],
            warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
            scores=_score_results(race, results),
        )
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/gpx/analyze", response_model=GpxAnalysis)
async def analyze_gpx(file: UploadFile, finish_time_seconds: int | None = Form(default=None)) -> GpxAnalysis:
    """Parse an uploaded GPX file and, optionally, estimate an illustrative score for a given time.

    The estimate is explicitly NOT a calibrated prediction — see
    ``scoring.estimator``'s module docstring and ``docs/gpx-predictor.md``.
    """
    suffix = Path(file.filename or "").suffix or ".gpx"
    contents = await file.read()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        points = read_track_points(temp_path)
        features = extract_features(points)
    except GpxParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        temp_path.unlink(missing_ok=True)

    estimate = None
    if finish_time_seconds is not None:
        estimate = IllustrativeEstimateOut(
            **estimate_illustrative_score(features.distance_km, features.elevation_gain_m, finish_time_seconds).to_dict()
        )

    return GpxAnalysis(features=features.to_dict(), estimate=estimate)
