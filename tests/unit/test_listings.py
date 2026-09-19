"""Race listings: races shown publicly before anyone has uploaded results
(docs/product/race-listings.md). Facts are public, results stay behind publishing, a course
file on an unclaimed listing needs a recorded permission, and runners can ask for scores."""

from datetime import date, timedelta

import pytest

from test_api import DEMO_RESULT_001, SINGLE_CLIMB_GPX, _admin_headers, _organizer_auth_headers, client

pytestmark = pytest.mark.usefixtures("clean_state")

FUTURE = (date.today() + timedelta(days=90)).isoformat()
PAST = (date.today() - timedelta(days=200)).isoformat()


def _listing(admin, *, event_date=FUTURE, name="Doi Trail", races=None):
    payload = {
        "event_name": name,
        "event_date": event_date,
        "location": "Chiang Mai",
        "country": "THA",
        "website": "https://doitrail.example",
        "source_url": "https://calendar.example/doi-trail",
        "races": races or [{"course_name": "50K", "distance_km": 50.0, "elevation_gain_m": 2600.0}],
    }
    response = client.post("/admin/listings", json=payload, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def _public_race(name="Doi Trail", course="50K"):
    return next(r for r in client.get("/races").json() if r["event_name"] == name and r["course_name"] == course)


def test_only_admins_create_listings(monkeypatch):
    organizer = _organizer_auth_headers()
    payload = {"event_name": "X", "event_date": FUTURE, "races": [{"course_name": "10K", "distance_km": 10}]}
    assert client.post("/admin/listings", json=payload).status_code == 401
    assert client.post("/admin/listings", json=payload, headers=organizer).status_code == 403


def test_a_listing_is_public_without_results_and_says_what_it_is(monkeypatch):
    admin = _admin_headers(monkeypatch)
    assert _listing(admin) == {"created_events": 1, "created_races": 1, "skipped": [], "before_since": 0}
    race = _public_race()
    assert race["listing_status"] == "upcoming"
    assert race["is_listed"] is True and race["is_published"] is False and race["is_claimed"] is False
    assert race["official_url"] == "https://doitrail.example"
    assert race["request_count"] == 0 and race["finisher_count"] == 0

    _listing(admin, event_date=PAST, name="Old Trail")
    assert _public_race("Old Trail")["listing_status"] == "awaiting_results"


def test_adding_the_same_listing_again_adds_only_what_is_new(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)
    again = _listing(admin, name="doi trail", races=[{"course_name": "50k", "distance_km": 50.0}, {"course_name": "21K", "distance_km": 21.0, "elevation_gain_m": 900}])
    assert again["created_events"] == 0 and again["created_races"] == 1
    assert again["skipped"] == ["doi trail · 50k: already on OTRI"]


def test_listing_facts_are_validated(monkeypatch):
    admin = _admin_headers(monkeypatch)
    base = {"event_name": "Bad", "event_date": FUTURE, "races": [{"course_name": "10K", "distance_km": 10}]}
    assert client.post("/admin/listings", json={**base, "website": "javascript:alert(1)"}, headers=admin).status_code == 422
    assert client.post("/admin/listings", json={**base, "races": [{"course_name": "10K", "distance_km": 0}]}, headers=admin).status_code == 422
    assert client.post("/admin/listings", json={**base, "races": []}, headers=admin).status_code == 422


def test_csv_import_groups_rows_into_events_and_reports_bad_lines(monkeypatch):
    admin = _admin_headers(monkeypatch)
    csv_text = (
        "event_name,event_date,location,country,website,source_url,course_name,distance_km,elevation_gain_m\n"
        f"Khao Yai Trail,{FUTURE},Khao Yai,THA,https://khaoyai.example,,25K,25,1100\n"
        f"Khao Yai Trail,{FUTURE},Khao Yai,THA,https://khaoyai.example,,50K,50,2300\n"
        f"Broken Row,not-a-date,,,,,10K,10,100\n"
        f"Bad Country,{FUTURE},,THAILAND,,,10K,10,100\n"
    )
    response = client.post("/admin/listings/import", files={"file": ("listings.csv", csv_text.encode(), "text/csv")}, headers=admin)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created_events"] == 1 and body["created_races"] == 2
    assert len(body["skipped"]) == 2 and body["skipped"][0].startswith("line 4:") and "country" in body["skipped"][1]
    assert {r["course_name"] for r in client.get("/races").json() if r["event_name"] == "Khao Yai Trail"} == {"25K", "50K"}

    missing = client.post("/admin/listings/import", files={"file": ("x.csv", b"event_name,event_date\nA,2027-01-01\n", "text/csv")}, headers=admin)
    assert missing.status_code == 422 and "course_name" in missing.json()["detail"]


def test_a_course_file_on_an_unclaimed_listing_records_the_permission_when_one_is_given(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)
    race_id = _public_race()["race_id"]
    with SINGLE_CLIMB_GPX.open("rb") as handle:
        bare = client.post(f"/races/{race_id}/gpx", files={"file": ("c.gpx", handle, "application/gpx+xml")}, headers=admin)
    assert bare.status_code == 200, "the note is optional"
    assert bare.json()["course_permission"] is None and bare.json()["has_gpx"] is True

    with SINGLE_CLIMB_GPX.open("rb") as handle:
        attached = client.post(
            f"/races/{race_id}/gpx",
            files={"file": ("c.gpx", handle, "application/gpx+xml")},
            data={"course_permission": "Organizer's email of 2026-09-18: yes, show the course"},
            headers=admin,
        )
    assert attached.status_code == 200, attached.text
    assert attached.json()["course_permission"].startswith("Organizer's email")
    assert attached.json()["is_listed"] is True
    # The course of a listing is public; that is the point of listing it.
    assert client.get(f"/races/{race_id}/gpx").status_code == 200
    assert client.get(f"/races/{race_id}/measurement").status_code == 200


def test_runners_ask_for_scores_once_each(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)
    race_id = _public_race()["race_id"]
    first = client.post(f"/races/{race_id}/score-requests", json={"client_id": "browser-a"})
    assert first.status_code == 200 and first.json() == {"request_count": 1, "counted": True}
    assert client.post(f"/races/{race_id}/score-requests", json={"client_id": "browser-a"}).json() == {"request_count": 1, "counted": False}
    # Another runner on the same shared address still counts.
    assert client.post(f"/races/{race_id}/score-requests", json={"client_id": "browser-b"}).json()["request_count"] == 2
    assert client.post(f"/races/{race_id}/score-requests").json()["request_count"] == 3
    assert _public_race()["request_count"] == 3
    assert client.post("/races/nope/score-requests").status_code == 404


def test_one_address_cannot_inflate_a_race(monkeypatch):
    import importlib

    from api import rate_limit

    api_module = importlib.import_module("api.app")

    admin = _admin_headers(monkeypatch)
    _listing(admin)
    race_id = _public_race()["race_id"]
    monkeypatch.setattr(api_module, "_SCORE_REQUESTS_PER_ADDRESS", 3)
    for i in range(6):
        rate_limit.reset()
        client.post(f"/races/{race_id}/score-requests", json={"client_id": f"bot-{i}"})
    assert _public_race()["request_count"] == 3


def test_claimed_listing_goes_through_the_normal_flow_and_results_stay_private_until_published(monkeypatch):
    admin = _admin_headers(monkeypatch)
    organizer = _organizer_auth_headers("rd@doitrail.example")
    _listing(admin, event_date=PAST)
    race = _public_race()

    assert client.post(f"/admin/events/{race['event_id']}/assign", json={"organizer_email": "nobody@example.com"}, headers=admin).status_code == 404
    assigned = client.post(f"/admin/events/{race['event_id']}/assign", json={"organizer_email": "rd@doitrail.example"}, headers=admin)
    assert assigned.status_code == 200 and assigned.json()["organizer_email"] == "rd@doitrail.example"
    assert _public_race()["is_claimed"] is True
    assert [e["event_name"] for e in client.get("/events?mine=true", headers=organizer).json()] == ["Doi Trail"]

    with DEMO_RESULT_001.open("rb") as handle:
        uploaded = client.post(f"/races/{race['race_id']}/results", files={"file": ("r.csv", handle, "text/csv")}, headers=organizer)
    assert uploaded.status_code == 200, uploaded.text
    # Listed, results uploaded, not published: the public still sees a listing and no results.
    assert client.get(f"/races/{race['race_id']}/results").status_code == 403
    assert _public_race()["listing_status"] == "awaiting_results"

    assert client.post(f"/races/{race['race_id']}/publish", headers=organizer).status_code == 200
    assert _public_race()["listing_status"] == "scored"
    assert client.get(f"/races/{race['race_id']}/results").status_code == 200
    assert client.post(f"/races/{race['race_id']}/score-requests").status_code == 409


def test_an_organizer_can_list_their_own_upcoming_race_and_take_it_down():
    organizer = _organizer_auth_headers()
    event = client.post("/events", json={"event_name": "My Race", "event_date": FUTURE}, headers=organizer).json()
    race = client.post(f"/events/{event['event_id']}/races", json={"course_name": "30K", "distance_km": 30, "elevation_gain_m": 1500}, headers=organizer).json()
    assert race["listing_status"] == "private"
    assert all(r["race_id"] != race["race_id"] for r in client.get("/races").json())

    other = _organizer_auth_headers("other@example.com")
    assert client.post(f"/races/{race['race_id']}/listing", headers=other).status_code == 403
    listed = client.post(f"/races/{race['race_id']}/listing", headers=organizer)
    assert listed.status_code == 200 and listed.json()["listing_status"] == "upcoming"
    assert any(r["race_id"] == race["race_id"] for r in client.get("/races").json())

    assert client.delete(f"/races/{race['race_id']}/listing", headers=organizer).json()["listing_status"] == "private"
    assert all(r["race_id"] != race["race_id"] for r in client.get("/races").json())


def test_a_claim_is_a_report_the_admin_sees(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)
    race = _public_race()
    claim = client.post(
        "/reports",
        json={"kind": "claim", "subject_id": race["race_id"], "subject_label": "Doi Trail · 50K", "message": "I am the race director of Doi Trail.", "reporter_email": "rd@doitrail.example"},
    )
    assert claim.status_code == 201, claim.text
    assert any(r["kind"] == "claim" and r["subject_id"] == race["race_id"] for r in client.get("/admin/reports", headers=admin).json())


def test_event_names_match_loosely_but_not_across_races():
    from api.event_match import names_match, same_edition

    assert names_match("Doi Trail", "Doi Suthep Trail 2027")
    assert names_match("doi trail", "The 5th Doi Trail")
    assert names_match("Ultra-Trail Chiang Maï", "Ultra Trail Chiang Mai")
    assert names_match("Doi Suthep Trial", "Doi Suthep Trail")  # a typo
    assert not names_match("Doi Trail", "Khao Yai Trail")
    assert not names_match("Trail Marathon", "Ultra Trail")  # nothing but generic words in common
    assert not names_match("2027", "Doi Trail")

    day = date(2027, 12, 11)
    assert same_edition("Doi Trail", day, "Doi Trail 2027", day + timedelta(days=1))
    assert not same_edition("Doi Trail", day, "Doi Trail 2028", day + timedelta(days=364))


def test_creating_an_event_that_is_already_listed_offers_the_listing_to_claim(monkeypatch):
    admin = _admin_headers(monkeypatch)
    organizer = _organizer_auth_headers("rd@doitrail.example")
    _listing(admin)
    _listing(admin, name="Khao Yai Trail")
    event_id = _public_race()["event_id"]

    assert client.get(f"/events/matches?name=Doi+Suthep+Trail+2027&event_date={FUTURE}").status_code == 401
    matches = client.get(f"/events/matches?name=Doi+Suthep+Trail+2027&event_date={FUTURE}", headers=organizer).json()
    assert [(m["event_id"], m["courses"], m["is_yours"], m["claim_pending"]) for m in matches] == [(event_id, ["50K"], False, False)]
    assert client.get(f"/events/matches?name=Doi+Trail&event_date={PAST}", headers=organizer).json() == []

    # Claiming files one report for the admin, however often it is pressed, and changes no owner.
    assert client.post(f"/events/{event_id}/claim", headers=organizer).status_code == 201
    assert client.post(f"/events/{event_id}/claim", json={"message": "again"}, headers=organizer).status_code == 201
    claims = [r for r in client.get("/admin/reports", headers=admin).json() if r["kind"] == "claim"]
    assert len(claims) == 1 and claims[0]["reporter_email"] == "rd@doitrail.example" and claims[0]["payload"] == {"event_id": event_id}
    assert _public_race()["is_claimed"] is False
    assert client.get(f"/events/matches?name=Doi+Trail&event_date={FUTURE}", headers=organizer).json()[0]["claim_pending"] is True

    # Handed over by the admin, it is the organizer's own event, and nobody else can claim it.
    assert client.post(f"/admin/events/{event_id}/assign", json={"organizer_email": "rd@doitrail.example"}, headers=admin).status_code == 200
    mine = client.get(f"/events/matches?name=Doi+Trail&event_date={FUTURE}", headers=organizer).json()
    assert [(m["event_id"], m["is_yours"]) for m in mine] == [(event_id, True)]
    other = _organizer_auth_headers("other@example.com")
    assert client.get(f"/events/matches?name=Doi+Trail&event_date={FUTURE}", headers=other).json() == []
    assert client.post(f"/events/{event_id}/claim", headers=other).status_code == 409
    assert client.post(f"/events/{event_id}/claim", headers=organizer).status_code == 409
    assert client.post("/events/evt-missing/claim", headers=organizer).status_code == 404


def test_an_unlisted_private_event_is_never_offered_to_another_organizer():
    owner = _organizer_auth_headers("owner@example.com")
    client.post("/events", json={"event_name": "Secret Trail", "event_date": FUTURE}, headers=owner)
    other = _organizer_auth_headers("other@example.com")
    assert client.get(f"/events/matches?name=Secret+Trail&event_date={FUTURE}", headers=other).json() == []


def _csv_upload(admin, text, since=None):
    url = "/admin/listings/import" + (f"?since={since}" if since else "")
    response = client.post(url, files={"file": ("races.csv", text.encode("utf-8"), "text/csv")}, headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


def test_a_big_calendar_file_imports_only_the_races_from_the_chosen_day(monkeypatch):
    admin = _admin_headers(monkeypatch)
    header = "event_name,event_date,location,country,website,source_url,course_name,distance_km,elevation_gain_m\n"
    this_year = date(date.today().year, 1, 1)
    rows = []
    for i in range(1500):  # years of history ...
        rows.append(f"Old Race {i},{this_year - timedelta(days=1 + i)},Town,THA,,,21K,21,900")
    for i in range(1200):  # ... and this season: 1200 events, two distances each
        day = this_year + timedelta(days=i % 500)
        rows.append(f"Trail Number{i},{day},Town,THA,https://race{i}.example,,50K,50,2500")
        rows.append(f"Trail Number{i},{day},Town,THA,https://race{i}.example,,21K,21,900")
    result = _csv_upload(admin, header + "\n".join(rows) + "\n", since=this_year.isoformat())
    assert result == {"created_events": 1200, "created_races": 2400, "skipped": [], "before_since": 1500}

    public = client.get("/races", headers={"Accept-Encoding": "gzip"})
    assert public.headers.get("content-encoding") == "gzip"
    assert sum(1 for r in public.json() if r["event_name"].startswith("Trail Number")) == 2400
    imported = [e for e in client.get("/admin/events", headers=admin).json() if e["event_name"].startswith("Trail Number")]
    assert len(imported) == 1200 and all(e["race_count"] == 2 and [r["course_name"] for r in e["races"]] == ["21K", "50K"] for e in imported)

    # Importing the file again adds nothing, and the report of what was skipped stays readable.
    again = _csv_upload(admin, header + "\n".join(rows) + "\n", since=this_year.isoformat())
    assert again["created_events"] == 0 and again["created_races"] == 0
    assert len(again["skipped"]) == 101 and again["skipped"][-1] == "… and 2300 more"


def test_an_import_treats_the_year_and_punctuation_in_a_name_as_the_same_event(monkeypatch):
    admin = _admin_headers(monkeypatch)
    _listing(admin)  # "Doi Trail", 50K
    header = "event_name,event_date,course_name,distance_km,elevation_gain_m\n"
    result = _csv_upload(admin, header + f"Doi-Trail {FUTURE[:4]},{FUTURE},50K,50,2600\nDoi Trail,{FUTURE},21K,21,900\nBad Row,not-a-date,10K,10,100\n")
    assert result["created_events"] == 0 and result["created_races"] == 1
    assert result["skipped"][0].startswith("line 4:") and any("already on OTRI" in line for line in result["skipped"])
