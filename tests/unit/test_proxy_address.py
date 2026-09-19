"""Which address the rate limiter and the sign-in locks see, behind nginx.

They key on `request.client.host`. In production that is set by uvicorn's proxy-headers middleware
from X-Forwarded-For, trusting only the proxy on 127.0.0.1 (gunicorn's default
`forwarded_allow_ips`), and nginx appends the address it really saw to whatever the client sent
(`$proxy_add_x_forwarded_for`, scripts/deploy/03-configure-nginx.sh). A client can therefore write
anything into the header and still be counted under its own address. Checked on production too
(a forged header was ignored); this pins it, because the dependencies are not pinned."""

import importlib
from pathlib import Path

import pytest
from starlette.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from api import db, rate_limit

app_module = importlib.import_module("api.app")
pytestmark = pytest.mark.usefixtures("clean_state")
REPO = Path(__file__).resolve().parents[2]


def _behind_nginx(headers):
    """The app as gunicorn runs it: the peer is nginx on loopback, the headers are what nginx sends."""
    wrapped = ProxyHeadersMiddleware(app_module.app, trusted_hosts="127.0.0.1")
    client = TestClient(wrapped, client=("127.0.0.1", 40000))
    return client.post("/auth/login", json={"email": "nobody@example.com", "password": "not-the-password-1"}, headers=headers)


def _sources():
    with db.get_connection() as connection:
        return {row["key"].split(":", 1)[1] for row in connection.execute("SELECT key FROM rate_limits WHERE key LIKE '/auth/login:%'").fetchall()}


def test_a_forged_forwarded_header_does_not_change_whose_attempts_are_counted():
    # The client wrote 198.51.100.77 into the header; nginx appended the address it saw.
    assert _behind_nginx({"X-Forwarded-For": "198.51.100.77, 203.0.113.9"}).status_code == 401
    assert _sources() == {"203.0.113.9"}
    # However many the client invents, and whatever it claims about loopback.
    rate_limit.reset()
    _behind_nginx({"X-Forwarded-For": "127.0.0.1, 10.0.0.1, 198.51.100.77, 203.0.113.9"})
    assert _sources() == {"203.0.113.9"}


def test_a_request_that_did_not_come_through_the_proxy_cannot_name_its_own_address():
    wrapped = ProxyHeadersMiddleware(app_module.app, trusted_hosts="127.0.0.1")
    direct = TestClient(wrapped, client=("192.0.2.50", 40000))
    direct.post("/auth/login", json={"email": "nobody@example.com", "password": "not-the-password-1"}, headers={"X-Forwarded-For": "198.51.100.77"})
    assert _sources() == {"192.0.2.50"}


def test_nginx_appends_the_address_it_saw_and_the_api_listens_on_loopback_only():
    nginx = (REPO / "scripts" / "deploy" / "03-configure-nginx.sh").read_text(encoding="utf-8")
    assert "proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;" in nginx
    unit = (REPO / "scripts" / "deploy" / "10-install-service.sh").read_text(encoding="utf-8")
    assert "--bind 127.0.0.1:8000" in unit and "forwarded-allow-ips" not in unit, "nobody widened the default trust (127.0.0.1)"
