"""Sign in with Google, end to end against a stand-in for Google: the redirect out, the binding
cookie, the one-shot state, the verified ID token, and the ways an identity becomes an account
(api/oauth_google.py). Google itself is replaced by a local RSA key and a fake code exchange;
everything on OTRI's side runs for real.

The addresses here are @gmail.com, the case where Google runs the mailbox and its answer about the
address is about who holds it now. An address on somebody else's domain takes the longer way
round; that is test_google_link_confirmation.py.
"""

import importlib
import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from api import auth, db, security
from api import oauth_google as google

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PUBLIC = _KEY.public_key()
WEB = {"X-OTRI-Client": "web"}


@pytest.fixture(autouse=True)
def google_stand_in(monkeypatch):
    """A configured client, our own signing key in place of Google's, and a record of the emails
    the callback would send. Returns that record."""
    monkeypatch.setattr(google, "CLIENT_ID", "test-client")
    monkeypatch.setattr(google, "CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(google, "_signing_key", lambda token: _PUBLIC)
    sent = []
    monkeypatch.setattr(app_module._email, "send_google_linked_email", lambda to, *, reclaimed: sent.append((to, reclaimed)))
    client.cookies.clear()
    yield sent
    client.cookies.clear()


def _id_token(*, sub, email, nonce, verified=True, **overrides):
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-client",
        "sub": sub,
        "email": email,
        "email_verified": verified,
        "nonce": nonce,
        "iat": now,
        "exp": now + 300,
        "name": "Test Person",
    }
    claims.update(overrides)
    return jwt.encode(claims, _KEY, algorithm="RS256")


def _start(**params):
    response = client.get("/auth/google/start", params=params, follow_redirects=False)
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    return query["state"][0], query["nonce"][0]


def _finish(state, id_token, monkeypatch, *, code="the-code"):
    monkeypatch.setattr(google, "_exchange", lambda got, verifier, redirect_uri: {"id_token": id_token} if got == code else {})
    response = client.get("/auth/google/callback", params={"state": state, "code": code}, follow_redirects=False)
    assert response.status_code == 303
    return response


def _landing(response):
    """(path inside the organizer app, its query) that the callback sent the browser to."""
    fragment = urlparse(response.headers["location"]).fragment
    path, _, query = fragment.partition("?")
    return path, parse_qs(query)


def _sign_in(monkeypatch, *, email, sub, intent="login", accept_terms=False, remember=False, verified=True):
    state, nonce = _start(intent=intent, accept_terms=accept_terms, remember=remember)
    return _finish(state, _id_token(sub=sub, email=email, nonce=nonce, verified=verified), monkeypatch)


def _register(email, password=PASSWORD):
    return client.post("/auth/register", json={"email": email, "password": password, "accept_terms": True})


def _me():
    return client.get("/auth/me", headers=WEB)


# --- Configuration and the redirect out ------------------------------------------------------


def test_providers_reflect_configuration(monkeypatch):
    assert client.get("/auth/providers").json() == {"google": True}
    monkeypatch.setattr(google, "CLIENT_ID", "")
    assert client.get("/auth/providers").json() == {"google": False}
    assert client.get("/auth/google/start", follow_redirects=False).status_code == 404
    assert client.get("/auth/google/callback", params={"state": "x", "code": "y"}, follow_redirects=False).status_code == 404


def test_start_sends_the_browser_to_google_with_pkce_and_a_binding_cookie():
    response = client.get("/auth/google/start", params={"intent": "login"}, follow_redirects=False)
    url = urlparse(response.headers["location"])
    query = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert query["client_id"] == ["test-client"]
    assert query["redirect_uri"] == ["http://testserver/auth/google/callback"]
    assert query["code_challenge_method"] == ["S256"] and query["code_challenge"][0]
    assert query["scope"] == ["openid email profile"]
    assert "otri_oauth" in response.cookies
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie and "path=/auth/google" in set_cookie


def test_an_unknown_intent_is_refused():
    assert client.get("/auth/google/start", params={"intent": "surprise"}, follow_redirects=False).status_code == 400


# --- The four ways an identity becomes an account ----------------------------------------------


def test_a_new_organizer_is_created_from_the_register_page(monkeypatch):
    response = _sign_in(monkeypatch, email="new@gmail.com", sub="sub-1", intent="register", accept_terms=True)
    path, query = _landing(response)
    assert path == "/login" and query["google"] == ["ok"] and query["event"] == ["created"]
    assert "otri_session" in response.cookies
    assert "otri_oauth" not in client.cookies  # the binding cookie is cleared once used

    me = _me().json()
    assert me["email"] == "new@gmail.com"
    assert me["email_verified"] is True  # Google verified it; no confirmation email is needed
    assert me["has_password"] is False
    with db.get_connection() as connection:
        row = connection.execute("SELECT terms_accepted_at FROM organizers WHERE email = %s", ("new@gmail.com",)).fetchone()
    assert row["terms_accepted_at"] is not None
    # there is no password, so a password sign-in cannot work
    assert client.post("/auth/login", json={"email": "new@gmail.com", "password": PASSWORD}).status_code == 401


def test_the_register_page_without_the_terms_makes_no_account(monkeypatch):
    response = _sign_in(monkeypatch, email="new@gmail.com", sub="sub-1", intent="register", accept_terms=False)
    path, query = _landing(response)
    assert path == "/register" and query["google"] == ["no-account"] and query["email"] == ["new@gmail.com"]
    assert "otri_session" not in response.cookies
    assert db.find_organizer_id("new@gmail.com") is None


def test_the_login_page_with_no_account_is_sent_to_register(monkeypatch):
    response = _sign_in(monkeypatch, email="nobody@gmail.com", sub="sub-9")
    path, query = _landing(response)
    assert (path, query["google"]) == ("/register", ["no-account"])
    assert db.find_organizer_id("nobody@gmail.com") is None


def test_a_confirmed_account_is_linked_and_keeps_its_password(monkeypatch, google_stand_in):
    _register("owner@gmail.com")
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", ("owner@gmail.com",))
    client.cookies.clear()

    response = _sign_in(monkeypatch, email="owner@gmail.com", sub="sub-2")
    assert _landing(response)[1]["event"] == ["linked"]
    assert google_stand_in == [("owner@gmail.com", False)]
    assert _me().json()["has_password"] is True
    assert client.post("/auth/login", json={"email": "owner@gmail.com", "password": PASSWORD}).status_code == 200
    with db.get_connection() as connection:
        identities = connection.execute("SELECT provider, subject FROM organizer_identities").fetchall()
    assert [(row["provider"], row["subject"]) for row in identities] == [("google", "sub-2")]


def test_an_unconfirmed_account_is_reclaimed_by_the_owner_of_the_mailbox(monkeypatch, google_stand_in):
    # A stranger registered this address, holds its password, has a session, and put a second
    # factor on it. None of that may survive the real owner arriving with a verified identity.
    _register("victim@gmail.com")
    strangers_session = client.post("/auth/login", json={"email": "victim@gmail.com", "password": PASSWORD}).json()["access_token"]
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE organizers SET two_factor_method = 'totp', totp_secret = %s WHERE email = %s", (security.new_totp_secret(), "victim@gmail.com")
        )
    client.cookies.clear()

    response = _sign_in(monkeypatch, email="victim@gmail.com", sub="sub-3")
    assert _landing(response)[1]["event"] == ["reclaimed"]
    assert google_stand_in == [("victim@gmail.com", True)]
    me = _me().json()
    assert me["email_verified"] is True and me["has_password"] is False
    assert me["two_factor"]["enabled"] is False
    assert client.post("/auth/login", json={"email": "victim@gmail.com", "password": PASSWORD}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {strangers_session}"}).status_code == 401


def test_a_known_subject_signs_in_even_after_the_address_changed(monkeypatch):
    _sign_in(monkeypatch, email="first@gmail.com", sub="sub-4", intent="register", accept_terms=True)
    client.cookies.clear()
    response = _sign_in(monkeypatch, email="renamed@gmail.com", sub="sub-4")
    assert _landing(response)[1]["event"] == ["signed_in"]
    assert _me().json()["email"] == "first@gmail.com"
    assert db.find_organizer_id("renamed@gmail.com") is None


# --- What is refused --------------------------------------------------------------------------


def test_a_state_finishes_one_sign_in_only(monkeypatch):
    state, nonce = _start(intent="login")
    token = _id_token(sub="sub-5", email="x@example.com", nonce=nonce)
    _finish(state, token, monkeypatch)
    again = _finish(state, token, monkeypatch)
    assert _landing(again)[1] == {"google": ["failed"], "reason": ["expired"]}


def test_the_browser_that_finishes_must_be_the_one_that_started(monkeypatch):
    state, nonce = _start(intent="login")
    client.cookies.clear()  # another browser: it never received the binding cookie
    response = _finish(state, _id_token(sub="sub-6", email="x@example.com", nonce=nonce), monkeypatch)
    assert _landing(response)[1]["reason"] == ["mismatch"]
    assert "otri_session" not in response.cookies


def test_a_token_from_another_sign_in_is_refused(monkeypatch):
    state, _ = _start(intent="login")
    response = _finish(state, _id_token(sub="sub-7", email="x@example.com", nonce="somebody-elses-nonce"), monkeypatch)
    assert _landing(response)[1]["reason"] == ["token"]


def test_a_token_issued_for_another_client_or_issuer_is_refused(monkeypatch):
    state, nonce = _start(intent="login")
    response = _finish(state, _id_token(sub="sub-7", email="x@example.com", nonce=nonce, aud="other-client"), monkeypatch)
    assert _landing(response)[1]["reason"] == ["token"]
    state, nonce = _start(intent="login")
    response = _finish(state, _id_token(sub="sub-7", email="x@example.com", nonce=nonce, iss="https://evil.example"), monkeypatch)
    assert _landing(response)[1]["reason"] == ["token"]


def test_a_token_signed_by_someone_else_is_refused(monkeypatch):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    state, nonce = _start(intent="login")
    now = int(time.time())
    forged = jwt.encode(
        {"iss": "https://accounts.google.com", "aud": "test-client", "sub": "sub-8", "email": "x@example.com", "email_verified": True, "nonce": nonce, "iat": now, "exp": now + 300},
        other,
        algorithm="RS256",
    )
    response = _finish(state, forged, monkeypatch)
    assert _landing(response)[1]["reason"] == ["token"]


def test_an_address_google_has_not_verified_is_never_used(monkeypatch):
    response = _sign_in(monkeypatch, email="unverified@example.com", sub="sub-8", intent="register", accept_terms=True, verified=False)
    assert _landing(response)[1]["reason"] == ["unverified"]
    assert db.find_organizer_id("unverified@example.com") is None


def test_google_saying_no_is_reported_and_nothing_is_set(monkeypatch):
    _start(intent="login")
    response = client.get("/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert _landing(response)[1] == {"google": ["failed"], "reason": ["denied"]}
    assert "otri_session" not in response.cookies


# --- What still applies --------------------------------------------------------------------------


def test_the_accounts_own_second_factor_still_stands(monkeypatch):
    _register("careful@gmail.com")
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE organizers SET email_verified = TRUE, two_factor_method = 'totp', totp_secret = %s WHERE email = %s",
            (security.new_totp_secret(), "careful@gmail.com"),
        )
    client.cookies.clear()
    response = _sign_in(monkeypatch, email="careful@gmail.com", sub="sub-10")
    path, query = _landing(response)
    assert path == "/login" and query["challenge"][0] and query["method"] == ["totp"]
    assert "otri_session" not in response.cookies


def test_the_admin_list_applies_as_at_password_sign_in(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss@gmail.com"})
    response = _sign_in(monkeypatch, email="boss@gmail.com", sub="sub-11", intent="register", accept_terms=True)
    assert _landing(response)[1]["event"] == ["created"]
    assert _me().json()["is_admin"] is True


def test_remember_me_carries_through_to_the_session(monkeypatch):
    response = _sign_in(monkeypatch, email="r@example.com", sub="sub-13", intent="register", accept_terms=True, remember=True)
    max_age = [part for part in response.headers["set-cookie"].split(";") if "max-age" in part.lower()]
    assert max_age and int(max_age[0].split("=")[1]) == auth.token_ttl_seconds(True)


def test_a_google_only_account_can_set_a_password_and_then_use_both(monkeypatch):
    _sign_in(monkeypatch, email="g@example.com", sub="sub-12", intent="register", accept_terms=True)

    # password-gated actions explain what to do instead of counting a wrong password
    response = client.post(
        "/auth/change-password", json={"current_password": "anything-at-all-1", "new_password": "a-brand-new-password-2"}, headers=WEB
    )
    assert response.status_code == 400 and "no password" in response.json()["detail"]

    # the reset link is how a password is set; opening it also proves the mailbox
    _, token = auth.create_password_reset_token("g@example.com")
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-2"}).status_code == 200
    assert client.post("/auth/login", json={"email": "g@example.com", "password": "a-brand-new-password-2"}).status_code == 200

    client.cookies.clear()
    response = _sign_in(monkeypatch, email="g@example.com", sub="sub-12")
    assert _landing(response)[1]["event"] == ["signed_in"]
    assert _me().json()["has_password"] is True
