"""Minimal in-process rate limiting for auth endpoints (login, register, password reset).

In-memory, per-process — correct for a single-worker deployment but NOT
shared across multiple gunicorn/uvicorn worker processes. A multi-worker
production deployment should replace this with a Redis-backed limiter
(HANDBOOK.md "Recommended stack" already lists Redis). Documented as a known
gap in api/README.md rather than silently assumed solved.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_WINDOW_SECONDS = 60.0
_MAX_REQUESTS_PER_WINDOW = 10

_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request, *, max_requests: int = _MAX_REQUESTS_PER_WINDOW) -> None:
    """Raise 429 if this client has made too many requests to this endpoint recently."""
    key = f"{request.url.path}:{_client_key(request)}"
    now = time.monotonic()
    hits = _hits[key]

    while hits and now - hits[0] > _WINDOW_SECONDS:
        hits.popleft()

    if len(hits) >= max_requests:
        raise HTTPException(status_code=429, detail="too many requests, try again later")

    hits.append(now)
