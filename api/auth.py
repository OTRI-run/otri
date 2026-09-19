"""Organizer authentication: PostgreSQL-backed accounts, bcrypt hashing, JWT sessions.

Email verification and password reset use single-use, expiring tokens
(``email_verification_tokens`` / ``password_reset_tokens``) delivered via
``api/email.py`` (Resend). See api/README.md "Known gaps" for what's still
not battle-tested here (hand-rolled JWT, no refresh tokens).
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from . import security
from .db import get_connection

_JWT_ALGORITHM = "HS256"
_TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours
_REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days, when the organizer ticks "remember me"
_CHALLENGE_TTL = timedelta(minutes=10)
_CHALLENGE_MAX_ATTEMPTS = 5
_EMAIL_VERIFICATION_TTL = timedelta(days=2)
_PASSWORD_RESET_TTL = timedelta(hours=1)

_env_secret = os.environ.get("OTRI_API_JWT_SECRET")
if _env_secret:
    JWT_SECRET = _env_secret
else:
    JWT_SECRET = secrets.token_hex(32)
    print(
        "WARNING: OTRI_API_JWT_SECRET is not set - generated a random secret for "
        "this process. All organizer sessions will be invalidated on restart. "
        "Set OTRI_API_JWT_SECRET explicitly for a stable deployment."
    )


class AuthError(Exception):
    """Raised for any authentication failure (bad credentials, invalid token, etc.)."""


class WrongPassword(AuthError):
    """The password asked for to confirm an action was wrong: the caller counts these per account."""


class WrongSecondFactor(AuthError):
    """A wrong code at the second step of sign-in: the caller counts these per account, across challenges."""

    def __init__(self, message: str, email: str):
        super().__init__(message)
        self.email = email


# --- Passwords --------------------------------------------------------------
#
# bcrypt reads at most 72 bytes. Version 4 cut a longer password off silently; version 5 refuses it
# with an exception, which made registering or signing in with a long passphrase (the site allows
# 128 characters, and 25 Thai characters are already 75 bytes) a server error. A password over 72
# bytes is therefore brought down to 32 bytes first and that goes to bcrypt; shorter ones go in as
# they are, so every hash made before this still verifies.
#
# The shortening is PBKDF2 with a salt of OTRI's own, not a bare SHA-256: a bare digest of the
# password is a value other sites' leaks may hold too (they let an attacker test a stolen
# bcrypt(sha256(password)) against a list of known sha256(password) values without paying for the
# passwords), and a code scanner rightly cannot tell a fast hash on its way into bcrypt from a fast
# hash that is the whole protection. bcrypt remains what makes guessing expensive. (The first
# version did use SHA-256, for some hours: no password was set on production in that time.)
_LONG_PASSWORD_SALT = b"otri.run long passphrase v1"


def _bcrypt_input(password: str) -> bytes:
    raw = password.encode("utf-8")
    return raw if len(raw) <= 72 else base64.b64encode(hashlib.pbkdf2_hmac("sha256", raw, _LONG_PASSWORD_SALT, 10_000))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_bcrypt_input(password), bcrypt.gensalt()).decode("utf-8")


def password_matches(password: str, password_hash: str) -> bool:
    stored = password_hash.encode("utf-8")
    try:
        if bcrypt.checkpw(_bcrypt_input(password), stored):
            return True
        raw = password.encode("utf-8")
        # An account made while bcrypt 4 truncated long passwords: its hash is of the first 72 bytes.
        return len(raw) > 72 and bcrypt.checkpw(raw[:72], stored)
    except ValueError:
        return False


# A real hash of a password nobody has, checked when the email is unknown so that an unknown address
# and a wrong password take the same time to answer: the answer's timing must not say which
# addresses have accounts.
_NO_ACCOUNT_HASH = bcrypt.hashpw(secrets.token_bytes(24), bcrypt.gensalt()).decode("utf-8")


def _token_lookup(token: str) -> tuple[str, str]:
    """The two values a presented link token may be stored under: its digest, and, for a link sent
    before tokens were hashed, the token itself. A stored digest must never work as a token, or
    hashing would protect nothing: a digest is 64 characters and a token is 43, so something of a
    digest's length is only ever looked up hashed."""
    digest = _token_digest(token)
    return (digest, digest if len(token) == 64 else token)


def _token_digest(token: str) -> str:
    """How a one-time token (email confirmation, password reset, half-finished sign-in) is kept: as
    a digest. The token itself exists only in the email or the browser, so a copy of the database
    (a backup, a leak) holds nothing that opens an account.

    The tokens are 256 random bits, for which one SHA-256 would do. It is PBKDF2 all the same: a
    code scanner cannot tell a random token from a password somebody chose, asks for a slow hash
    wherever it sees either, and a rule that is always satisfied is worth more than one with
    standing exceptions. A thousand rounds cost a third of a millisecond, on requests that send an
    email or run bcrypt anyway."""
    return hashlib.pbkdf2_hmac("sha256", token.encode("utf-8"), b"otri.run one-time token v1", 1_000).hex()


@dataclass(frozen=True)
class Organizer:
    id: int
    email: str
    is_admin: bool = False
    is_demo: bool = False
    session_version: int = 1
    # Read from the account on every request. An unconfirmed address may sign in and prepare a
    # race, but cannot make anything public and is never an admin (api/app.py `require_verified`).
    email_verified: bool = False
    # Which token this request came with (its `jti`): what signing out revokes. None for an
    # organizer that did not come from a token (just registered, just signed in).
    token_id: str | None = None
    token_expires_at: datetime | None = None


def register_organizer(email: str, password: str, *, accept_terms: bool = True, marketing_opt_in: bool = False) -> Organizer:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise AuthError("a valid email is required")
    if not accept_terms:
        raise AuthError("you need to accept the terms of service and privacy policy to create an account")
    require_acceptable_password(password, email)

    password_hash = hash_password(password)

    with get_connection() as connection:
        existing = connection.execute("SELECT 1 FROM organizers WHERE email = %s", (email,)).fetchone()
        if existing is not None:
            raise AuthError(f"an account for {email!r} already exists")
        row = connection.execute(
            "INSERT INTO organizers (email, password_hash, terms_accepted_at, marketing_opt_in, marketing_opt_in_at)"
            " VALUES (%s, %s, NOW(), %s, CASE WHEN %s THEN NOW() ELSE NULL END) RETURNING id",
            (email, password_hash, bool(marketing_opt_in), bool(marketing_opt_in)),
        ).fetchone()
        return Organizer(id=row["id"], email=email)


def authenticate_organizer(email: str, password: str) -> Organizer:
    """The account for these credentials, whether or not its email is confirmed yet: what an
    unconfirmed account may do is decided per route, not at the door."""
    email = email.strip().lower()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, email, password_hash, email_verified FROM organizers WHERE email = %s", (email,)
        ).fetchone()

    if row is None:
        password_matches(password, _NO_ACCOUNT_HASH)  # same work as a wrong password: see _NO_ACCOUNT_HASH
        raise AuthError("invalid email or password")

    if not password_matches(password, row["password_hash"]):
        raise AuthError("invalid email or password")

    return Organizer(id=row["id"], email=row["email"], email_verified=bool(row["email_verified"]))


def require_acceptable_password(password: str, email: str | None = None) -> None:
    problems = security.password_problems(password, email)
    if problems:
        raise AuthError("; ".join(problems))


def token_ttl_seconds(remember: bool = False) -> int:
    return _REMEMBER_TTL_SECONDS if remember else _TOKEN_TTL_SECONDS


def current_session_version(organizer_id: int) -> int:
    with get_connection() as connection:
        row = connection.execute("SELECT session_version FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
    return int(row["session_version"]) if row else 1


def create_access_token(organizer: Organizer, remember: bool = False) -> str:
    """The token carries the account's session version; a bump (password change, 2FA off,
    sign out everywhere) makes every earlier token fail verification."""
    payload = {
        "sub": str(organizer.id),
        "email": organizer.email,
        "sv": current_session_version(organizer.id),
        "exp": int(time.time()) + token_ttl_seconds(remember),
        # Unique per token: two sign-ins in the same second were the same string, so signing out
        # of one (which revokes that string) would have signed out the other.
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> Organizer:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError as error:
        raise AuthError("invalid or expired token") from error
    # A token is known by its id, which says nothing about the token: signing out stores the id,
    # never the credential nor a digest of it. Tokens from before ids existed are told apart by
    # what they do carry (two of the same account and second share one; they are signed out together).
    token_id = payload.get("jti") or f"{payload['sub']}.{payload.get('sv', 1)}.{payload['exp']}"
    return Organizer(
        id=int(payload["sub"]),
        email=payload["email"],
        session_version=int(payload.get("sv", 1)),
        token_id=str(token_id),
        token_expires_at=datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc),
    )


# --- Email verification -------------------------------------------------


def request_email_verification(email: str) -> tuple[Organizer, str] | None:
    """Returns (organizer, token) if the account exists and isn't verified yet, else None.

    Callers should return the same response either way (don't leak account existence).
    """
    email = email.strip().lower()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, email FROM organizers WHERE email = %s AND email_verified = FALSE", (email,)
        ).fetchone()
    if row is None:
        return None
    organizer = Organizer(id=row["id"], email=row["email"])
    return organizer, create_email_verification_token(organizer)


def create_email_verification_token(organizer: Organizer) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + _EMAIL_VERIFICATION_TTL
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO email_verification_tokens (token, organizer_id, expires_at) VALUES (%s, %s, %s)",
            (_token_digest(token), organizer.id, expires_at),
        )
    return token


def verify_email(token: str) -> Organizer:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT token, organizer_id, expires_at FROM email_verification_tokens WHERE token IN (%s, %s)", _token_lookup(token)
        ).fetchone()
        if row is None:
            raise AuthError("invalid verification token")
        if row["expires_at"] < datetime.now(timezone.utc):
            raise AuthError("verification token has expired")

        organizer_row = connection.execute(
            "UPDATE organizers SET email_verified = TRUE WHERE id = %s RETURNING id, email",
            (row["organizer_id"],),
        ).fetchone()
        connection.execute("DELETE FROM email_verification_tokens WHERE token = %s", (row["token"],))
        return Organizer(id=organizer_row["id"], email=organizer_row["email"])


# --- Password reset -------------------------------------------------------


def create_password_reset_token(email: str) -> tuple[Organizer, str] | None:
    """Returns (organizer, token) if the email exists, else None (caller should not leak which)."""
    email = email.strip().lower()
    with get_connection() as connection:
        row = connection.execute("SELECT id, email FROM organizers WHERE email = %s", (email,)).fetchone()
        if row is None:
            return None
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + _PASSWORD_RESET_TTL
        connection.execute(
            "INSERT INTO password_reset_tokens (token, organizer_id, expires_at) VALUES (%s, %s, %s)",
            (_token_digest(token), row["id"], expires_at),
        )
        return Organizer(id=row["id"], email=row["email"]), token


def reset_password(token: str, new_password: str) -> Organizer:
    require_acceptable_password(new_password)

    with get_connection() as connection:
        row = connection.execute(
            "SELECT token, organizer_id, expires_at, used_at FROM password_reset_tokens WHERE token IN (%s, %s) FOR UPDATE", _token_lookup(token)
        ).fetchone()
        if row is None:
            raise AuthError("invalid reset token")
        if row["used_at"] is not None:
            raise AuthError("reset token has already been used")
        if row["expires_at"] < datetime.now(timezone.utc):
            raise AuthError("reset token has expired")

        password_hash = hash_password(new_password)
        organizer_row = connection.execute(
            # The reset link went to the account's address: opening it confirms the address too.
            # session_version + 1: whoever is signed in anywhere, with the old password or a stolen
            # session, is signed out. A reset is what an owner does when they fear exactly that.
            "UPDATE organizers SET password_hash = %s, email_verified = TRUE, session_version = session_version + 1, "
            "password_changed_at = now() WHERE id = %s RETURNING id, email",
            (password_hash, row["organizer_id"]),
        ).fetchone()
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (row["organizer_id"],))
        # This link is used; any other still-open reset link for the account dies with it.
        connection.execute("UPDATE password_reset_tokens SET used_at = now() WHERE organizer_id = %s AND used_at IS NULL", (row["organizer_id"],))
        return Organizer(id=organizer_row["id"], email=organizer_row["email"], email_verified=True)


# --- Password change ------------------------------------------------------


def change_password(organizer_id: int, current_password: str, new_password: str) -> None:
    with get_connection() as connection:
        row = connection.execute("SELECT email, password_hash FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
        if row is None or not password_matches(current_password, row["password_hash"]):
            raise WrongPassword("the current password is not right")
        require_acceptable_password(new_password, row["email"])
        if password_matches(new_password, row["password_hash"]):
            raise AuthError("choose a password you have not used here before")
        password_hash = hash_password(new_password)
        connection.execute(
            "UPDATE organizers SET password_hash = %s, password_changed_at = now(), session_version = session_version + 1 WHERE id = %s",
            (password_hash, organizer_id),
        )
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (organizer_id,))


def _check_password(connection, organizer_id: int, password: str) -> None:
    row = connection.execute("SELECT password_hash FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
    if row is None or not password_matches(password, row["password_hash"]):
        raise WrongPassword("the password is not right")


# --- Two-factor authentication ---------------------------------------------
#
# Two methods: an authenticator app (TOTP) or a six-digit code sent to the account email.
# Either way the organizer gets ten one-time recovery codes for the day the phone is gone.


def two_factor_status(organizer_id: int) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT two_factor_method, (SELECT COUNT(*) FROM recovery_codes rc WHERE rc.organizer_id = o.id AND rc.used_at IS NULL) AS unused "
            "FROM organizers o WHERE id = %s",
            (organizer_id,),
        ).fetchone()
    if row is None:
        return {"enabled": False, "method": None, "recovery_codes_left": 0}
    return {"enabled": row["two_factor_method"] is not None, "method": row["two_factor_method"], "recovery_codes_left": int(row["unused"])}


def _issue_recovery_codes(connection, organizer_id: int) -> list[str]:
    codes = security.new_recovery_codes()
    connection.execute("DELETE FROM recovery_codes WHERE organizer_id = %s", (organizer_id,))
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO recovery_codes (organizer_id, code_hash) VALUES (%s, %s)",
            [(organizer_id, security.hash_code(code)) for code in codes],
        )
    return codes


def begin_totp_setup(organizer_id: int, email: str, password: str) -> tuple[str, str]:
    """A fresh secret, kept pending until a code from the app proves the phone has it.

    Needs the password, like every change to how an account is protected: a session alone (a
    stolen cookie, an unlocked laptop) must not be enough to swap the owner's authenticator for the
    intruder's and lock the owner out."""
    secret = security.new_totp_secret()
    with get_connection() as connection:
        _check_password(connection, organizer_id, password)
        connection.execute("UPDATE organizers SET totp_secret_pending = %s WHERE id = %s", (secret, organizer_id))
    return secret, security.otpauth_uri(secret, email)


def enable_totp(organizer_id: int, code: str) -> list[str]:
    with get_connection() as connection:
        row = connection.execute("SELECT totp_secret_pending FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
        if row is None or not row["totp_secret_pending"]:
            raise AuthError("start the authenticator setup first")
        if not security.verify_totp(row["totp_secret_pending"], code):
            raise AuthError("that code did not match; check the time on your phone and try the next one")
        connection.execute(
            # session_version + 1: an owner who turns this on because somebody else may be in the
            # account expects that somebody to be out. Their session used to stay good for its
            # full thirty days, never meeting the second factor it was turned on against.
            "UPDATE organizers SET totp_secret = totp_secret_pending, totp_secret_pending = NULL, two_factor_method = 'totp', "
            "email_code_hash = NULL, email_code_expires_at = NULL, session_version = session_version + 1 WHERE id = %s",
            (organizer_id,),
        )
        return _issue_recovery_codes(connection, organizer_id)


def begin_email_two_factor(organizer_id: int, password: str) -> str:
    """Returns the code the caller must email; only its hash is stored."""
    code = security.new_email_code()
    with get_connection() as connection:
        _check_password(connection, organizer_id, password)  # as for the authenticator: see begin_totp_setup
        connection.execute(
            "UPDATE organizers SET email_code_hash = %s, email_code_expires_at = %s WHERE id = %s",
            (security.hash_code(code), datetime.now(timezone.utc) + _CHALLENGE_TTL, organizer_id),
        )
    return code


def enable_email_two_factor(organizer_id: int, code: str) -> list[str]:
    with get_connection() as connection:
        row = connection.execute("SELECT email_code_hash, email_code_expires_at FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
        if row is None or not row["email_code_hash"]:
            raise AuthError("request a code first")
        if row["email_code_expires_at"] < datetime.now(timezone.utc):
            raise AuthError("that code has expired; request a new one")
        if not secrets.compare_digest(row["email_code_hash"], security.hash_code(code)):
            raise AuthError("that code did not match")
        connection.execute(
            "UPDATE organizers SET two_factor_method = 'email', totp_secret = NULL, totp_secret_pending = NULL, "
            "email_code_hash = NULL, email_code_expires_at = NULL, session_version = session_version + 1 WHERE id = %s",  # as for the authenticator
            (organizer_id,),
        )
        return _issue_recovery_codes(connection, organizer_id)


def disable_two_factor(organizer_id: int, password: str) -> None:
    with get_connection() as connection:
        _check_password(connection, organizer_id, password)
        connection.execute(
            "UPDATE organizers SET two_factor_method = NULL, totp_secret = NULL, totp_secret_pending = NULL, "
            "email_code_hash = NULL, email_code_expires_at = NULL, session_version = session_version + 1 WHERE id = %s",
            (organizer_id,),
        )
        connection.execute("DELETE FROM recovery_codes WHERE organizer_id = %s", (organizer_id,))
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (organizer_id,))


def revoke_all_sessions(organizer_id: int, password: str) -> None:
    """'Sign out everywhere': every token issued so far stops working, including the caller's."""
    with get_connection() as connection:
        _check_password(connection, organizer_id, password)
        connection.execute("UPDATE organizers SET session_version = session_version + 1 WHERE id = %s", (organizer_id,))
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (organizer_id,))


def delete_own_account(organizer_id: int, password: str) -> None:
    from . import db as _db

    with get_connection() as connection:
        _check_password(connection, organizer_id, password)
    _db.delete_organizer(organizer_id)


def regenerate_recovery_codes(organizer_id: int, password: str) -> list[str]:
    with get_connection() as connection:
        _check_password(connection, organizer_id, password)
        if connection.execute("SELECT two_factor_method FROM organizers WHERE id = %s", (organizer_id,)).fetchone()["two_factor_method"] is None:
            raise AuthError("two-factor authentication is not enabled")
        return _issue_recovery_codes(connection, organizer_id)


# --- Login challenge (second step of sign-in) -------------------------------


def start_login_challenge(organizer: Organizer, remember: bool) -> tuple[str, str, str | None]:
    """(challenge token, method, email code or None). The code is only returned for the email
    method, so the caller can send it; the database keeps its hash."""
    with get_connection() as connection:
        row = connection.execute("SELECT two_factor_method FROM organizers WHERE id = %s", (organizer.id,)).fetchone()
        method = row["two_factor_method"] if row else None
        if method is None:
            raise AuthError("two-factor authentication is not enabled")
        code = security.new_email_code() if method == "email" else None
        token = secrets.token_urlsafe(32)
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s OR expires_at < now()", (organizer.id,))
        connection.execute(
            "INSERT INTO login_challenges (token, organizer_id, method, code_hash, remember, expires_at) VALUES (%s, %s, %s, %s, %s, %s)",
            # Only a digest is kept: a copy of the table must not hold sign-ins that are half done.
            (_token_digest(token), organizer.id, method, security.hash_code(code) if code else None, remember, datetime.now(timezone.utc) + _CHALLENGE_TTL),
        )
    return token, method, code


def challenge_email(token: str) -> str | None:
    """Whose sign-in this challenge belongs to, so the caller can refuse a locked account before
    any code is looked at."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT o.email FROM login_challenges c JOIN organizers o ON o.id = c.organizer_id WHERE c.token = %s", (_token_digest(token),)
        ).fetchone()
    return row["email"] if row else None


def complete_login_challenge(token: str, code: str) -> tuple[Organizer, bool]:
    """Verify an app code, an emailed code or a recovery code; returns (organizer, remember).

    The attempt is counted in a transaction of its own, committed before the code is looked at. It
    used to be counted in the same transaction as the check, and a wrong code raised, which rolled
    the count back: the five-attempt limit never counted anything, and a six-digit code could be
    guessed at for the challenge's whole ten minutes."""
    token = _token_digest(token)
    with get_connection() as connection:
        counted = connection.execute(
            "UPDATE login_challenges SET attempts = attempts + 1 WHERE token = %s RETURNING attempts, expires_at", (token,)
        ).fetchone()
    if counted is None:
        raise AuthError("sign in again to get a new code")
    if counted["expires_at"] < datetime.now(timezone.utc) or counted["attempts"] > _CHALLENGE_MAX_ATTEMPTS:
        with get_connection() as connection:
            connection.execute("DELETE FROM login_challenges WHERE token = %s", (token,))
        raise AuthError("too many attempts or the code expired; sign in again")

    with get_connection() as connection:
        row = connection.execute(
            "SELECT c.organizer_id, c.method, c.code_hash, c.remember, c.attempts, c.expires_at, o.email, o.totp_secret "
            "FROM login_challenges c JOIN organizers o ON o.id = c.organizer_id WHERE c.token = %s",
            (token,),
        ).fetchone()
        if row is None:
            raise AuthError("sign in again to get a new code")

        ok = False
        if row["method"] == "totp" and row["totp_secret"]:
            ok = security.verify_totp(row["totp_secret"], code)
        elif row["method"] == "email" and row["code_hash"]:
            ok = secrets.compare_digest(row["code_hash"], security.hash_code(code))
        if not ok:
            recovery = connection.execute(
                "SELECT id FROM recovery_codes WHERE organizer_id = %s AND used_at IS NULL AND code_hash IN (%s, %s)",
                (row["organizer_id"], security.hash_code(code), security.legacy_hash_code(code)),
            ).fetchone()
            if recovery:
                # Two requests with the same code at the same moment: the row is spent by one of them.
                spent = connection.execute("UPDATE recovery_codes SET used_at = now() WHERE id = %s AND used_at IS NULL RETURNING id", (recovery["id"],)).fetchone()
                ok = spent is not None
        if not ok:
            raise WrongSecondFactor("that code did not match", row["email"])
        connection.execute("DELETE FROM login_challenges WHERE token = %s", (token,))
        return Organizer(id=int(row["organizer_id"]), email=row["email"]), bool(row["remember"])
