"""OTRI public API — races, scored results, and the organizer submission workflow.

Stateless for now: races/results are read from ``data/demo/`` on each request
and nothing is persisted. A real database is a separate, future decision
(see ``docs/roadmap.md``) — this establishes the request/response contract
first, per HANDBOOK.md's "start small" guidance.

Run locally with: ``uvicorn api.app:app --reload``
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile

from ingestion import InvalidFileError, race_records, result_records, validate_result_file
from scoring import score_race

from .schemas import RaceSummary, RunnerScoreOut, SubmissionResult, ValidationIssueOut

REPO_ROOT = Path(__file__).resolve().parents[1]
RACES_FILE = REPO_ROOT / "data" / "demo" / "races.csv"
RESULTS_DIR = REPO_ROOT / "data" / "demo" / "results"

app = FastAPI(
    title="OTRI API",
    description="Open Trail Running Index — races, scored results, and the organizer submission workflow.",
    version="0.1.0",
)


@app.get("/")
def root() -> dict:
    return {"name": "OTRI API", "status": "in development", "docs": "/docs"}


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
async def submit_race_results(race_id: str, file: UploadFile) -> SubmissionResult:
    """Organizer submission workflow.

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
