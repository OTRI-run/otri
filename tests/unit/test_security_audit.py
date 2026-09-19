"""The findings of the September 2026 audit of the whole repository, each tried here the way a
script would try it. Companion to test_security_account.py (the review before it)."""

import importlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth, db, rate_limit, security

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
elsewhere = TestClient(app_module.app, client=("203.0.113.9", 50000))  # the same API, seen from another address
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"
GPX = (Path(__file__).resolve().parents[2] / "public" / "examples" / "otri-example-course.gpx").read_bytes()


def _forget_request_counts():
    """A minute passes: the per-minute limits are fresh, the locks are not."""
    rate_limit._hits.clear()
    with db.get_connection() as connection:
        connection.execute("DELETE FROM rate_limits")


def _account(email, *, verified=True):
    client.cookies.clear()
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    if verified:
        with db.get_connection() as connection:
            connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    token = client.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def _with_authenticator(email):
    headers = _account(email)
    secret = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).json()["secret"]
    enabled = client.post("/auth/2fa/totp/enable", json={"code": security.totp_now(secret)}, headers=headers).json()
    return {**headers, "Authorization": f"Bearer {enabled['access_token']}"}, secret, enabled["codes"]


def _emails_to(address):
    with db.get_connection() as connection:
        return [row["subject"] for row in connection.execute("SELECT subject FROM email_log WHERE to_email = %s ORDER BY id", (address,)).fetchall()]


# --- 1. the password asked for again ---------------------------------------------------------


def test_confirming_with_the_password_is_limited_like_signing_in():
    """Signing out everywhere, deleting the account, turning two-factor off and new recovery codes
    checked the password with no limit at all: endless guesses for a stolen session, and a sixth
    of a second of a core per call for anybody with a free account."""
    headers = _account("confirm@example.com")
    calls = [
        lambda: client.post("/auth/logout-all", json={"password": "wrong-password-0"}, headers=headers),
        lambda: client.request("DELETE", "/auth/account", json={"password": "wrong-password-0"}, headers=headers),
        lambda: client.post("/auth/2fa/disable", json={"password": "wrong-password-0"}, headers=headers),
        lambda: client.post("/auth/2fa/recovery-codes", json={"password": "wrong-password-0"}, headers=headers),
    ]
    statuses = [calls[i % 4]().status_code for i in range(8)]
    assert statuses == [400] * 5 + [429] * 3, "one allowance for all of them together, per account"

    # A minute later the guesser is back; the tenth wrong password pauses the account's confirmations.
    _forget_request_counts()
    assert [calls[0]().status_code for _ in range(5)] == [400] * 5
    _forget_request_counts()
    answer = client.post("/auth/logout-all", json={"password": PASSWORD}, headers=headers)
    assert answer.status_code == 429 and "reset your password" in answer.json()["detail"], "the right password, while paused"
    assert client.get("/auth/me", headers=headers).status_code == 200, "nothing was signed out"


# --- 2. the second factor, across challenges -------------------------------------------------


def test_wrong_codes_are_counted_for_the_account_not_only_for_the_challenge():
    """Every sign-in hands out a new challenge with five attempts. Nothing counted across them, so
    whoever had the password could guess at the code without end."""
    _headers, secret, recovery = _with_authenticator("second@example.com")
    for _ in range(2):
        _forget_request_counts()
        challenge = client.post("/auth/login", json={"email": "second@example.com", "password": PASSWORD}).json()["challenge"]
        for _ in range(5):
            assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": "000000"}).status_code == 401
    _forget_request_counts()
    # No further challenge, from any address, and the one in hand is no use either.
    assert elsewhere.post("/auth/login", json={"email": "second@example.com", "password": PASSWORD}).status_code == 429
    assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": security.totp_now(secret)}).status_code in (401, 429)
    assert _emails_to("second@example.com")[-1] == "Someone may know your OTRI password"

    # A reset link does not give the guesser a fresh count: the mailbox does not answer for the code.
    _organizer, token = auth.create_password_reset_token("second@example.com")
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-9"}).status_code == 200
    assert client.post("/auth/login", json={"email": "second@example.com", "password": "a-brand-new-password-9"}).status_code == 429

    # The hour over, the owner signs in, with a recovery code even.
    rate_limit.clear_failures("2fa|second@example.com")
    challenge = client.post("/auth/login", json={"email": "second@example.com", "password": "a-brand-new-password-9"}).json()["challenge"]
    assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": recovery[0]}).status_code == 200


def test_a_half_finished_sign_in_is_kept_as_a_digest_and_old_recovery_codes_still_work():
    _headers, _secret, _codes = _with_authenticator("digest@example.com")
    challenge = client.post("/auth/login", json={"email": "digest@example.com", "password": PASSWORD}).json()["challenge"]
    with db.get_connection() as connection:
        stored = connection.execute("SELECT token FROM login_challenges").fetchone()["token"]
        organizer_id = connection.execute("SELECT id FROM organizers WHERE email = 'digest@example.com'").fetchone()["id"]
        # A recovery code issued before the hash was keyed.
        connection.execute("INSERT INTO recovery_codes (organizer_id, code_hash) VALUES (%s, %s)", (organizer_id, security.legacy_hash_code("abcd-2345")))
    assert stored != challenge and len(stored) == 64
    assert client.post("/auth/login/2fa", json={"challenge": stored, "code": "abcd-2345"}).status_code == 401, "the stored value is not a challenge"
    assert security.hash_code("abcd-2345") != security.legacy_hash_code("abcd-2345")
    assert client.post("/auth/login/2fa", json={"challenge": challenge, "code": "ABCD 2345"}).status_code == 200


# --- 8. locking somebody else out ------------------------------------------------------------


def test_ten_wrong_passwords_lock_out_the_address_they_came_from_not_the_owner():
    _account("owner@example.com")
    for _ in range(10):
        _forget_request_counts()
        assert client.post("/auth/login", json={"email": "owner@example.com", "password": "not-the-password-1"}).status_code == 401
    _forget_request_counts()
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 429, "that address is out"
    assert elsewhere.post("/auth/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 200, "the owner is not"

    # Spread over many addresses it is still a guess at one password: fifty lock the account.
    for _ in range(rate_limit.LOCKOUT_FAILURES_ANY_SOURCE):
        rate_limit.record_login_failure("owner@example.com", "198.51.100.1")
    assert elsewhere.post("/auth/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 429
    # The way back in is the owner's mailbox.
    _organizer, token = auth.create_password_reset_token("owner@example.com")
    assert elsewhere.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-9"}).status_code == 200
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": "a-brand-new-password-9"}).status_code == 200


# --- 7. mail -----------------------------------------------------------------------------------


def test_nobody_can_fill_an_inbox_with_reset_or_confirmation_mail():
    _account("inbox@example.com", verified=False)
    before = len(_emails_to("inbox@example.com"))
    answers = []
    for i in range(8):
        _forget_per_minute_only()
        path = "/auth/request-password-reset" if i % 2 else "/auth/resend-verification"
        sender = elsewhere if i >= 4 else client  # the limit is the recipient's, whoever asks
        answers.append(sender.post(path, json={"email": "inbox@example.com"}))
    assert {a.status_code for a in answers} == {200}
    assert len({a.json()["message"] for a in answers[0::2]}) == 1, "the answer does not say that nothing was sent"
    assert len(_emails_to("inbox@example.com")) - before == 3


def _forget_per_minute_only():
    rate_limit._hits.clear()
    with db.get_connection() as connection:
        connection.execute("DELETE FROM rate_limits WHERE key NOT LIKE '~%%'")


def test_accounts_cannot_be_made_by_the_hundred_from_one_address():
    made = []
    for i in range(12):
        _forget_per_minute_only()
        made.append(client.post("/auth/register", json={"email": f"bulk{i}@example.com", "password": PASSWORD, "accept_terms": True}).status_code)
        client.cookies.clear()
    assert made == [201] * 10 + [429] * 2


# --- 5. what an unconfirmed address may hold -------------------------------------------------


def _results_csv(rows, prefix="N"):
    return ("Rank,Time,Last name,First name,Gender\n" + "".join(f"{i},{3 + i // 3600}:{i // 60 % 60:02d}:{i % 60:02d},{prefix}{i},F{i},M\n" for i in range(1, rows + 1))).encode()


def test_an_unconfirmed_address_holds_little_until_it_is_confirmed(monkeypatch):
    monkeypatch.setattr(app_module, "_MAX_RESULT_ROWS_UNCONFIRMED", 60)
    headers = _account("unconfirmed@example.com", verified=False)
    event = client.post("/events", json={"event_name": "Try-out", "event_date": "2027-01-01"}, headers=headers).json()
    races = [client.post(f"/events/{event['event_id']}/races", json={"course_name": f"{n}K", "distance_km": n, "elevation_gain_m": 100}, headers=headers) for n in range(5, 12)]
    assert [r.status_code for r in races] == [201] * 6 + [403]
    assert "Confirm your email address" in races[6].json()["detail"]

    first, second = races[0].json()["race_id"], races[1].json()["race_id"]
    upload = lambda race_id, rows, prefix: client.post(f"/races/{race_id}/results", files={"file": ("r.csv", _results_csv(rows, prefix), "text/csv")}, headers=headers)  # noqa: E731
    assert upload(first, 40, "A").status_code == 200
    refused = upload(second, 40, "B")
    assert refused.status_code == 403 and "Nothing was stored" in refused.json()["detail"]
    assert upload(first, 50, "C").status_code == 200, "replacing a race's results counts the new file, not both"
    with db.get_connection() as connection:
        stored = connection.execute("SELECT race_id, COUNT(*) AS n FROM results WHERE race_id IN (%s, %s) GROUP BY race_id", (first, second)).fetchall()
    assert {row["race_id"]: row["n"] for row in stored} == {first: 50}

    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = 'unconfirmed@example.com'")
    assert upload(second, 40, "B").status_code == 200, "confirmed: the same file goes in"


# --- 4. ids that are already taken -----------------------------------------------------------


def test_an_id_that_is_taken_is_drawn_again_instead_of_failing_the_upload(monkeypatch):
    """Runner ids were 32 random bits and a taken one was a server error for the whole file: past
    a hundred thousand runners, most large uploads."""
    headers = _account("ids@example.com")
    event = client.post("/events", json={"event_name": "Ids", "event_date": "2027-01-01"}, headers=headers).json()
    race = client.post(f"/events/{event['event_id']}/races", json={"course_name": "10K", "distance_km": 10, "elevation_gain_m": 100}, headers=headers).json()
    real, drawn = db._new_id, []

    def mostly_taken(prefix, nbytes=4):
        drawn.append(prefix)
        return f"{prefix}-taken" if len(drawn) % 2 else real(prefix, nbytes)  # every other draw collides

    with db.get_connection() as connection:
        connection.execute("INSERT INTO runners (runner_id, family_name, first_name, gender, name_key) VALUES ('run-taken', 'Taken', 'Id', 'M', 'taken|id|M')")
        connection.execute("INSERT INTO events (event_id, event_name, event_date) VALUES ('evt-taken', 'Taken', '2027-01-01')")
    monkeypatch.setattr(db, "_new_id", mostly_taken)
    answer = client.post(f"/races/{race['race_id']}/results", files={"file": ("r.csv", _results_csv(25), "text/csv")}, headers=headers)
    assert answer.status_code == 200 and len(answer.json()["scores"]) == 25
    assert client.post("/events", json={"event_name": "Second", "event_date": "2027-02-01"}, headers=headers).status_code == 201
    monkeypatch.undo()
    assert len(db._new_id("run", 8)) == len("run-") + 16


# --- 6. the link in a report -----------------------------------------------------------------


def test_a_report_keeps_only_a_page_of_this_site(monkeypatch):
    monkeypatch.setattr(app_module, "_ALLOWED_ORIGIN_LIST", ["https://otri.run"])
    report = {"kind": "other", "subject_id": "x", "message": "please look at this, the score is wrong"}
    kept = {}
    for url in (
        "https://otri.run/prototype/#races/race-1",
        "https://otri.run.evil.example/organizer/#/login",
        "https://otri.run@evil.example/",
        "javascript:fetch('https://evil.example/')",
        "//evil.example/",
    ):
        _forget_request_counts()
        answer = client.post("/reports", json={**report, "page_url": url})
        assert answer.status_code == 201
        kept[url] = answer.json()["page_url"]
    assert [url for url, stored in kept.items() if stored] == ["https://otri.run/prototype/#races/race-1"]


def test_reports_are_all_kept_but_the_admins_inbox_is_not_filled(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss@example.com"})
    before = len(_emails_to("boss@example.com"))
    for i in range(15):
        _forget_per_minute_only()
        sender = TestClient(app_module.app, client=(f"198.51.100.{i}", 40000))
        assert sender.post("/reports", json={"kind": "other", "subject_id": "x", "message": f"report number {i}, long enough"}).status_code == 201
    assert len(_emails_to("boss@example.com")) - before == 12
    assert len(db.list_reports(None)) == 15


# --- the limiter itself ----------------------------------------------------------------------


def test_a_limit_cannot_be_doubled_across_the_minute_boundary():
    """Fixed windows: ten at 11:59:59 and ten more at 12:00:00. The count now carries over."""
    noon = datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)
    for _ in range(10):
        rate_limit._count_in_db("boundary:test", noon - timedelta(seconds=1))
    assert rate_limit._count_in_db("boundary:test", noon + timedelta(seconds=1)) > 10
    assert rate_limit._count_in_db("boundary:test", noon + timedelta(seconds=59)) < 3, "a minute later it has all but passed"
    assert rate_limit._count_in_db("boundary:cost", noon, 3600, cost=4) == 4


def test_an_upload_without_a_length_is_refused_before_it_is_read():
    def endless():
        yield b"--x\r\n"

    answer = client.post("/gpx/analyze", content=endless(), headers={"Content-Type": "multipart/form-data; boundary=x"})
    assert answer.status_code == 411


# --- 3. terrain tiles ------------------------------------------------------------------------


def test_a_visitor_has_a_small_allowance_of_new_terrain_tiles_and_an_admin_no_limit():
    from starlette.requests import Request

    request = Request({"type": "http", "client": ("192.0.2.7", 1), "headers": [], "path": "/gpx/analyze", "method": "POST", "query_string": b""})
    allow = app_module._tile_allowance(request)
    assert [allow(2), allow(2), allow(2), allow(1)] == [True, True, True, False]
    admin = auth.Organizer(id=1, email="a@example.com", is_admin=True)
    assert app_module._tile_allowance(request, admin) is None
    # Everyone together has an hourly allowance too: other visitors' tiles count against it.
    rate_limit.over_limit(None, max_requests=1, scope="dem-tiles", subject="everyone", window_seconds=3600, cost=app_module._TILES_PER_HOUR_EVERYONE)
    other = Request({"type": "http", "client": ("192.0.2.8", 1), "headers": [], "path": "/gpx/analyze", "method": "POST", "query_string": b""})
    assert app_module._tile_allowance(other)(1) is False
