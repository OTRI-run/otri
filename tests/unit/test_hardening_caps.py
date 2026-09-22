"""Two caps from the security review, pinned.

The GPX tag ceiling is checked before the file is parsed, and a file over it costs the server a
string count and nothing else. And the API's own origin, when it has to be read from the request,
never comes from X-Forwarded-Host: that header is the caller's to write, and the value goes into
links that are emailed.
"""

import importlib
import time
from pathlib import Path

import pytest
from starlette.requests import Request

from course.gpx import MAX_TAGS, GpxParseError, parse_track_points

app_module = importlib.import_module("api.app")
REPO = Path(__file__).resolve().parents[2]


def test_the_tag_ceiling_is_two_million():
    """Below every genuine file (a 100,000-point course with a watch's extensions is under two
    million tags) and a third below the old ceiling that let a public upload parse to 240 MB."""
    assert MAX_TAGS == 2_000_000


def test_a_file_over_the_tag_ceiling_is_refused_before_it_is_parsed():
    points = '<trkpt lat="7.0" lon="98.0"/><trkpt lat="7.01" lon="98.0"/>'
    body = f'<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>{points}</trkseg></trk><extensions>{"<a/>" * (MAX_TAGS + 1)}</extensions></gpx>'
    started = time.monotonic()
    with pytest.raises(GpxParseError, match="far more markup"):
        parse_track_points(body)
    # A refusal that parsed the tree first would take seconds; counting "<" takes milliseconds.
    assert time.monotonic() - started < 1.5


def _request(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": "https",
        "path": "/",
        "query_string": b"",
        "server": ("127.0.0.1", 8000),
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }
    return Request(scope)


def test_the_request_fallback_for_the_api_origin_ignores_x_forwarded_host(monkeypatch):
    monkeypatch.setattr(app_module, "_API_BASE_URL", "")
    request = _request({"host": "api.otri.run", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https"})
    assert app_module._api_base(request) == "https://api.otri.run"


def test_the_configured_api_origin_wins_over_any_header(monkeypatch):
    monkeypatch.setattr(app_module, "_API_BASE_URL", "https://api.otri.run")
    request = _request({"host": "evil.example", "x-forwarded-host": "evil.example"})
    assert app_module._api_base(request) == "https://api.otri.run"


def test_nginx_strips_x_forwarded_host_and_the_deploy_pins_the_origin():
    nginx = (REPO / "scripts" / "deploy" / "03-configure-nginx.sh").read_text(encoding="utf-8")
    assert 'proxy_set_header X-Forwarded-Host "";' in nginx
    deploy = (REPO / "scripts" / "deploy" / "02-deploy-app.sh").read_text(encoding="utf-8")
    assert "OTRI_API_BASE_URL=${OTRI_API_BASE_URL:-https://api.otri.run}" in deploy
