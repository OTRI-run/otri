"""Pydantic response models for the OTRI API.

Kept separate from the domain dataclasses in ``ingestion``/``scoring`` so the
wire format can evolve independently of internal representations.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class RaceSummary(BaseModel):
    race_id: str
    race_name: str
    event_date: date
    course_name: str
    distance_km: float
    elevation_gain_m: float


class RaceCreate(BaseModel):
    race_id: str
    race_name: str
    event_date: date
    course_name: str
    distance_km: float
    elevation_gain_m: float


class RunnerScoreOut(BaseModel):
    rank: int
    bib_number: str | None
    family_name: str
    first_name: str
    otri_score: int
    base_performance: float
    course_adjustment: float
    field_adjustment: float
    environmental_factor: float
    confidence: str
    scoring_version: str


class ValidationIssueOut(BaseModel):
    severity: str
    row: int | None
    field: str | None
    message: str


class SubmissionResult(BaseModel):
    is_valid: bool
    errors: list[ValidationIssueOut]
    warnings: list[ValidationIssueOut]
    scores: list[RunnerScoreOut] = []


class IllustrativeEstimateOut(BaseModel):
    equivalent_distance_km: float
    pace_seconds_per_km: float
    illustrative_score: int
    disclaimer: str


class GpxAnalysis(BaseModel):
    features: dict
    estimate: IllustrativeEstimateOut | None = None


class OrganizerCredentials(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class MessageResponse(BaseModel):
    message: str


class EmailVerificationRequest(BaseModel):
    token: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
