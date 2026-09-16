"""OTRI public API — races, scored results, and the organizer submission workflow.

Stateless for now: races/results are read from ``data/demo/`` on each request
and nothing is persisted. A real database is a separate, future decision
(see ``docs/roadmap.md``) — this establishes the request/response contract
first, per HANDBOOK.md's "start small" guidance.

Run locally with: ``uvicorn api.app:app --reload``
"""

from __future__ import annotations

import csv
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from course import GpxParseError, extract_features, read_track_points
from ingestion import InvalidFileError, race_records, result_records, validate_race_file, validate_result_file
from scoring import estimate_illustrative_score, score_race

from .auth import AuthError, Organizer, authenticate_organizer, create_access_token, decode_access_token, register_organizer
from .schemas import (
    GpxAnalysis,
    IllustrativeEstimateOut,
    OrganizerCredentials,
    RaceCreate,
    RaceSummary,
    RunnerScoreOut,
    SubmissionResult,
    TokenResponse,
    ValidationIssueOut,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"

app = FastAPI(
    title="OTRI API",
    description="Open Trail Running Index — races, scored results, and the organizer submission workflow.",
    version="0.1.0",
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
def register(payload: OrganizerCredentials) -> TokenResponse:
    try:
        organizer = register_organizer(payload.email, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: OrganizerCredentials) -> TokenResponse:
    try:
        organizer = authenticate_organizer(payload.email, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return TokenResponse(access_token=create_access_token(organizer), email=organizer.email)


@app.get("/races", response_model=list[RaceSummary])
def list_races() -> list[RaceSummary]:
    return [RaceSummary(**vars(race)) for race in race_records(RACES_FILE)]


def _find_race(race_id: str):
    return next((race for race in race_records(RACES_FILE) if race.race_id == race_id), None)


@app.get("/races/{race_id}", response_model=RaceSummary)
def get_race(race_id: str) -> RaceSummary:
    race = _find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    return RaceSummary(**vars(race))


@app.post("/races", response_model=RaceSummary, status_code=201)
def create_race(payload: RaceCreate, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Organizer race registration. Requires a valid organizer bearer token.

    Prototype-only persistence: appends to the demo ``races.csv`` on disk and
    re-validates the whole file, rolling back on failure. This is NOT safe
    under concurrent writes and is not a real database — see api/README.md
    "Known gaps". Replace with real persistence before any production use.
    """
    if _find_race(payload.race_id) is not None:
        raise HTTPException(status_code=409, detail=f"race {payload.race_id!r} already exists")

    with RACES_FILE.open("a", newline="", encoding="utf-8") as handle:
        csv.writer(handle).writerow(
            [
                payload.race_id,
                payload.race_name,
                payload.event_date.isoformat(),
                payload.course_name,
                payload.distance_km,
                payload.elevation_gain_m,
            ]
        )

    report = validate_race_file(RACES_FILE)
    if not report.is_valid:
        _remove_last_races_row()
        raise HTTPException(status_code=422, detail=[issue.to_dict() for issue in report.errors])

    return RaceSummary(**vars(_find_race(payload.race_id)))


def _remove_last_races_row() -> None:
    lines = RACES_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
    RACES_FILE.write_text("".join(lines[:-1]), encoding="utf-8")


def _score_result_file(race, result_path: Path) -> list[RunnerScoreOut]:
    results = result_records(result_path)
    return [RunnerScoreOut(**score.to_dict()) for score in score_race(race, results)]


@app.get("/races/{race_id}/results", response_model=list[RunnerScoreOut])
def get_race_results(race_id: str) -> list[RunnerScoreOut]:
    race = _find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")

    result_path = RESULTS_DIR / f"{race_id}.csv"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail=f"no results on file for race {race_id!r}")

    try:
        return _score_result_file(race, result_path)
    except InvalidFileError as error:
        # A result file already on disk should always be valid; surface this
        # loudly rather than silently returning an empty/partial response.
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/races/{race_id}/results", response_model=SubmissionResult)
async def submit_race_results(
    race_id: str, file: UploadFile, organizer: Organizer = Depends(require_organizer)
) -> SubmissionResult:
    """Organizer submission workflow. Requires a valid organizer bearer token.

    Always validates then re-scores from the raw uploaded file — the
    organizer can never supply a score directly (HANDBOOK.md "Validation and
    anti-gaming"). Nothing is persisted yet; see module docstring.
    """
    race = _find_race(race_id)
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

        return SubmissionResult(
            is_valid=True,
            errors=[],
            warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
            scores=_score_result_file(race, temp_path),
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
