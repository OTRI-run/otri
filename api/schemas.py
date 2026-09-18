"""Pydantic response models for the OTRI API.

Kept separate from the domain dataclasses in ``ingestion``/``scoring`` so the
wire format can evolve independently of internal representations.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class EventSummary(BaseModel):
    event_id: str
    event_name: str
    event_date: date
    race_count: int = 0


class EventCreate(BaseModel):
    event_name: str
    event_date: date


class EventUpdate(BaseModel):
    event_name: str | None = None
    event_date: date | None = None


class RaceSummary(BaseModel):
    race_id: str
    event_id: str
    event_name: str
    event_date: date
    course_name: str
    distance_km: float
    elevation_gain_m: float
    has_gpx: bool = False
    scoring_version: str
    measurement_version: str | None = None
    measurement_status: str | None = None
    published_at: datetime | None = None
    is_published: bool = False
    is_demo: bool = False
    finisher_count: int | None = None


class EventDetail(EventSummary):
    races: list[RaceSummary] = []


class RaceCreate(BaseModel):
    course_name: str
    distance_km: float
    elevation_gain_m: float
    scoring_version: str | None = None


class RaceUpdate(BaseModel):
    course_name: str | None = None
    distance_km: float | None = None
    elevation_gain_m: float | None = None
    scoring_version: str | None = None


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
    performance_rate: float = 0.0
    quality_flags: list[str] = []
    finish_time_seconds: int | None = None
    runner_id: str | None = None
    gender: str | None = None
    nationality: str | None = None


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


class EstimateBreakdownOut(BaseModel):
    """Intermediates of one score, for explaining it (see scoring.estimator.EstimateBreakdown)."""

    physical_distance_km: float
    course_demand_km: float
    terrain_factor: float
    steep_distance_fraction: float
    altitude_excess_m: float
    adjusted_demand_km: float
    performance_rate: float
    reference_rate: float | None = None
    fraction_of_ceiling: float | None = None
    reference_factor: float | None = None
    lookup_rate: float | None = None
    riegel_exponent: float | None = None
    world_best_time_seconds: float


class IllustrativeEstimateOut(BaseModel):
    equivalent_distance_km: float
    performance_rate: float
    otri_raw: float
    predicted_score: int
    scoring_version: str
    disclaimer: str
    quality_flags: list[str] = []
    breakdown: EstimateBreakdownOut | None = None
    confidence: str = "Low"


class GpxAnalysis(BaseModel):
    measurement: dict = {}
    features: dict
    estimate: IllustrativeEstimateOut | None = None


class RunnerIndexOut(BaseModel):
    version: str
    as_of: date
    index: int | None
    provisional: bool
    counted: int
    window_months: int
    full_weight_months: int


class RunnerSummary(BaseModel):
    runner_id: str
    family_name: str
    first_name: str
    gender: str
    nationality: str | None = None
    age_category: str | None = None
    result_count: int = 0
    last_race_date: date | None = None
    index: int | None = None
    provisional: bool = True


class RunnerResultOut(BaseModel):
    result_id: str
    race_id: str
    event_id: str
    event_name: str
    event_date: date
    course_name: str
    distance_km: float
    elevation_gain_m: float
    has_gpx: bool
    is_demo: bool = False
    rank: int
    finish_time_seconds: int | None = None
    otri_score: int
    confidence: str
    scoring_version: str
    weight: float
    counts: bool
    status: str
    full_until: date
    expires_on: date


class RunnerProfile(RunnerSummary):
    index_details: RunnerIndexOut
    results: list[RunnerResultOut] = []


class MeResponse(BaseModel):
    email: str
    is_admin: bool = False
    is_demo: bool = False


class AdminEventOut(EventSummary):
    """An event as the admin sees it: who owns it and every race with its publish state."""

    organizer_email: str | None = None
    published_count: int = 0
    races: list[RaceSummary] = []


class SharedCourseOut(BaseModel):
    """A course file stored, with the uploader's consent, so a calculator link can reopen it."""

    share_id: str
    name: str | None = None
    created: bool


class ScoringModelOut(BaseModel):
    version: str
    name: str
    description: str
    uses_competitors: bool


class OrganizerCredentials(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    is_admin: bool = False
    is_demo: bool = False
    access_token: str
    token_type: str = "bearer"
    email: str


class MessageResponse(BaseModel):
    message: str


class EmailVerificationRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
