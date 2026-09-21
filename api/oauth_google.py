"""Sign in with Google: the OpenID Connect authorization-code flow, run entirely by the API.

The page never loads Google's script. A button on the organizer app is a plain link to
``GET /auth/google/start``; the API sends the browser to Google; Google sends it back to
``GET /auth/google/callback`` on the API, which checks the identity, decides which OTRI account it
belongs to, sets the same session cookie a password sign-in sets, and redirects to the app.

What is checked, in order, before an identity is believed:

* the ``state`` in the callback names a row this API wrote in the last ten minutes, once;
* the browser that finishes the sign-in is the browser that started it, by a cookie whose digest
  is in that row (otherwise a link crafted by somebody else could sign a visitor into the
  somebody's account);
* the authorization code is exchanged over a direct call, with the PKCE verifier from the row;
* the ID token is signed by one of Google's published keys, issued by Google, issued for this
  client, in date, and carries the ``nonce`` from the row;
* Google says the address is verified. An unverified address is never used for anything.

Then the identity is resolved to an account. The key is Google's ``sub``, never the email:
addresses change, subjects do not. See ``resolve`` for the four cases and why the unconfirmed one
is treated the way a password reset treats it.

Only the subject and the address are ever stored. No access token, no refresh token: nothing
here calls Google's APIs after the sign-in.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from base64 import urlsafe_b64encode
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt

from . import auth as _auth
from .auth import AuthError, Organizer
from .db import get_connection

PROVIDER = "google"
CLIENT_ID = os.environ.get("OTRI_GOOGLE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("OTRI_GOOGLE_CLIENT_SECRET", "").strip()

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})

STATE_TTL = timedelta(minutes=10)
INTENTS = frozenset({"login", "register"})


class OAuthError(AuthError):
    """A sign-in that cannot be finished. ``reason`` is a short code for the redirect back to the
    app, never text from Google and never anything about which accounts exist."""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(detail or reason)
        self.reason = reason


def enabled() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


# --- Starting ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class Begun:
    url: str
    browser_token: str  # goes in a short-lived cookie; its digest is in the state row


def begin(*, redirect_uri: str, intent: str, accept_terms: bool, marketing_opt_in: bool, remember: bool) -> Begun:
    """Writes the state row and returns where to send the browser."""
    if intent not in INTENTS:
        raise OAuthError("bad-request", "unknown intent")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    browser_token = secrets.token_urlsafe(32)
    challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")

    with get_connection() as connection:
        connection.execute("DELETE FROM oauth_states WHERE expires_at < now()")
        connection.execute(
            "INSERT INTO oauth_states (state, provider, verifier, nonce, browser, intent, accept_terms, marketing_opt_in, remember, expires_at)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                _auth._token_digest(state),
                PROVIDER,
                verifier,
                _auth._token_digest(nonce),
                _auth._token_digest(browser_token),
                intent,
                bool(accept_terms),
                bool(marketing_opt_in),
                bool(remember),
                datetime.now(timezone.utc) + STATE_TTL,
            ),
        )

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
        "access_type": "online",
    }
    return Begun(url=f"{AUTHORIZE_URL}?{urlencode(params)}", browser_token=browser_token)


# --- Finishing --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Identity:
    subject: str
    email: str
    name: str | None


@dataclass(frozen=True)
class Started:
    intent: str
    accept_terms: bool
    marketing_opt_in: bool
    remember: bool


def _consume_state(state: str, browser_token: str | None) -> dict:
    """The row for this state, deleted as it is read: a state finishes one sign-in or none."""
    with get_connection() as connection:
        row = connection.execute(
            "DELETE FROM oauth_states WHERE state = %s AND provider = %s RETURNING verifier, nonce, browser, intent, accept_terms, marketing_opt_in, remember, expires_at",
            (_auth._token_digest(state), PROVIDER),
        ).fetchone()
    if row is None:
        raise OAuthError("expired", "this sign-in was not started here, or was already finished")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise OAuthError("expired", "this sign-in took too long; start again")
    # Constant-time on purpose: the digest is the secret that ties the two requests together.
    if not browser_token or not secrets.compare_digest(_auth._token_digest(browser_token), row["browser"]):
        raise OAuthError("mismatch", "this sign-in was started in a different browser")
    return dict(row)


def _exchange(code: str, verifier: str, redirect_uri: str) -> dict:
    """The authorization code for Google's tokens. Separate so tests can stand in for Google."""
    response = httpx.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        },
        timeout=10.0,
    )
    if response.status_code != 200:
        raise OAuthError("exchange", "Google did not accept the sign-in code")
    return response.json()


_jwk_client: jwt.PyJWKClient | None = None


def _signing_key(id_token: str):
    """The public key that signed this token, from Google's published set (cached by PyJWT).
    Separate so tests can supply their own key."""
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600)
    return _jwk_client.get_signing_key_from_jwt(id_token).key


def _claims(id_token: str, expected_nonce_digest: str) -> dict:
    try:
        key = _signing_key(id_token)
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=30,
        )
    except jwt.PyJWTError as error:
        raise OAuthError("token", "the identity token could not be verified") from error
    if claims.get("iss") not in ISSUERS:
        raise OAuthError("token", "the identity token was not issued by Google")
    nonce = claims.get("nonce")
    if not nonce or not secrets.compare_digest(_auth._token_digest(str(nonce)), expected_nonce_digest):
        raise OAuthError("token", "the identity token does not belong to this sign-in")
    return claims


def complete(*, state: str, code: str, browser_token: str | None, redirect_uri: str) -> tuple[Identity, Started]:
    """Everything between Google's redirect and a believed identity."""
    row = _consume_state(state, browser_token)
    tokens = _exchange(code, row["verifier"], redirect_uri)
    id_token = tokens.get("id_token")
    if not id_token:
        raise OAuthError("exchange", "Google returned no identity token")
    claims = _claims(id_token, row["nonce"])

    email = str(claims.get("email") or "").strip().lower()
    if not email or "@" not in email or claims.get("email_verified") is not True:
        # An address Google itself has not verified proves nothing about who is signing in.
        raise OAuthError("unverified", "Google has not verified the email address on this account")

    identity = Identity(subject=str(claims["sub"]), email=email, name=(claims.get("name") or None))
    started = Started(
        intent=row["intent"],
        accept_terms=bool(row["accept_terms"]),
        marketing_opt_in=bool(row["marketing_opt_in"]),
        remember=bool(row["remember"]),
    )
    return identity, started


# --- Resolving an identity to an account ----------------------------------------------------


@dataclass(frozen=True)
class Outcome:
    organizer: Organizer | None
    event: str  # "signed_in" | "created" | "linked" | "reclaimed" | "no_account"


def resolve(identity: Identity, started: Started) -> Outcome:
    """Which OTRI account this Google identity is, in four cases.

    1. The subject is known: that account, whatever its address is now.
    2. No account has this address: create one, but only from the register page with the terms
       accepted. From the login page the answer is "no account", and the app sends the visitor to
       register; a half-made account waiting on a checkbox is worse than one more click.
    3. An account has this address and its address is confirmed: both sides have shown they own
       the mailbox, so the identity is linked to it.
    4. An account has this address and its address was never confirmed. Sign-up is instant, so a
       stranger may have registered this address with a password and be sitting on it. Linking a
       verified Google identity to that account as it stands would leave the stranger with a
       working password on the real owner's account. So it is treated exactly as a password reset
       treats an unconfirmed account (auth.reset_password): the address becomes confirmed, the
       password becomes unusable, the second factor and recovery codes go, every session is signed
       out, and open reset links die. The owner of the mailbox gets the account; nobody else keeps
       a way in.
    """
    with get_connection() as connection:
        known = connection.execute(
            "SELECT o.id, o.email, o.email_verified, o.session_version FROM organizer_identities i"
            " JOIN organizers o ON o.id = i.organizer_id WHERE i.provider = %s AND i.subject = %s",
            (PROVIDER, identity.subject),
        ).fetchone()
        if known is not None:
            connection.execute(
                "UPDATE organizer_identities SET last_used_at = now(), email = %s WHERE provider = %s AND subject = %s",
                (identity.email, PROVIDER, identity.subject),
            )
            return Outcome(_organizer(known), "signed_in")

        account = connection.execute(
            "SELECT id, email, email_verified, session_version FROM organizers WHERE email = %s FOR UPDATE", (identity.email,)
        ).fetchone()

        if account is None:
            if started.intent != "register" or not started.accept_terms:
                return Outcome(None, "no_account")
            account = connection.execute(
                "INSERT INTO organizers (email, password_hash, has_password, email_verified, terms_accepted_at, marketing_opt_in, marketing_opt_in_at)"
                " VALUES (%s, %s, FALSE, TRUE, now(), %s, CASE WHEN %s THEN now() ELSE NULL END)"
                " RETURNING id, email, email_verified, session_version",
                (identity.email, _auth.unusable_password_hash(), started.marketing_opt_in, started.marketing_opt_in),
            ).fetchone()
            _link(connection, account["id"], identity)
            return Outcome(_organizer(account), "created")

        if account["email_verified"]:
            _link(connection, account["id"], identity)
            return Outcome(_organizer(account), "linked")

        reclaimed = connection.execute(
            "UPDATE organizers SET email_verified = TRUE, password_hash = %s, has_password = FALSE,"
            " two_factor_method = NULL, totp_secret = NULL, totp_secret_pending = NULL, email_code_hash = NULL, email_code_expires_at = NULL,"
            " session_version = session_version + 1 WHERE id = %s RETURNING id, email, email_verified, session_version",
            (_auth.unusable_password_hash(), account["id"]),
        ).fetchone()
        connection.execute("DELETE FROM recovery_codes WHERE organizer_id = %s", (account["id"],))
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (account["id"],))
        connection.execute("UPDATE password_reset_tokens SET used_at = now() WHERE organizer_id = %s AND used_at IS NULL", (account["id"],))
        _link(connection, account["id"], identity)
        return Outcome(_organizer(reclaimed), "reclaimed")


def _link(connection, organizer_id: int, identity: Identity) -> None:
    connection.execute(
        "INSERT INTO organizer_identities (provider, subject, organizer_id, email, last_used_at) VALUES (%s, %s, %s, %s, now())",
        (PROVIDER, identity.subject, organizer_id, identity.email),
    )


def _organizer(row) -> Organizer:
    return Organizer(id=row["id"], email=row["email"], email_verified=bool(row["email_verified"]), session_version=int(row["session_version"]))
