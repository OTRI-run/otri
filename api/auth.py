"""Organizer authentication: SQLite-backed accounts, bcrypt hashing, JWT sessions.

Prototype-scoped persistence (see api/README.md "Known gaps") — same spirit
as the CSV-based race storage. A real production deployment needs a proper
database and a battle-tested auth provider, not a hand-rolled scheme like
this one.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

import bcrypt
import jwt

REPO_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = REPO_ROOT / "data" / "organizers.db"

_JWT_ALGORITHM = "HS256"
_TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours

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


def _get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS organizers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    return connection


def register_organizer(email: str, password: str) -> Organizer:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise AuthError("a valid email is required")
    if len(password) < 8:
        raise AuthError("password must be at least 8 characters")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    with _get_connection() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO organizers (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, password_hash, time.time()),
            )
        except sqlite3.IntegrityError as error:
            raise AuthError(f"an account for {email!r} already exists") from error
        return Organizer(id=cursor.lastrowid, email=email)


def authenticate_organizer(email: str, password: str) -> Organizer:
    email = email.strip().lower()
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT id, email, password_hash FROM organizers WHERE email = ?", (email,)
        ).fetchone()

    if row is None:
        raise AuthError("invalid email or password")

    organizer_id, stored_email, password_hash = row
    if not bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8")):
        raise AuthError("invalid email or password")

    return Organizer(id=organizer_id, email=stored_email)


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
