"""More of the common attacks, beside tests/unit/test_api_security.py: passwords and link tokens at
rest, the timing of a sign-in answer, forged cross-site requests, a spreadsheet zip bomb, script links."""

import importlib
import zipfile

import pytest
from fastapi.testclient import TestClient

from api import auth, db

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"


def _register(email, password=PASSWORD):
    return client.post("/auth/register", json={"email": email, "password": password, "accept_terms": True})


def _headers(email, password=PASSWORD):
    _register(email, password)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}



def test_a_long_passphrase_works_and_is_not_cut_short():
    """bcrypt reads 72 bytes and its current version refuses more: a long passphrase (25 Thai
    characters are 75 bytes) was a server error at registration and at sign-in."""
    long_password = "ก" * 30 + " four unrelated words are better"
    assert _register("long@example.com", long_password).status_code == 201
    assert client.post("/auth/login", json={"email": "long@example.com", "password": long_password}).status_code == 200
    # Not truncated: the first 72 bytes alone do not open the account.
    assert client.post("/auth/login", json={"email": "long@example.com", "password": long_password.encode()[:72].decode(errors="ignore")}).status_code == 401
    assert client.post("/auth/login", json={"email": "long@example.com", "password": "x" * 1000}).status_code in (401, 422)


def test_an_unknown_address_costs_a_password_check_too(monkeypatch):
    """So that how long the answer takes does not say which addresses have accounts."""
    checked = []
    real = auth.password_matches
    monkeypatch.setattr(auth, "password_matches", lambda password, stored: checked.append(stored) or real(password, stored))
    answer = client.post("/auth/login", json={"email": "nobody-here@example.com", "password": PASSWORD})
    assert answer.status_code == 401 and answer.json()["detail"] == "invalid email or password"
    assert checked == [auth._NO_ACCOUNT_HASH]


def test_link_tokens_are_kept_as_digests_and_open_once():
    _register("reset@example.com")
    _organizer, token = auth.create_password_reset_token("reset@example.com")
    with db.get_connection() as connection:
        stored = [row["token"] for row in connection.execute("SELECT token FROM password_reset_tokens").fetchall()]
        verification = [row["token"] for row in connection.execute("SELECT token FROM email_verification_tokens").fetchall()]
    assert stored == [auth._token_digest(token)] and token not in stored, "a copy of the database holds nothing that opens an account"
    assert verification and all(len(value) == 64 for value in verification)
    # The digest is not the key: only the token from the email is.
    assert client.post("/auth/reset-password", json={"token": stored[0], "new_password": "another-long-password-2"}).status_code == 400
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "another-long-password-2"}).status_code == 200
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "yet-another-password-3"}).status_code == 400, "single use"
    # A link sent before tokens were hashed (the token itself in the table) still opens.
    with db.get_connection() as connection:
        organizer_id = connection.execute("SELECT id FROM organizers WHERE email = %s", ("reset@example.com",)).fetchone()["id"]
        connection.execute("INSERT INTO password_reset_tokens (token, organizer_id, expires_at) VALUES ('old-style-token', %s, now() + interval '1 hour')", (organizer_id,))
    assert client.post("/auth/reset-password", json={"token": "old-style-token", "new_password": "yet-another-password-3"}).status_code == 200



def test_a_cookie_session_cannot_be_driven_from_another_site():
    """Cross-site request forgery: a page elsewhere can make the browser send the cookie, but not the
    X-OTRI-Client header, so a state-changing request without it is refused."""
    _register("csrf@example.com")
    login = client.post("/auth/login", json={"email": "csrf@example.com", "password": PASSWORD}, headers={"X-OTRI-Client": "web"})
    cookies = dict(login.cookies.items())
    assert cookies and login.json()["access_token"] == "", "the web app signs in with a cookie, and gets no token a script could read"
    client.cookies.clear()
    forged = client.post("/events", json={"event_name": "Forged", "event_date": "2027-03-03"}, cookies=cookies)
    assert forged.status_code == 403
    genuine = client.post("/events", json={"event_name": "Genuine", "event_date": "2027-03-03"}, cookies=cookies, headers={"X-OTRI-Client": "web"})
    assert genuine.status_code == 201
    set_cookie = login.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie
    client.cookies.clear()



def test_a_spreadsheet_that_unpacks_to_gigabytes_is_refused_before_it_is_unpacked(tmp_path, monkeypatch):
    from ingestion import reader

    monkeypatch.setattr(reader, "MAX_XLSX_UNPACKED_BYTES", 1_000_000)
    bomb = tmp_path / "results.xlsx"
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/sharedStrings.xml", "A" * 5_000_000)  # 5 MB of one letter: a few kB on disk
    assert bomb.stat().st_size < 50_000
    with pytest.raises(ValueError, match="far larger inside"):
        reader.read_table(bomb)



def test_responses_carry_the_headers_that_stop_sniffing_and_framing():
    answer = client.get("/races")
    assert answer.headers["x-content-type-options"] == "nosniff" and answer.headers["x-frame-options"] == "DENY"
    # A website typed as a script is stored as a harmless https address, never as a javascript: link.
    headers = _headers("link@example.com")
    assert client.get("/auth/me", headers=headers).headers.get("cache-control") == "no-store"
    profile = client.patch("/auth/profile", json={"website": "javascript:alert(document.cookie)"}, headers=headers).json()["profile"]
    assert profile["website"].startswith("https://")


def test_the_api_reference_runs_no_script_that_is_not_pinned_by_its_hash():
    """/docs is a page on the API's own origin, where session cookies count. FastAPI's default loads
    whatever a CDN serves for "swagger-ui-dist@5" (and ReDoc "@next"): one hijacked package would run
    as api.otri.run with the session of whoever opened it."""
    page = client.get("/docs")
    assert page.status_code == 200
    scripts = [tag for tag in page.text.split("<script")[1:] if "src=" in tag.split(">")[0]]
    assert scripts and all('integrity="sha384-' in tag.split(">")[0] and 'crossorigin="anonymous"' in tag.split(">")[0] for tag in scripts)
    assert 'rel="stylesheet"' in page.text and page.text.count('integrity="sha384-') == 2
    assert "swagger-ui-dist@5.33.0/" in page.text and "swagger-ui-dist@5/" not in page.text, "an exact version, not a range"
    policy = page.headers["content-security-policy"]
    assert "default-src 'none'" in policy and "connect-src 'self'" in policy and "frame-ancestors 'none'" in policy
    assert "'unsafe-inline'" not in policy.split("script-src")[1].split(";")[0], "only the hashed start-up script may run inline"
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 200, "the machine-readable description stays public"
    # Everything else is data, and says that nothing in it may load or run.
    assert client.get("/races").headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
