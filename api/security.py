"""Password policy, time-based one-time passwords and recovery codes. Standard library only.

Password rules follow NIST SP 800-63B: length is what matters (10 to 128 characters), no
composition rules, but nothing from a list of very common passwords and nothing built from the
account's own email. TOTP is RFC 6238 (SHA-1, 6 digits, 30 s steps), compatible with every
authenticator app. Recovery codes are random, shown once and stored hashed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import struct
import time
import unicodedata

PASSWORD_MIN = 10
PASSWORD_MAX = 128

# The most common passwords seen in breach corpora, lower-cased; a password that normalises to one
# of these (or one of these plus digits) is refused. Kept short on purpose: length is the defence.
_COMMON = {
    "password", "passwort", "password1", "password123", "passw0rd", "p@ssw0rd", "123456", "1234567", "12345678",
    "123456789", "1234567890", "12345", "111111", "123123", "000000", "qwerty", "qwertyuiop", "qwerty123",
    "abc123", "letmein", "welcome", "welcome1", "admin", "administrator", "login", "iloveyou", "monkey",
    "dragon", "football", "baseball", "soccer", "sunshine", "princess", "master", "shadow", "michael",
    "jennifer", "superman", "batman", "trustno1", "hello", "freedom", "whatever", "charlie", "donald",
    "computer", "internet", "starwars", "cheese", "summer", "winter", "secret", "pokemon", "flower",
    "hunter", "mustang", "harley", "ranger", "jordan", "thomas", "robert", "daniel", "andrew", "joshua",
    "matthew", "ashley", "amanda", "nicole", "jessica", "michelle", "chelsea", "george", "killer", "ginger",
    "buster", "tigger", "cookie", "pepper", "purple", "orange", "yellow", "silver", "golden", "maggie",
    "bailey", "sophie", "hannah", "taylor", "nothing", "access", "biteme", "changeme", "default", "guest",
    "letmein1", "test", "test1234", "testing", "temp", "temp123", "root", "toor", "passpass", "qazwsx",
    "zaq12wsx", "1q2w3e4r", "1qaz2wsx", "asdfgh", "asdfghjkl", "zxcvbnm", "azerty", "trailrun", "trailrunning",
    "running", "runner", "marathon", "ultra", "otri", "otrirun", "organizer", "organiser", "thailand", "bangkok",
}
_TRAILING_DIGITS = re.compile(r"[\d!@#$%^&*.]+$")


def _normalise(password: str) -> str:
    return unicodedata.normalize("NFKC", password).strip().lower()


def password_problems(password: str, email: str | None = None) -> list[str]:
    """Why a password is not acceptable; an empty list means it is."""
    problems = []
    raw = password or ""
    if len(raw) < PASSWORD_MIN:
        problems.append(f"use at least {PASSWORD_MIN} characters (a few words work well)")
    if len(raw) > PASSWORD_MAX:
        problems.append(f"use at most {PASSWORD_MAX} characters")
    norm = _normalise(raw)
    stem = _TRAILING_DIGITS.sub("", norm)
    if norm in _COMMON or stem in _COMMON:
        problems.append("that password is on every attacker's list; choose something less common")
    if len(set(norm)) <= 2 and len(norm) >= PASSWORD_MIN:
        problems.append("that is one or two characters repeated")
    if email:
        local = _normalise(email.split("@", 1)[0])
        for part in {local, *[p for p in re.split(r"[._+-]", local) if len(p) >= 4]}:
            if part and part in norm:
                problems.append("do not build the password from your email address")
                break
    return problems


def password_strength(password: str) -> dict:
    """A 0-4 score with a label, for the meter in the sign-up form. Length-led, like the policy."""
    raw = password or ""
    length = len(raw)
    classes = sum(bool(re.search(p, raw)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]"))
    score = 0
    if length >= PASSWORD_MIN:
        score = 1
    if length >= 12 and classes >= 2:
        score = 2
    if length >= 14 and classes >= 2 or length >= 16:
        score = 3
    if length >= 18 and classes >= 3 or length >= 24:
        score = 4
    if not password_problems(raw) == [] and length >= PASSWORD_MIN:
        score = min(score, 1)
    labels = ["too short", "weak", "fair", "good", "strong"]
    return {"score": score, "label": labels[score], "problems": password_problems(raw)}


# ---------------------------------------------------------------------------- TOTP (RFC 6238)


def new_totp_secret() -> str:
    """A 160-bit secret, base32 without padding (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int, digits: int = 6) -> str:
    padded = secret_b32.upper() + "=" * (-len(secret_b32) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


def totp_now(secret_b32: str, at: float | None = None, step: int = 30) -> str:
    return _hotp(secret_b32, int((time.time() if at is None else at) // step))


def totp_counter(secret_b32: str, code: str, at: float | None = None, step: int = 30, window: int = 1) -> int | None:
    """Which 30-second step `code` is the code for, or None if it is not one of them. The caller
    keeps the number: an authenticator code is valid for a minute and a half, and RFC 6238 asks
    that it open an account once in that time and not again."""
    cleaned = re.sub(r"\s+", "", code or "")
    if not re.fullmatch(r"\d{6}", cleaned):
        return None
    now = time.time() if at is None else at
    counter = int(now // step)
    for delta in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret_b32, counter + delta), cleaned):
            return counter + delta
    return None


def verify_totp(secret_b32: str, code: str, at: float | None = None, step: int = 30, window: int = 1) -> bool:
    """True if `code` matches the current step or one step either side (clock drift)."""
    return totp_counter(secret_b32, code, at, step, window) is not None


def otpauth_uri(secret_b32: str, account: str, issuer: str = "OTRI") -> str:
    from urllib.parse import quote

    return f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret_b32}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"


# ---------------------------------------------------------------------------- one-time codes


def new_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_recovery_codes(count: int = 10) -> list[str]:
    """Ten codes like 'k7m2-9qwd'; the user keeps them, the server keeps only hashes."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = []
    for _ in range(count):
        chunk = lambda: "".join(secrets.choice(alphabet) for _ in range(4))  # noqa: E731
        codes.append(f"{chunk()}-{chunk()}")
    return codes


def _normalise_code(code: str) -> str:
    return re.sub(r"[\s-]+", "", (code or "").strip().lower())


# The key lives in the environment, not in the database. A recovery code is 40 bits: with a plain
# SHA-256, whoever copied the database could try all of them on a graphics card in an afternoon.
# Keyed, the digests in a leaked table say nothing without the server's secret as well.
# Without OTRI_API_JWT_SECRET this used to be sha256(b"otri-code-key:"), a value anybody can
# compute from this file, which left the digests in a leaked table open to a straight guess at the
# 40 bits behind them. Unset, the key is now random per process, like the JWT secret beside it.
_CODE_KEY = hashlib.sha256(b"otri-code-key:" + (os.environ.get("OTRI_API_JWT_SECRET") or secrets.token_hex(32)).encode("utf-8")).digest()


def hash_code(code: str) -> str:
    """Recovery and email codes are short, so they are hashed with a fast keyed hash, not bcrypt;
    brute force is prevented by attempt limits and expiry, not by hashing cost."""
    return hmac.new(_CODE_KEY, ("otri-code:" + _normalise_code(code)).encode("utf-8"), hashlib.sha256).hexdigest()


def legacy_hash_code(code: str) -> str:
    """How recovery codes were hashed before the key: codes issued then must keep working."""
    return hashlib.sha256(("otri-code:" + _normalise_code(code)).encode("utf-8")).hexdigest()
