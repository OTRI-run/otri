"""Pydantic response models for the OTRI API.

Kept separate from the domain dataclasses in ``ingestion``/``scoring`` so the
wire format can evolve independently of internal representations.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class EventSummary(BaseModel):
    event_id: str
    event_name: str
    event_date: date
    race_count: int = 0
    location: str | None = None
    country: str | None = None


class EventCreate(BaseModel):
    event_name: str = Field(max_length=200)
    event_date: date
    location: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=8)


class EventUpdate(BaseModel):
    event_name: str | None = Field(default=None, max_length=200)
    event_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=8)


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
    event_location: str | None = None
    event_country: str | None = None
    organizer_display: str | None = None
    organizer_website: str | None = None
    elevation_loss_m: float | None = None
    # Uphill-only course (course/discipline.py). A label for finding races; never enters a score.
    is_vertical: bool = False
    # Listings (docs/product/race-listings.md): 'scored' once results are published; a listed race
    # without them is 'upcoming' or 'awaiting_results' by its date; anything else is 'private'.
    listing_status: str = "private"
    is_listed: bool = False
    is_claimed: bool = True
    request_count: int = 0
    official_url: str | None = None
    course_permission: str | None = None


class ListingRaceIn(BaseModel):
    course_name: str = Field(max_length=200)
    distance_km: float
    elevation_gain_m: float = 0.0


class ListingCreate(BaseModel):
    """Race facts for a public listing nobody has claimed yet. Facts only: a course file is attached
    separately and needs a recorded licence or permission (DATA_POLICY.md)."""

    event_name: str = Field(max_length=200)
    event_date: date
    location: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=8)
    website: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=500)
    races: list[ListingRaceIn] = Field(min_length=1, max_length=30)


class ListingImportResult(BaseModel):
    created_events: int = 0
    created_races: int = 0
    skipped: list[str] = []


class RaceListingUpdate(BaseModel):
    course_permission: str | None = Field(default=None, max_length=500)


class EventAssign(BaseModel):
    organizer_email: str | None = Field(default=None, max_length=320)


class ScoreRequestIn(BaseModel):
    client_id: str | None = Field(default=None, max_length=80)


class ScoreRequestOut(BaseModel):
    request_count: int
    counted: bool


class EventDetail(EventSummary):
    races: list[RaceSummary] = []


class RaceCreate(BaseModel):
    course_name: str = Field(max_length=200)
    distance_km: float
    elevation_gain_m: float
    scoring_version: str | None = Field(default=None, max_length=80)


class RaceUpdate(BaseModel):
    course_name: str | None = Field(default=None, max_length=200)
    distance_km: float | None = None
    elevation_gain_m: float | None = None
    scoring_version: str | None = Field(default=None, max_length=80)


class RunnerScoreOut(BaseModel):
    """A leaderboard row. Finishers carry a score; DNF/DSQ rows carry the code as rank and no score."""

    rank: int | str
    bib_number: str | None
    family_name: str
    first_name: str
    otri_score: int | None = None
    base_performance: float = 0.0
    course_adjustment: float = 0.0
    field_adjustment: float = 0.0
    environmental_factor: float = 0.0
    confidence: str = "n/a"
    scoring_version: str
    status: str = "finisher"
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


class AdminOrganizerOut(BaseModel):
    id: int
    email: str
    email_verified: bool
    is_admin: bool
    is_demo: bool
    created_at: datetime
    event_count: int = 0
    race_count: int = 0
    display_name: str | None = None
    organization: str | None = None
    two_factor_method: str | None = None
    marketing_opt_in: bool = False
    terms_accepted_at: datetime | None = None


class NewsletterSubscriber(BaseModel):
    email: str
    display_name: str | None = None
    organization: str | None = None
    country: str | None = None
    marketing_opt_in_at: datetime | None = None


class SharedCourseAdminOut(BaseModel):
    share_id: str
    name: str | None = None
    filename: str | None = None
    created_at: str | None = None
    size_bytes: int = 0


class ReportCreate(BaseModel):
    kind: str = Field(max_length=40)
    subject_id: str = Field(max_length=200)
    subject_label: str | None = Field(default=None, max_length=300)
    reason: str | None = Field(default=None, max_length=80)
    message: str = Field(max_length=4000)
    reporter_email: str | None = Field(default=None, max_length=320)
    page_url: str | None = Field(default=None, max_length=1000)


class ReportOut(BaseModel):
    id: int
    kind: str
    subject_id: str
    subject_label: str | None = None
    reason: str | None = None
    message: str
    reporter_email: str | None = None
    page_url: str | None = None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution: str | None = None


class ReportResolve(BaseModel):
    resolution: str | None = None


class AdminOverview(BaseModel):
    stats: dict
    api: dict
    security: dict
    admin_accounts: list[str] = []
    recent_signups: list[AdminOrganizerOut] = []
    recent_races: list[RaceSummary] = []


class ProfileOut(BaseModel):
    display_name: str | None = None
    organization: str | None = None
    website: str | None = None
    phone: str | None = None
    country: str | None = None
    bio: str | None = None
    marketing_opt_in: bool = False
    marketing_opt_in_at: datetime | None = None
    terms_accepted_at: datetime | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    organization: str | None = None
    website: str | None = None
    phone: str | None = None
    country: str | None = None
    bio: str | None = None
    marketing_opt_in: bool | None = None


class TwoFactorStatus(BaseModel):
    enabled: bool = False
    method: str | None = None
    recovery_codes_left: int = 0


class MeResponse(BaseModel):
    email: str
    is_admin: bool = False
    is_demo: bool = False
    profile: ProfileOut = ProfileOut()
    two_factor: TwoFactorStatus = TwoFactorStatus()
    password_changed_at: datetime | None = None


class TwoFactorLogin(BaseModel):
    challenge: str
    code: str


class TwoFactorCode(BaseModel):
    code: str


class PasswordConfirm(BaseModel):
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class RecoveryCodesOut(BaseModel):
    codes: list[str]
    method: str


class AdminEventOut(EventSummary):
    """An event as the admin sees it: who owns it and every race with its publish state."""

    organizer_email: str | None = None
    website: str | None = None
    source_url: str | None = None
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
    remember: bool = False


class OrganizerRegistration(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)
    accept_terms: bool = False
    marketing_opt_in: bool = False



class TokenResponse(BaseModel):
    requires_2fa: bool = False
    challenge: str | None = None
    method: str | None = None
    expires_in: int | None = None
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
    email: str = Field(max_length=320)


class PasswordResetConfirm(BaseModel):
    token: str = Field(max_length=512)
    new_password: str = Field(max_length=1024)
