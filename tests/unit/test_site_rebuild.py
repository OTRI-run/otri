"""The API asking GitHub for a site build when what is public changes (api/app.py,
request_site_rebuild): nothing without a token, one coalesced request with it.
"""

from __future__ import annotations

import importlib
import json

app_module = importlib.import_module("api.app")


class _Response:
    status = 204

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_nothing_is_sent_without_a_token(monkeypatch):
    monkeypatch.setattr(app_module, "_GITHUB_DISPATCH_TOKEN", "")
    calls = []
    monkeypatch.setattr(app_module.urllib.request, "urlopen", lambda *args, **kwargs: calls.append(args) or _Response())
    assert app_module.request_site_rebuild("publish") is False
    assert calls == []


def test_the_request_names_the_repository_and_the_event(monkeypatch):
    monkeypatch.setattr(app_module, "_GITHUB_DISPATCH_TOKEN", "ghp_test")
    monkeypatch.setattr(app_module, "_GITHUB_REPO", "OTRI-run/otri")
    captured = []
    monkeypatch.setattr(app_module.urllib.request, "urlopen", lambda request, timeout=0: captured.append(request) or _Response())
    assert app_module._send_site_rebuild("publish") is True
    request = captured[0]
    assert request.full_url == "https://api.github.com/repos/OTRI-run/otri/dispatches"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == "Bearer ghp_test"
    assert json.loads(request.data) == {"event_type": "site-rebuild", "client_payload": {"reason": "publish"}}


def test_requests_inside_the_cooldown_are_coalesced(monkeypatch):
    monkeypatch.setattr(app_module, "_GITHUB_DISPATCH_TOKEN", "ghp_test")
    monkeypatch.setattr(app_module, "_REBUILD_COOLDOWN_SECONDS", 600.0)
    monkeypatch.setattr(app_module, "_REBUILD_SETTLE_SECONDS", 0.0)
    monkeypatch.setattr(app_module, "_rebuild_last", 0.0)
    monkeypatch.setattr(app_module, "_rebuild_pending", False)
    started = []

    class _Timer:
        def __init__(self, delay, function, args=()):
            started.append(delay)
            self.daemon = False

        def start(self):
            pass

    monkeypatch.setattr(app_module.threading, "Timer", _Timer)
    assert app_module.request_site_rebuild("publish") is True, "the first request goes at once"
    assert app_module.request_site_rebuild("unpublish") is True, "the second waits for the cooldown"
    assert app_module.request_site_rebuild("listing") is True, "the third rides with the second"
    assert len(started) == 2 and started[0] == 0.0 and 0 < started[1] <= 600.0
