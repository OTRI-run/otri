"""Password policy and TOTP (api/security.py)."""

import base64

from api.security import _hotp, hash_code, new_recovery_codes, new_totp_secret, otpauth_uri, password_problems, password_strength, totp_now, verify_totp


def test_hotp_matches_rfc_4226_vectors():
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert [_hotp(secret, i) for i in range(4)] == ["755224", "287082", "359152", "969429"]


def test_totp_accepts_neighbouring_steps_only():
    secret = new_totp_secret()
    at = 1_700_000_000
    code = totp_now(secret, at)
    assert verify_totp(secret, code, at) and verify_totp(secret, code, at + 30) and verify_totp(secret, code, at - 30)
    assert not verify_totp(secret, code, at + 90)
    assert not verify_totp(secret, "12345", at) and not verify_totp(secret, "abcdef", at)
    assert otpauth_uri(secret, "a@b.c").startswith("otpauth://totp/OTRI:a%40b.c?secret=")


def test_password_policy_is_length_led_and_blocks_common_and_email_based_passwords():
    assert password_problems("correct horse battery staple", "x@example.com") == []
    assert any("at least 10" in p for p in password_problems("Tr0ub4dor", "x@example.com"))
    assert any("attacker" in p for p in password_problems("Password123!", "x@example.com"))
    assert any("email" in p for p in password_problems("halloween8-rocks", "halloween8@googlemail.com"))
    assert any("repeated" in p for p in password_problems("aaaaaaaaaaaa"))
    assert password_strength("pass")["score"] == 0 and password_strength("correct horse battery staple")["score"] == 4


def test_recovery_codes_are_random_and_hashed_consistently():
    codes = new_recovery_codes()
    assert len(set(codes)) == 10 and all(len(c) == 9 and c[4] == "-" for c in codes)
    assert hash_code("K7M2-9QWD") == hash_code("k7m2 9qwd") == hash_code(" k7m29qwd ")
