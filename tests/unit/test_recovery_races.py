"""A password reset must win against anything running beside it.

Recovery is what an owner does when somebody else is already in the account. A password change the
intruder had in flight when the reset landed used to finish anyway and overwrite it: the owner
recovered the account and lost it again, to a password only the intruder knew.

The two are called directly rather than over HTTP, because the test client serialises requests and
the overlap is the whole point.
"""

from __future__ import annotations

import threading
import time

import pytest

from api import auth as auth_module
from api.db import get_connection

PASSWORD = "correct horse battery"
OWNER_CHOSE = "the owner is back again 7"
INTRUDER_CHOSE = "the intruder picked this 4"


def _make_account(email: str) -> int:
    organizer = auth_module.register_organizer(email, PASSWORD, accept_terms=True)
    with get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE id = %s", (organizer.id,))
    return organizer.id


def _account(organizer_id: int) -> dict:
    with get_connection() as connection:
        return dict(connection.execute("SELECT password_hash, session_version FROM organizers WHERE id = %s", (organizer_id,)).fetchone())


@pytest.mark.usefixtures("clean_state")
def test_a_password_change_in_flight_cannot_undo_a_reset(monkeypatch):
    """The owner's reset is in its slow hash; the intruder's password change arrives in that
    window. The change must wait for the account row and then find the password it was given is no
    longer the account's, rather than writing over the recovery."""
    organizer_id = _make_account("reset-race@example.com")
    token = auth_module.create_password_reset_token("reset-race@example.com")[1]
    before = _account(organizer_id)

    holding = threading.Event()
    real_hash = auth_module.hash_password

    def slow_hash(password):
        if password == OWNER_CHOSE:
            holding.set()
            time.sleep(1.0)  # the account row is already locked here
        return real_hash(password)

    monkeypatch.setattr(auth_module, "hash_password", slow_hash)

    reset_done: list[object] = []

    def reset():
        reset_done.append(auth_module.reset_password(token, OWNER_CHOSE))

    owner = threading.Thread(target=reset)
    owner.start()
    assert holding.wait(timeout=10), "the reset never reached its hash"

    started = time.monotonic()
    with pytest.raises(auth_module.AuthError):
        auth_module.change_password(organizer_id, PASSWORD, INTRUDER_CHOSE)
    waited = time.monotonic() - started

    owner.join(timeout=20)
    assert not owner.is_alive() and reset_done, "the reset did not finish"
    assert waited > 0.4, "the change did not wait for the account row: it was not locked"

    after = _account(organizer_id)
    assert auth_module.password_matches(OWNER_CHOSE, after["password_hash"]), "the owner is locked out of their recovered account"
    assert not auth_module.password_matches(INTRUDER_CHOSE, after["password_hash"]), "the change overwrote the reset"
    assert not auth_module.password_matches(PASSWORD, after["password_hash"])
    assert after["session_version"] > before["session_version"], "the reset must sign every old session out"


@pytest.mark.usefixtures("clean_state")
def test_a_reset_waits_for_a_password_change_already_holding_the_account(monkeypatch):
    """The other order. The change is in its password check with the row locked; the reset must
    wait rather than read a row that is about to be written."""
    organizer_id = _make_account("reset-race-2@example.com")
    auth_module.create_password_reset_token("reset-race-2@example.com")

    holding = threading.Event()
    real_matches = auth_module.password_matches

    def slow_matches(password, password_hash):
        if password == PASSWORD:
            holding.set()
            time.sleep(1.0)
        return real_matches(password, password_hash)

    monkeypatch.setattr(auth_module, "password_matches", slow_matches)

    def change():
        auth_module.change_password(organizer_id, PASSWORD, INTRUDER_CHOSE)

    worker = threading.Thread(target=change)
    worker.start()
    assert holding.wait(timeout=10)

    started = time.monotonic()
    with get_connection() as connection:
        connection.execute("SELECT 1 FROM organizers WHERE id = %s FOR UPDATE", (organizer_id,))
    waited = time.monotonic() - started
    worker.join(timeout=20)

    assert waited > 0.4, "the account row was not held for the whole of the password change"


@pytest.mark.usefixtures("clean_state")
def test_a_burst_of_events_cannot_get_past_the_account_limit():
    """The limit used to be counted in Python between two transactions, so requests arriving
    together all read the same count and all inserted. It is counted inside the insert now."""
    from datetime import date

    from api import db

    organizer_id = _make_account("quota-race@example.com")
    limit = 3
    made: list[str] = []
    refused: list[Exception] = []
    barrier = threading.Barrier(12)

    def create(n: int):
        barrier.wait()
        try:
            made.append(db.create_event(f"Race Weekend {n}", date(2026, 6, 1), organizer_id, max_for_organizer=limit).event_id)
        except db.QuotaExceeded as error:
            refused.append(error)

    threads = [threading.Thread(target=create, args=(i,)) for i in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    with get_connection() as connection:
        held = connection.execute("SELECT count(*) AS n FROM events WHERE organizer_id = %s", (organizer_id,)).fetchone()["n"]
    assert held == limit, f"the account holds {held} events, past a limit of {limit}"
    assert len(made) == limit and len(refused) == 12 - limit


@pytest.mark.usefixtures("clean_state")
def test_a_token_issued_by_a_password_change_cannot_outlive_a_later_reset():
    """The change commits, the owner's reset commits, and only then does the changing request mint
    its token. Reading the account's session version at that moment would take the reset's own
    version and hand the intruder a session the recovery could not end. The version the change
    itself set is what the token carries."""
    email = "version-race@example.com"
    organizer_id = _make_account(email)
    version = auth_module.change_password(organizer_id, PASSWORD, INTRUDER_CHOSE)
    # The owner recovers, still before the changing request has handed back its token.
    reset_token = auth_module.create_password_reset_token(email)[1]
    auth_module.reset_password(reset_token, OWNER_CHOSE)

    organizer = auth_module.Organizer(id=organizer_id, email=email)
    minted = auth_module.decode_access_token(auth_module.create_access_token(organizer, session_version=version))
    assert minted.session_version == version

    current = auth_module.current_session_version(organizer_id)
    assert current > version, "the reset must move the account past the change"
    # What the old code did: read the version at minting time, which is the reset's own.
    without = auth_module.decode_access_token(auth_module.create_access_token(organizer))
    assert without.session_version == current, "this is the version the token must NOT be given"
