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
from dataclasses import asdict, replace
from hashlib import sha256
from datetime import date, datetime, timezone
import re
import sys
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
from scoring.runner_index import IndexInput, compute_runner_index

from . import db
from . import auth as _auth
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
from . import email as _email
from . import server_stats as _server
from .email import send_password_reset_email, send_verification_email
from .rate_limit import AccountLocked, check_account_lock, clear_login_failures, enforce_rate_limit, record_login_failure
from . import rate_limit as _rate_limit
from .schemas import (
    ChangePassword,
    PasswordConfirm,
    ProfileOut,
    ProfileUpdate,
    RecoveryCodesOut,
    TotpSetupOut,
    TwoFactorCode,
    TwoFactorLogin,
    TwoFactorStatus,
    ReportCreate,
    ReportOut,
    ReportResolve,
    AdminOrganizerOut,
    AdminOverview,
    SharedCourseAdminOut,
    RunnerIndexOut,
    RunnerProfile,
    RunnerResultOut,
    RunnerSummary,
    AdminEventOut,
    MeResponse,
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
    OrganizerRegistration,
    NewsletterSubscriber,
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


_SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=_SENTRY_DSN, send_default_pii=False, traces_sample_rate=0.0, environment=os.environ.get("OTRI_ENV", "production"))
    except Exception as error:  # noqa: BLE001 - monitoring must never stop the API
        print(f"WARNING: Sentry not initialised: {error}")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    applied = db.init_db()
    if applied:
        print(f"schema migrations applied: {', '.join(applied)}")
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
    allow_credentials=True,  # the organizer app authenticates with an HttpOnly cookie
)


_MAX_BODY_BYTES = 20_000_000
_PUBLIC_CACHE_PREFIXES = ("/races", "/runners", "/events", "/scoring/models", "/gpx/shared/")


@app.middleware("http")
async def _guardrails(request: Request, call_next):
    """Reject oversized bodies before reading them, and add the response headers every API
    should carry (no MIME sniffing, no framing, no caching of anything personal)."""
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > _MAX_BODY_BYTES:
        return Response(content='{"detail":"Upload exceeds 20 MB"}', status_code=413, media_type="application/json")
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    personal = request.url.path.startswith(("/auth", "/admin")) or "authorization" in request.headers or _SESSION_COOKIE in request.cookies
    if personal:
        response.headers["Cache-Control"] = "no-store"
    elif request.method == "GET" and response.status_code == 200 and request.url.path.startswith(_PUBLIC_CACHE_PREFIXES):
        # Public reads are identical for every anonymous visitor: let browsers and the edge (the
        # nginx microcache in scripts/deploy/03-configure-nginx.sh) reuse them for half a minute,
        # so one shared leaderboard link does not hit the database once per viewer. Shared
        # courses are content-addressed and can be held for an hour.
        ttl = 3600 if request.url.path.startswith("/gpx/shared/") else 30
        response.headers.setdefault("Cache-Control", f"public, max-age={ttl}, stale-while-revalidate=60")
    return response


def _discard_temp(path: Path) -> None:
    """Delete an upload's temp file. On Windows a parser that failed mid-file can still hold it
    open through the pending exception; collect, retry once, otherwise leave it to the OS."""
    import gc

    try:
        path.unlink(missing_ok=True)
    except PermissionError:
        gc.collect()
        try:
            path.unlink(missing_ok=True)
        except PermissionError:
            pass


def _safe_suffix(filename: str | None, default: str) -> str:
    """Only a plain extension ever reaches a temp-file name."""
    suffix = Path(filename or "").suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix) else default


@app.get("/")
def root() -> dict:
    return {"name": "OTRI API", "status": "in development", "docs": "/docs", "started_at": _STARTED_AT.isoformat()}


def _is_local_or_admin(request: Request) -> bool:
    """True for the watchdog on the droplet itself (direct to 127.0.0.1, so nginx has not added
    X-Forwarded-For), the test client, or a signed-in admin. Everyone else is the public."""
    if "x-forwarded-for" not in request.headers and (request.client is None or request.client.host in ("127.0.0.1", "::1", "testclient")):
        return True
    token, _from_cookie = _token_from_request(request, None)
    if token is None:
        return False
    try:
        organizer = _with_flags(decode_access_token(token))
    except AuthError:
        return False
    return bool(organizer and organizer.is_admin)


@app.get("/health")
def health(request: Request, response: Response) -> dict:
    """For the watchdog and uptime checks: database reachable, disk not full, migrations applied.
    503 when degraded, so a plain HTTP check can alert. The public answer is the status alone;
    the individual checks (disk space, pending migrations) are internal and only shown to the
    watchdog on the droplet or to an admin."""
    import shutil

    checks: dict[str, dict] = {}
    try:
        with db.get_connection() as connection:
            connection.execute("SELECT 1")
            from . import migrations as _migrations

            pending = [m.name for m in _migrations.pending(connection)]
        checks["database"] = {"ok": not pending, "pending_migrations": pending}
    except Exception as error:  # noqa: BLE001
        checks["database"] = {"ok": False, "error": str(error)[:200]}
    try:
        usage = shutil.disk_usage(REPO_ROOT)
        free_percent = round(usage.free / usage.total * 100, 1)
        checks["disk"] = {"ok": free_percent >= 10, "free_percent": free_percent}
    except OSError as error:
        checks["disk"] = {"ok": False, "error": str(error)[:200]}
    ok = all(check["ok"] for check in checks.values())
    if not ok:
        response.status_code = 503
    payload = {"status": "ok" if ok else "degraded", "started_at": _STARTED_AT.isoformat()}
    if _is_local_or_admin(request):
        payload["checks"] = checks
    return payload


_bearer_scheme = HTTPBearer(auto_error=False)


# Admin accounts: a comma-separated list of emails. The flag is written to the account at sign-in,
# so it survives token refreshes and can be revoked by removing the email and restarting.
_ADMIN_EMAILS = {email.strip().lower() for email in os.environ.get("OTRI_ADMIN_EMAILS", "").split(",") if email.strip()}


def _with_flags(organizer: Organizer, *, check_session: bool = True) -> Organizer:
    """The token carries identity; the admin/demo flags are read from the account on every request,
    so revoking admin takes effect immediately."""
    flags = db.get_organizer_flags(organizer.id)
    if flags is None:
        raise AuthError("this account no longer exists")
    if check_session and flags["session_version"] != organizer.session_version:
        raise AuthError("this session was signed out; sign in again")
    return replace(organizer, **flags)


# --- Sessions -------------------------------------------------------------------------------
#
# Two ways to present a session token:
#   * `Authorization: Bearer <token>` — API clients, scripts, tests. The token is in the body of
#     the login response.
#   * the `otri_session` cookie — the organizer web app. It sends `X-OTRI-Client: web` on every
#     request; login-type endpoints then set an HttpOnly, SameSite=Lax cookie (Secure behind
#     HTTPS) and leave `access_token` empty in the body, so page scripts never hold the token
#     and a cross-site-scripting bug cannot exfiltrate a 30-day session.
# Cookie-authenticated requests that change state must carry the client header too: a cross-site
# form post cannot add custom headers, and a cross-origin fetch with one is stopped by CORS.
_SESSION_COOKIE = "otri_session"
_CLIENT_HEADER = "x-otri-client"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _is_web_client(request: Request) -> bool:
    return request.headers.get(_CLIENT_HEADER, "").lower() == "web"


def _cookie_secure(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme).lower() == "https"


def _set_session_cookie(response: Response, request: Request, token: str, remember: bool) -> None:
    response.set_cookie(
        _SESSION_COOKIE,
        token,
        max_age=_auth.token_ttl_seconds(remember),
        httponly=True,
        secure=_cookie_secure(request),
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(_SESSION_COOKIE, path="/", httponly=True, secure=_cookie_secure(request), samesite="lax")


def _token_from_request(request: Request, credentials: HTTPAuthorizationCredentials | None) -> tuple[str | None, bool]:
    """(token, from_cookie). A bearer header wins over the cookie."""
    if credentials is not None:
        return credentials.credentials, False
    cookie = request.cookies.get(_SESSION_COOKIE)
    return (cookie, True) if cookie else (None, False)


def _finish_session(response: Response, request: Request, session: TokenResponse, remember: bool) -> TokenResponse:
    """For the web client, move the token from the body into the cookie."""
    if session.access_token and _is_web_client(request):
        _set_session_cookie(response, request, session.access_token, remember)
        session.access_token = ""
        session.token_type = "cookie"
    return session


def require_organizer(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> Organizer:
    """FastAPI dependency: a valid session, as a bearer header or the session cookie."""
    token, from_cookie = _token_from_request(request, credentials)
    if token is None:
        raise HTTPException(status_code=401, detail="missing bearer token")
    if from_cookie and request.method not in _SAFE_METHODS and not _is_web_client(request):
        raise HTTPException(status_code=403, detail="cookie sessions must send the X-OTRI-Client header on state-changing requests")
    try:
        return _with_flags(decode_access_token(token))
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


def require_admin(organizer: Organizer = Depends(require_organizer)) -> Organizer:
    if not organizer.is_admin:
        raise HTTPException(status_code=403, detail="admin access required")
    return organizer


def _optional_organizer(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> Organizer | None:
    """Like require_organizer, but returns None instead of raising when no/invalid token is given."""
    token, from_cookie = _token_from_request(request, credentials)
    if token is None:
        return None
    if from_cookie and request.method not in _SAFE_METHODS and not _is_web_client(request):
        return None
    try:
        return _with_flags(decode_access_token(token))
    except AuthError:
        return None


def _require_event_owner(event: db.Event, organizer: Organizer) -> None:
    if event.organizer_id != organizer.id and not organizer.is_admin:
        raise HTTPException(status_code=403, detail="you do not have permission to modify this event")


def _require_race_owner(race: db.Race, organizer: Organizer) -> None:
    if race.organizer_id != organizer.id and not organizer.is_admin:
        raise HTTPException(status_code=403, detail="you do not have permission to modify this race")


def _require_race_visible(race: db.Race, organizer: Organizer | None) -> None:
    """Results, course and measurement are public once published; until then only the owner and admins see them."""
    if race.published_at is not None:
        return
    if organizer is not None and (organizer.id == race.organizer_id or organizer.is_admin):
        return
    raise HTTPException(status_code=403, detail="this race has not been published by its organizer")


# --- Auth ------------------------------------------------------------------


@app.post("/auth/register", response_model=MessageResponse, status_code=201)
def register(payload: OrganizerRegistration, request: Request) -> MessageResponse:
    """Creates an unverified account and emails a verification link. No access token yet —
    organizers can't log in until they verify their email (see /auth/login)."""
    enforce_rate_limit(request, max_requests=5)
    try:
        organizer = register_organizer(payload.email, payload.password, accept_terms=payload.accept_terms, marketing_opt_in=payload.marketing_opt_in)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    token = create_email_verification_token(organizer)
    send_verification_email(organizer.email, token)

    return MessageResponse(message="account created — check your email to verify it before signing in")


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: OrganizerCredentials, request: Request, response: Response) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    try:
        check_account_lock(payload.email)
    except AccountLocked as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": "900"}) from error
    try:
        organizer = authenticate_organizer(payload.email, payload.password)
    except EmailNotVerifiedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except AuthError as error:
        record_login_failure(payload.email)
        raise HTTPException(status_code=401, detail=str(error)) from error
    clear_login_failures(payload.email)
    if organizer.email in _ADMIN_EMAILS:
        db.set_organizer_flags(organizer.email, is_admin=True)
    organizer = _with_flags(organizer, check_session=False)  # credentials, not a token: nothing to compare yet
    return _finish_session(response, request, _issue_session(organizer, payload.remember), payload.remember)


def _issue_session(organizer: Organizer, remember: bool) -> TokenResponse:
    """Either a token, or a second-step challenge when the account has two-factor enabled."""
    status = _auth.two_factor_status(organizer.id)
    if status["enabled"]:
        challenge, method, code = _auth.start_login_challenge(organizer, remember)
        if code:
            _email.send_login_code_email(organizer.email, code)
        return TokenResponse(access_token="", email=organizer.email, requires_2fa=True, challenge=challenge, method=method)
    return TokenResponse(
        access_token=create_access_token(organizer, remember),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        expires_in=_auth.token_ttl_seconds(remember),
    )


@app.post("/auth/login/2fa", response_model=TokenResponse)
def login_second_step(payload: TwoFactorLogin, request: Request, response: Response) -> TokenResponse:
    """The second step: an authenticator code, an emailed code, or a recovery code."""
    enforce_rate_limit(request, max_requests=10)
    try:
        organizer, remember = _auth.complete_login_challenge(payload.challenge, payload.code)
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    organizer = _with_flags(organizer, check_session=False)
    return _finish_session(response, request, TokenResponse(
        access_token=create_access_token(organizer, remember),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        expires_in=_auth.token_ttl_seconds(remember),
    ), remember)


def _me(organizer: Organizer) -> MeResponse:
    profile = db.get_profile(organizer.id)
    return MeResponse(
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        profile=ProfileOut(**{k: profile.get(k) for k in (*db.PROFILE_FIELDS, "marketing_opt_in_at", "terms_accepted_at")}),
        two_factor=TwoFactorStatus(**_auth.two_factor_status(organizer.id)),
        password_changed_at=profile.get("password_changed_at"),
    )


@app.get("/auth/me", response_model=MeResponse)
def me(organizer: Organizer = Depends(require_organizer)) -> MeResponse:
    """Who the token belongs to: flags, profile and two-factor status."""
    return _me(organizer)


@app.patch("/auth/profile", response_model=MeResponse)
def update_profile(payload: ProfileUpdate, organizer: Organizer = Depends(require_organizer)) -> MeResponse:
    """Organizer details shown with their races (organization, website) and to admins (the rest)."""
    values = {}
    for field in db.PROFILE_FIELDS:
        value = getattr(payload, field)
        if value is None:
            continue
        if field == "marketing_opt_in":
            values[field] = bool(value)
            continue
        value = value.strip()
        if field == "website" and value and not re.match(r"^https?://", value):
            value = "https://" + value
        if field == "country":
            value = _clean_country(value) or ""
        limit = 1000 if field == "bio" else 200
        values[field] = value[:limit] or None
    db.update_profile(organizer.id, values)
    return _me(organizer)


@app.post("/auth/change-password", response_model=TokenResponse)
def change_password(payload: ChangePassword, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> TokenResponse:
    """Changes the password and signs out every other device; returns a fresh token for this one."""
    enforce_rate_limit(request, max_requests=5)
    try:
        _auth.change_password(organizer.id, payload.current_password, payload.new_password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _finish_session(response, request, _fresh_token(organizer), False)


@app.post("/auth/logout", response_model=MessageResponse)
def logout(request: Request, response: Response) -> MessageResponse:
    """Ends the cookie session on this device (bearer tokens simply expire or are revoked)."""
    _clear_session_cookie(response, request)
    return MessageResponse(message="signed out")


def _fresh_token(organizer: Organizer) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(organizer),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        expires_in=_auth.token_ttl_seconds(False),
    )


@app.post("/auth/logout-all", response_model=MessageResponse)
def logout_everywhere(payload: PasswordConfirm, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> MessageResponse:
    """Invalidates every token for this account, this one included."""
    try:
        _auth.revoke_all_sessions(organizer.id, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _clear_session_cookie(response, request)
    return MessageResponse(message="signed out everywhere")


@app.get("/auth/export")
def export_account(organizer: Organizer = Depends(require_organizer)) -> Response:
    """Everything OTRI holds for this account, as a JSON download (PRIVACY.md, 'Your rights')."""
    data = db.export_organizer(organizer.id)
    data["exported_at"] = datetime.now(timezone.utc).isoformat()
    body = json.dumps(data, default=str, indent=2)
    return Response(content=body, media_type="application/json", headers={"Content-Disposition": 'attachment; filename="otri-account-export.json"'})


@app.delete("/auth/account", response_model=MessageResponse)
def delete_own_account(payload: PasswordConfirm, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> MessageResponse:
    """Deletes the account with every event, race and result it owns. Published leaderboards
    disappear and runner profiles lose those results. Cannot be undone."""
    try:
        _auth.delete_own_account(organizer.id, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _clear_session_cookie(response, request)
    return MessageResponse(message="account deleted")


@app.post("/auth/2fa/totp/setup", response_model=TotpSetupOut)
def totp_setup(organizer: Organizer = Depends(require_organizer)) -> TotpSetupOut:
    """Start authenticator-app setup: a secret to scan; nothing changes until a code confirms it."""
    secret, uri = _auth.begin_totp_setup(organizer.id, organizer.email)
    return TotpSetupOut(secret=secret, otpauth_uri=uri)


@app.post("/auth/2fa/totp/enable", response_model=RecoveryCodesOut)
def totp_enable(payload: TwoFactorCode, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    try:
        codes = _auth.enable_totp(organizer.id, payload.code)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return RecoveryCodesOut(codes=codes, method="totp")


@app.post("/auth/2fa/email/start", response_model=MessageResponse)
def email_two_factor_start(request: Request, organizer: Organizer = Depends(require_organizer)) -> MessageResponse:
    enforce_rate_limit(request, max_requests=5)
    code = _auth.begin_email_two_factor(organizer.id)
    _email.send_login_code_email(organizer.email, code)
    return MessageResponse(message=f"a code was sent to {organizer.email}")


@app.post("/auth/2fa/email/enable", response_model=RecoveryCodesOut)
def email_two_factor_enable(payload: TwoFactorCode, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    try:
        codes = _auth.enable_email_two_factor(organizer.id, payload.code)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return RecoveryCodesOut(codes=codes, method="email")


@app.post("/auth/2fa/disable", response_model=TokenResponse)
def two_factor_disable(payload: PasswordConfirm, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> TokenResponse:
    """Turns two-factor off and signs out every other device; returns a fresh token for this one."""
    try:
        _auth.disable_two_factor(organizer.id, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _finish_session(response, request, _fresh_token(organizer), False)


@app.post("/auth/2fa/recovery-codes", response_model=RecoveryCodesOut)
def two_factor_recovery_codes(payload: PasswordConfirm, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    """Fresh recovery codes; the old ones stop working."""
    try:
        codes = _auth.regenerate_recovery_codes(organizer.id, payload.password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return RecoveryCodesOut(codes=codes, method=_auth.two_factor_status(organizer.id)["method"] or "")


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
def confirm_password_reset(payload: PasswordResetConfirm, request: Request, response: Response) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    try:
        organizer = reset_password(payload.token, payload.new_password)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _finish_session(response, request, TokenResponse(access_token=create_access_token(organizer), email=organizer.email, expires_in=_auth.token_ttl_seconds(False)), False)


# --- Events ------------------------------------------------------------------


def _race_summary(race: db.Race, finisher_count: int | None = None) -> RaceSummary:
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
        published_at=race.published_at,
        is_published=race.published_at is not None,
        is_demo=race.is_demo,
        finisher_count=finisher_count,
        event_location=race.event_location,
        event_country=race.event_country,
        organizer_display=race.organizer_display,
        organizer_website=race.organizer_website,
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


def _clean_country(value: str | None) -> str | None:
    """A 3-letter country code, upper-cased; anything else is rejected."""
    if value is None or not value.strip():
        return None
    code = value.strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", code):
        raise HTTPException(status_code=422, detail="country must be a 3-letter country code (e.g. THA)")
    return code


@app.get("/events", response_model=list[EventSummary])
def list_events(mine: bool = False, organizer: Organizer | None = Depends(_optional_organizer)) -> list[EventSummary]:
    """By default lists every event (public). Pass ?mine=true with a bearer token to list only
    events owned by the requesting organizer."""
    events = db.list_events()
    if mine:
        if organizer is None:
            raise HTTPException(status_code=401, detail="missing bearer token")
        events = [event for event in events if event.organizer_id == organizer.id]
    race_counts = db.count_races_by_event()
    return [
        EventSummary(
            event_id=event.event_id,
            event_name=event.event_name,
            event_date=event.event_date,
            race_count=race_counts.get(event.event_id, 0),
            location=event.location,
            country=event.country,
        )
        for event in events
    ]


@app.get("/events/{event_id}", response_model=EventDetail)
def get_event(event_id: str) -> EventDetail:
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    races = db.list_races_for_event(event_id)
    counts = db.count_results_by_race()
    return EventDetail(
        event_id=event.event_id,
        event_name=event.event_name,
        event_date=event.event_date,
        race_count=len(races),
        location=event.location,
        country=event.country,
        races=[_race_summary(race, counts.get(race.race_id, 0)) for race in races],
    )


@app.get("/admin/events", response_model=list[AdminEventOut])
def admin_list_events(organizer: Organizer = Depends(require_admin)) -> list[AdminEventOut]:
    """Every event on the platform with its owner and each race's publish state. Admin only."""
    counts = db.count_results_by_race()
    out = []
    for event in db.list_events():
        races = db.list_races_for_event(event.event_id)
        out.append(
            AdminEventOut(
                event_id=event.event_id,
                event_name=event.event_name,
                event_date=event.event_date,
                race_count=len(races),
                location=event.location,
                country=event.country,
                organizer_email=event.organizer_email,
                published_count=sum(1 for race in races if race.published_at is not None),
                races=[_race_summary(race, counts.get(race.race_id, 0)) for race in races],
            )
        )
    out.sort(key=lambda e: e.event_date, reverse=True)
    return out


@app.post("/events", response_model=EventSummary, status_code=201)
def create_event(payload: EventCreate, organizer: Organizer = Depends(require_organizer)) -> EventSummary:
    """Requires a valid, verified organizer bearer token."""
    if not payload.event_name.strip():
        raise HTTPException(status_code=422, detail="event_name is required")
    country = _clean_country(payload.country)
    event = db.create_event(
        payload.event_name.strip(), payload.event_date, organizer.id, location=(payload.location or "").strip() or None, country=country
    )
    return EventSummary(event_id=event.event_id, event_name=event.event_name, event_date=event.event_date, race_count=0, location=event.location, country=event.country)


@app.patch("/events/{event_id}", response_model=EventSummary)
def edit_event(event_id: str, payload: EventUpdate, organizer: Organizer = Depends(require_organizer)) -> EventSummary:
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    _require_event_owner(event, organizer)

    updated = db.update_event(
        event_id,
        event_name=payload.event_name,
        event_date_=payload.event_date,
        location=(payload.location.strip() if payload.location is not None else None),
        country=_clean_country(payload.country) if payload.country else None,
    )
    return EventSummary(
        event_id=updated.event_id,
        event_name=updated.event_name,
        event_date=updated.event_date,
        race_count=len(db.list_races_for_event(event_id)),
        location=updated.location,
        country=updated.country,
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
def list_races(all: bool = False, organizer: Organizer | None = Depends(_optional_organizer)) -> list[RaceSummary]:
    """Published races, newest event first, with finisher counts. ``?all=true`` (admin) lists every race."""
    if all:
        if organizer is None or not organizer.is_admin:
            raise HTTPException(status_code=403, detail="admin access required")
    counts = db.count_results_by_race()
    return [_race_summary(race, counts.get(race.race_id, 0)) for race in db.list_races(published_only=not all)]


@app.get("/races/{race_id}", response_model=RaceSummary)
def get_race(race_id: str) -> RaceSummary:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    return _race_summary(race, db.count_results_by_race().get(race_id, 0))


@app.post("/races/{race_id}/publish", response_model=RaceSummary)
def publish_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Make the race's results, course and measurement public. Owner or admin; needs scored results."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    if not db.has_results(race_id):
        raise HTTPException(status_code=422, detail="upload results before publishing")
    return _race_summary(db.set_race_published(race_id, True), db.count_results_by_race().get(race_id, 0))


@app.delete("/races/{race_id}/publish", response_model=RaceSummary)
def unpublish_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Hide the race again. Owner or admin."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    return _race_summary(db.set_race_published(race_id, False), db.count_results_by_race().get(race_id, 0))


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


_TILE_CODE = re.compile(r"_(N|S)(\d{2})_00_(E|W)(\d{3})_00_")


def _dem_tile_codes(provider) -> list[str]:
    """The installed terrain tiles as short codes (N07E098 = the 1°×1° tile north of 7°N, east of
    98°E), for the admin overview: a course outside them scores at Low confidence."""
    if provider is None:
        return []
    codes = []
    for tile in provider.manifest.get("tiles", []):
        name = str(tile.get("path", ""))
        match = _TILE_CODE.search(name)
        codes.append("".join(match.groups()) if match else Path(name).stem)
    return sorted(codes)


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

    suffix = _safe_suffix(file.filename, ".gpx")
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
        _discard_temp(temp_path)

    updated = db.attach_gpx(
        race_id,
        filename=file.filename or "course.gpx",
        content=contents.decode("utf-8", errors="replace"),
        distance_km=features.distance_km,
        elevation_gain_m=features.elevation_gain_m,
        measurement={**measurement.to_dict(), "raw_sha256": sha256(contents).hexdigest(), "processed_at": datetime.now(timezone.utc).isoformat(), "snapshot": asdict(measurement)},
    )
    return _race_summary(updated)


def _visible_race(race_id: str, organizer: Organizer | None) -> db.Race:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_visible(race, organizer)
    return race


@app.get("/races/{race_id}/measurement")
def get_race_measurement(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> dict:
    _visible_race(race_id, organizer)
    result = db.get_measurement(race_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No versioned measurement stored; reattach GPX to measure it")
    return {key: value for key, value in result.items() if key != "snapshot"}


@app.get("/races/{race_id}/gpx")
def get_race_gpx(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> Response:
    _visible_race(race_id, organizer)
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
    # Finish times ride along for the public leaderboard; scores carry the runner's identity only.
    by_key = {(str(r.rank), r.family_name, r.first_name): r for r in results}
    out = []
    for score in scores:
        data = score.to_dict()
        source = by_key.get((str(data.get("rank")), data.get("family_name"), data.get("first_name")))
        out.append(
            RunnerScoreOut(
                **data,
                status="finisher",
                finish_time_seconds=source.finish_time_seconds if source else None,
                runner_id=source.runner_id if source else None,
                gender=source.gender if source else None,
                nationality=source.nationality if source else None,
            )
        )
    # Non-finishers who started are part of the story of a race; DNS rows are not listed.
    for result in results:
        if isinstance(result.rank, str) and result.rank in ("DNF", "DSQ"):
            out.append(
                RunnerScoreOut(
                    rank=result.rank,
                    bib_number=result.bib_number,
                    family_name=result.family_name,
                    first_name=result.first_name,
                    scoring_version=race.scoring_version,
                    status=result.rank,
                    runner_id=result.runner_id,
                    gender=result.gender,
                    nationality=result.nationality,
                )
            )
    return out


@app.get("/races/{race_id}/results", response_model=list[RunnerScoreOut])
def get_race_results(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> list[RunnerScoreOut]:
    race = _visible_race(race_id, organizer)

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

    suffix = _safe_suffix(file.filename, ".csv")
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        try:
            report = await run_in_threadpool(validate_result_file, temp_path)
        except (ValueError, OSError) as error:  # unreadable, wrong type, too many rows
            raise HTTPException(status_code=422, detail=str(error)) from error
        if not report.is_valid:
            return SubmissionResult(
                is_valid=False,
                errors=[ValidationIssueOut(**issue.to_dict()) for issue in report.errors],
                warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
                scores=[],
            )

        results = await run_in_threadpool(result_records, temp_path)
        db.replace_results(race_id, results)

        try:
            # Score the stored rows, which now carry runner ids, so the response matches a later replay.
            scores = await run_in_threadpool(_score_results, race, db.get_results(race_id))
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        return SubmissionResult(
            is_valid=True,
            errors=[],
            warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
            scores=scores,
        )
    finally:
        _discard_temp(temp_path)


# --- Runners ---------------------------------------------------------------------
#
# A runner is whoever the results files say raced: identity comes from name, gender and year
# of birth (docs/methodology/runner-index/RUNNER-INDEX-v1.md §3). Profiles and the index use published races
# only, and are computed on request so they are always consistent with what organizers show.


def _age_category(gender: str, birth_year: int | None, as_of: date) -> str | None:
    if not birth_year:
        return None
    age = as_of.year - birth_year
    band = "U20" if age < 20 else f"{(age // 10) * 10}"
    prefix = {"M": "M", "F": "F"}.get((gender or "").upper()[:1], "X")
    return f"{prefix}{band}"


def _scored_rows_for_race(race_id: str) -> dict[str, RunnerScoreOut]:
    """Every scored result of a race keyed by runner_id. Non-finishers carry no score."""
    race = db.find_race(race_id)
    if race is None:
        return {}
    try:
        scored = _score_results(race, db.get_results(race_id))
    except ValueError:
        return {}
    return {row.runner_id: row for row in scored if row.runner_id and row.status == "finisher"}


def _runner_profile(runner: db.Runner, as_of: date) -> RunnerProfile:
    entries = db.published_results_for_runner(runner.runner_id)
    scored_by_race = {race_id: _scored_rows_for_race(race_id) for race_id in {e["race_id"] for e in entries}}
    inputs = []
    details = {}
    for entry in entries:
        row = scored_by_race.get(entry["race_id"], {}).get(runner.runner_id)
        if row is None:
            continue  # DNF/DNS/DSQ rows have no score and no place in the index
        result_id = str(entry["result_id"])
        inputs.append(IndexInput(result_id=result_id, event_date=entry["event_date"], score=row.otri_score))
        details[result_id] = (entry["race_id"], row)
    index = compute_runner_index(inputs, as_of)
    races = {race_id: db.find_race(race_id) for race_id in {race_id for race_id, _ in details.values()}}
    results = []
    for item in index.results:
        race_id, row = details[item.result_id]
        race = races[race_id]
        results.append(
            RunnerResultOut(
                result_id=item.result_id,
                race_id=race_id,
                event_id=race.event_id,
                event_name=race.event_name or "",
                event_date=item.event_date,
                course_name=race.course_name,
                distance_km=race.distance_km,
                elevation_gain_m=race.elevation_gain_m,
                has_gpx=race.has_gpx,
                is_demo=race.is_demo,
                rank=row.rank,
                finish_time_seconds=row.finish_time_seconds,
                otri_score=row.otri_score,
                confidence=row.confidence,
                scoring_version=row.scoring_version,
                weight=item.weight,
                counts=item.counts,
                status=item.status,
                full_until=item.full_until,
                expires_on=item.expires_on,
            )
        )
    return RunnerProfile(
        **_runner_summary_fields(runner, as_of),
        index=index.index,
        provisional=index.provisional,
        index_details=RunnerIndexOut(**index.to_dict()),
        results=results,
    )


def _runner_summary_fields(runner: db.Runner, as_of: date) -> dict:
    return {
        "runner_id": runner.runner_id,
        "family_name": runner.family_name,
        "first_name": runner.first_name,
        "gender": runner.gender,
        "nationality": runner.nationality,
        "age_category": _age_category(runner.gender, runner.birth_year, as_of),
        "result_count": runner.result_count,
        "last_race_date": runner.last_race_date,
    }


def _runner_summaries(runners: list[db.Runner], as_of: date) -> list[RunnerSummary]:
    """Summaries with indexes for a set of runners, scoring each involved race once."""
    grouped = db.published_results_grouped_by_race()
    wanted = {runner.runner_id for runner in runners}
    inputs: dict[str, list[IndexInput]] = {runner.runner_id: [] for runner in runners}
    for race_id, entries in grouped.items():
        if not any(entry["runner_id"] in wanted for entry in entries):
            continue
        scored = _scored_rows_for_race(race_id)
        for entry in entries:
            row = scored.get(entry["runner_id"])
            if row is not None and entry["runner_id"] in wanted:
                inputs[entry["runner_id"]].append(IndexInput(result_id=str(entry["result_id"]), event_date=entry["event_date"], score=row.otri_score))
    out = []
    for runner in runners:
        index = compute_runner_index(inputs[runner.runner_id], as_of)
        out.append(RunnerSummary(**_runner_summary_fields(runner, as_of), index=index.index, provisional=index.provisional))
    return out


@app.get("/runners", response_model=list[RunnerSummary])
def list_runners(q: str | None = None, limit: int = 100) -> list[RunnerSummary]:
    """Search runners by name (``q``), or list every runner with a published result, indexed."""
    as_of = date.today()
    limit = max(1, min(limit, 500))
    runners = db.search_runners(q, limit) if q and q.strip() else db.list_runners(limit)
    summaries = _runner_summaries(runners, as_of)
    summaries.sort(key=lambda r: (r.index is None, -(r.index or 0), r.family_name, r.first_name))
    return summaries


@app.get("/runners/{runner_id}", response_model=RunnerProfile)
def get_runner(runner_id: str) -> RunnerProfile:
    runner = db.find_runner(runner_id)
    if runner is None:
        raise HTTPException(status_code=404, detail="no runner with published results has that id")
    return _runner_profile(runner, date.today())


@app.post("/gpx/analyze", response_model=GpxAnalysis)
async def analyze_gpx(request: Request, file: UploadFile, finish_time_seconds: int | None = Form(default=None)) -> GpxAnalysis:
    """Parse an uploaded GPX file and, optionally, predict its Course Standard score for a given time.

    Uses the exact same formula as the real post-race scorer (no competitor
    assumption needed) — see ``scoring.estimator``'s module docstring and
    ``docs/gpx-predictor.md``.
    """
    enforce_rate_limit(request, max_requests=60)  # public and CPU-heavy: one call per slider move is fine, a flood is not
    suffix = _safe_suffix(file.filename, ".gpx")
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
        _discard_temp(temp_path)

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
# Eviction and the write happen under one lock per process, and the folder is trimmed again after
# the write, so concurrent shares cannot leave the folder over budget (verified in test_hardening).
_SHARED_COURSE_LOCK = __import__("threading").Lock()


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
        points = await run_in_threadpool(parse_track_points, contents.decode("utf-8"))
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if len(points) < 2:
        raise HTTPException(status_code=422, detail="The GPX has fewer than two track points")

    share_id = sha256(contents).hexdigest()[:16]
    path = _shared_course_path(share_id)
    created = not path.exists()
    if created:
        packed = gzip.compress(contents, compresslevel=6)
        clean_name = (name or Path(file.filename or "").stem or "").strip()[:120] or None
        with _SHARED_COURSE_LOCK:
            _SHARED_COURSE_DIR.mkdir(parents=True, exist_ok=True)
            # Make room first so the new file is never the one evicted, then trim again in case
            # another process wrote in between.
            _evict_shared_courses(max(0, _SHARED_COURSE_MAX_TOTAL_BYTES - len(packed)))
            path.write_bytes(packed)
            _shared_course_meta_path(share_id).write_text(
                json.dumps({"name": clean_name, "filename": file.filename, "created_at": datetime.now(timezone.utc).isoformat()}),
                encoding="utf-8",
            )
            _evict_shared_courses(_SHARED_COURSE_MAX_TOTAL_BYTES)
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


# --- Admin dashboard -----------------------------------------------------------------


def _account_out(account: db.OrganizerAccount) -> AdminOrganizerOut:
    return AdminOrganizerOut(**vars(account))


def _shared_course_rows() -> list[SharedCourseAdminOut]:
    rows = []
    if not _SHARED_COURSE_DIR.exists():
        return rows
    for path in sorted(_SHARED_COURSE_DIR.glob("*.gpx.gz"), key=lambda p: p.stat().st_mtime, reverse=True):
        share_id = path.name[: -len(".gpx.gz")]
        meta = _shared_course_meta(share_id)
        rows.append(
            SharedCourseAdminOut(
                share_id=share_id,
                name=meta.get("name"),
                filename=meta.get("filename"),
                created_at=meta.get("created_at"),
                size_bytes=path.stat().st_size,
            )
        )
    return rows


@app.get("/admin/overview", response_model=AdminOverview)
def admin_overview(organizer: Organizer = Depends(require_admin)) -> AdminOverview:
    """Platform statistics plus the API's configuration and security posture (no secrets)."""
    from course.measurement import VERSION as MEASUREMENT_VERSION
    from scoring import DEFAULT_SCORING_VERSION

    stats = db.platform_stats()
    stats.update(db.email_stats())
    shared = _shared_course_rows()
    stats.update(
        {
            "open_reports": db.count_open_reports(),
            "shared_courses": len(shared),
            "shared_bytes": sum(row.size_bytes for row in shared),
            "shared_budget_mb": _SHARED_COURSE_MAX_TOTAL_BYTES // 1_000_000,
        }
    )
    provider = None
    try:
        provider = configured_provider()
    except Exception:  # noqa: BLE001 - a misconfigured DEM must not break the dashboard
        provider = None
    manifest = os.environ.get("OTRI_DEM_MANIFEST", "")
    cache_entries = len(list(_MEASUREMENT_CACHE_DIR.glob("*.json"))) if _MEASUREMENT_CACHE_DIR.exists() else 0
    accounts = db.list_organizer_accounts()
    counts = db.count_results_by_race()
    recent_races = sorted(db.list_races(published_only=False), key=lambda race: race.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:8]
    return AdminOverview(
        stats=stats,
        api={
            "version": app.version,
            "started_at": _STARTED_AT.isoformat(),
            "scoring_version": DEFAULT_SCORING_VERSION,
            "measurement_version": MEASUREMENT_VERSION,
            "dem_configured": provider is not None,
            "dem_manifest": Path(manifest).name if manifest else None,
            "dem_tiles": _dem_tile_codes(provider),
            "measurement_cache_entries": cache_entries,
            "measurement_cache_max": _MEASUREMENT_CACHE_MAX_ENTRIES,
            "python": sys.version.split()[0],
        },
        security={
            "token_ttl_hours": round(_auth._TOKEN_TTL_SECONDS / 3600),
            "email_configured": bool(_email.RESEND_API_KEY),
            "email_from": _email.EMAIL_FROM,
            "rate_limits": {"register": 5, "login": 10, "password_reset": 5, "share": 10, "window_seconds": 60, "backend": "database (shared by all workers)"},
            "lockout": {"failures": _rate_limit.LOCKOUT_FAILURES, "window_minutes": int(_rate_limit.LOCKOUT_WINDOW.total_seconds() // 60), "minutes": int(_rate_limit.LOCKOUT_DURATION.total_seconds() // 60)},
            "session_revocation": "password change, 2FA off and 'sign out everywhere' invalidate every earlier token",
            "error_monitoring": bool(_SENTRY_DSN),
            "allowed_origins": [origin.strip() for origin in _allowed_origins.split(",") if origin.strip()],
            "admin_emails": sorted(_ADMIN_EMAILS),
            "shared_course_max_mb": _SHARED_COURSE_MAX_FILE_BYTES // 1_000_000,
            "upload_max_mb": 20,
        },
        admin_accounts=[account.email for account in accounts if account.is_admin],
        recent_signups=[_account_out(account) for account in accounts[:8]],
        recent_races=[_race_summary(race, counts.get(race.race_id, 0)) for race in recent_races],
    )


@app.get("/admin/emails")
def admin_emails(limit: int = 50, organizer: Organizer = Depends(require_admin)) -> list[dict]:
    """The last emails the API asked Resend to send, with the provider id and any error, newest
    first. For "I never got the email": find the row, then look the id up in the Resend dashboard."""
    return db.recent_emails(max(1, min(limit, 500)))


@app.get("/admin/newsletter", response_model=list[NewsletterSubscriber])
def admin_newsletter(organizer: Organizer = Depends(require_admin)) -> list[NewsletterSubscriber]:
    """Verified organizers who ticked "send me OTRI news": the audience for a marketing email.
    Demo accounts are excluded. Withdrawing consent on the account page drops them from this list."""
    return [NewsletterSubscriber(**row) for row in db.list_newsletter_subscribers()]


@app.get("/admin/newsletter.csv")
def admin_newsletter_csv(organizer: Organizer = Depends(require_admin)) -> Response:
    """The same audience as a CSV (email, name, organization, country, consented_at) for a Resend
    audience import or any mail tool."""
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["email", "name", "organization", "country", "consented_at"])
    for row in db.list_newsletter_subscribers():
        writer.writerow([row["email"], row.get("display_name") or "", row.get("organization") or "", row.get("country") or "", row["marketing_opt_in_at"].isoformat() if row.get("marketing_opt_in_at") else ""])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="otri-newsletter.csv"'},
    )


@app.get("/admin/organizers", response_model=list[AdminOrganizerOut])
def admin_list_organizers(organizer: Organizer = Depends(require_admin)) -> list[AdminOrganizerOut]:
    return [_account_out(account) for account in db.list_organizer_accounts()]


@app.post("/admin/organizers/{organizer_id}/verify", response_model=AdminOrganizerOut)
def admin_verify_organizer(organizer_id: int, organizer: Organizer = Depends(require_admin)) -> AdminOrganizerOut:
    """Mark an account's email as verified by hand (when the verification mail did not arrive)."""
    if not db.set_organizer_verified(organizer_id):
        raise HTTPException(status_code=404, detail="no account with that id")
    return _account_out(db.find_organizer_account(organizer_id))


@app.delete("/admin/organizers/{organizer_id}", status_code=204)
def admin_delete_organizer(organizer_id: int, organizer: Organizer = Depends(require_admin)) -> Response:
    """Delete an account with everything it owns. Admins cannot delete themselves."""
    if organizer_id == organizer.id:
        raise HTTPException(status_code=422, detail="you cannot delete your own account from here")
    if not db.delete_organizer(organizer_id):
        raise HTTPException(status_code=404, detail="no account with that id")
    return Response(status_code=204)


@app.get("/admin/shared-courses", response_model=list[SharedCourseAdminOut])
def admin_list_shared_courses(organizer: Organizer = Depends(require_admin)) -> list[SharedCourseAdminOut]:
    return _shared_course_rows()


@app.delete("/admin/shared-courses/{share_id}", status_code=204)
def admin_delete_shared_course(share_id: str, organizer: Organizer = Depends(require_admin)) -> Response:
    if not _SHARE_ID_RE.match(share_id) or not _shared_course_path(share_id).exists():
        raise HTTPException(status_code=404, detail="No shared course with that id")
    _shared_course_path(share_id).unlink(missing_ok=True)
    (_SHARED_COURSE_DIR / f"{share_id}.gpx").unlink(missing_ok=True)  # pre-gzip layout
    _shared_course_meta_path(share_id).unlink(missing_ok=True)
    return Response(status_code=204)


_SERVER_CACHE: dict = {"at": 0.0, "value": None}


def _server_snapshot(host_header: str | None) -> dict:
    manifest = os.environ.get("OTRI_DEM_MANIFEST", "")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "host": _server.host_stats(),
        "storage": _server.storage_stats(
            {
                "root": Path("/"),
                "terrain_tiles": Path(manifest).parent if manifest else None,
                "shared_courses": _SHARED_COURSE_DIR,
                "measurement_cache": _MEASUREMENT_CACHE_DIR,
                "app": REPO_ROOT,
            },
            db.database_size_bytes(),
        ),
        "services": _server.services_status(),
        "firewall": _server.firewall_status(),
        "fail2ban": _server.fail2ban_status(),
        "api_usage": _server.api_usage(),
        "tls": _server.tls_expiry((host_header or "").split(":")[0] if host_header else None),
    }


@app.get("/admin/server")
async def admin_server(request: Request, organizer: Organizer = Depends(require_admin)) -> dict:
    """Host, storage, services, firewall, fail2ban and 24 h API usage. Read-only; cached for 30 s."""
    import time as _time

    now = _time.monotonic()
    if _SERVER_CACHE["value"] is not None and now - _SERVER_CACHE["at"] < 30:
        return _SERVER_CACHE["value"]
    snapshot = await run_in_threadpool(_server_snapshot, request.headers.get("x-forwarded-host") or request.headers.get("host"))
    _SERVER_CACHE.update({"at": now, "value": snapshot})
    return snapshot


# --- Reports ------------------------------------------------------------------------
#
# The public "something is wrong" form. Anyone may file one (rate limited); admins see them on
# the dashboard next to the actions that resolve them (unpublish, delete race, delete runner data,
# delete a shared course) and mark them resolved.

_REPORT_KINDS = {"runner", "race", "shared_course", "other"}
_REPORT_REASONS = {"not_me", "wrong_result", "remove_my_data", "wrong_course", "other"}


def _report_out(report: db.Report) -> ReportOut:
    return ReportOut(**vars(report))


@app.post("/reports", response_model=ReportOut, status_code=201)
def create_report(payload: ReportCreate, request: Request) -> ReportOut:
    enforce_rate_limit(request, max_requests=5)
    if payload.kind not in _REPORT_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {sorted(_REPORT_KINDS)}")
    message = payload.message.strip()
    if len(message) < 10 or len(message) > 2000:
        raise HTTPException(status_code=422, detail="please describe the problem in 10 to 2000 characters")
    email = (payload.reporter_email or "").strip().lower() or None
    if email and ("@" not in email or len(email) > 254):
        raise HTTPException(status_code=422, detail="that does not look like an email address")
    reason = payload.reason if payload.reason in _REPORT_REASONS else None
    report = db.create_report(
        kind=payload.kind,
        subject_id=payload.subject_id.strip()[:120],
        subject_label=(payload.subject_label or "").strip()[:200] or None,
        reason=reason,
        message=message,
        reporter_email=email,
        page_url=(payload.page_url or "").strip()[:500] or None,
    )
    for admin_email in sorted(_ADMIN_EMAILS):
        _email.send_report_email(admin_email, report.kind, report.subject_label or report.subject_id, message, report.page_url)
    return _report_out(report)


@app.get("/admin/reports", response_model=list[ReportOut])
def admin_list_reports(status: str | None = "open", organizer: Organizer = Depends(require_admin)) -> list[ReportOut]:
    return [_report_out(r) for r in db.list_reports(None if status in (None, "", "all") else status)]


@app.post("/admin/reports/{report_id}/resolve", response_model=ReportOut)
def admin_resolve_report(report_id: int, payload: ReportResolve, organizer: Organizer = Depends(require_admin)) -> ReportOut:
    report = db.resolve_report(report_id, resolved_by=organizer.email, resolution=(payload.resolution or "").strip()[:500] or None)
    if report is None:
        raise HTTPException(status_code=404, detail="no report with that id")
    return _report_out(report)


@app.delete("/admin/reports/{report_id}", status_code=204)
def admin_delete_report(report_id: int, organizer: Organizer = Depends(require_admin)) -> Response:
    if not db.delete_report(report_id):
        raise HTTPException(status_code=404, detail="no report with that id")
    return Response(status_code=204)


@app.delete("/admin/runners/{runner_id}", status_code=204)
def admin_delete_runner(runner_id: str, organizer: Organizer = Depends(require_admin)) -> Response:
    """Remove a runner's profile and every result attached to it (a removal request, or a bad merge)."""
    if db.find_runner(runner_id) is None and not db.delete_runner(runner_id):
        raise HTTPException(status_code=404, detail="no runner with that id")
    db.delete_runner(runner_id)
    return Response(status_code=204)
