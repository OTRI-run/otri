"""Organizer authentication: PostgreSQL-backed accounts, bcrypt hashing, JWT sessions.

Email verification and password reset use single-use, expiring tokens
(``email_verification_tokens`` / ``password_reset_tokens``) delivered via
``api/email.py`` (Resend). See api/README.md "Known gaps" for what's still
not battle-tested here (hand-rolled JWT, no refresh tokens).
"""

from __future__ import annotations

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


def register_organizer(email: str, password: str, *, accept_terms: bool = True, marketing_opt_in: bool = False) -> Organizer:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise AuthError("a valid email is required")
    if not accept_terms:
        raise AuthError("you need to accept the terms of service and privacy policy to create an account")
    require_acceptable_password(password, email)

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

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
        raise AuthError("invalid email or password")

    if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
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
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> Organizer:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError as error:
        raise AuthError("invalid or expired token") from error
    return Organizer(id=int(payload["sub"]), email=payload["email"], session_version=int(payload.get("sv", 1)))


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
            (token, organizer.id, expires_at),
        )
    return token


def verify_email(token: str) -> Organizer:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT organizer_id, expires_at FROM email_verification_tokens WHERE token = %s", (token,)
        ).fetchone()
        if row is None:
            raise AuthError("invalid verification token")
        if row["expires_at"] < datetime.now(timezone.utc):
            raise AuthError("verification token has expired")

        organizer_row = connection.execute(
            "UPDATE organizers SET email_verified = TRUE WHERE id = %s RETURNING id, email",
            (row["organizer_id"],),
        ).fetchone()
        connection.execute("DELETE FROM email_verification_tokens WHERE token = %s", (token,))
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
            (token, row["id"], expires_at),
        )
        return Organizer(id=row["id"], email=row["email"]), token


def reset_password(token: str, new_password: str) -> Organizer:
    require_acceptable_password(new_password)

    with get_connection() as connection:
        row = connection.execute(
            "SELECT organizer_id, expires_at, used_at FROM password_reset_tokens WHERE token = %s", (token,)
        ).fetchone()
        if row is None:
            raise AuthError("invalid reset token")
        if row["used_at"] is not None:
            raise AuthError("reset token has already been used")
        if row["expires_at"] < datetime.now(timezone.utc):
            raise AuthError("reset token has expired")

        password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        organizer_row = connection.execute(
            # The reset link went to the account's address: opening it confirms the address too.
            "UPDATE organizers SET password_hash = %s, email_verified = TRUE WHERE id = %s RETURNING id, email",
            (password_hash, row["organizer_id"]),
        ).fetchone()
        connection.execute("UPDATE password_reset_tokens SET used_at = now() WHERE token = %s", (token,))
        return Organizer(id=organizer_row["id"], email=organizer_row["email"], email_verified=True)


# --- Password change ------------------------------------------------------


def change_password(organizer_id: int, current_password: str, new_password: str) -> None:
    with get_connection() as connection:
        row = connection.execute("SELECT email, password_hash FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
        if row is None or not bcrypt.checkpw(current_password.encode("utf-8"), row["password_hash"].encode("utf-8")):
            raise AuthError("the current password is not right")
        require_acceptable_password(new_password, row["email"])
        if bcrypt.checkpw(new_password.encode("utf-8"), row["password_hash"].encode("utf-8")):
            raise AuthError("choose a password you have not used here before")
        password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        connection.execute(
            "UPDATE organizers SET password_hash = %s, password_changed_at = now(), session_version = session_version + 1 WHERE id = %s",
            (password_hash, organizer_id),
        )
        connection.execute("DELETE FROM login_challenges WHERE organizer_id = %s", (organizer_id,))


def _check_password(connection, organizer_id: int, password: str) -> None:
    row = connection.execute("SELECT password_hash FROM organizers WHERE id = %s", (organizer_id,)).fetchone()
    if row is None or not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        raise AuthError("the password is not right")


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


def begin_totp_setup(organizer_id: int, email: str) -> tuple[str, str]:
    """A fresh secret, kept pending until a code from the app proves the phone has it."""
    secret = security.new_totp_secret()
    with get_connection() as connection:
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
            "UPDATE organizers SET totp_secret = totp_secret_pending, totp_secret_pending = NULL, two_factor_method = 'totp', "
            "email_code_hash = NULL, email_code_expires_at = NULL WHERE id = %s",
            (organizer_id,),
        )
        return _issue_recovery_codes(connection, organizer_id)


def begin_email_two_factor(organizer_id: int) -> str:
    """Returns the code the caller must email; only its hash is stored."""
    code = security.new_email_code()
    with get_connection() as connection:
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
            "email_code_hash = NULL, email_code_expires_at = NULL WHERE id = %s",
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
            (token, organizer.id, method, security.hash_code(code) if code else None, remember, datetime.now(timezone.utc) + _CHALLENGE_TTL),
        )
    return token, method, code


def complete_login_challenge(token: str, code: str) -> tuple[Organizer, bool]:
    """Verify an app code, an emailed code or a recovery code; returns (organizer, remember)."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT c.organizer_id, c.method, c.code_hash, c.remember, c.attempts, c.expires_at, o.email, o.totp_secret "
            "FROM login_challenges c JOIN organizers o ON o.id = c.organizer_id WHERE c.token = %s",
            (token,),
        ).fetchone()
        if row is None:
            raise AuthError("sign in again to get a new code")
        if row["expires_at"] < datetime.now(timezone.utc) or row["attempts"] >= _CHALLENGE_MAX_ATTEMPTS:
            connection.execute("DELETE FROM login_challenges WHERE token = %s", (token,))
            raise AuthError("too many attempts or the code expired; sign in again")
        connection.execute("UPDATE login_challenges SET attempts = attempts + 1 WHERE token = %s", (token,))

        ok = False
        if row["method"] == "totp" and row["totp_secret"]:
            ok = security.verify_totp(row["totp_secret"], code)
        elif row["method"] == "email" and row["code_hash"]:
            ok = secrets.compare_digest(row["code_hash"], security.hash_code(code))
        if not ok:
            recovery = connection.execute(
                "SELECT id FROM recovery_codes WHERE organizer_id = %s AND used_at IS NULL AND code_hash = %s",
                (row["organizer_id"], security.hash_code(code)),
            ).fetchone()
            if recovery:
                connection.execute("UPDATE recovery_codes SET used_at = now() WHERE id = %s", (recovery["id"],))
                ok = True
        if not ok:
            raise AuthError("that code did not match")
        connection.execute("DELETE FROM login_challenges WHERE token = %s", (token,))
        return Organizer(id=int(row["organizer_id"]), email=row["email"]), bool(row["remember"])
