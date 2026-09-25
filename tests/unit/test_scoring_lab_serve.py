"""The scoring lab's local app: what it accepts, where it writes, and whom it answers."""

from __future__ import annotations

import http.client
import json
import shutil
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from course.gpx import GpxParseError
from scoring_lab import lab, serve

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "gpx" / "out-and-back.gpx"


@pytest.fixture()
def state(tmp_path, monkeypatch):
    monkeypatch.delenv("OTRI_DEM_MANIFEST", raising=False)
    monkeypatch.setattr(lab, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(lab, "REPO_DIR", tmp_path)
    monkeypatch.setattr(lab, "DEFAULT_OUT_DIR", tmp_path / "reports")
    courses = tmp_path / "courses"
    courses.mkdir()
    return serve.Lab(courses, [], jobs=1)


def test_upload_keeps_the_file_inside_the_folder_and_refuses_non_gpx(state):
    data = FIXTURE.read_bytes()
    assert state.upload("../../x/evil name.gpx", data) == "evil name.gpx"
    assert state.upload("evil name.gpx", data) == "evil name.gpx"  # same bytes: not copied twice
    assert state.upload("evil name.gpx", data + b"\n") == "evil name (2).gpx"
    assert sorted(p.name for p in state.courses_dir.iterdir()) == ["evil name (2).gpx", "evil name.gpx"]
    with pytest.raises(GpxParseError):
        state.upload("junk.gpx", b"hello")


def test_times_replace_only_this_course_and_removed_courses_leave_the_report(state):
    shutil.copy(FIXTURE, state.courses_dir / "a.gpx")
    shutil.copy(FIXTURE, state.courses_dir / "b.gpx")
    state.times_file.write_text("gpx,time,label\nb.gpx,1:00:00,keep\n", encoding="utf-8")
    state.set_times("courses/a.gpx", [{"label": "me", "time": "12:30"}])
    state.set_times("courses/a.gpx", [{"label": "me", "time": "12:00"}])
    assert state.times_file.read_text(encoding="utf-8").splitlines() == ["gpx,time,label", "b.gpx,1:00:00,keep", "a.gpx,0:12:00,me"]
    with pytest.raises(ValueError):
        state.set_times("courses/a.gpx", [{"time": "soon"}])
    with pytest.raises(ValueError):
        state.set_times("../outside.gpx", [])

    report = state.report()
    a = next(c for c in report["courses"] if c["name"] == "a")
    assert [(t["label"], t["seconds"]) for t in a["models"]["prod"]["times"]] == [("me", 720)]
    assert report["server"]["times_file"] == "courses/times.csv"

    state.remove("courses/a.gpx")
    assert (state.courses_dir / "_removed" / "a.gpx").exists()
    assert [c["name"] for c in state.report()["courses"]] == ["b"]


def test_server_answers_only_its_own_host_and_changes_only_with_its_header(state):
    server = ThreadingHTTPServer(("127.0.0.1", 0), serve.make_handler(state, 0))
    port = server.server_address[1]
    server.RequestHandlerClass = serve.make_handler(state, port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        def call(method, path, body=None, headers=None):
            conn = http.client.HTTPConnection("127.0.0.1", port)
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, response.read()

        assert call("GET", "/api/state")[0] == 200
        assert call("GET", "/api/state", headers={"Host": "evil.example"})[0] == 403
        data = FIXTURE.read_bytes()
        assert call("POST", "/api/upload?name=a.gpx", data)[0] == 403
        status, body = call("POST", "/api/upload?name=a.gpx", data, {"X-Lab": "1"})
        assert status == 200 and json.loads(body) == {"saved": "a.gpx"}
        status, body = call("GET", "/")
        assert status == 200 and b'"server"' in body
    finally:
        server.shutdown()
        server.server_close()
