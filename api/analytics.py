"""Who came to the site, counted without following anybody.

OTRI's privacy policy says there are no third-party analytics here, and the site's whole argument
is that it can be inspected. So the counting is OTRI's own, and it is built so that there is
nothing to inspect: no cookie, no identifier in the browser, no address kept, nothing that joins
one visit to another or one day to the next.

How a visitor is counted once per day without being known:

    visitor = sha256(secret + today + address + browser)

The address and the browser string go into that and are thrown away; only the digest is kept, and
only until the day is over. The date is in the digest, so the same person tomorrow is a different
number and no row can be joined to any other. This is the method the self-hosted analytics people
settled on (Plausible, Umami, Fathom) and it is what lets a site count visitors in the EU without
a consent banner: nothing here is personal data once the request has been handled.

What is kept is the count: how many visits a page had on a day, where they came from, roughly
where in the world they were and on what sort of screen. And a short list of the things worth
counting on a site like this -- a score worked out, a course measured, a race scored -- because
those say more about whether OTRI is useful than any number of page views.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

from . import db
from .auth import JWT_SECRET

# What the beacon may say, and how much of it is kept.
MAX_PATH = 120
MAX_SOURCE = 80
MAX_ZONE = 60
VISITOR_RETENTION = timedelta(days=3)  # the salt has rotated by then; the rows say nothing

# The things worth counting besides page views. A fixed list: whatever the beacon sends that is
# not one of these is dropped, so the table cannot be filled with invented names.
ACTIONS = frozenset(
    {
        "course_analysed",    # a GPX measured, which is what the calculator asks for
        "course_shared",      # a share link made
        "race_scored",        # a whole results file scored
        "race_published",     # a race made public
        "organizer_signup",   # an account created
        "embed_loaded",       # the calculator opened inside somebody else's page
    }
)

# Anything that says it is a robot. These never run a page's scripts, so few of them ever reach
# the beacon; the ones that do are the headless browsers people point at a site on purpose.
_ROBOT = re.compile(
    r"bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests"
    r"|httpx|axios|scrapy|monitor|uptime|pingdom|lighthouse|gtmetrix|preview|fetcher|archiver",
    re.I,
)

# Coarse on purpose. A screen is a phone, a tablet or a desk; a browser is one of a handful. Any
# more detail than this starts to describe a person rather than a population.
_TABLET = re.compile(r"ipad|tablet|playbook|silk|android(?!.*mobile)", re.I)
_MOBILE = re.compile(r"mobi|iphone|ipod|android|blackberry|iemobile|opera mini", re.I)
_BROWSERS = (
    ("Edge", re.compile(r"edg[ea]?/", re.I)),
    ("Opera", re.compile(r"opr/|opera", re.I)),
    ("Samsung", re.compile(r"samsungbrowser", re.I)),
    ("Firefox", re.compile(r"firefox/|fxios", re.I)),
    ("Chrome", re.compile(r"chrome/|crios", re.I)),
    ("Safari", re.compile(r"safari/", re.I)),
)

_ZONE = re.compile(r"\A[A-Za-z][A-Za-z0-9+/_-]{1,58}\Z")
_ALLOWED_PATH = re.compile(r"\A[A-Za-z0-9/_\-.#?=&]{0,119}\Z")


def is_robot(user_agent: str) -> bool:
    return bool(_ROBOT.search(user_agent or ""))


def device_of(user_agent: str) -> str:
    agent = user_agent or ""
    if _TABLET.search(agent):
        return "tablet"
    if _MOBILE.search(agent):
        return "mobile"
    return "desktop"


def browser_of(user_agent: str) -> str:
    for name, pattern in _BROWSERS:
        if pattern.search(user_agent or ""):
            return name
    return "Other"


def visitor_key(address: str, user_agent: str, day: date) -> str:
    """One visitor, for one day, as a number nobody can turn back into a person.

    The day is inside the digest, so the same person tomorrow hashes to something else and the two
    rows cannot be joined. Nothing that went in is stored.
    """
    material = f"{JWT_SECRET}|{day.isoformat()}|{address}|{user_agent}".encode("utf-8", "replace")
    return hashlib.sha256(material).hexdigest()[:32]


def clean_path(value: str) -> str:
    """The page, as a path of this site. Anything with an id in it becomes the shape of the page:
    one row for every race page is a list of which races were looked at, which is more than a
    count of visits needs to know."""
    path = (value or "/").strip()[:MAX_PATH]
    if not path.startswith("/"):
        path = "/" + path
    if not _ALLOWED_PATH.match(path):
        return "/other"
    path = re.sub(r"(evt|race|run)-[0-9a-z]{4,}", r"\1-…", path)
    path = re.sub(r"\b[0-9a-f]{12,}\b", "…", path)
    path = re.sub(r"[?&]t=\d+", "", path)
    return path[:MAX_PATH] or "/"


def clean_source(referrer: str, own_hosts: set[str]) -> str:
    """Where the visit came from: a host, never a full address. A search engine's query string is
    the visitor's own words, and OTRI has no business keeping those."""
    referrer = (referrer or "").strip()[:500]
    if not referrer:
        return "direct"
    try:
        host = (urlsplit(referrer).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return "direct"
    if not host or host in own_hosts:
        return "direct"
    return host[:MAX_SOURCE]


def clean_zone(value: str) -> str:
    """The browser's own time zone, which is as close to "where" as this gets. It is coarse, it is
    the same for a whole region, and it needs no address lookup and no third party."""
    zone = (value or "").strip()[:MAX_ZONE]
    return zone if _ZONE.match(zone) else ""


def record(*, address: str, user_agent: str, path: str, referrer: str, zone: str, own_hosts: set[str], action: str | None = None) -> bool:
    """One beacon. False when it was not counted (a robot, or an action nobody asked for)."""
    if is_robot(user_agent):
        return False
    today = datetime.now(timezone.utc).date()
    if action is not None:
        if action not in ACTIONS:
            return False
        db.record_site_action(today, action)
        return True
    db.record_site_hit(
        day=today,
        path=clean_path(path),
        source=clean_source(referrer, own_hosts),
        zone=clean_zone(zone),
        device=device_of(user_agent),
        browser=browser_of(user_agent),
        visitor=visitor_key(address, user_agent, today),
    )
    return True


def count(action: str) -> None:
    """Count something the API itself watched happen. Better than asking the page to report it:
    the server cannot be told a lie about its own work, and it holds when scripts do not run."""
    if action not in ACTIONS:
        return
    try:
        db.record_site_action(datetime.now(timezone.utc).date(), action)
    except Exception as error:  # noqa: BLE001 - counting is never why a request fails
        print(f"analytics.count({action}): {error!r}")


def summary(days: int = 30) -> dict:
    """What the admin page shows: a day-by-day line, and the top of each list beside it."""
    days = max(1, min(days, 365))
    since = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    return db.site_traffic(since)
