"""Who a runner is, and what leaves the building without being asked.

A name key that kept only the characters surviving a conversion to ASCII made every runner whose
name is not written in Latin script share one identity. A counted page address carried whatever was
in the URL, and on one page that is a live password-reset token. A field the account page promises
is private was published whenever another one was blank. And a ranking "by index" ranked whoever
came first in the alphabet.
"""

from __future__ import annotations

import importlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from api import analytics, db

app_module = importlib.import_module("api.app")

from test_api import _create_event_and_race, _organizer_auth_headers, _publish_results  # noqa: E402

client = TestClient(app_module.app)
pytestmark = pytest.mark.usefixtures("clean_state")

ZHANG, WEI = "张", "伟"      # 张 伟
LI, NA = "李", "娜"          # 李 娜


def _verified(email):
    headers = _organizer_auth_headers(email)
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))
    return headers


# --- A name in any script is a name ------------------------------------------------------------


def test_names_in_other_scripts_keep_their_own_key():
    """Encoding to ASCII and dropping what would not fit turned every one of these into ''."""
    keys = {
        db.runner_name_key(ZHANG, WEI, "M"),
        db.runner_name_key(LI, NA, "F"),
        db.runner_name_key("Анна", "Петрова", "F"),
        db.runner_name_key("สมชาย", "วิชัย", "M"),
    }
    assert len(keys) == 4, f"different people share a key: {keys}"
    assert all(key.split("|")[0] for key in keys), "a family name was thrown away"


def test_accents_still_fold_together():
    """The reason the old code folded at all, and it still has to work."""
    assert db.runner_name_key("Müller", "Ann", "F") == db.runner_name_key("Muller", "Ann", "F")
    assert db.runner_name_key("Nguyễn", "An", "M") == db.runner_name_key("Nguyen", "An", "M")


def test_two_different_runners_in_the_same_script_stay_two_runners():
    headers = _verified("scripts@example.com")
    csv = f"Rank,Time,Last name,First name,Gender,Year\n1,2:00:00,{ZHANG},{WEI},M,1990\n2,2:05:00,{LI},{NA},M,1990\n"
    race_id = _publish_results(headers, csv)
    rows = client.get(f"/races/{race_id}/results").json()
    runner_ids = {row["runner_id"] for row in rows if row["runner_id"]}
    assert len(runner_ids) == 2, "two people were merged into one profile"


def test_a_row_with_no_name_left_does_not_collect_other_people():
    headers = _verified("nameless@example.com")
    _, race_id = _create_event_and_race(headers)
    csv = b"Rank,Time,Last name,First name,Gender,Year\n1,5:10:00,-,-,M,1990\n2,5:20:00,.,.,M,1990\n"
    assert client.post(f"/races/{race_id}/results", files={"file": ("r.csv", csv, "text/csv")}, headers=headers).status_code == 200
    with db.get_connection() as connection:
        rows = connection.execute("SELECT DISTINCT runner_id FROM results WHERE race_id = %s", (race_id,)).fetchall()
    assert len(rows) == 2, "rows with no usable name were gathered into one runner"


# --- A counted page address is a route, not a secret -------------------------------------------


def test_a_reset_token_is_not_counted():
    """The organizer app routes on the fragment, so this page address carries a live token."""
    counted = analytics.clean_path("/prototype/organizer/#/reset?token=AbC-123_xyzAbC123xyzAbC")
    assert counted == "/prototype/organizer/#/reset"
    assert "token" not in counted


def test_no_counted_address_keeps_a_query_string():
    for raw in (
        "/prototype/?verify_email=AbC-123_xyz",
        "/prototype/organizer/#/login?challenge=abcdef123456",
        "/prototype/#races?country=THA",
    ):
        assert "?" not in analytics.clean_path(raw), raw


def test_the_shape_of_a_page_is_still_counted():
    assert analytics.clean_path("/prototype/#races/race-abc123def") == "/prototype/#races/race-…"
    assert analytics.clean_path("/prototype/organizer/#/events") == "/prototype/organizer/#/events"


# --- What the account page calls private stays private -----------------------------------------


def test_an_organizer_name_is_not_published_when_the_organization_is_blank():
    """The profile form promises "Your name" is shown to admins only. The public race query used
    to fall back to it whenever the organization was empty."""
    headers = _verified("private-name@example.com")
    assert client.patch("/auth/profile", json={"display_name": "Ann Real-Person", "organization": ""}, headers=headers).status_code == 200
    race_id = _publish_results(headers, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Finisher,Fay,F\n")

    public = client.get(f"/races/{race_id}").json()
    assert public.get("organizer_display") in (None, ""), public.get("organizer_display")
    assert "Ann Real-Person" not in client.get(f"/races/{race_id}").text


def test_an_organization_is_still_published():
    headers = _verified("public-org@example.com")
    assert client.patch("/auth/profile", json={"organization": "Doi Trail Club"}, headers=headers).status_code == 200
    race_id = _publish_results(headers, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Finisher,Fay,F\n")
    assert client.get(f"/races/{race_id}").json()["organizer_display"] == "Doi Trail Club"


# --- Taking a race down takes back what it gave ------------------------------------------------


def test_unpublishing_takes_back_the_details_it_contributed():
    """Publishing copies a year of birth and a nationality onto the shared runner record, which
    the public reads through the runner's other races. Unpublishing left them there."""
    headers = _verified("derived@example.com")
    plain = _publish_results(headers, "Rank,Time,Last name,First name,Gender\n1,2:00:00,Reveal,Rae,F\n", event_date="2026-02-01")
    detailed = _publish_results(
        headers,
        "Rank,Time,Last name,First name,Gender,Year,Nationality\n1,2:01:00,Reveal,Rae,F,1991,THA\n",
        event_date="2026-03-01",
    )
    runner_id = next(row["runner_id"] for row in client.get(f"/races/{plain}/results").json() if row["runner_id"])
    assert client.get(f"/runners/{runner_id}").json()["nationality"] == "THA"

    assert client.delete(f"/races/{detailed}/publish", headers=headers).status_code == 200
    profile = client.get(f"/runners/{runner_id}").json()
    assert profile["nationality"] is None, "the nationality stayed public after its race came down"
    assert profile["age_category"] is None, "the year of birth stayed public after its race came down"


# --- A ranking ranks everybody ------------------------------------------------------------------


def test_the_strongest_runner_is_in_the_ranking_whatever_their_name():
    """The list was cut to 500 in alphabetical order and only then ranked, so a strong runner whose
    name comes late could be missing from a table headed "by index"."""
    headers = _verified("ranking@example.com")
    # More than the 500 the database used to hand over, so the alphabetical cut really bites.
    rows = ["Rank,Time,Last name,First name,Gender"]
    rows.append("1,2:30:00,Zzz,Fastest,M")  # quickest, and last in the alphabet
    for i in range(560):
        rows.append(f"{i + 2},{4 + i // 60}:{i % 60:02d}:00,Aaa{i:03d},Runner,M")
    race_id = _publish_results(headers, "\n".join(rows) + "\n")
    assert race_id

    listed = client.get("/runners", params={"limit": 500}).json()
    names = [runner["family_name"] for runner in listed]
    assert "Zzz" in names, "the quickest runner was cut away before anything was ranked"
    assert names.index("Zzz") < names.index("Aaa000"), "the list is not ordered by index"
    assert len(listed) <= 500, "limit is still a page size"


# --- A day's visitor count outlives the digests it was counted from -----------------------------


def test_the_visitor_count_survives_the_digests_being_pruned():
    today = date.today()
    for visitor in ("digest-a", "digest-b"):
        db.record_site_hit(day=today, path="/", source="", zone="", device="desk", browser="Other", visitor=visitor)
    assert db.prune_site_visitors(today + timedelta(days=1)) >= 2, "the digests were not pruned"

    by_day = {row["day"]: row["visitors"] for row in db.site_traffic(today - timedelta(days=30))["by_day"]}
    assert by_day[today.isoformat()] == 2, "a day older than the digests reports nobody"
