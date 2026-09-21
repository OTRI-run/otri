"""Signing in with Google on an address Google does not run the mailbox for.

Google answers `email_verified: true` for an address it checked once. For an address on somebody
else's domain, that says who held it when Google checked, not who holds it now, and Google's own
guidance says so. OTRI used to link an existing account on that answer alone, so a former holder
of a work address could sign straight into the account of whoever has it today.

Now the mailbox is asked. Nothing is written until the link we send there is opened.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from api import db, security
from api import oauth_google as google

app_module = importlib.import_module("api.app")

from test_google_sign_in import _KEY, _PUBLIC, PASSWORD, _id_token  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")
WEB = {"X-OTRI-Client": "web"}

VICTIM = "alex@a-company.example"  # a real mailbox somewhere that is not Google


@pytest.fixture(autouse=True)
def google_stand_in(monkeypatch):
    """A configured client, our key in place of Google's, and a record of every email sent."""
    monkeypatch.setattr(google, "CLIENT_ID", "test-client")
    monkeypatch.setattr(google, "CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(google, "_signing_key", lambda token: _PUBLIC)
    sent: dict[str, list] = {"link": [], "linked": [], "verify": []}
    monkeypatch.setattr(app_module._email, "send_google_link_email", lambda to, link, *, unconfirmed: sent["link"].append((to, link, unconfirmed)))
    monkeypatch.setattr(app_module._email, "send_google_linked_email", lambda to, *, reclaimed: sent["linked"].append((to, reclaimed)))
    monkeypatch.setattr(app_module, "send_verification_email", lambda to, token: sent["verify"].append(to))
    client.cookies.clear()
    yield sent
    client.cookies.clear()


def _sign_in(monkeypatch, *, email, sub, intent="login", accept_terms=False, **claims):
    from urllib.parse import parse_qs, urlparse

    start = client.get("/auth/google/start", params={"intent": intent, "accept_terms": accept_terms}, follow_redirects=False)
    query = parse_qs(urlparse(start.headers["location"]).query)
    token = _id_token(sub=sub, email=email, nonce=query["nonce"][0], **claims)
    monkeypatch.setattr(google, "_exchange", lambda code, verifier, redirect_uri: {"id_token": token})
    response = client.get("/auth/google/callback", params={"state": query["state"][0], "code": "the-code"}, follow_redirects=False)
    fragment = urlparse(response.headers["location"]).fragment
    path, _, rest = fragment.partition("?")
    return response, path, parse_qs(rest)


def _confirmed_account(email: str) -> int:
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    client.cookies.clear()
    return db.find_organizer_id(email)


def _link_from(sent) -> str:
    assert len(sent["link"]) == 1, sent["link"]
    return sent["link"][0][1]


def _open(link: str):
    from urllib.parse import parse_qs, urlparse

    token = parse_qs(urlparse(link).query)["token"][0]
    response = client.get("/auth/google/confirm-link", params={"token": token}, follow_redirects=False)
    fragment = urlparse(response.headers["location"]).fragment
    path, _, rest = fragment.partition("?")
    return response, path, parse_qs(rest)


# --- The takeover ------------------------------------------------------------------------------


def test_a_stale_address_does_not_open_an_existing_account(monkeypatch, google_stand_in):
    """The finding. Someone holds a Google account that Google verified against this address years
    ago. They must not arrive inside the account of whoever reads that mailbox now."""
    _confirmed_account(VICTIM)

    response, path, query = _sign_in(monkeypatch, email=VICTIM, sub="stale-holder")

    assert path == "/login" and query["google"] == ["confirm-link"]
    assert "otri_session" not in response.cookies, "a session was issued without the mailbox answering"
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM organizer_identities").fetchone()["n"] == 0, "the identity was linked anyway"
    assert google_stand_in["link"] == [(VICTIM, google_stand_in["link"][0][1], False)]
    assert client.get("/auth/me", headers=WEB).status_code == 401
    # and the account is untouched: its password still works
    assert client.post("/auth/login", json={"email": VICTIM, "password": PASSWORD}).status_code == 200


def test_the_owner_of_the_mailbox_completes_the_link(monkeypatch, google_stand_in):
    _confirmed_account(VICTIM)
    _sign_in(monkeypatch, email=VICTIM, sub="the-owner")
    client.cookies.clear()

    response, path, query = _open(_link_from(google_stand_in))
    assert path == "/login" and query["google"] == ["connected"]
    assert "otri_session" not in response.cookies, "opening a link in an email must not be a sign-in"
    assert google_stand_in["linked"] == [(VICTIM, False)]
    with db.get_connection() as connection:
        rows = connection.execute("SELECT subject FROM organizer_identities").fetchall()
    assert [row["subject"] for row in rows] == ["the-owner"]

    # From here Google knows the account, so the address is not consulted again.
    _, path, query = _sign_in(monkeypatch, email=VICTIM, sub="the-owner")
    assert query["event"] == ["signed_in"]
    assert client.get("/auth/me", headers=WEB).json()["email"] == VICTIM
    assert client.post("/auth/login", json={"email": VICTIM, "password": PASSWORD}).status_code == 200, "the password still works"


def test_the_link_works_once(monkeypatch, google_stand_in):
    _confirmed_account(VICTIM)
    _sign_in(monkeypatch, email=VICTIM, sub="once-only")
    link = _link_from(google_stand_in)
    assert _open(link)[2]["google"] == ["connected"]
    client.cookies.clear()
    _, path, query = _open(link)
    assert (path, query["google"], query["reason"]) == ("/login", ["failed"], ["link-expired"])


def test_an_expired_link_is_refused(monkeypatch, google_stand_in):
    _confirmed_account(VICTIM)
    _sign_in(monkeypatch, email=VICTIM, sub="too-slow")
    link = _link_from(google_stand_in)
    with db.get_connection() as connection:
        connection.execute("UPDATE identity_link_tokens SET expires_at = now() - interval '1 minute'")
    assert _open(link)[2]["reason"] == ["link-expired"]
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM organizer_identities").fetchone()["n"] == 0


def test_a_made_up_link_is_refused():
    _, path, query = _open("https://api.example/auth/google/confirm-link?token=not-a-real-token")
    assert (path, query["reason"]) == ("/login", ["link-expired"])


# --- Where Google does run the mailbox ---------------------------------------------------------


def test_a_workspace_address_on_its_own_domain_links_at_once(monkeypatch, google_stand_in):
    """`hd` is Google's word that it runs the mail for this domain, so its answer is about now."""
    _confirmed_account("staff@school.example")
    _, path, query = _sign_in(monkeypatch, email="staff@school.example", sub="workspace", hd="school.example")
    assert query["event"] == ["linked"] and google_stand_in["link"] == []
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM organizer_identities").fetchone()["n"] == 1


def test_a_hosted_domain_that_is_not_the_address_domain_proves_nothing(monkeypatch, google_stand_in):
    """An `hd` for one domain says nothing about an address at another."""
    _confirmed_account(VICTIM)
    _, path, query = _sign_in(monkeypatch, email=VICTIM, sub="mismatched", hd="somewhere-else.example")
    assert query["google"] == ["confirm-link"]
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM organizer_identities").fetchone()["n"] == 0


# --- A brand new account -----------------------------------------------------------------------


def test_a_new_account_on_a_third_party_address_starts_unconfirmed(monkeypatch, google_stand_in):
    """Nobody has this account yet, so it is made and the visitor is signed in, as a password
    sign-up would be. But Google has not shown it reads the mailbox, so the address is not
    confirmed, publishing waits for it, and the Google identity is not joined to the account
    until the link we send there is opened."""
    _, path, query = _sign_in(monkeypatch, email="fresh@a-company.example", sub="fresh", intent="register", accept_terms=True)
    assert query["event"] == ["created"]
    me = client.get("/auth/me", headers=WEB).json()
    assert me["email"] == "fresh@a-company.example"
    assert me["email_verified"] is False, "Google only checked this address once, and not recently"
    assert google_stand_in["link"][0][0] == "fresh@a-company.example"
    with db.get_connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM organizer_identities").fetchone()["n"] == 0, "linked before the mailbox answered"


def test_registering_first_does_not_outlast_the_owner_recovering(monkeypatch, google_stand_in):
    """The gap left by the first round. Whoever registers through Google on a stale address used
    to have their identity joined to the new account for good: the owner of the mailbox could take
    the account back with a password reset, and the identity survived it, so the other person
    signed straight back in past the recovery."""
    _sign_in(monkeypatch, email=VICTIM, sub="registered-first", intent="register", accept_terms=True)
    client.cookies.clear()

    # The owner of the mailbox takes the account: a reset link confirms the address and sets a password.
    from api import auth

    token = auth.create_password_reset_token(VICTIM)[1]
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "the owner is here now 5"}).status_code == 200
    assert client.post("/auth/login", json={"email": VICTIM, "password": "the owner is here now 5"}).status_code == 200
    client.cookies.clear()

    # And the one who registered first is on the outside of it.
    _, path, query = _sign_in(monkeypatch, email=VICTIM, sub="registered-first")
    assert query["google"] == ["confirm-link"], "the identity survived the recovery"
    assert client.get("/auth/me", headers=WEB).status_code == 401


def test_a_stale_address_on_the_admin_list_is_not_an_admin(monkeypatch, google_stand_in):
    """The escalation this closes: an address on the admin list, a Google account that once held
    it, and the account is created confirmed and handed the admin flag."""
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss@a-company.example"})
    _, path, query = _sign_in(monkeypatch, email="boss@a-company.example", sub="not-the-boss", intent="register", accept_terms=True)
    assert query["event"] == ["created"]
    me = client.get("/auth/me", headers=WEB).json()
    assert me["email_verified"] is False
    assert me["is_admin"] is False, "an address nobody has answered for must not carry admin rights"


# --- An account nobody ever confirmed ----------------------------------------------------------


def test_an_unconfirmed_account_is_reclaimed_only_through_the_mailbox(monkeypatch, google_stand_in):
    """A stranger registered the address and holds its password. The real owner still has to come
    through the mailbox, and when they do, the stranger loses everything."""
    client.post("/auth/register", json={"email": VICTIM, "password": PASSWORD, "accept_terms": True})
    strangers = client.post("/auth/login", json={"email": VICTIM, "password": PASSWORD}).json()["access_token"]
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET two_factor_method = 'totp', totp_secret = %s WHERE email = %s", (security.new_totp_secret(), VICTIM))
    client.cookies.clear()

    _, path, query = _sign_in(monkeypatch, email=VICTIM, sub="real-owner")
    assert query["google"] == ["confirm-link"]
    assert google_stand_in["link"][0][2] is True, "the email must say the account is being taken over"
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {strangers}"}).status_code == 200, "nothing has happened yet"

    assert _open(_link_from(google_stand_in))[2]["google"] == ["connected"]
    assert google_stand_in["linked"] == [(VICTIM, True)]
    assert client.post("/auth/login", json={"email": VICTIM, "password": PASSWORD}).status_code == 401, "the stranger's password must stop working"
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {strangers}"}).status_code == 401, "and their session with it"

    client.cookies.clear()
    _, path, query = _sign_in(monkeypatch, email=VICTIM, sub="real-owner")
    assert query["event"] == ["signed_in"]
    me = client.get("/auth/me", headers=WEB).json()
    assert me["email_verified"] is True and me["has_password"] is False and me["two_factor"]["enabled"] is False
