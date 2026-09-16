"""Unit tests for organizer authentication (register/login/JWT).

Run with: pytest tests/unit
"""

import pytest

import api.auth as auth_module


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Point the auth DB at a throwaway file so tests never touch real data."""
    monkeypatch.setattr(auth_module, "DB_PATH", tmp_path / "organizers-test.db")
    yield


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
