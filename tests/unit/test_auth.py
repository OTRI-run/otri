"""Unit tests for organizer authentication (register/login/JWT/verify/reset).

Run with: pytest tests/unit
"""

import pytest

import api.auth as auth_module


def test_register_then_authenticate():
    organizer = auth_module.register_organizer("Runner@Example.com", "correct horse battery")
    assert organizer.email == "runner@example.com"  # normalized to lowercase

    authenticated = auth_module.authenticate_organizer("runner@example.com", "correct horse battery")
    assert authenticated.id == organizer.id


def test_register_duplicate_email_raises():
    auth_module.register_organizer("dup@example.com", "correct horse battery")
    with pytest.raises(auth_module.AuthError):
        auth_module.register_organizer("dup@example.com", "another password")


def test_register_rejects_short_password():
    with pytest.raises(auth_module.AuthError):
        auth_module.register_organizer("short@example.com", "short")


def test_register_rejects_invalid_email():
    with pytest.raises(auth_module.AuthError):
        auth_module.register_organizer("not-an-email", "correct horse battery")


def test_authenticate_wrong_password_raises():
    auth_module.register_organizer("wrong@example.com", "correct horse battery")
    with pytest.raises(auth_module.AuthError):
        auth_module.authenticate_organizer("wrong@example.com", "incorrect password")


def test_authenticate_unknown_email_raises():
    with pytest.raises(auth_module.AuthError):
        auth_module.authenticate_organizer("nobody@example.com", "whatever password")


def test_access_token_round_trips():
    organizer = auth_module.register_organizer("token@example.com", "correct horse battery")
    token = auth_module.create_access_token(organizer)

    decoded = auth_module.decode_access_token(token)
    assert decoded.id == organizer.id
    assert decoded.email == organizer.email


def test_decode_rejects_garbage_token():
    with pytest.raises(auth_module.AuthError):
        auth_module.decode_access_token("not-a-real-token")


def test_email_verification_round_trip():
    organizer = auth_module.register_organizer("verify@example.com", "correct horse battery")
    token = auth_module.create_email_verification_token(organizer)

    verified = auth_module.verify_email(token)
    assert verified.email == organizer.email


def test_verify_email_rejects_unknown_token():
    with pytest.raises(auth_module.AuthError):
        auth_module.verify_email("not-a-real-token")


def test_password_reset_round_trip():
    organizer = auth_module.register_organizer("reset@example.com", "correct horse battery")
    result = auth_module.create_password_reset_token(organizer.email)
    assert result is not None
    _, token = result

    auth_module.reset_password(token, "new correct horse battery")
    authenticated = auth_module.authenticate_organizer("reset@example.com", "new correct horse battery")
    assert authenticated.id == organizer.id


def test_password_reset_token_is_single_use():
    organizer = auth_module.register_organizer("resetonce@example.com", "correct horse battery")
    _, token = auth_module.create_password_reset_token(organizer.email)

    auth_module.reset_password(token, "new correct horse battery")
    with pytest.raises(auth_module.AuthError):
        auth_module.reset_password(token, "another new password")


def test_password_reset_for_unknown_email_returns_none():
    assert auth_module.create_password_reset_token("nobody@example.com") is None
