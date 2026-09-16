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

from .db import get_connection

_JWT_ALGORITHM = "HS256"
_TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours
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


def register_organizer(email: str, password: str) -> Organizer:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise AuthError("a valid email is required")
    if len(password) < 8:
        raise AuthError("password must be at least 8 characters")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    with get_connection() as connection:
        existing = connection.execute("SELECT 1 FROM organizers WHERE email = %s", (email,)).fetchone()
        if existing is not None:
            raise AuthError(f"an account for {email!r} already exists")
        row = connection.execute(
            "INSERT INTO organizers (email, password_hash) VALUES (%s, %s) RETURNING id",
            (email, password_hash),
        ).fetchone()
        return Organizer(id=row["id"], email=email)


def authenticate_organizer(email: str, password: str) -> Organizer:
    email = email.strip().lower()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, email, password_hash FROM organizers WHERE email = %s", (email,)
        ).fetchone()

    if row is None:
        raise AuthError("invalid email or password")

    if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        raise AuthError("invalid email or password")

    return Organizer(id=row["id"], email=row["email"])


def create_access_token(organizer: Organizer) -> str:
    payload = {
        "sub": str(organizer.id),
        "email": organizer.email,
        "exp": int(time.time()) + _TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> Organizer:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError as error:
        raise AuthError("invalid or expired token") from error
    return Organizer(id=int(payload["sub"]), email=payload["email"])


# --- Email verification -------------------------------------------------


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
    if len(new_password) < 8:
        raise AuthError("password must be at least 8 characters")

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
            "UPDATE organizers SET password_hash = %s WHERE id = %s RETURNING id, email",
            (password_hash, row["organizer_id"]),
        ).fetchone()
        connection.execute("UPDATE password_reset_tokens SET used_at = now() WHERE token = %s", (token,))
        return Organizer(id=organizer_row["id"], email=organizer_row["email"])
