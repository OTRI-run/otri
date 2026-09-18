"""Scale pass: pooled database connections, indexes, and cache headers that let browsers and the
edge reuse anonymous public reads while personal responses stay uncacheable."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from api import db
from test_api import _register_and_verify

pytestmark = pytest.mark.usefixtures("clean_state")
app_module = importlib.import_module("api.app")


def test_connections_are_pooled_not_opened_per_request():
    with db.get_connection() as first:
        first.execute("SELECT 1")
    assert not first.closed, "a pooled connection goes back to the pool instead of being closed"
    before = db._pool().get_stats()["connections_num"]
    for _ in range(25):
        with db.get_connection() as connection:
            connection.execute("SELECT 1")
    stats = db._pool().get_stats()
    assert stats["connections_num"] - before <= 2, f"25 sequential requests opened {stats['connections_num'] - before} new connections"
    assert stats["pool_size"] <= db.POOL_MAX_SIZE and db._pool() is db._pool()


def test_a_failed_transaction_is_rolled_back_and_the_connection_survives():
    with pytest.raises(Exception):
        with db.get_connection() as connection:
            connection.execute("SELECT 1")
            raise RuntimeError("boom")
    with db.get_connection() as connection:
        assert connection.execute("SELECT 1 AS ok").fetchone()["ok"] == 1


def test_hot_lookups_are_indexed():
    with db.get_connection() as connection:
        rows = connection.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'").fetchall()
    names = {row["indexname"] for row in rows}
    for expected in ("results_race_id_idx", "results_runner_id_idx", "races_event_id_idx", "races_published_at_idx", "events_organizer_id_idx"):
        assert expected in names, expected


def test_public_reads_are_cacheable_and_personal_responses_are_not():
    client = TestClient(app_module.app)
    for path in ("/races", "/runners", "/events", "/scoring/models"):
        header = client.get(path).headers.get("cache-control", "")
        assert header.startswith("public, max-age=30"), (path, header)
    assert "public" not in client.get("/races/does-not-exist").headers.get("cache-control", ""), "errors are not cached"
    assert "public" not in client.get("/health").headers.get("cache-control", "")

    _register_and_verify("cache@example.com", "correct horse battery")
    token = client.post("/auth/login", json={"email": "cache@example.com", "password": "correct horse battery"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/races", headers=headers).headers["cache-control"] == "no-store", "the same URL with a session is personal"
    assert client.get("/auth/me", headers=headers).headers["cache-control"] == "no-store"
    web = TestClient(app_module.app)
    web.post("/auth/login", json={"email": "cache@example.com", "password": "correct horse battery"}, headers={"X-OTRI-Client": "web"})
    assert web.get("/events").headers["cache-control"] == "no-store", "a cookie session is personal too"


def test_admin_overview_lists_installed_terrain_tiles(monkeypatch):
    class FakeProvider:
        manifest = {"tiles": [{"path": "Copernicus_DSM_COG_10_N07_00_E098_00_DEM.tif"}, {"path": "Copernicus_DSM_COG_10_S33_00_W070_00_DEM.tif"}]}

    assert app_module._dem_tile_codes(FakeProvider()) == ["N07E098", "S33W070"]
    assert app_module._dem_tile_codes(None) == []
