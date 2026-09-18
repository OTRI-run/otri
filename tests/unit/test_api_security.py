"""Attack tests: every route's auth requirement (computed from the app, so a new endpoint cannot
slip through), ownership (IDOR), token tampering, injection strings, path traversal, XML entity
bombs, spreadsheet bombs, oversized bodies, mass assignment, enumeration, security headers."""

from __future__ import annotations

import base64
import importlib
import io
import json
import time
import zipfile

import jwt
import pytest
from fastapi.testclient import TestClient

from api import db, rate_limit
from test_api import FLAT_LOOP_GPX, _admin_headers, _create_event_and_race, _organizer_auth_headers, _register_and_verify

pytestmark = pytest.mark.usefixtures("clean_state")
app_module = importlib.import_module("api.app")
client = TestClient(app_module.app)
PASSWORD = "correct horse battery"

# Endpoints anyone may call without a session (everything else that changes state needs one).
PUBLIC_MUTATIONS = {
    "/auth/register", "/auth/login", "/auth/login/2fa", "/auth/logout", "/auth/verify-email",
    "/auth/resend-verification", "/auth/request-password-reset", "/auth/reset-password", "/gpx/analyze", "/gpx/share", "/reports",
}


def _routes():
    for route in app_module.app.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", "")
        if not path.startswith("/") or path in ("/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"):
            continue
        yield path, {m for m in methods if m not in ("HEAD", "OPTIONS")}


def _concrete(path: str) -> str:
    return path.replace("{race_id}", "OTRI-DEMO-001").replace("{event_id}", "evt-OTRI-DEMO-001").replace("{organizer_id}", "1").replace("{runner_id}", "x").replace("{share_id}", "0" * 16).replace("{report_id}", "1").replace("{id}", "1")


# --- auth requirement of every route ---------------------------------------------------


def test_every_state_changing_route_rejects_anonymous_callers():
    rate_limit.reset()
    misses = []
    for path, methods in _routes():
        for method in methods - {"GET"}:
            if path in PUBLIC_MUTATIONS:
                continue
            response = client.request(method, _concrete(path), json={})
            if response.status_code != 401:
                misses.append((method, path, response.status_code))
    assert misses == [], f"routes reachable without a session: {misses}"


def test_every_admin_route_rejects_plain_organizers(monkeypatch):
    plain = _organizer_auth_headers("plain-sec@example.com")
    misses = []
    for path, methods in _routes():
        if not path.startswith("/admin"):
            continue
        for method in methods:
            response = client.request(method, _concrete(path), json={}, headers=plain)
            if response.status_code != 403:
                misses.append((method, path, response.status_code))
    assert misses == [], f"admin routes open to organizers: {misses}"
    admin = _admin_headers(monkeypatch)
    assert client.get("/admin/overview", headers=admin).status_code == 200


# --- ownership (IDOR) ---------------------------------------------------------------------


def test_another_organizer_cannot_touch_your_event_or_race():
    a = _organizer_auth_headers("owner-a@example.com")
    b = _organizer_auth_headers("owner-b@example.com")
    event_id, race_id = _create_event_and_race(a)
    checks = [
        client.patch(f"/events/{event_id}", json={"event_name": "Hijacked"}, headers=b),
        client.delete(f"/events/{event_id}", headers=b),
        client.post(f"/events/{event_id}/races", json={"course_name": "x", "distance_km": 5, "elevation_gain_m": 10}, headers=b),
        client.patch(f"/races/{race_id}", json={"course_name": "Hijacked"}, headers=b),
        client.delete(f"/races/{race_id}", headers=b),
        client.post(f"/races/{race_id}/publish", headers=b),
        client.post(f"/races/{race_id}/gpx", files={"file": ("c.gpx", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")}, headers=b),
        client.post(f"/races/{race_id}/results", files={"file": ("r.csv", b"rank,name,time\n1,x,1:00:00\n", "text/csv")}, headers=b),
    ]
    assert all(r.status_code in (403, 404, 405) for r in checks), [r.status_code for r in checks]
    assert client.get(f"/events/{event_id}").json()["event_name"] == "Test Event"


def test_unpublished_results_are_not_public():
    a = _organizer_auth_headers("private-a@example.com")
    _, race_id = _create_event_and_race(a)
    from test_hardening import _upload_results

    _upload_results(a, race_id)
    assert client.get(f"/races/{race_id}/results").status_code in (403, 404)
    assert client.get(f"/races/{race_id}/results", headers=_organizer_auth_headers("private-b@example.com")).status_code in (403, 404)
    assert client.get(f"/races/{race_id}/results", headers=a).status_code == 200


# --- token tampering ------------------------------------------------------------------------


def test_forged_tokens_are_rejected():
    _register_and_verify("token@example.com", PASSWORD)
    real = client.post("/auth/login", json={"email": "token@example.com", "password": PASSWORD}).json()["access_token"]
    header, payload, signature = real.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=="))

    def b64(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    forged = [
        b64({"alg": "none", "typ": "JWT"}) + "." + payload + ".",  # alg none
        header + "." + b64({**claims, "sub": "1", "email": "admin@example.com"}) + "." + signature,  # edited claims
        jwt.encode(claims, "not-the-secret", algorithm="HS256"),  # wrong key
        jwt.encode({**claims, "exp": int(time.time()) - 10}, __import__("api.auth", fromlist=["JWT_SECRET"]).JWT_SECRET, algorithm="HS256"),  # expired
        real[:-3] + "abc",  # broken signature
        "",
    ]
    for token in forged:
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401, token[:30]


# --- injection strings ----------------------------------------------------------------------


def test_injection_strings_are_stored_verbatim_and_change_nothing_else():
    headers = _organizer_auth_headers("inject@example.com")
    nasty = "Robert'); DROP TABLE events;-- <script>alert(1)</script> %_\\"
    created = client.post("/events", json={"event_name": nasty, "event_date": "2026-07-01", "location": nasty}, headers=headers)
    assert created.status_code == 201, created.text
    assert client.get(f"/events/{created.json()['event_id']}").json()["event_name"] == nasty
    assert client.get("/events").status_code == 200, "the table is still there"
    report = client.post("/reports", json={"kind": "race", "subject_id": nasty, "message": nasty, "reporter_email": "a@b.c\r\nBcc: x@y.z"})
    assert report.status_code == 201, report.text
    with db.get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) AS n FROM events").fetchone()["n"] >= 6


def test_runner_search_wildcards_are_literal():
    everyone = client.get("/runners").json()
    assert len(everyone) > 3
    assert client.get("/runners", params={"q": "%"}).json() == []
    assert client.get("/runners", params={"q": "_"}).json() == []
    assert client.get("/runners", params={"q": "'; DROP TABLE runners; --"}).status_code == 200
    assert len(client.get("/runners").json()) == len(everyone)


# --- path traversal and file names --------------------------------------------------------


def test_share_ids_and_file_names_cannot_escape_their_folders(tmp_path, monkeypatch):
    for bad in ["../../etc/passwd", "..%2F..%2Fetc%2Fpasswd", "0000000000000000/../x", "x" * 16]:
        assert client.get(f"/gpx/shared/{bad}").status_code in (404, 422)
    headers = _organizer_auth_headers("names@example.com")
    _, race_id = _create_event_and_race(headers)
    monkeypatch.setattr(app_module, "enforce_rate_limit", lambda *a, **k: None)
    weird = client.post(f"/races/{race_id}/gpx", files={"file": ("../../../evil.sh;rm -rf /.gpx\\..\\x", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")}, headers=headers)
    assert weird.status_code in (200, 422), weird.text
    assert app_module._safe_suffix("../../../evil.sh;rm -rf /.gpx\\..\\x", ".gpx") == ".gpx"
    assert app_module._safe_suffix("results.XLSX", ".csv") == ".xlsx"
    assert app_module._safe_suffix("noext", ".csv") == ".csv"
    assert app_module._safe_suffix("a.b/../c", ".csv") == ".csv"


# --- parser bombs -----------------------------------------------------------------------------


def test_billion_laughs_and_external_entities_in_gpx_are_refused_quickly(monkeypatch):
    monkeypatch.setattr(app_module, "enforce_rate_limit", lambda *a, **k: None)
    laughs = (
        '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">'
        + "".join(f'<!ENTITY lol{i} "' + "&lol{};".format(i - 1 if i else "") * 10 + '">' for i in range(1, 9))
        + ']><gpx version="1.1" creator="x"><trk><trkseg><trkpt lat="1" lon="1"><ele>1</ele></trkpt><trkpt lat="1.001" lon="1"><ele>&lol8;</ele></trkpt></trkseg></trk></gpx>'
    ).replace('"&lol;"', '"lol"')
    xxe = (
        '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        '<gpx version="1.1" creator="x"><trk><name>&xxe;</name><trkseg><trkpt lat="1" lon="1"><ele>1</ele></trkpt><trkpt lat="1.001" lon="1"><ele>2</ele></trkpt></trkseg></trk></gpx>'
    )
    for body in (laughs, xxe):
        started = time.monotonic()
        response = client.post("/gpx/share", files={"file": ("bomb.gpx", body.encode(), "application/gpx+xml")})
        assert response.status_code == 422, response.text
        assert time.monotonic() - started < 5
        assert "root:" not in response.text
        response = client.post("/gpx/analyze", files={"file": ("bomb.gpx", body.encode(), "application/gpx+xml")})
        assert response.status_code == 422, response.text


def test_a_spreadsheet_with_too_many_rows_is_refused():
    from ingestion import reader

    from openpyxl import Workbook

    headers = _organizer_auth_headers("rows@example.com")
    _, race_id = _create_event_and_race(headers)
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["rank", "name", "time"])
    for i in range(reader.MAX_ROWS + 5):
        sheet.append([i + 1, f"Runner {i}", "1:00:00"])
    buffer = io.BytesIO()
    workbook.save(buffer)
    response = client.post(f"/races/{race_id}/results", files={"file": ("big.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=headers)
    assert response.status_code == 422 and "rows" in response.json()["detail"]
    assert client.get(f"/races/{race_id}/results", headers=headers).status_code == 404, "nothing was stored"


def test_a_zip_that_is_not_a_spreadsheet_is_a_clean_422():
    headers = _organizer_auth_headers("zip@example.com")
    _, race_id = _create_event_and_race(headers)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("x.txt", "0" * 10_000)
    response = client.post(f"/races/{race_id}/results", files={"file": ("fake.xlsx", buffer.getvalue(), "application/octet-stream")}, headers=headers)
    assert response.status_code == 422


# --- body size, headers, mass assignment, enumeration ---------------------------------------


def test_oversized_bodies_are_refused_before_they_are_read():
    response = client.post("/gpx/share", headers={"Content-Length": "30000000", "Content-Type": "text/plain"}, content=b"")
    assert response.status_code == 413


def test_security_headers_and_no_store_on_personal_responses():
    public = client.get("/races")
    assert public.headers["x-content-type-options"] == "nosniff" and public.headers["x-frame-options"] == "DENY"
    assert public.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    headers = _organizer_auth_headers("headers@example.com")
    assert client.get("/auth/me", headers=headers).headers["cache-control"] == "no-store"
    assert client.get("/events?mine=true", headers=headers).headers["cache-control"] == "no-store"


def test_flags_cannot_be_set_through_registration_or_profile():
    response = client.post("/auth/register", json={"email": "mass@example.com", "password": PASSWORD, "accept_terms": True, "is_admin": True, "email_verified": True})
    assert response.status_code == 201
    assert client.post("/auth/login", json={"email": "mass@example.com", "password": PASSWORD}).status_code == 403, "still unverified"
    headers = _organizer_auth_headers("mass2@example.com")
    me = client.patch("/auth/profile", json={"display_name": "x", "is_admin": True, "is_demo": True, "session_version": 99}, headers=headers).json()
    assert me["is_admin"] is False and me["is_demo"] is False
    assert client.get("/admin/overview", headers=headers).status_code == 403


def test_password_reset_and_resend_do_not_reveal_whether_an_email_exists():
    _register_and_verify("known@example.com", PASSWORD)
    known = client.post("/auth/request-password-reset", json={"email": "known@example.com"})
    unknown = client.post("/auth/request-password-reset", json={"email": "nobody-here@example.com"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()
    known = client.post("/auth/resend-verification", json={"email": "known@example.com"})
    unknown = client.post("/auth/resend-verification", json={"email": "nobody-here@example.com"})
    assert known.status_code == unknown.status_code and known.json() == unknown.json()


def test_over_long_inputs_are_422_not_stored():
    headers = _organizer_auth_headers("long@example.com")
    assert client.post("/events", json={"event_name": "x" * 201, "event_date": "2026-07-01"}, headers=headers).status_code == 422
    assert client.post("/reports", json={"kind": "race", "subject_id": "r", "message": "m" * 4001}).status_code == 422
    assert client.post("/auth/register", json={"email": "e@example.com", "password": "p" * 2000, "accept_terms": True}).status_code in (400, 422)


def test_analyze_is_rate_limited():
    rate_limit.reset()
    statuses = [client.post("/gpx/analyze", files={"file": ("c.gpx", FLAT_LOOP_GPX.read_bytes(), "application/gpx+xml")}).status_code for _ in range(62)]
    assert statuses[0] == 200 and 429 in statuses[60:]
    rate_limit.reset()
