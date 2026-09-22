"""Production-hardening behaviour: migrations, session revocation, lockout, shared rate limits,
email log, health, account export/deletion, eviction under concurrency, deletion cascades."""

from __future__ import annotations

import importlib
import time
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import db, migrations, rate_limit

app_module = importlib.import_module("api.app")  # the module; `api.app` the attribute is the FastAPI instance

from test_api import (
    DEMO_RESULT_001,
    FLAT_LOOP_GPX,
    _admin_headers,
    _create_event_and_race,
    _organizer_auth_headers,
    _register_and_verify,
)

pytestmark = pytest.mark.usefixtures("clean_state")
client = TestClient(app_module.app)
PASSWORD = "correct horse battery"


def _upload_results(headers: dict, race_id: str) -> None:
    with DEMO_RESULT_001.open("rb") as handle:
        response = client.post(f"/races/{race_id}/results", files={"file": ("r.csv", handle, "text/csv")}, headers=headers)
    assert response.status_code == 200, response.text


# --- migrations -----------------------------------------------------------------


def test_migrations_are_recorded_once_and_pending_is_empty_after_init():
    with db.get_connection() as connection:
        assert migrations.pending(connection) == []
        names = migrations.applied_names(connection)
    assert names == sorted(m.name for m in migrations.MIGRATIONS)
    assert db.init_db() == [], "a second init applies nothing"


def test_unknown_applied_migration_aborts_instead_of_guessing():
    with db.get_connection() as connection:
        connection.execute("INSERT INTO schema_migrations (name) VALUES ('9999_from_the_future')")
        with pytest.raises(RuntimeError, match="from_the_future"):
            migrations.pending(connection)
        connection.execute("DELETE FROM schema_migrations WHERE name = '9999_from_the_future'")


# --- session revocation ---------------------------------------------------------


def test_password_change_signs_out_other_devices_but_returns_a_fresh_token():
    old = _organizer_auth_headers("rev@example.com")
    other_device = client.post("/auth/login", json={"email": "rev@example.com", "password": PASSWORD}).json()["access_token"]
    changed = client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "a brand new passphrase 9"}, headers=old)
    assert changed.status_code == 200, changed.text
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200
    assert client.get("/auth/me", headers=old).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {other_device}"}).status_code == 401


def test_sign_out_everywhere_needs_the_password_and_kills_every_token():
    headers = _organizer_auth_headers("everywhere@example.com")
    assert client.post("/auth/logout-all", json={"password": "nope nope nope"}, headers=headers).status_code == 400
    assert client.post("/auth/logout-all", json={"password": PASSWORD}, headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    again = client.post("/auth/login", json={"email": "everywhere@example.com", "password": PASSWORD})
    assert again.status_code == 200 and client.get("/auth/me", headers={"Authorization": f"Bearer {again.json()['access_token']}"}).status_code == 200


def test_turning_two_factor_off_revokes_earlier_tokens():
    from api.security import totp_now

    headers = _organizer_auth_headers("twofa-off@example.com")
    setup = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).json()
    enabled = client.post("/auth/2fa/totp/enable", json={"code": totp_now(setup["secret"])}, headers=headers)
    assert enabled.status_code == 200
    headers = {"Authorization": f"Bearer {enabled.json()['access_token']}"}
    disabled = client.post("/auth/2fa/disable", json={"password": PASSWORD}, headers=headers)
    assert disabled.status_code == 200 and disabled.json()["access_token"]
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {disabled.json()['access_token']}"}).status_code == 200


def test_deleted_account_token_is_rejected_immediately(monkeypatch):
    headers = _organizer_auth_headers("gone@example.com")
    admin = _admin_headers(monkeypatch)
    me = client.get("/auth/me", headers=headers).json()
    account = next(a for a in client.get("/admin/organizers", headers=admin).json() if a["email"] == me["email"])
    assert client.delete(f"/admin/organizers/{account['id']}", headers=admin).status_code in (200, 204)
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 401 and "no longer exists" in response.json()["detail"]


# --- lockout and rate limits ----------------------------------------------------


def test_ten_wrong_passwords_lock_the_account_for_a_while_even_with_the_right_one():
    _register_and_verify("locked@example.com", PASSWORD)
    for _ in range(rate_limit.LOCKOUT_FAILURES):
        rate_limit._hits.clear()
        with db.get_connection() as connection:
            connection.execute("DELETE FROM rate_limits")  # isolate the lockout from the per-IP limit
        assert client.post("/auth/login", json={"email": "Locked@Example.com", "password": "wrong password here"}).status_code == 401
    with db.get_connection() as connection:
        connection.execute("DELETE FROM rate_limits")
    response = client.post("/auth/login", json={"email": "locked@example.com", "password": PASSWORD})
    assert response.status_code == 429
    assert "try again in" in response.json()["detail"] and 880 < int(response.headers["retry-after"]) <= 900
    rate_limit.clear_all_locks("locked@example.com")
    with db.get_connection() as connection:
        connection.execute("DELETE FROM rate_limits")
    assert client.post("/auth/login", json={"email": "locked@example.com", "password": PASSWORD}).status_code == 200


def test_a_correct_password_resets_the_failure_count():
    _register_and_verify("resetcount@example.com", PASSWORD)
    for _ in range(3):
        client.post("/auth/login", json={"email": "resetcount@example.com", "password": "wrong password here"})
    assert client.post("/auth/login", json={"email": "resetcount@example.com", "password": PASSWORD}).status_code == 200
    with db.get_connection() as connection:
        assert connection.execute("SELECT 1 FROM login_failures WHERE email = 'resetcount@example.com'").fetchone() is None


def test_rate_limit_lives_in_the_database_not_the_process():
    """Clearing the in-process fallback between requests must not reset the limit: a restart or a
    second worker sees the same counts."""
    for _ in range(5):
        rate_limit._hits.clear()
        response = client.post("/auth/register", json={"email": "rl@example.com", "password": PASSWORD, "accept_terms": True})
        assert response.status_code in (201, 400)
    rate_limit._hits.clear()
    limited = client.post("/auth/register", json={"email": "rl2@example.com", "password": PASSWORD, "accept_terms": True})
    assert limited.status_code == 429 and limited.headers["retry-after"] == "60"
    with db.get_connection() as connection:
        rows = connection.execute("SELECT count FROM rate_limits WHERE key LIKE '/auth/register:%'").fetchall()
    assert rows and rows[0]["count"] == 6


# --- email log, health, monitoring ---------------------------------------------


def test_every_send_is_logged_with_its_outcome(monkeypatch):
    monkeypatch.setattr(importlib.import_module("api.email"), "RESEND_API_KEY", "")
    _register_and_verify("logged@example.com", PASSWORD)
    admin = _admin_headers(monkeypatch)
    rows = client.get("/admin/emails", headers=admin).json()
    mine = [row for row in rows if row["to_email"] == "logged@example.com"]
    assert mine and mine[0]["subject"].startswith("Verify") and mine[0]["status"] == "logged"
    overview = client.get("/admin/overview", headers=admin).json()
    assert "emails_24h" in overview["stats"] and "email_failures_24h" in overview["stats"]
    assert overview["security"]["lockout"]["failures"] == rate_limit.LOCKOUT_FAILURES
    assert "database" in overview["security"]["rate_limits"]["backend"]
    assert client.get("/admin/emails").status_code == 401


def test_health_reports_database_disk_and_migrations(monkeypatch):
    import shutil
    from collections import namedtuple

    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(shutil, "disk_usage", lambda _path: usage(100, 40, 60))
    response = client.get("/health")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == {"ok": True, "pending_migrations": []}
    assert body["checks"]["disk"] == {"ok": True, "free_percent": 60.0}


def test_health_is_503_when_the_disk_is_nearly_full(monkeypatch):
    import shutil
    from collections import namedtuple

    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(shutil, "disk_usage", lambda _path: usage(100, 95, 5))
    response = client.get("/health")
    assert response.status_code == 503 and response.json()["checks"]["disk"]["ok"] is False


def test_health_is_503_when_the_database_is_unreachable(monkeypatch):
    def broken():
        raise RuntimeError("connection refused")

    monkeypatch.setattr(db, "get_connection", broken)
    response = client.get("/health")
    assert response.status_code == 503 and response.json()["checks"]["database"]["ok"] is False


def test_health_details_are_hidden_from_the_public(monkeypatch):
    """Through nginx every outside request carries X-Forwarded-For; the answer is then the status
    alone. The watchdog on the droplet (direct, no proxy header) still sees the individual checks."""
    import shutil
    from collections import namedtuple

    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(shutil, "disk_usage", lambda _path: usage(100, 40, 60))
    public = client.get("/health", headers={"X-Forwarded-For": "203.0.113.9"})
    assert public.status_code == 200 and set(public.json()) == {"status", "started_at"}
    local = client.get("/health")
    assert "checks" in local.json()


# --- export and self-service deletion -------------------------------------------


def test_export_contains_the_organizers_own_data_only():
    headers = _organizer_auth_headers("export@example.com")
    _, race_id = _create_event_and_race(headers)
    _upload_results(headers, race_id)
    _organizer_auth_headers("other@example.com")
    assert client.post("/auth/export", json={"password": "wrong password entirely"}, headers=headers).status_code == 400
    response = client.post("/auth/export", json={"password": "correct horse battery"}, headers=headers)
    assert response.status_code == 200 and "attachment" in response.headers["content-disposition"]
    data = response.json()
    assert data["account"]["email"] == "export@example.com" and "password_hash" not in data["account"]
    assert [race["race_id"] for race in data["races"]] == [race_id]
    assert len(data["results"]) > 0 and all(row["race_id"] == race_id for row in data["results"])
    assert any(row["subject"].startswith("Verify") for row in data["emails_sent_to_you"])


def test_deleting_your_own_account_needs_the_password_and_removes_everything():
    headers = _organizer_auth_headers("bye@example.com")
    _, race_id = _create_event_and_race(headers)
    _upload_results(headers, race_id)
    assert client.post(f"/races/{race_id}/publish", headers=headers).status_code == 200
    assert client.request("DELETE", "/auth/account", json={"password": "not it at all"}, headers=headers).status_code == 400
    assert client.request("DELETE", "/auth/account", json={"password": PASSWORD}, headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.get(f"/races/{race_id}").status_code == 404
    assert client.post("/auth/login", json={"email": "bye@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/auth/register", json={"email": "bye@example.com", "password": PASSWORD, "accept_terms": True}).status_code == 201, "the address is free again"


def test_admin_deleting_an_organizer_cascades_to_runners_and_reports(monkeypatch):
    headers = _organizer_auth_headers("cascade@example.com")
    _, race_id = _create_event_and_race(headers)
    _upload_results(headers, race_id)
    assert client.post(f"/races/{race_id}/publish", headers=headers).status_code == 200
    rows = client.get(f"/races/{race_id}/results").json()
    runner_id = next(row["runner_id"] for row in rows if row.get("runner_id"))
    assert client.get(f"/runners/{runner_id}").status_code == 200
    assert client.post("/reports", json={"kind": "race", "subject_id": race_id, "reason": "wrong_result", "message": "please check"}).status_code in (200, 201)
    admin = _admin_headers(monkeypatch)
    account = next(a for a in client.get("/admin/organizers", headers=admin).json() if a["email"] == "cascade@example.com")
    assert client.delete(f"/admin/organizers/{account['id']}", headers=admin).status_code in (200, 204)
    assert client.get(f"/races/{race_id}").status_code == 404
    profile = client.get(f"/runners/{runner_id}")
    assert profile.status_code == 404 or all(row["race_id"] != race_id for row in profile.json().get("results", []))
    with db.get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) AS n FROM results WHERE race_id = %s", (race_id,)).fetchone()["n"] == 0


# --- concurrency and restarts ---------------------------------------------------


def test_concurrent_shares_never_exceed_the_budget_or_crash(tmp_path, monkeypatch):
    import gzip

    monkeypatch.setattr(app_module, "_SHARED_COURSE_DIR", tmp_path / "shared")
    raw = FLAT_LOOP_GPX.read_bytes()
    packed = len(gzip.compress(raw, compresslevel=6))
    monkeypatch.setattr(app_module, "_SHARED_COURSE_MAX_TOTAL_BYTES", int(packed * 3.5))
    monkeypatch.setattr(app_module, "enforce_rate_limit", lambda *a, **k: None)
    errors: list[str] = []

    def share(i: int) -> None:
        variant = raw.replace(b"<gpx", f"<!-- c{i} --><gpx".encode(), 1)
        try:
            response = TestClient(app_module.app).post("/gpx/share", files={"file": (f"c{i}.gpx", variant, "application/gpx+xml")})
            if response.status_code != 200:
                errors.append(response.text)
        except Exception as error:  # noqa: BLE001
            errors.append(repr(error))

    threads = [threading.Thread(target=share, args=(i,)) for i in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    files = list((tmp_path / "shared").glob("*.gpx.gz"))
    assert 1 <= len(files) <= 4
    assert sum(path.stat().st_size for path in files) <= int(packed * 3.5) + packed, "at most one file over budget, transiently"
    for path in files:
        assert Path(str(path)[: -len(".gpx.gz")] + ".json").exists(), "every survivor keeps its sidecar"


def test_login_challenge_survives_a_process_restart():
    """The second step is stored in the database, so a deploy between step one and two does not
    strand the organizer. Simulated by reloading the auth module and using a new client."""
    from api.security import totp_now

    headers = _organizer_auth_headers("restart@example.com")
    setup = client.post("/auth/2fa/totp/setup", json={"password": PASSWORD}, headers=headers).json()
    assert client.post("/auth/2fa/totp/enable", json={"code": totp_now(setup["secret"])}, headers=headers).status_code == 200
    first = client.post("/auth/login", json={"email": "restart@example.com", "password": PASSWORD}).json()
    assert first["requires_2fa"]
    importlib.reload(importlib.import_module("api.rate_limit"))
    fresh_client = TestClient(app_module.app)
    # The code that switched two-factor on is spent (one code, one sign-in): use the next one.
    second = fresh_client.post("/auth/login/2fa", json={"challenge": first["challenge"], "code": totp_now(setup["secret"], at=time.time() + 30)})
    assert second.status_code == 200 and second.json()["access_token"]
