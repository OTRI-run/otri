"""Pydantic response models for the OTRI API.

Kept separate from the domain dataclasses in ``ingestion``/``scoring`` so the
wire format can evolve independently of internal representations.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class EventSummary(BaseModel):
    event_id: str
    event_name: str
    event_date: date
    race_count: int = 0
    location: str | None = None
    country: str | None = None


# A race happened, or is going to happen, within a human span of years. Anything outside this is a
# typo or a probe, and it does not stay harmless: a runner's index weights a result by how long ago
# it was, and the arithmetic that does it (scoring/runner_index.add_months) adds two years to the
# event date, so an event in the year 9999 took every public page that runner appears on down with
# a ValueError. Refused where it arrives instead.
EARLIEST_EVENT = date(1900, 1, 1)
EVENT_YEARS_AHEAD = 5


def _plausible_event_date(value: date | None) -> date | None:
    if value is None:
        return value
    latest = date(date.today().year + EVENT_YEARS_AHEAD, 12, 31)
    if value < EARLIEST_EVENT or value > latest:
        raise ValueError(f"event_date must be between {EARLIEST_EVENT.isoformat()} and {latest.isoformat()}")
    return value


class EventCreate(BaseModel):
    event_name: str = Field(max_length=200)
    event_date: date
    location: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=8)

    _check_date = field_validator("event_date")(_plausible_event_date)


class EventUpdate(BaseModel):
    event_name: str | None = Field(default=None, max_length=200)
    event_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=8)

    _check_date = field_validator("event_date")(_plausible_event_date)


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
    # 'scored' once results are published; a race its organizer listed ahead of them is 'upcoming'
    # without them is 'upcoming' or 'awaiting_results' by its date; anything else is 'private'.
    listing_status: str = "private"
    is_listed: bool = False
    # A course put up by OTRI for the calculator's "Pick a race": not a race page, no results to come.
    calculator_only: bool = False
    # Where the course file came from (the organizer's page), shown with a calculator course.
    source_url: str | None = None
    # The edition (year) a calculator course's file is from, when the admin gave one.
    edition_year: int | None = None
    # The publish review (api/screening.py). 'none' until published; 'pending' while public and
    # waiting to verify itself; 'verified'; 'held' (not public, an admin decides); 'rejected'.
    review_status: str = "none"
    # The rest only for the race's owner and admins: what the automatic check noted, when the
    # race verifies itself, who decided, and the note an admin left.
    review_flags: list[dict] | None = None
    auto_verify_at: datetime | None = None
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None
    review_note: str | None = None
    publish_attested_at: datetime | None = None

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


class RunnerDeletedOut(BaseModel):
    """What removing a runner actually did, including to races the admin was not looking at."""

    results_removed: int
    unpublished_races: list[str] = []


class PendingAddressOut(BaseModel):
    """The address a Google sign-in ended on, handed to the page that needs to show it."""

    email: str = ""


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
    # How the results file was understood: the header each field was read from ("finish_time":
    # "Temps", "full_name": "Runner" when one column held the whole name, "category" when gender
    # came from it), and the headers nothing was read from.
    columns: dict[str, str] = {}
    ignored_columns: list[str] = []


class ScoredCourse(BaseModel):
    """The course a results file was scored against, as `POST /score` understood it."""

    name: str | None = None
    # Always measured from the uploaded course file: `POST /score` does not score official figures.
    source: str = "gpx"
    distance_km: float
    elevation_gain_m: float
    confidence: str | None = None
    quality_flags: list[str] = []
    # Why the course carries finish times only (an uphill-only course today); None when it is scored.
    not_scored_reason: str | None = None


class ScoreSummary(BaseModel):
    finishers: int = 0
    non_finishers: int = 0
    best_score: int | None = None
    median_score: int | None = None


class ScoreRaceResult(SubmissionResult):
    """`POST /score`: a results file validated and scored against a course, and nothing kept."""

    stored: bool = False
    scoring_version: str
    course: ScoredCourse
    summary: ScoreSummary = ScoreSummary()
    measurement: dict | None = None


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
    payload: dict | None = None


class ReportResolve(BaseModel):
    resolution: str | None = None


class AdminOverview(BaseModel):
    stats: dict
    api: dict
    security: dict
    admin_accounts: list[str] = []
    recent_signups: list[AdminOrganizerOut] = []
    recent_races: list[RaceSummary] = []


class SiteHit(BaseModel):
    """What a page sends when it is opened. Short names because this goes out on every view, and
    nothing in it identifies anybody: see api/analytics.py."""

    p: str = Field(default="/", max_length=200)     # the path, without any id in it
    r: str = Field(default="", max_length=500)      # the referring address; only its host is kept
    tz: str = Field(default="", max_length=60)      # the browser's time zone, as coarse a "where" as this gets
    e: str | None = Field(default=None, max_length=40)  # a named action instead of a page view


class TrafficSummary(BaseModel):
    by_day: list[dict] = []
    pages: list[dict] = []
    sources: list[dict] = []
    zones: list[dict] = []
    devices: list[dict] = []
    browsers: list[dict] = []
    actions: list[dict] = []
    totals: dict = {}


class ProfileOut(BaseModel):
    display_name: str | None = None
    organization: str | None = None
    website: str | None = None
    country: str | None = None
    bio: str | None = None
    marketing_opt_in: bool = False
    marketing_opt_in_at: datetime | None = None
    terms_accepted_at: datetime | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    organization: str | None = None
    website: str | None = None
    country: str | None = None
    bio: str | None = None
    marketing_opt_in: bool | None = None


class TwoFactorStatus(BaseModel):
    enabled: bool = False
    method: str | None = None
    recovery_codes_left: int = 0


class MaintenanceState(BaseModel):
    """Whether the site is closed for maintenance, as the public sees it."""

    on: bool = False
    # What the closed site says, in the admin's words; empty means the default wording.
    message: str = ""
    since: datetime | None = None


class SiteStatus(BaseModel):
    maintenance: MaintenanceState = MaintenanceState()


class MaintenanceUpdate(BaseModel):
    on: bool
    message: str = Field("", max_length=500)


class MeResponse(BaseModel):
    email: str
    is_admin: bool = False
    is_demo: bool = False
    # False until the link in the confirmation email was opened; publishing and listing need it.
    email_verified: bool = False
    profile: ProfileOut = ProfileOut()
    two_factor: TwoFactorStatus = TwoFactorStatus()
    password_changed_at: datetime | None = None
    # False for an account made through Google that has not set a password yet: the account page
    # then offers to set one instead of asking for the current one.
    has_password: bool = True


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
    # Turning two-factor on signs out every session; these carry the fresh one for this device
    # (empty `access_token` for the web client, whose session is the cookie).
    access_token: str = ""
    token_type: str = "bearer"
    expires_in: int | None = None


class PublishRequest(BaseModel):
    """What the organizer confirms when they press Publish: that they organize the race and have
    the right to publish these results. Recorded with the race."""

    attest: bool = False


class ReviewAction(BaseModel):
    action: str = Field(max_length=20)  # verify | hold | reject
    note: str | None = Field(default=None, max_length=1000)


class RaceReviewOut(RaceSummary):
    """A race in the publish review, as the admin sees it."""

    organizer_email: str | None = None


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
    email_verified: bool = False
    access_token: str
    token_type: str = "bearer"
    email: str


class RegistrationResponse(TokenResponse):
    message: str


class MessageResponse(BaseModel):
    message: str


class ProvidersResponse(BaseModel):
    """Which outside sign-in providers this deployment has configured."""

    google: bool = False


class EmailVerificationRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: str


class PasswordResetRequest(BaseModel):
    email: str = Field(max_length=320)


class PasswordResetConfirm(BaseModel):
    token: str = Field(max_length=512)
    new_password: str = Field(max_length=1024)
