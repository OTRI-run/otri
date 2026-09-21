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

import base64
import gzip
import json
import os
from urllib.parse import quote, urlencode
from dataclasses import asdict, replace
from hashlib import sha256
from datetime import date, datetime, timezone
import re
import sys
import tempfile
import unicodedata
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from fastapi.responses import RedirectResponse
from fastapi import FastAPI, Form, HTTPException, Request, Response, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool

from course import GpxParseError, extract_features, parse_track_points, read_track_points
from course.discipline import is_vertical
from course.sanitize import SANITIZED_HEADER, sanitized_gpx, source_metadata
from course.measurement import Measurement, measure_course
from course.features import features_from_measurement
from course.elevation import cell_of, configured_provider
from course import dem_fetch
import logging

_log = logging.getLogger("otri.api")
if not os.environ.get("OTRI_DEM_MANIFEST"):
    _log.warning(
        "OTRI_DEM_MANIFEST is not set: courses are measured from uploaded elevations and every "
        "V0.7 score will report Low confidence. See scripts/deploy/06-install-dem.sh."
    )
from ingestion import result_records, validate_result_file
from ingestion.records import RaceRecord
from scoring import DEFAULT_SCORING_VERSION, available_scoring_models, estimate_score, get_scoring_model_info, score_race
from scoring.runner_index import IndexInput, compute_runner_index

from . import db
from . import auth as _auth
from .auth import (
    AuthError,
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
from . import oauth_google as _google
from . import rate_limit as _limits
from .rate_limit import enforce_rate_limit, over_limit
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
    ScoredCourse,
    ScoreRaceResult,
    ScoreSummary,
    GpxAnalysis,
    IllustrativeEstimateOut,
    MessageResponse,
    ProvidersResponse,
    RegistrationResponse,
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
    revoked = db.keep_admins(_ADMIN_EMAILS)
    if revoked:
        print(f"admin flag taken from {revoked} account(s) no longer in OTRI_ADMIN_EMAILS")
    yield


app = FastAPI(
    title="OTRI API",
    description="Open Trail Running Index — events, race distances, scored results, and the organizer workflow.",
    version="0.1.0",
    lifespan=_lifespan,
    # The generated pages are replaced below: FastAPI's own load whatever a CDN serves today for
    # "swagger-ui-dist@5" and "redoc@next", as script on this origin, which is where organizers'
    # and admins' session cookies count. See `interactive_docs`.
    docs_url=None,
    redoc_url=None,
)

# Swagger UI, one exact version, each file pinned by its hash (Subresource Integrity): the browser
# refuses a file that is not byte for byte this one, so a tampered or hijacked CDN package cannot
# run as api.otri.run and act with the session of whoever opened the page. To upgrade: pick the
# version, download the two files and recompute `sha384` (openssl dgst -sha384 -binary | base64).
_SWAGGER_VERSION = "5.33.0"
_SWAGGER_FILES = {
    "swagger-ui-bundle.js": "sha384-YDALVcy8kj8yltLBVi1vBiBAUqdxvus673gM8XKwiy6aDUJFXivF/KCufekjYbVf",
    "swagger-ui.css": "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW",
}
_SWAGGER_CDN = f"https://cdn.jsdelivr.net/npm/swagger-ui-dist@{_SWAGGER_VERSION}"
_DOCS_INIT = "window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: false, presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset], layout: 'BaseLayout' })"
_DOCS_CSP = (
    "default-src 'none'; "
    f"script-src https://cdn.jsdelivr.net 'sha256-{base64.b64encode(sha256(_DOCS_INIT.encode()).digest()).decode()}'; "
    "style-src https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
_DOCS_HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>OTRI API reference</title>
<link rel="stylesheet" href="{_SWAGGER_CDN}/swagger-ui.css" integrity="{_SWAGGER_FILES['swagger-ui.css']}" crossorigin="anonymous">
</head>
<body>
<div id="swagger-ui"></div>
<script src="{_SWAGGER_CDN}/swagger-ui-bundle.js" integrity="{_SWAGGER_FILES['swagger-ui-bundle.js']}" crossorigin="anonymous"></script>
<script>{_DOCS_INIT}</script>
</body>
</html>
"""


@app.get("/docs", include_in_schema=False)
def interactive_docs() -> Response:
    """The generated API reference. Public on purpose (the code is open, and so is the API): what it
    must not be is a way for someone else's script to run on this origin."""
    return Response(content=_DOCS_HTML, media_type="text/html; charset=utf-8", headers={"Content-Security-Policy": _DOCS_CSP, "Cache-Control": "public, max-age=3600"})


# Captured once at process/worker start — the practical "last restarted at" for this API
# instance (a deploy restarts the systemd service, spawning a fresh process).
_STARTED_AT = datetime.now(timezone.utc)


# Configurable via OTRI_API_ALLOWED_ORIGINS (comma-separated), e.g.
# "https://otri.run,https://www.otri.run" in production. Defaults to the
# local Vite dev server so `npm run dev` + `uvicorn api.app:app` work together
# out of the box.
_allowed_origins = os.environ.get("OTRI_API_ALLOWED_ORIGINS", "http://localhost:5173")
_ALLOWED_ORIGIN_LIST = [origin.strip() for origin in _allowed_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGIN_LIST,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
    allow_credentials=True,  # the organizer app authenticates with an HttpOnly cookie
)
# The race list is one response the browser filters itself; with a few thousand listings it is
# megabytes of JSON and about a tenth of that compressed. The proxy does not compress for us.
app.add_middleware(GZipMiddleware, minimum_size=2000)


_MAX_BODY_BYTES = 20_000_000
_PUBLIC_CACHE_PREFIXES = ("/races", "/runners", "/events", "/scoring/models", "/gpx/shared/")


@app.middleware("http")
async def _guardrails(request: Request, call_next):
    """Reject oversized bodies before reading them, and add the response headers every API
    should carry (no MIME sniffing, no framing, no caching of anything personal)."""
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > _MAX_BODY_BYTES:
        return Response(content='{"detail":"Upload exceeds 20 MB"}', status_code=413, media_type="application/json")
    # A chunked body announces no length, and the form parser would spool all of it to disk before
    # any endpoint looked at its size. Browsers and the proxy always send a length; ask for one.
    if "chunked" in request.headers.get("transfer-encoding", "").lower():
        return Response(content='{"detail":"Send a Content-Length: chunked uploads are not accepted"}', status_code=411, media_type="application/json")
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    # An API answers with data. Should a browser ever be talked into showing one as a page, nothing
    # in it may load or run (the docs page sets its own, narrower-than-default policy).
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
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


# The calculator endpoints are a public tool: any website may call them from a browser (an embedded
# calculator, a timing company's results page). They carry no session and keep nothing, so they
# answer every origin, without credentials. Everything else stays on the allow-list above.
_OPEN_CORS_PATHS = {"/score", "/gpx/analyze", "/scoring/models"}


@app.middleware("http")
async def _open_cors(request: Request, call_next):
    origin = request.headers.get("origin")
    # OTRI's own pages send the session cookie, which a wildcard answer would make the browser refuse.
    if origin is None or request.url.path not in _OPEN_CORS_PATHS or origin in _ALLOWED_ORIGIN_LIST:
        return await call_next(request)
    if request.method == "OPTIONS" and "access-control-request-method" in request.headers:
        response = Response(status_code=204)
        response.headers["Access-Control-Allow-Methods"] = "GET, POST"
        response.headers["Access-Control-Allow-Headers"] = request.headers.get("access-control-request-headers", "*")
        response.headers["Access-Control-Max-Age"] = "86400"
    else:
        response = await call_next(request)
    if "access-control-allow-origin" not in response.headers:  # not one of our own origins
        response.headers["Access-Control-Allow-Origin"] = "*"
        if "access-control-allow-credentials" in response.headers:
            del response.headers["access-control-allow-credentials"]  # a wildcard answer never carries credentials
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, Retry-After"
    response.headers.add_vary_header("Origin")
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
        print(f"health: database check failed: {error!r}")
        checks["database"] = {"ok": False, "error": "database unreachable (details in the API log)"}
    try:
        usage = shutil.disk_usage(REPO_ROOT)
        free_percent = round(usage.free / usage.total * 100, 1)
        checks["disk"] = {"ok": free_percent >= 10, "free_percent": free_percent}
    except OSError as error:
        print(f"health: disk check failed: {error!r}")
        checks["disk"] = {"ok": False, "error": "disk usage unavailable (details in the API log)"}
    ok = all(check["ok"] for check in checks.values())
    if not ok:
        response.status_code = 503
    payload = {"status": "ok" if ok else "degraded", "started_at": _STARTED_AT.isoformat()}
    if _is_local_or_admin(request):
        payload["checks"] = checks
    return payload


_bearer_scheme = HTTPBearer(auto_error=False)


# Admin accounts: a comma-separated list of emails, and the list is what counts. An account is an
# admin while its confirmed address is on it: checked on every request (_with_flags), so taking an
# address off the list and restarting ends that admin's rights with the restart, open sessions
# included. The flag on the account follows the list (at sign-in and at start) and is what the
# admin pages show. It used to be the other way round: the flag was set at sign-in and nothing
# ever cleared it, so removing an address from the list removed nothing.
_ADMIN_EMAILS = {email.strip().lower() for email in os.environ.get("OTRI_ADMIN_EMAILS", "").split(",") if email.strip()}


def _with_flags(organizer: Organizer, *, check_session: bool = True) -> Organizer:
    """The token carries identity; the admin/demo flags are read from the account on every request,
    so revoking admin takes effect immediately."""
    flags = db.get_organizer_flags(organizer.id, organizer.token_id)
    if flags is None:
        raise AuthError("this account no longer exists")
    if flags.pop("revoked") or (check_session and flags["session_version"] != organizer.session_version):
        raise AuthError("this session was signed out; sign in again")
    flags["is_admin"] = flags["is_admin"] and organizer.email.strip().lower() in _ADMIN_EMAILS
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


def require_verified(organizer: Organizer) -> None:
    """Anything that shows a race to the public needs a confirmed email address: it is the one thing
    OTRI knows about who is publishing runners' names."""
    if not organizer.email_verified:
        raise HTTPException(status_code=403, detail=f"confirm your email address first: we sent a link to {organizer.email}")


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


def _require_race_visible(race: db.Race, organizer: Organizer | None, *, results: bool = False) -> None:
    """Results, course and measurement are public once published; until then only the owner and admins
    see them. A listing makes the course and measurement public earlier, never the results."""
    if race.published_at is not None or (race.listed_at is not None and not results):
        return
    if organizer is not None and (organizer.id == race.organizer_id or organizer.is_admin):
        return
    raise HTTPException(status_code=403, detail="this race has not been published by its organizer")


# --- Auth ------------------------------------------------------------------


@app.post("/auth/register", response_model=RegistrationResponse, status_code=201)
def register(payload: OrganizerRegistration, request: Request, response: Response) -> RegistrationResponse:
    """Creates the account, emails a confirmation link and signs the organizer in. They can build
    their race straight away; publishing or listing it waits for the confirmed address."""
    enforce_rate_limit(request, max_requests=5)
    # An account is free and each one sends an email and may hold data: five a minute is a slip of
    # the finger, three hundred an hour is a script.
    enforce_rate_limit(request, max_requests=10, scope="register-hour", window_seconds=3600)
    enforce_rate_limit(request, max_requests=30, scope="register-day", window_seconds=86400)
    try:
        organizer = register_organizer(payload.email, payload.password, accept_terms=payload.accept_terms, marketing_opt_in=payload.marketing_opt_in)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    token = create_email_verification_token(organizer)
    send_verification_email(organizer.email, token)

    session = _finish_session(response, request, _issue_session(organizer, False, request), False)
    return RegistrationResponse(**session.model_dump(), message="account created: confirm your email address from the link we sent before you publish")


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: OrganizerCredentials, request: Request, response: Response) -> TokenResponse:
    enforce_rate_limit(request, max_requests=10)
    source = _limits._client_key(request)
    try:
        _limits.check_account_lock(payload.email, source)
    except _limits.AccountLocked as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": error.retry_after}) from error
    try:
        organizer = authenticate_organizer(payload.email, payload.password)
    except AuthError as error:
        _limits.record_login_failure(payload.email, source)
        raise HTTPException(status_code=401, detail=str(error)) from error
    _limits.clear_login_failures(payload.email, source)
    checked_under = organizer.session_version  # read with the password hash: see authenticate_organizer
    # The flag follows the list in both directions; an unconfirmed address proves nothing.
    db.set_organizer_flags(organizer.email, is_admin=organizer.email in _ADMIN_EMAILS and organizer.email_verified)
    organizer = _with_flags(organizer, check_session=False)  # credentials, not a token: nothing to compare yet
    return _finish_session(response, request, _issue_session(organizer, payload.remember, request, session_version=checked_under), payload.remember)


def _second_factor_key(email: str) -> str:
    return f"2fa|{email.strip().lower()}"


def _refuse_locked_second_factor(email: str) -> None:
    try:
        _limits.check_lock(_second_factor_key(email))
    except _limits.AccountLocked as error:
        raise HTTPException(
            status_code=429,
            detail="Too many wrong codes for this account. Signing in with a code is paused for up to an hour; we have written to the account's address.",
            headers={"Retry-After": error.retry_after},
        ) from error


def _issue_session(organizer: Organizer, remember: bool, request: Request | None = None, *, session_version: int | None = None) -> TokenResponse:
    """Either a token, or a second-step challenge when the account has two-factor enabled."""
    status = _auth.two_factor_status(organizer.id)
    if status["enabled"]:
        # Every sign-in hands out a fresh challenge with five attempts of its own, so the attempts
        # are also counted per account: without that, whoever has the password guesses at the code
        # five at a time for as long as they like.
        _refuse_locked_second_factor(organizer.email)
        if status["method"] == "email" and request is not None:  # each challenge is an email to the owner
            enforce_rate_limit(request, max_requests=6, scope="login-code", subject=f"account-{organizer.id}", window_seconds=900)
        try:
            challenge, method, code = _auth.start_login_challenge(organizer, remember, session_version=session_version)
        except AuthError as error:  # the account's protection changed while the password was being checked
            raise HTTPException(status_code=401, detail=str(error)) from error
        if code:
            _email.send_login_code_email(organizer.email, code)
        return TokenResponse(access_token="", email=organizer.email, requires_2fa=True, challenge=challenge, method=method)
    return TokenResponse(
        access_token=create_access_token(organizer, remember, session_version=session_version),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        email_verified=organizer.email_verified,
        expires_in=_auth.token_ttl_seconds(remember),
    )


@app.post("/auth/login/2fa", response_model=TokenResponse)
def login_second_step(payload: TwoFactorLogin, request: Request, response: Response) -> TokenResponse:
    """The second step: an authenticator code, an emailed code, or a recovery code."""
    enforce_rate_limit(request, max_requests=10)
    owner = _auth.challenge_email(payload.challenge)
    if owner:
        _refuse_locked_second_factor(owner)
    try:
        organizer, remember = _auth.complete_login_challenge(payload.challenge, payload.code)
    except _auth.WrongSecondFactor as error:
        # Whoever got this far has the password. Ten wrong codes pause the second step for the
        # account, from every address, and the owner is told why.
        if _limits.record_failure(_second_factor_key(error.email), duration=_limits.SECOND_FACTOR_LOCKOUT_DURATION):
            _email.send_security_alert_email(error.email)
        raise HTTPException(status_code=401, detail=str(error)) from error
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    _limits.clear_failures(_second_factor_key(organizer.email))
    checked_under = organizer.session_version
    organizer = _with_flags(organizer, check_session=False)
    return _finish_session(response, request, TokenResponse(
        access_token=create_access_token(organizer, remember, session_version=checked_under),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        email_verified=organizer.email_verified,
        expires_in=_auth.token_ttl_seconds(remember),
    ), remember)


def _me(organizer: Organizer) -> MeResponse:
    profile = db.get_profile(organizer.id)
    return MeResponse(
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        email_verified=organizer.email_verified,
        profile=ProfileOut(**{k: profile.get(k) for k in (*db.PROFILE_FIELDS, "marketing_opt_in_at", "terms_accepted_at")}),
        two_factor=TwoFactorStatus(**_auth.two_factor_status(organizer.id)),
        password_changed_at=profile.get("password_changed_at"),
        has_password=bool(profile.get("has_password", True)),
    )


# --- Sign in with Google ------------------------------------------------------------------------
#
# See api/oauth_google.py for the flow and the checks. Two things are particular to these routes.
# The callback is a top-level navigation from Google, so it cannot carry the web client's header:
# it sets the session cookie directly, and the state row plus the browser cookie stand in for the
# header as the proof that this browser meant to sign in. And every failure ends in a redirect to
# the app with a short reason code, never in an error page on the API host.

_OAUTH_COOKIE = "otri_oauth"
_ORGANIZER_APP = f"{_email.APP_BASE_URL}/prototype/organizer/"


_API_BASE_URL = os.environ.get("OTRI_API_BASE_URL", "").strip().rstrip("/")


def _api_base(request: Request) -> str:
    """This API's own origin: where Google must send the browser back, and where a link we email
    points. It has to match the URI registered in the Google console exactly.

    OTRI_API_BASE_URL decides it. Without that it is read from the request, which is right for a
    local run and wrong behind a proxy: nginx passes X-Forwarded-Host through from whoever sent
    it, so the address would be the caller's to choose."""
    if _API_BASE_URL:
        return _API_BASE_URL
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc)).split(",")[0].strip()
    return f"{scheme}://{host}"


def _app_redirect(fragment: str, **params: str) -> RedirectResponse:
    query = f"?{urlencode(params)}" if params else ""
    return RedirectResponse(f"{_ORGANIZER_APP}#{fragment}{query}", status_code=303)


def _clear_oauth_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(_OAUTH_COOKIE, path="/auth/google", httponly=True, secure=_cookie_secure(request), samesite="lax")


@app.get("/auth/providers", response_model=ProvidersResponse)
def auth_providers() -> ProvidersResponse:
    """Which outside sign-ins this deployment offers, so the app only shows buttons that work."""
    return ProvidersResponse(google=_google.enabled())


@app.get("/auth/google/start")
def google_start(
    request: Request,
    intent: str = "login",
    accept_terms: bool = False,
    marketing_opt_in: bool = False,
    remember: bool = False,
):
    """Sends the browser to Google. `intent` says which page the button was on: only the register
    page, with the terms ticked, may end in a new account."""
    if not _google.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in is not configured")
    enforce_rate_limit(request, max_requests=10)
    enforce_rate_limit(request, max_requests=60, scope="oauth-start-hour", window_seconds=3600)
    try:
        begun = _google.begin(
            redirect_uri=f"{_api_base(request)}/auth/google/callback",
            intent=intent,
            accept_terms=accept_terms,
            marketing_opt_in=marketing_opt_in,
            remember=remember,
        )
    except _google.OAuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    response = RedirectResponse(begun.url, status_code=303)
    response.set_cookie(
        _OAUTH_COOKIE,
        begun.browser_token,
        max_age=int(_google.STATE_TTL.total_seconds()),
        httponly=True,
        secure=_cookie_secure(request),
        samesite="lax",  # sent on the top-level GET back from Google, never on a cross-site POST or fetch
        path="/auth/google",
    )
    return response


@app.get("/auth/google/callback")
def google_callback(request: Request, state: str = "", code: str = "", error: str = ""):
    """Where Google sends the browser back. Ends in the app, signed in or with a reason not to be."""
    if not _google.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in is not configured")
    enforce_rate_limit(request, max_requests=20)

    def fail(reason: str) -> RedirectResponse:
        response = _app_redirect("/login", google="failed", reason=reason)
        _clear_oauth_cookie(response, request)
        return response

    if error or not state or not code:
        return fail("denied" if error else "bad-request")
    try:
        identity, started = _google.complete(
            state=state,
            code=code,
            browser_token=request.cookies.get(_OAUTH_COOKIE),
            redirect_uri=f"{_api_base(request)}/auth/google/callback",
        )
        outcome = _google.resolve(identity, started)
    except _google.OAuthError as exc:
        return fail(exc.reason)
    except AuthError:
        return fail("failed")

    if outcome.event == "no_account":
        # The visitor's own address, handed back so the register page can fill it in.
        response = _app_redirect("/register", google="no-account", email=identity.email)
        _clear_oauth_cookie(response, request)
        return response

    if outcome.event == "confirm_link":
        # An account already has this address, and Google only checked the address once, some time
        # ago, on somebody else's domain. Whoever reads that mailbox now says whether this Google
        # account belongs to it. Nothing has been written, and no session is issued.
        token = _google.begin_link(outcome.organizer, outcome.pending)
        _email.send_google_link_email(
            outcome.organizer.email,
            f"{_api_base(request)}/auth/google/confirm-link?token={quote(token, safe='')}",
            unconfirmed=not outcome.organizer.email_verified,
        )
        response = _app_redirect("/login", google="confirm-link", email=identity.email)
        _clear_oauth_cookie(response, request)
        return response

    organizer = outcome.organizer
    # Every Google outcome has a verified address, so the admin list applies as at password sign-in.
    db.set_organizer_flags(organizer.email, is_admin=organizer.email in _ADMIN_EMAILS)
    organizer = _with_flags(organizer, check_session=False)
    if outcome.event in ("linked", "reclaimed"):
        _email.send_google_linked_email(organizer.email, reclaimed=outcome.event == "reclaimed")
    if outcome.event == "created" and not organizer.email_verified:
        # Google checked this address once and does not run the mailbox, so the account starts
        # unconfirmed like any other: it may build a race, and publishing waits for the link.
        send_verification_email(organizer.email, create_email_verification_token(organizer))

    session = _issue_session(organizer, started.remember, request, session_version=organizer.session_version)
    if session.requires_2fa:
        # The account's own second factor still stands. The login page knows this screen.
        response = _app_redirect("/login", challenge=session.challenge, method=session.method or "")
    else:
        response = _app_redirect("/login", google="ok", event=outcome.event)
        _set_session_cookie(response, request, session.access_token, started.remember)
    _clear_oauth_cookie(response, request)
    return response


@app.get("/auth/google/confirm-link")
def google_confirm_link(request: Request, token: str = ""):
    """The link we emailed the account's address when Google could not answer for it. Opening it
    joins that Google account to this one; it does not sign anybody in, so reading the mailbox
    gets a way in and nothing more, and the account's own second factor still stands at the door."""
    if not _google.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in is not configured")
    enforce_rate_limit(request, max_requests=20)
    if not token:
        return _app_redirect("/login", google="failed", reason="link-expired")
    try:
        outcome = _google.complete_link(token)
    except _google.OAuthError as error:
        return _app_redirect("/login", google="failed", reason=error.reason)
    except AuthError:
        return _app_redirect("/login", google="failed", reason="failed")
    _email.send_google_linked_email(outcome.organizer.email, reclaimed=outcome.event == "reclaimed")
    return _app_redirect("/login", google="connected")


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


@contextmanager
def _password_confirmed(request: Request, organizer: Organizer):
    """Around every action that asks a signed-in organizer for the password again.

    Each check is a bcrypt comparison, a sixth of a second of a core, and each is a guess at the
    password by whoever holds the session. Sign-in limits both; these endpoints had neither, so a
    stolen session could guess without end and any free account could keep the server's cores busy.
    Limited per account and per address, and ten wrong passwords pause them for the account."""
    enforce_rate_limit(request, max_requests=5, scope="password-check", subject=f"account-{organizer.id}")
    enforce_rate_limit(request, max_requests=10, scope="password-check-address")
    key = f"confirm|{organizer.email.strip().lower()}"
    try:
        _limits.check_lock(key)
    except _limits.AccountLocked as error:
        raise HTTPException(status_code=429, detail="Too many wrong passwords. Try again in a quarter of an hour, or reset your password.", headers={"Retry-After": error.retry_after}) from error
    try:
        yield
    except _auth.WrongPassword as error:
        _limits.record_failure(key)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _limits.clear_failures(key)


@app.post("/auth/change-password", response_model=TokenResponse)
def change_password(payload: ChangePassword, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> TokenResponse:
    """Changes the password and signs out every other device; returns a fresh token for this one."""
    with _password_confirmed(request, organizer):
        _auth.change_password(organizer.id, payload.current_password, payload.new_password)
    return _finish_session(response, request, _fresh_token(organizer), False)


@app.post("/auth/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> MessageResponse:
    """Ends this session: the cookie is cleared and the token itself stops working. Clearing the
    cookie alone left the token good until it expired, up to thirty days: whoever had copied it
    from a shared computer or a log was not signed out by the owner signing out."""
    token, from_cookie = _token_from_request(request, credentials)
    # A cookie counts only with the web client's header, like every other state change by cookie:
    # another site must not be able to end a visitor's session.
    if token and not (from_cookie and not _is_web_client(request)):
        try:
            session = decode_access_token(token)
            db.revoke_token(session.token_id, session.token_expires_at)
        except AuthError:
            pass  # not a token of ours, or one that has expired: nothing to end
    _clear_session_cookie(response, request)
    return MessageResponse(message="signed out")


def _fresh_token(organizer: Organizer) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(organizer),
        email=organizer.email,
        is_admin=organizer.is_admin,
        is_demo=organizer.is_demo,
        email_verified=organizer.email_verified,
        expires_in=_auth.token_ttl_seconds(False),
    )


@app.post("/auth/logout-all", response_model=MessageResponse)
def logout_everywhere(payload: PasswordConfirm, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> MessageResponse:
    """Invalidates every token for this account, this one included."""
    with _password_confirmed(request, organizer):
        _auth.revoke_all_sessions(organizer.id, payload.password)
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
    with _password_confirmed(request, organizer):
        _auth.delete_own_account(organizer.id, payload.password)
    _clear_session_cookie(response, request)
    return MessageResponse(message="account deleted")


@app.post("/auth/2fa/totp/setup", response_model=TotpSetupOut)
def totp_setup(payload: PasswordConfirm, request: Request, organizer: Organizer = Depends(require_organizer)) -> TotpSetupOut:
    """Start authenticator-app setup: a secret to scan; nothing changes until a code confirms it.
    Needs the password: a session alone must not be able to replace the owner's second factor."""
    with _password_confirmed(request, organizer):
        secret, uri = _auth.begin_totp_setup(organizer.id, organizer.email, payload.password)
    return TotpSetupOut(secret=secret, otpauth_uri=uri)


def _recovery_codes_with_session(response: Response, request: Request, organizer: Organizer, codes: list[str], method: str) -> RecoveryCodesOut:
    """Turning two-factor on signed out every session of the account, this one too: hand this
    device a new one with the codes, as turning it off does."""
    session = _finish_session(response, request, _fresh_token(organizer), False)
    return RecoveryCodesOut(codes=codes, method=method, access_token=session.access_token, token_type=session.token_type, expires_in=session.expires_in)


@app.post("/auth/2fa/totp/enable", response_model=RecoveryCodesOut)
def totp_enable(payload: TwoFactorCode, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    enforce_rate_limit(request, max_requests=10, scope="2fa-enable", subject=f"account-{organizer.id}")
    try:
        codes = _auth.enable_totp(organizer.id, payload.code)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _recovery_codes_with_session(response, request, organizer, codes, "totp")


@app.post("/auth/2fa/email/start", response_model=MessageResponse)
def email_two_factor_start(payload: PasswordConfirm, request: Request, organizer: Organizer = Depends(require_organizer)) -> MessageResponse:
    enforce_rate_limit(request, max_requests=6, scope="login-code", subject=f"account-{organizer.id}", window_seconds=900)  # each one is an email
    with _password_confirmed(request, organizer):
        code = _auth.begin_email_two_factor(organizer.id, payload.password)
    _email.send_login_code_email(organizer.email, code)
    return MessageResponse(message=f"a code was sent to {organizer.email}")


@app.post("/auth/2fa/email/enable", response_model=RecoveryCodesOut)
def email_two_factor_enable(payload: TwoFactorCode, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    # Six digits, ten minutes: without a limit the code is a guess away. Five tries a code.
    enforce_rate_limit(request, max_requests=5, scope="2fa-enable", subject=f"account-{organizer.id}", window_seconds=600)
    try:
        codes = _auth.enable_email_two_factor(organizer.id, payload.code)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _recovery_codes_with_session(response, request, organizer, codes, "email")


@app.post("/auth/2fa/disable", response_model=TokenResponse)
def two_factor_disable(payload: PasswordConfirm, request: Request, response: Response, organizer: Organizer = Depends(require_organizer)) -> TokenResponse:
    """Turns two-factor off and signs out every other device; returns a fresh token for this one."""
    with _password_confirmed(request, organizer):
        _auth.disable_two_factor(organizer.id, payload.password)
    return _finish_session(response, request, _fresh_token(organizer), False)


@app.post("/auth/2fa/recovery-codes", response_model=RecoveryCodesOut)
def two_factor_recovery_codes(payload: PasswordConfirm, request: Request, organizer: Organizer = Depends(require_organizer)) -> RecoveryCodesOut:
    """Fresh recovery codes; the old ones stop working."""
    with _password_confirmed(request, organizer):
        codes = _auth.regenerate_recovery_codes(organizer.id, payload.password)
    return RecoveryCodesOut(codes=codes, method=_auth.two_factor_status(organizer.id)["method"] or "")


@app.post("/auth/verify-email", response_model=MessageResponse)
def confirm_email(payload: EmailVerificationRequest) -> MessageResponse:
    try:
        verify_email(payload.token)
    except AuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return MessageResponse(message="email verified — you can sign in now")


def _may_email(request: Request, address: str) -> bool:
    """Whether one more account email may go to `address`. The per-address limits counted the
    sender only, so a script behind a few addresses could fill anybody's inbox with OTRI mail
    (and get OTRI's sending domain marked as spam). Three an hour per recipient, whoever asks; over
    that the endpoint answers as always and sends nothing, so the answer still says nothing about
    whether the address has an account."""
    enforce_rate_limit(request, max_requests=20, scope="account-mail-hour", window_seconds=3600)
    return not over_limit(request, max_requests=3, scope="account-mail-to", subject=_limits.subject_for(address), window_seconds=3600)


@app.post("/auth/resend-verification", response_model=MessageResponse)
def resend_verification(payload: ResendVerificationRequest, request: Request) -> MessageResponse:
    enforce_rate_limit(request, max_requests=5)
    result = request_email_verification(payload.email) if _may_email(request, payload.email) else None
    if result is not None:
        organizer, token = result
        send_verification_email(organizer.email, token)
    # Same response either way — don't leak which emails have accounts / are already verified.
    return MessageResponse(message="if that email needs verifying, a new link has been sent")


@app.post("/auth/request-password-reset", response_model=MessageResponse)
def request_password_reset(payload: PasswordResetRequest, request: Request) -> MessageResponse:
    enforce_rate_limit(request, max_requests=5)
    result = create_password_reset_token(payload.email) if _may_email(request, payload.email) else None
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
    # The owner is back: the wrong passwords somebody piled up against the account no longer lock
    # it. The count of wrong second-factor codes stays, a mailbox does not answer for those.
    _limits.clear_all_locks(organizer.email)
    # A reset link proves the mailbox, which is one factor. An account with a second factor is not
    # signed in by it: the password is changed, and the owner signs in the normal way, code included.
    if _auth.two_factor_status(organizer.id)["enabled"]:
        return TokenResponse(access_token="", email=organizer.email, requires_2fa=True)
    organizer = _with_flags(organizer, check_session=False)
    return _finish_session(response, request, TokenResponse(access_token=create_access_token(organizer), email=organizer.email, is_admin=organizer.is_admin, is_demo=organizer.is_demo, email_verified=organizer.email_verified, expires_in=_auth.token_ttl_seconds(False)), False)


# --- Events ------------------------------------------------------------------


def _listing_status(race: db.Race) -> str:
    if race.published_at is not None:
        return "scored"
    if race.listed_at is None:
        return "private"
    return "upcoming" if race.event_date and race.event_date > date.today() else "awaiting_results"


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
        elevation_loss_m=race.elevation_loss_m,
        is_vertical=is_vertical(race.distance_km, race.elevation_gain_m, race.elevation_loss_m),
        listing_status=_listing_status(race),
        is_listed=race.listed_at is not None,
        calculator_only=race.calculator_only,
        source_url=race.event_source_url if race.calculator_only else None,
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
    # A calculator course (Admin, Calculator courses) is kept as an event of the admin's, but it is not
    # one of their events: it has its own screen, and no place in a list of events.
    calculator_events = {race.event_id for race in db.list_calculator_courses()}
    events = [event for event in db.list_events() if event.event_id not in calculator_events]
    if mine:
        if organizer is None:
            raise HTTPException(status_code=401, detail="missing bearer token")
        events = [event for event in events if event.organizer_id == organizer.id]
    elif organizer is None or not organizer.is_admin:
        # Public: only events with something public in them. An organizer's drafts (an event being
        # prepared, a race not published yet) are theirs until they publish: not their names either.
        public_events = {race.event_id for race in db.list_races(published_only=True)}
        events = [event for event in events if event.event_id in public_events]
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


def _is_public_race(race: db.Race) -> bool:
    return race.published_at is not None or race.listed_at is not None


@app.get("/events/{event_id}", response_model=EventDetail)
def get_event(event_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> EventDetail:
    """The event and its races: all of them for its owner and admins, the public ones for anyone
    else. An event with nothing public answers 404 to the public, like one that does not exist, so
    its existence is not confirmed either."""
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    races = db.list_races_for_event(event_id)
    if organizer is None or not (organizer.is_admin or organizer.id == event.organizer_id):
        races = [race for race in races if _is_public_race(race)]
        if not races:
            raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
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
    # One query for every race, not one per event: the list runs to thousands once listings are imported.
    races_by_event: dict[str, list[db.Race]] = {}
    for race in db.list_races():
        races_by_event.setdefault(race.event_id, []).append(race)
    out = []
    for event in db.list_events():
        races = races_by_event.get(event.event_id, [])
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


# What one account may hold and how fast it may add to it. An account costs nothing to make and
# needs no confirmed address to start building a race, so without these a script could pile up
# events and keep the course measurement busy with upload after upload. The numbers are far above
# what an organizer does by hand (a big event has a dozen distances; a timing company a few
# hundred events) and low enough that abuse stays small. Admins are not limited.
#
# An unconfirmed address is one nobody has shown they can read: a script makes them by the
# thousand. It may try everything once (a few events, a few distances, a real results file) and
# holds little until the link in the inbox is clicked. Counted in result rows because rows are what
# fills the disk: three events of forty distances of fifty thousand rows was six million rows an
# account, before any address was confirmed.
_MAX_EVENTS_UNCONFIRMED = 3
_MAX_EVENTS_PER_ACCOUNT = 500
_MAX_RACES_PER_EVENT = 40
_MAX_RACES_PER_EVENT_UNCONFIRMED = 6
_MAX_RESULT_ROWS_UNCONFIRMED = 20_000
_MAX_RESULT_ROWS_PER_ACCOUNT = 3_000_000
_UPLOADS_PER_MINUTE = 12
_UPLOADS_PER_HOUR = 150
_UPLOADS_PER_HOUR_UNCONFIRMED = 30


def _limit_writes(request: Request, organizer: Organizer, *, scope: str, per_minute: int, per_hour: int | None = None) -> None:
    """Per account and per address: whichever a script does not rotate still stops it."""
    if organizer.is_admin:
        return
    enforce_rate_limit(request, max_requests=per_minute, scope=scope, subject=f"account-{organizer.id}")
    enforce_rate_limit(request, max_requests=per_minute * 3, scope=f"{scope}-address")
    if per_hour:
        enforce_rate_limit(request, max_requests=per_hour, scope=f"{scope}-hour", subject=f"account-{organizer.id}", window_seconds=3600)
        enforce_rate_limit(request, max_requests=per_hour * 3, scope=f"{scope}-hour-address", window_seconds=3600)


def _limit_uploads(request: Request, organizer: Organizer) -> None:
    _limit_writes(request, organizer, scope="upload", per_minute=_UPLOADS_PER_MINUTE, per_hour=_UPLOADS_PER_HOUR if organizer.email_verified else _UPLOADS_PER_HOUR_UNCONFIRMED)


def _result_row_limit(organizer: Organizer) -> int | None:
    if organizer.is_admin:
        return None
    return _MAX_RESULT_ROWS_PER_ACCOUNT if organizer.email_verified else _MAX_RESULT_ROWS_UNCONFIRMED


def _no_room_for_results(organizer: Organizer) -> HTTPException:
    if not organizer.email_verified:
        return HTTPException(status_code=403, detail=f"Confirm your email address to store more than {_MAX_RESULT_ROWS_UNCONFIRMED:,} results: the link is in your inbox, and you can have it sent again. Nothing was stored from this file.")
    return HTTPException(status_code=403, detail=f"This account holds {_MAX_RESULT_ROWS_PER_ACCOUNT:,} results, which is the limit. Write to us if you really need more.")


@app.post("/events", response_model=EventSummary, status_code=201)
def create_event(payload: EventCreate, request: Request, organizer: Organizer = Depends(require_organizer)) -> EventSummary:
    """Requires a signed-in organizer. An unconfirmed address may build a few events; more needs the
    address confirmed."""
    _limit_writes(request, organizer, scope="create", per_minute=20)
    if not organizer.is_admin:
        held = db.count_events_for_organizer(organizer.id)
        if not organizer.email_verified and held >= _MAX_EVENTS_UNCONFIRMED:
            raise HTTPException(status_code=403, detail=f"Confirm your email address to create more than {_MAX_EVENTS_UNCONFIRMED} events: the link is in your inbox, and you can have it sent again.")
        if held >= _MAX_EVENTS_PER_ACCOUNT:
            raise HTTPException(status_code=403, detail=f"This account holds {_MAX_EVENTS_PER_ACCOUNT} events, which is the limit. Write to us if you really need more.")
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
def get_race(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> RaceSummary:
    """A race's summary: for anyone once it is published or listed, before that for its owner and
    admins only (404 to everyone else, as for a race that does not exist)."""
    race = db.find_race(race_id)
    if race is None or not (_is_public_race(race) or (organizer is not None and (organizer.is_admin or organizer.id == race.organizer_id))):
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    return _race_summary(race, db.count_results_by_race().get(race_id, 0))


@app.post("/races/{race_id}/publish", response_model=RaceSummary)
def publish_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Make the race's results, course and measurement public. Owner or admin; needs scored results
    and a confirmed email address."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    require_verified(organizer)
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


# --- Listings -----------------------------------------------------------------------
#
# An organizer can show their own race publicly before it has results: the facts and the course, so
# runners can try a target time on it (and the embedded calculator can open it). Results stay
# behind publishing. OTRI lists no race on anyone's behalf: see docs/product/open-scoring-tool.md.


@app.post("/races/{race_id}/listing", response_model=RaceSummary)
def list_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Show this race publicly before it has results. Owner or admin, with a confirmed email address."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    require_verified(organizer)
    return _race_summary(db.set_race_listed(race_id, True), db.count_results_by_race().get(race_id, 0))


@app.delete("/races/{race_id}/listing", response_model=RaceSummary)
def unlist_race(race_id: str, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    return _race_summary(db.set_race_listed(race_id, False), db.count_results_by_race().get(race_id, 0))


@app.post("/events/{event_id}/races", response_model=RaceSummary, status_code=201)
def add_race(event_id: str, payload: RaceCreate, request: Request, organizer: Organizer = Depends(require_organizer)) -> RaceSummary:
    """Add a race distance (e.g. "50K") to an event. Requires ownership of the event."""
    event = db.find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id!r} not found")
    _require_event_owner(event, organizer)
    _limit_writes(request, organizer, scope="create", per_minute=20)
    if not organizer.is_admin:
        held = len(db.list_races_for_event(event_id))
        if not organizer.email_verified and held >= _MAX_RACES_PER_EVENT_UNCONFIRMED:
            raise HTTPException(status_code=403, detail=f"Confirm your email address to add more than {_MAX_RACES_PER_EVENT_UNCONFIRMED} distances to an event: the link is in your inbox, and you can have it sent again.")
        if held >= _MAX_RACES_PER_EVENT:
            raise HTTPException(status_code=403, detail=f"An event holds at most {_MAX_RACES_PER_EVENT} race distances.")

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
# And a budget in bytes, because the entries are not alike: one snapshot of a 2,000 km course is
# 6 MB, so sixty-four of them is 384 MB of a 1 GB droplet, and any anonymous visitor can make
# sixty-four of them out of one file with a byte changed.
_MEASUREMENT_CACHE_MAX_BYTES = 48_000_000


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


def _manifest_fingerprint(provider, points=()) -> str:
    """What a cached measurement of this course depends on: the pinned tiles under it. Not the
    manifest as a whole: with tiles fetched on demand the manifest changes whenever a course
    somewhere new arrives, and that must not throw away every other course's measurement."""
    if provider is None:
        return "no-dem"
    cells = dem_fetch.cells_for(points)
    under = sorted(f"{tile.get('path')}={tile.get('sha256')}" for tile in provider.manifest.get("tiles", []) if cell_of(str(tile.get("path", ""))) in (*cells, None))
    return sha256("|".join([str(provider.manifest.get("dataset")), str(provider.manifest.get("release")), *under]).encode()).hexdigest()[:16]


def _measurement_cache_key(path, provider, points=()) -> Path:
    digest = sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return _MEASUREMENT_CACHE_DIR / f"{digest.hexdigest()}-{_manifest_fingerprint(provider, points)}.json"


def _measurement_cache_get(path, provider, points=()):
    key = _measurement_cache_key(path, provider, points)
    try:
        snapshot = json.loads(key.read_text(encoding="utf-8"))
        key.touch()  # keep recently used entries when trimming
        return Measurement(**snapshot)
    except (OSError, ValueError, TypeError):
        return None


def _measurement_cache_put(path, provider, measurement, points=()) -> None:
    try:
        _MEASUREMENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = _measurement_cache_key(path, provider, points)
        tmp = key.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(measurement)), encoding="utf-8")
        os.replace(tmp, key)
        entries = sorted(_MEASUREMENT_CACHE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for stale in entries[:-_MEASUREMENT_CACHE_MAX_ENTRIES]:
            stale.unlink(missing_ok=True)
            entries = entries[1:]
        # Newest first, keeping entries while they fit the budget.
        total = 0
        for entry in reversed(entries):
            try:
                total += entry.stat().st_size
            except OSError:
                continue
            if total > _MEASUREMENT_CACHE_MAX_BYTES:
                entry.unlink(missing_ok=True)
    except OSError:
        pass  # a cache that cannot be written just means measuring again next time


_MIN_COURSE_M = 100  # no race is this short; test courses of a couple of hundred metres stay usable


# New terrain tiles a day: a visitor's course lies in one region or two, an organizer's events in a
# few. Everyone together: what a busy hour of new regions needs, and few enough that a script
# walking the globe cell by cell cannot push the tiles real courses use out of the disk budget.
_TILES_PER_DAY_VISITOR = 6
_TILES_PER_DAY_ACCOUNT = 40
_TILES_PER_HOUR_EVERYONE = int(os.environ.get("OTRI_DEM_FETCH_PER_HOUR", "30"))


def _tile_allowance(request: Request, organizer: Organizer | None = None):
    """The `allow` of dem_fetch.ensure_tiles for this caller: asked only when tiles are missing,
    with how many, and answers whether they may be downloaded now. A no costs the caller nothing
    but the terrain: the course is measured from its own elevations, as before tiles were fetched."""
    if organizer is not None and organizer.is_admin:
        return None

    def allow(tiles: int) -> bool:
        if organizer is not None:
            mine = over_limit(request, max_requests=_TILES_PER_DAY_ACCOUNT, scope="dem-tiles", subject=f"account-{organizer.id}", window_seconds=86400, cost=tiles)
        else:
            mine = over_limit(request, max_requests=_TILES_PER_DAY_VISITOR, scope="dem-tiles", window_seconds=86400, cost=tiles)
        return not mine and not over_limit(request, max_requests=_TILES_PER_HOUR_EVERYONE, scope="dem-tiles", subject="everyone", window_seconds=3600, cost=tiles)

    return allow


def _no_new_tiles(tiles: int) -> bool:
    return False


def _measure_gpx_path(path, allow_tiles=_no_new_tiles):
    points = read_track_points(path)
    # Terrain tiles for a region nobody has uploaded a course from yet are fetched here, once
    # (course/dem_fetch.py); it never raises, and without them the course measures as before.
    # `allow_tiles` is the caller's allowance (_tile_allowance): None for no limit (an admin).
    dem_fetch.ensure_tiles(points, allow=allow_tiles)
    provider = configured_provider()
    measurement = _measurement_cache_get(path, provider, points)
    if measurement is None:
        measurement = measure_course(points, provider)
        _measurement_cache_put(path, provider, measurement, points)
    # A recording of the start area, or a handful of points: a number for it would mean nothing.
    if measurement.distance_m < _MIN_COURSE_M:
        raise GpxParseError(f"This GPX is only {measurement.distance_m:.0f} m long: it does not hold the course. Export the whole track of the race and upload that.")
    return points, measurement


# ---------------------------------------------------------------------------- calculator courses
#
# Courses an admin hand-picks for the calculator's "Pick a race": a name and a GPX, so a visitor can
# try a target time on a well-known course without hunting for its file. They are not race pages:
# no results are expected, they never appear on the races page, and OTRI claims nothing about the
# race beyond "this is its course, from here" (the source link). Stored as an event and a race of the
# admin's, listed and marked `calculator_only`, so the calculator, the share links and the embed
# open them like any other course.


def _stored_gpx_fields(points, measurement, contents: bytes, name: str) -> dict:
    stored = sanitized_gpx(points, name=name)
    return {
        "content": stored,
        "measurement": {
            **measurement.to_dict(),
            "raw_sha256": sha256(contents).hexdigest(),
            "stored_sha256": sha256(stored.encode("utf-8")).hexdigest(),
            "source_metadata": source_metadata(contents.decode("utf-8", errors="replace")),
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "snapshot": asdict(measurement),
        },
    }


@app.get("/admin/calculator-courses", response_model=list[RaceSummary])
def admin_list_calculator_courses(organizer: Organizer = Depends(require_admin)) -> list[RaceSummary]:
    return [_race_summary(race) for race in db.list_calculator_courses()]


@app.post("/admin/calculator-courses", response_model=RaceSummary, status_code=201)
async def admin_add_calculator_course(
    file: UploadFile,
    event_name: str = Form(..., min_length=2, max_length=200),
    course_name: str = Form(..., min_length=1, max_length=120),
    event_date: date | None = Form(default=None),
    location: str | None = Form(default=None, max_length=200),
    country: str | None = Form(default=None, max_length=3),
    source_url: str | None = Form(default=None, max_length=500),
    organizer: Organizer = Depends(require_admin),
) -> RaceSummary:
    """Measure a GPX and put it up for the calculator under a race name. Admin only."""
    if source_url and not re.match(r"^https?://", source_url.strip()):
        raise HTTPException(status_code=422, detail="The source link must start with http:// or https://")
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    temp_path = _save_upload(contents, _safe_suffix(file.filename, ".gpx"))
    try:
        points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path, None)
        features = features_from_measurement(measurement)
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        _discard_temp(temp_path)

    event = db.create_event(
        event_name.strip(),
        event_date or date.today(),
        organizer.id,
        location=(location or "").strip() or None,
        country=(country or "").strip().upper() or None,
        source_url=(source_url or "").strip() or None,
    )
    race = db.create_race(event.event_id, course_name.strip(), features.distance_km, features.elevation_gain_m)
    db.attach_gpx(
        race.race_id,
        filename=file.filename or "course.gpx",
        distance_km=features.distance_km,
        elevation_gain_m=features.elevation_gain_m,
        **_stored_gpx_fields(points, measurement, contents, f"{event_name.strip()} {course_name.strip()}"),
    )
    return _race_summary(db.set_race_calculator_only(race.race_id, True))


@app.patch("/admin/calculator-courses/{race_id}", response_model=RaceSummary)
async def admin_edit_calculator_course(
    race_id: str,
    event_name: str = Form(..., min_length=2, max_length=200),
    course_name: str = Form(..., min_length=1, max_length=120),
    location: str | None = Form(default=None, max_length=200),
    country: str | None = Form(default=None, max_length=3),
    source_url: str | None = Form(default=None, max_length=500),
    file: UploadFile | None = None,
    organizer: Organizer = Depends(require_admin),
) -> RaceSummary:
    """Change a calculator course's names, place or source link; with a file, replace its course
    too (measured again). A field left empty is cleared. Admin only."""
    race = db.find_race(race_id)
    if race is None or not race.calculator_only:
        raise HTTPException(status_code=404, detail="no calculator course with that id")
    if source_url and not re.match(r"^https?://", source_url.strip()):
        raise HTTPException(status_code=422, detail="The source link must start with http:// or https://")
    # The file first: if it cannot be measured, nothing about the course changes.
    if file is not None and file.filename:
        contents = await file.read(20_000_001)
        if len(contents) > 20_000_000:
            raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
        temp_path = _save_upload(contents, _safe_suffix(file.filename, ".gpx"))
        try:
            points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path, None)
            features = features_from_measurement(measurement)
        except (GpxParseError, ValueError, UnicodeError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            _discard_temp(temp_path)
        db.attach_gpx(
            race_id,
            filename=file.filename,
            distance_km=features.distance_km,
            elevation_gain_m=features.elevation_gain_m,
            **_stored_gpx_fields(points, measurement, contents, f"{event_name.strip()} {course_name.strip()}"),
        )
    updated = db.update_calculator_course(
        race_id,
        event_name=event_name.strip(),
        course_name=course_name.strip(),
        location=(location or "").strip() or None,
        country=(country or "").strip().upper() or None,
        source_url=(source_url or "").strip() or None,
    )
    return _race_summary(updated)


@app.delete("/admin/calculator-courses/{race_id}", status_code=204)
def admin_delete_calculator_course(race_id: str, organizer: Organizer = Depends(require_admin)) -> Response:
    race = db.find_race(race_id)
    if race is None or not race.calculator_only:
        raise HTTPException(status_code=404, detail="no calculator course with that id")
    db.delete_event(race.event_id)  # the event holds only this course
    return Response(status_code=204)


@app.post("/races/{race_id}/gpx", response_model=RaceSummary)
async def attach_race_gpx(
    race_id: str, file: UploadFile, request: Request, organizer: Organizer = Depends(require_organizer)
) -> RaceSummary:
    """Attach (or replace) a GPX file for a race distance. Recomputes distance_km/elevation_gain_m
    from the real parsed course data — the GPX becomes the authoritative source once attached."""
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_owner(race, organizer)
    _limit_uploads(request, organizer)  # measuring a course costs a core for seconds

    suffix = _safe_suffix(file.filename, ".gpx")
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path, _tile_allowance(request, organizer))
        features = features_from_measurement(measurement)
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        _discard_temp(temp_path)

    # Stored and served: positions and elevations only (course/sanitize.py). What the upload said about
    # its origin stays with the race's private record; raw_sha256 still identifies the original file.
    stored = sanitized_gpx(points, name=f"{race.event_name or ''} {race.course_name}".strip())
    updated = db.attach_gpx(
        race_id,
        filename=file.filename or "course.gpx",
        content=stored,
        distance_km=features.distance_km,
        elevation_gain_m=features.elevation_gain_m,
        measurement={
            **measurement.to_dict(),
            "raw_sha256": sha256(contents).hexdigest(),
            "stored_sha256": sha256(stored.encode("utf-8")).hexdigest(),
            "source_metadata": source_metadata(contents.decode("utf-8", errors="replace")),
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "snapshot": asdict(measurement),
        },
    )
    return _race_summary(updated)


def _visible_race(race_id: str, organizer: Organizer | None, *, results: bool = False) -> db.Race:
    race = db.find_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail=f"race {race_id!r} not found")
    _require_race_visible(race, organizer, results=results)
    return race


# The replay snapshot is bulky; the upload's own metadata can name a person. Neither is public.
_PRIVATE_MEASUREMENT_KEYS = {"snapshot", "source_metadata"}


@app.get("/races/{race_id}/measurement")
def get_race_measurement(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> dict:
    _visible_race(race_id, organizer)
    result = db.get_measurement(race_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No versioned measurement stored; reattach GPX to measure it")
    return {key: value for key, value in result.items() if key not in _PRIVATE_MEASUREMENT_KEYS}


def _served_gpx(content: str, name: str) -> str:
    """A course file as it may leave OTRI: positions and elevations only (course/sanitize.py).

    Files are sanitized when they are stored, and a file OTRI wrote says so in its header. Anything
    else (a row from before sanitizing existed, or put there by other means) is reduced on the way
    out, so what this endpoint hands over never carries a device, an author, timestamps, heart
    rate, waypoints or notes, whatever is in the table."""
    if content.lstrip().startswith(SANITIZED_HEADER.strip()):
        return content
    return sanitized_gpx(parse_track_points(content), name=name)


@app.get("/races/{race_id}/gpx")
def get_race_gpx(race_id: str, download: bool = False, organizer: Organizer | None = Depends(_optional_organizer)) -> Response:
    """The race's course file, sanitized. `?download=1` answers with a file name, for a download link."""
    race = _visible_race(race_id, organizer)
    result = db.get_gpx_content(race_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"no GPX file attached to race {race_id!r}")
    _filename, content = result
    name = f"{race.event_name or ''} {race.course_name}".strip()
    headers = {}
    if download:
        stem = re.sub(r"[^A-Za-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")).strip("-").lower() or "course"
        headers["Content-Disposition"] = f'attachment; filename="{stem[:80]}-otri.gpx"'
    return Response(content=_served_gpx(content, name), media_type="application/gpx+xml", headers=headers)


# --- Results ------------------------------------------------------------------


def _score_results(race: db.Race, results: list) -> list[RunnerScoreOut]:
    gpx_points = None
    stored_gpx = db.get_gpx_content(race.race_id)
    if stored_gpx is not None:
        _filename, content = stored_gpx
        gpx_points = parse_track_points(content)
    stored_measurement = db.get_measurement(race.race_id)
    if gpx_points is not None and stored_measurement is None:
        raise ValueError('reattach the GPX to save a versioned measurement before using measured scoring')
    measurement = Measurement(**stored_measurement["snapshot"]) if stored_measurement else None
    return _scored_rows(race.to_race_record(), results, race.scoring_version, gpx_points, measurement)


def _scored_rows(race: RaceRecord, results: list, scoring_version: str, gpx_points, measurement) -> list[RunnerScoreOut]:
    """Score result rows against a course. Touches no storage: the stored leaderboard and the
    stateless `POST /score` are the same computation."""
    scores = score_race(race, results, model_version=scoring_version, gpx_points=gpx_points, measurement=measurement)
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
                    scoring_version=scoring_version,
                    status=result.rank,
                    runner_id=result.runner_id,
                    gender=result.gender,
                    nationality=result.nationality,
                )
            )
    return out


@app.get("/races/{race_id}/results", response_model=list[RunnerScoreOut])
def get_race_results(race_id: str, organizer: Organizer | None = Depends(_optional_organizer)) -> list[RunnerScoreOut]:
    race = _visible_race(race_id, organizer, results=True)

    if not db.has_results(race_id):
        raise HTTPException(status_code=404, detail=f"no results on file for race {race_id!r}")

    try:
        return _score_results(race, db.get_results(race_id))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/races/{race_id}/results", response_model=SubmissionResult)
async def submit_race_results(
    race_id: str, file: UploadFile, request: Request, organizer: Organizer = Depends(require_organizer)
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
    _limit_uploads(request, organizer)

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
        understood = {"columns": dict(report.columns), "ignored_columns": list(report.ignored_columns)}
        if not report.is_valid:
            return SubmissionResult(
                is_valid=False,
                errors=[ValidationIssueOut(**issue.to_dict()) for issue in report.errors],
                warnings=[ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
                scores=[],
                **understood,
            )

        results = await run_in_threadpool(result_records, temp_path)
        try:
            # Tens of thousands of inserts: not on the event loop. The account's limit is checked
            # inside, in the transaction that writes and with the account locked: checked out here,
            # two uploads to two races at once each saw room for themselves and both went in.
            await run_in_threadpool(db.replace_results, race_id, results, max_rows_for_organizer=_result_row_limit(organizer))
        except db.QuotaExceeded as error:
            raise _no_room_for_results(organizer) from error

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
            **understood,
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
    # A finisher on a course the model does not score (a vertical race) has a time and no score.
    return {row.runner_id: row for row in scored if row.runner_id and row.status == "finisher" and row.otri_score is not None}


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
    wanted = {runner.runner_id for runner in runners}
    grouped = db.published_results_grouped_by_race(sorted(wanted))
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
def list_runners(request: Request, q: str | None = None, limit: int = 100) -> list[RunnerSummary]:
    """Search runners by name (``q``), or list every runner with a published result, indexed."""
    # Public and, for all its caching, expensive: every race one of these runners ran is measured
    # and scored to place them. The proxy's microcache does not cover a caller who sends an
    # Authorization header, which is one line of a script, so the limit lives here too.
    enforce_rate_limit(request, max_requests=30)
    enforce_rate_limit(request, max_requests=600, scope="runners-hour", window_seconds=3600)
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
    ``docs/methodology/0.1.0/HOW-OTRI-SCORES.md``.
    """
    enforce_rate_limit(request, max_requests=60)  # public and CPU-heavy: one call per slider move is fine, a flood is not
    enforce_rate_limit(request, max_requests=600, scope="analyze-hour", window_seconds=3600)  # a big file is most of a second of a core
    suffix = _safe_suffix(file.filename, ".gpx")
    contents = await file.read(20_000_001)
    if len(contents) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        temp_path = Path(temp_file.name)

    try:
        points, measurement = await run_in_threadpool(_measure_gpx_path, temp_path, _tile_allowance(request))
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


# ----------------------------------------------------------------------------- score a race
# The whole product in one call, for a race that wants its scores and nothing else: a course and a
# results file in, the validated and scored result list out. No account, no race page, no row in
# any table; both files are deleted before the response is sent. It is the organizer workflow's
# validation and scoring, unchanged, minus the storing. See docs/product/open-scoring-tool.md.

_SCORE_CSV_COLUMNS = ("rank", "bib_number", "family_name", "first_name", "gender", "nationality", "finish_time", "otri_score", "confidence", "status", "performance_rate", "scoring_version", "quality_flags")


def _csv_cell(value) -> str:
    """A spreadsheet runs a cell that starts with = + - or @ as a formula; names come from a file
    anyone may have written, so such a cell is made text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _scores_csv(scores: list[RunnerScoreOut]) -> str:
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(_SCORE_CSV_COLUMNS)
    for row in scores:
        seconds = row.finish_time_seconds
        finish = f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}" if seconds is not None else ""
        values = {**row.model_dump(), "finish_time": finish, "quality_flags": " | ".join(row.quality_flags), "performance_rate": f"{row.performance_rate:.4f}" if row.performance_rate else ""}
        writer.writerow([_csv_cell(values.get(column)) for column in _SCORE_CSV_COLUMNS])
    return buffer.getvalue()


def _save_upload(contents: bytes, suffix: str) -> Path:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(contents)
        return Path(temp_file.name)


@app.post("/score", response_model=ScoreRaceResult)
async def score_a_race(
    request: Request,
    results: UploadFile,
    gpx: UploadFile,
    race_name: str | None = Form(default=None, max_length=200),
    scoring_version: str | None = Form(default=None, max_length=80),
    format: str = "json",
):
    """Validate a results file and score it against a course, without an account and without
    keeping anything. The course is a GPX file (`gpx`), measured like any OTRI course: a score
    rests on where the climbing is, which a distance and a climb figure cannot say, so there is no
    scoring from official figures here. `?format=csv` returns the scored list as a CSV download.
    An invalid results file answers 200 with `is_valid: false` and the issues."""
    enforce_rate_limit(request, max_requests=10)  # public, and a full course measurement plus thousands of rows
    enforce_rate_limit(request, max_requests=90, scope="score-hour", window_seconds=3600)
    if format not in ("json", "csv"):
        raise HTTPException(status_code=422, detail="format must be json or csv")
    version = scoring_version or DEFAULT_SCORING_VERSION
    _validate_scoring_version(version)

    results_bytes = await results.read(20_000_001)
    gpx_bytes = await gpx.read(20_000_001)
    if len(results_bytes) + len(gpx_bytes) > 20_000_000:
        raise HTTPException(status_code=413, detail="Upload exceeds 20 MB")

    def run() -> ScoreRaceResult:
        paths = [_save_upload(results_bytes, _safe_suffix(results.filename, ".csv"))]
        try:
            paths.append(_save_upload(gpx_bytes, _safe_suffix(gpx.filename, ".gpx")))
            try:
                points, measurement = _measure_gpx_path(paths[1], _tile_allowance(request))
            except (GpxParseError, ValueError, UnicodeError) as error:
                raise HTTPException(status_code=422, detail=f"course file: {error}") from error
            features = features_from_measurement(measurement)
            distance, climb = features.distance_km, features.elevation_gain_m
            course = ScoredCourse(name=(race_name or "").strip() or None, distance_km=round(distance, 3), elevation_gain_m=round(climb, 1))

            try:
                report = validate_result_file(paths[0])
            except (ValueError, OSError) as error:  # unreadable, wrong type, too many rows
                raise HTTPException(status_code=422, detail=f"results file: {error}") from error
            issues = {
                "errors": [ValidationIssueOut(**issue.to_dict()) for issue in report.errors],
                "warnings": [ValidationIssueOut(**issue.to_dict()) for issue in report.warnings],
                "columns": dict(report.columns),
                "ignored_columns": list(report.ignored_columns),
            }
            shared = {"scoring_version": version, "course": course, "measurement": measurement.to_dict()}
            if not report.is_valid:
                return ScoreRaceResult(is_valid=False, scores=[], **issues, **shared)

            race = RaceRecord(race_id="unsaved", race_name=course.name or "Unsaved race", event_date=date.today(), course_name=course.name or "Course", distance_km=distance, elevation_gain_m=climb)
            try:
                scores = _scored_rows(race, result_records(paths[0]), version, points, measurement)
            except ValueError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error

            finishers = [row for row in scores if row.status == "finisher"]
            if finishers:
                # Confidence and its reasons are the course's, identical on every row.
                course.confidence = finishers[0].confidence
                course.quality_flags = list(finishers[0].quality_flags)
                course.not_scored_reason = next((flag for flag in course.quality_flags if flag.startswith("course_not_scored")), None)
            values = sorted(row.otri_score for row in finishers if row.otri_score is not None)
            summary = ScoreSummary(
                finishers=len(finishers),
                non_finishers=len(scores) - len(finishers),
                best_score=values[-1] if values else None,
                median_score=values[len(values) // 2] if values else None,
            )
            return ScoreRaceResult(is_valid=True, scores=scores, summary=summary, **issues, **shared)
        finally:
            for path in paths:
                _discard_temp(path)

    result = await run_in_threadpool(run)
    if format == "csv" and result.is_valid:
        return Response(content=_scores_csv(result.scores), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="otri-scores.csv"'})
    return result


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
    def stored(path: Path) -> int:
        """A share is two files, the track and what the upload said about itself; both are the
        uploader's and both count. Only the track did, so the folder outgrew its budget."""
        meta = _shared_course_meta_path(path.name[: -len(".gpx.gz")])
        return path.stat().st_size + (meta.stat().st_size if meta.exists() else 0)

    try:
        entries = sorted(_SHARED_COURSE_DIR.glob("*.gpx.gz"), key=lambda path: path.stat().st_mtime)
        total = sum(stored(path) for path in entries)
        for path in entries:
            if total <= budget_bytes:
                break
            size = stored(path)
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
        text = contents.decode("utf-8")
        points = await run_in_threadpool(parse_track_points, text)
    except (GpxParseError, ValueError, UnicodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if len(points) < 2:
        raise HTTPException(status_code=422, detail="The GPX has fewer than two track points")

    share_id = sha256(contents).hexdigest()[:16]
    path = _shared_course_path(share_id)
    created = not path.exists()
    if created:
        # The id is the upload's own hash (the same file shares one link); what is kept is the track alone.
        packed = gzip.compress(sanitized_gpx(points).encode("utf-8"), compresslevel=6)
        clean_name = (name or Path(file.filename or "").stem or "").strip()[:120] or None
        with _SHARED_COURSE_LOCK:
            _SHARED_COURSE_DIR.mkdir(parents=True, exist_ok=True)
            # Make room first so the new file is never the one evicted, then trim again in case
            # another process wrote in between.
            about = json.dumps({"name": clean_name, "filename": (file.filename or "")[:200], "created_at": datetime.now(timezone.utc).isoformat(), "source_metadata": source_metadata(text)})
            _evict_shared_courses(max(0, _SHARED_COURSE_MAX_TOTAL_BYTES - len(packed) - len(about.encode("utf-8"))))
            path.write_bytes(packed)
            _shared_course_meta_path(share_id).write_text(about, encoding="utf-8")
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
    """The GPX behind a share link: the track alone, as it was sanitized when shared."""
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
            "dem_fetch": dem_fetch.status(),
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
        # Name and organization are whatever the organizer typed: never a formula in the admin's spreadsheet.
        cells = [row["email"], row.get("display_name") or "", row.get("organization") or "", row.get("country") or "", row["marketing_opt_in_at"].isoformat() if row.get("marketing_opt_in_at") else ""]
        writer.writerow([_csv_cell(cell) for cell in cells])
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
        "watchdog": _server.watchdog_status(),
        "backups": _server.backup_status(Path(os.environ.get("OTRI_BACKUP_DIR") or REPO_ROOT / "backups")),
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


def _own_page_url(value: str | None) -> str | None:
    """The page a report was sent from, kept only when it is a page of this site. Anyone may file a
    report, and the admin dashboard and the admins' email show this address as a link: left as
    sent, it was a link of the sender's choosing in front of the people with the most access."""
    from urllib.parse import urlencode, urlsplit

    value = (value or "").strip()[:500]
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    own = {*_ALLOWED_ORIGIN_LIST, _email.SITE_URL.rstrip("/"), _email.APP_BASE_URL.rstrip("/")}
    if parts.scheme in ("http", "https") and not parts.username and f"{parts.scheme}://{parts.netloc}".lower() in {origin.lower() for origin in own}:
        return value
    return None


def _report_out(report: db.Report) -> ReportOut:
    return ReportOut(**vars(report))


@app.post("/reports", response_model=ReportOut, status_code=201)
def create_report(payload: ReportCreate, request: Request) -> ReportOut:
    enforce_rate_limit(request, max_requests=5)
    enforce_rate_limit(request, max_requests=20, scope="reports-day", window_seconds=86400)
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
        page_url=_own_page_url(payload.page_url),
    )
    # Every report is kept; the emails about them are what is limited, so a script filing reports
    # from many addresses cannot fill the admins' inboxes. The dashboard shows them all.
    notify = not over_limit(None, max_requests=12, scope="report-mail", subject="admins", window_seconds=3600)
    for admin_email in sorted(_ADMIN_EMAILS) if notify else ():
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
