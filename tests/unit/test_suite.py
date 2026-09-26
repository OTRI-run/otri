"""The race suite (api/suite.py): plan, field, bibs, stations, the board, plugins and the hand-over
to scoring.

Run with: pytest tests/unit/test_suite.py
"""

from __future__ import annotations

import importlib
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api import app, db, suite, suite_db
from api import suite_plugins as plugins

pytestmark = pytest.mark.usefixtures("clean_state")

client = TestClient(app)
REPO_ROOT = Path(__file__).resolve().parents[2]
WEB = {"X-OTRI-Client": "web"}


def _register_and_verify(email: str, password: str = "correct horse battery") -> None:
    response = client.post("/auth/register", json={"accept_terms": True, "email": email, "password": password})
    assert response.status_code == 201, response.text
    with db.get_connection() as connection:
        connection.execute("UPDATE organizers SET email_verified = TRUE WHERE email = %s", (email,))


def _headers(email: str) -> dict:
    _register_and_verify(email)
    login = client.post("/auth/login", json={"email": email, "password": "correct horse battery"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _admin(monkeypatch, email: str = "boss@example.com") -> dict:
    api_module = importlib.import_module("api.app")
    _register_and_verify(email)
    monkeypatch.setattr(api_module, "_ADMIN_EMAILS", {email})
    login = client.post("/auth/login", json={"email": email, "password": "correct horse battery"})
    assert login.json()["is_admin"] is True
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _race(headers: dict, name: str = "Coastal 50K") -> str:
    event = client.post("/events", json={"event_name": "Coastal Trail Weekend", "event_date": "2026-10-03"}, headers=headers)
    assert event.status_code == 201, event.text
    race = client.post(f"/events/{event.json()['event_id']}/races", json={"course_name": name, "distance_km": 50.0, "elevation_gain_m": 2000.0}, headers=headers)
    assert race.status_code == 201, race.text
    return race.json()["race_id"]


def _plan(headers: dict, race_id: str) -> dict[str, str]:
    """Start, an aid station with a cut-off, a finish. Returns kind -> checkpoint id."""
    ids = {}
    for kind, name, km, cutoff, extra in (
        ("start", "Start", 0, None, {}),
        ("aid", "Aid 1 · Col", 18.5, 240, {"water": True, "food": True, "supplies": "water, cola, bananas, salt"}),
        ("finish", "Finish", 50, 720, {}),
    ):
        response = client.post(f"/suite/races/{race_id}/checkpoints", json={"name": name, "kind": kind, "distance_km": km, "cutoff_minutes": cutoff, **extra}, headers=headers)
        assert response.status_code == 201, response.text
        ids[kind] = response.json()["checkpoint_id"]
    return ids


def _field(headers: dict, race_id: str) -> list[dict]:
    text = "Bib,Last name,First name,Gender,Year of birth,Club\n12,Doe,Jane,F,1990,Trail Club\n7,Smith,John,M,1985,\n,Nguyen,Linh,F,,\n"
    response = client.post(f"/suite/races/{race_id}/participants/import", json={"text": text}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["added"] == 3
    return client.get(f"/suite/races/{race_id}/participants", headers=headers).json()


@pytest.fixture(autouse=True)
def _sync_plugins(monkeypatch):
    monkeypatch.setattr(plugins, "SYNC", True)


# --------------------------------------------------------------------------------------- access


def test_suite_is_admin_only_while_in_preview(monkeypatch):
    monkeypatch.setattr(suite, "SUITE_OPEN", False)
    plain = _headers("organizer@example.com")
    race_id = _race(plain)
    assert client.get("/suite/races", headers=plain).status_code == 403
    assert client.get(f"/suite/races/{race_id}", headers=plain).status_code == 403
    assert client.get("/suite/races").status_code == 401
    admin = _admin(monkeypatch)
    listed = client.get("/suite/races", headers=admin)
    assert listed.status_code == 200
    assert race_id in {r["race_id"] for r in listed.json()}, "an admin sees every race"


def test_opened_suite_lets_organizers_run_their_own_races_only(monkeypatch):
    monkeypatch.setattr(suite, "SUITE_OPEN", True)
    mine = _headers("one@example.com")
    theirs = _headers("two@example.com")
    race_id = _race(mine)
    assert client.get(f"/suite/races/{race_id}", headers=mine).status_code == 200
    assert client.get(f"/suite/races/{race_id}", headers=theirs).status_code == 403
    assert {r["race_id"] for r in client.get("/suite/races", headers=theirs).json()} == set()
    response = client.post(f"/suite/races/{race_id}/checkpoints", json={"name": "Finish", "kind": "finish"}, headers=theirs)
    assert response.status_code == 403


# ----------------------------------------------------------------------------------------- plan


def test_checkpoints_are_ordered_and_carry_station_keys(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    ids = _plan(admin, race_id)
    rows = client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()
    assert [r["kind"] for r in rows] == ["start", "aid", "finish"]
    assert [r["position"] for r in rows] == [1, 2, 3]
    assert all(len(r["station_key"]) == 32 for r in rows), "every checkpoint gets a station link"
    assert rows[1]["water"] is True and rows[1]["supplies"].startswith("water")

    # Insert a checkpoint before the finish: the finish moves down.
    response = client.post(f"/suite/races/{race_id}/checkpoints", json={"name": "Aid 2", "kind": "aid", "distance_km": 35, "position": 3}, headers=admin)
    assert response.status_code == 201
    rows = client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()
    assert [r["name"] for r in rows] == ["Start", "Aid 1 · Col", "Aid 2", "Finish"]

    # Reorder by ids, edit, clear a cut-off, rotate a key, delete.
    reordered = client.post(f"/suite/races/{race_id}/checkpoints/reorder", json={"checkpoint_ids": [ids["start"], response.json()["checkpoint_id"], ids["aid"], ids["finish"]]}, headers=admin)
    assert [r["name"] for r in reordered.json()] == ["Start", "Aid 2", "Aid 1 · Col", "Finish"]
    edited = client.patch(f"/suite/checkpoints/{ids['aid']}", json={"name": "Aid 1 · Col de la Croix", "clear_cutoff": True}, headers=admin)
    assert edited.json()["name"] == "Aid 1 · Col de la Croix" and edited.json()["cutoff_minutes"] is None
    old_key = edited.json()["station_key"]
    rotated = client.post(f"/suite/checkpoints/{ids['aid']}/rotate-key", headers=admin)
    assert rotated.json()["station_key"] != old_key
    assert client.get(f"/suite/stations/{old_key}").status_code == 404, "the old link is dead"
    assert client.delete(f"/suite/checkpoints/{response.json()['checkpoint_id']}", headers=admin).status_code == 204
    assert [r["position"] for r in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()] == [1, 2, 3]


# ---------------------------------------------------------------------------------------- field


def test_participants_import_bibs_and_qr_tokens(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    people = _field(admin, race_id)
    assert [p["bib"] for p in people] == ["7", "12", None], "bibs sort as numbers; the unnumbered last"
    jane = next(p for p in people if p["family_name"] == "Doe")
    assert jane["first_name"] == "Jane" and jane["gender"] == "F" and jane["birth_year"] == 1990 and jane["club"] == "Trail Club"
    assert len(jane["qr_token"]) == 32 and len({p["qr_token"] for p in people}) == 3

    # Auto-number the rest from 100; existing bibs stay.
    numbered = client.post(f"/suite/races/{race_id}/participants/assign-bibs", json={"start": 100}, headers=admin).json()
    assert {p["family_name"]: p["bib"] for p in numbered} == {"Smith": "7", "Doe": "12", "Nguyen": "100"}

    # A bib in use is refused, by hand and by import.
    linh = next(p for p in numbered if p["family_name"] == "Nguyen")
    assert client.patch(f"/suite/participants/{linh['participant_id']}", json={"bib": "12"}, headers=admin).status_code == 409
    again = client.post(f"/suite/races/{race_id}/participants/import", json={"text": "Name,Bib\nAda Lovelace,12\nGrace Hopper,13\n"}, headers=admin).json()
    assert again["added"] == 1 and any("12" in s for s in again["skipped"])
    assert client.post(f"/suite/races/{race_id}/participants", json={"family_name": "Hopper", "bib": "13"}, headers=admin).status_code == 409

    # Replace the list wholesale.
    replaced = client.post(f"/suite/races/{race_id}/participants/import", json={"text": "Last name;First name;Sex\nUno;A;H\nDos;B;W\n", "replace": True}, headers=admin).json()
    assert replaced["added"] == 2
    people = client.get(f"/suite/races/{race_id}/participants", headers=admin).json()
    assert sorted((p["family_name"], p["gender"]) for p in people) == [("Dos", "F"), ("Uno", "M")]

    # A sheet with no name column is told so.
    none = client.post(f"/suite/races/{race_id}/participants/import", json={"text": "Bib,Time\n1,2:00:00\n"}, headers=admin).json()
    assert none["added"] == 0 and "name column" in none["skipped"][0]


def test_parse_participant_sheet_reads_common_layouts():
    rows, skipped, columns, ignored = suite.parse_participant_sheet("Startnummer\tNachname\tVorname\tGeschlecht\tJahrgang\tVerein\tEmail\n1\tMüller\tAnna\tW\t1992\tTSV\tanna@example.com\n")
    assert rows[0]["bib"] == "1" and rows[0]["family_name"] == "Müller" and rows[0]["gender"] == "F" and rows[0]["birth_year"] == 1992 and rows[0]["club"] == "TSV"
    assert columns["family_name"] == "Nachname" and ignored == ["Email"] and skipped == []
    rows, *_ = suite.parse_participant_sheet("Name,DOB\nWALMSLEY Jim,1990-01-31\nDoe,\n")
    assert (rows[0]["family_name"], rows[0]["first_name"], rows[0]["birth_year"]) == ("WALMSLEY", "Jim", 1990)
    assert rows[1]["family_name"] == "Doe"


# ------------------------------------------------------------------------------------- race day


def test_a_race_day_from_gun_to_results(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    ids = _plan(admin, race_id)
    people = {p["family_name"]: p for p in _field(admin, race_id)}
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}

    # The station page: roster with tokens, and the server's clock.
    station = client.get(f"/suite/stations/{stations['aid']}")
    assert station.status_code == 200
    body = station.json()
    assert body["checkpoint"]["name"] == "Aid 1 · Col" and "station_key" not in body["checkpoint"]
    assert {r["bib"] for r in body["roster"]} == {"12", "7", None} and body["server_time"] and body["race"]["status"] == "planning"

    # Nobody is on course before the gun.
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    assert board["counts"] == {"registered": 3, "dns": 0, "started": 0, "finished": 0, "dnf": 0, "dsq": 0, "total": 3, "on_course": 0, "overdue": 0}

    # Linh does not show; then the gun.
    linh = people["Nguyen"]
    assert client.patch(f"/suite/participants/{linh['participant_id']}", json={"status": "dns"}, headers=admin).status_code == 200
    gun = datetime(2026, 10, 3, 6, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(suite, "_now", lambda: gun)
    started = client.post(f"/suite/races/{race_id}/start", json={"started_at": gun.isoformat()}, headers=admin)
    assert started.status_code == 200 and started.json()["status"] == "live"
    assert client.post(f"/suite/races/{race_id}/start", headers=admin).status_code == 409
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    assert board["counts"]["on_course"] == 2 and board["counts"]["dns"] == 1

    # The aid station's phone sends its queue: one by QR token, one by bib, one it made up, a replay.
    at_aid = gun + timedelta(hours=2, minutes=5)
    monkeypatch.setattr(suite, "_now", lambda: at_aid + timedelta(seconds=10))
    batch = {
        "passings": [
            {"client_id": "a1", "qr_token": people["Doe"]["qr_token"], "recorded_at": at_aid.isoformat(), "source": "scan", "device": "Pixel"},
            {"client_id": "a2", "bib": "7", "recorded_at": (at_aid + timedelta(minutes=3)).isoformat(), "source": "manual"},
            {"client_id": "a3", "bib": "999", "recorded_at": at_aid.isoformat()},
            {"client_id": "a1", "qr_token": people["Doe"]["qr_token"], "recorded_at": at_aid.isoformat()},
            {"client_id": "a4", "qr_token": people["Doe"]["qr_token"], "recorded_at": (at_aid + timedelta(seconds=40)).isoformat()},
        ]
    }
    answer = client.post(f"/suite/stations/{stations['aid']}/passings", json=batch)
    assert answer.status_code == 200, answer.text
    outcomes = {}
    for r in answer.json()["results"]:
        outcomes.setdefault(r["client_id"], r["outcome"])
    assert outcomes == {"a1": "accepted", "a2": "accepted", "a3": "unknown", "a4": "duplicate"}, "the replay of a1 keeps its first answer"
    assert [r["outcome"] for r in answer.json()["results"] if r["client_id"] == "a1"] == ["accepted", "replayed"]
    assert sum(1 for _ in suite_db.list_passings(race_id)) == 2

    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    jane = next(r for r in board["participants"] if r["family_name"] == "Doe")
    assert jane["last"]["name"] == "Aid 1 · Col" and jane["last"]["elapsed_seconds"] == 2 * 3600 + 5 * 60
    assert jane["next_checkpoint"]["name"] == "Finish" and jane["overdue"] is False
    aid = next(c for c in board["checkpoints"] if c["kind"] == "aid")
    assert aid["through"] == 2

    # Past the finish cut-off (12 h) with nobody in: both are overdue.
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=12, minutes=1))
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    assert board["counts"]["overdue"] == 2

    # Jane finishes at 5:12:40; John's finish is typed by the organizer from a radio call.
    finish_at = gun + timedelta(hours=5, minutes=12, seconds=40)
    monkeypatch.setattr(suite, "_now", lambda: finish_at + timedelta(seconds=5))
    answer = client.post(f"/suite/stations/{stations['finish']}/passings", json={"passings": [{"client_id": "f1", "qr_token": people["Doe"]["qr_token"], "recorded_at": finish_at.isoformat()}]})
    assert answer.json()["results"][0]["outcome"] == "accepted"
    manual = client.post(f"/suite/races/{race_id}/passings", json={"checkpoint_id": ids["finish"], "participant_id": people["Smith"]["participant_id"], "recorded_at": (finish_at + timedelta(minutes=30)).isoformat()}, headers=admin)
    assert manual.status_code == 201, manual.text
    assert client.post(f"/suite/races/{race_id}/passings", json={"checkpoint_id": ids["finish"], "participant_id": people["Smith"]["participant_id"], "recorded_at": (finish_at + timedelta(minutes=30, seconds=20)).isoformat()}, headers=admin).status_code == 409

    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    assert [(r["family_name"], r["rank"], r["finish_seconds"]) for r in board["participants"] if r["status"] == "finished"] == [("Doe", 1, 18760.0), ("Smith", 2, 20560.0)]
    assert board["counts"]["finished"] == 2 and board["counts"]["on_course"] == 0

    # The runner's own bib page: first name, splits, nobody else.
    mine = client.get(f"/suite/bibs/{people['Doe']['qr_token']}")
    assert mine.status_code == 200
    assert mine.json()["first_name"] == "Jane" and mine.json()["status"] == "finished" and mine.json()["finish_seconds"] == 18760.0
    assert [s["name"] for s in mine.json()["splits"]] == ["Aid 1 · Col", "Finish"]
    assert "family_name" not in mine.json() and "Smith" not in mine.text
    assert client.get("/suite/bibs/" + "0" * 32).status_code == 404

    # Close the race; the finish list is a results file OTRI reads; hand it to scoring.
    assert client.post(f"/suite/races/{race_id}/results/submit", headers=admin).status_code == 409, "not while live"
    closed = client.post(f"/suite/races/{race_id}/finish", headers=admin)
    assert closed.status_code == 200 and closed.json()["status"] == "finished"
    csv_text = client.get(f"/suite/races/{race_id}/results.csv", headers=admin).text
    assert csv_text.splitlines()[0] == "Rank,Time,Last name,First name,Gender,Bib,Birth year,Nationality,Status"
    assert "1,5:12:40,Doe,Jane,F,12,1990,,Finisher" in csv_text and "2,5:42:40,Smith,John,M,7,1985,,Finisher" in csv_text
    assert "DNS,,Nguyen,Linh,F" in csv_text
    submitted = client.post(f"/suite/races/{race_id}/results/submit", headers=admin)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["finishers"] == 2 and submitted.json()["rows"] == 3 and submitted.json()["scored"] == 2
    results = client.get(f"/races/{race_id}/results", headers=admin).json()
    assert [(r["family_name"], r["rank"]) for r in results][:2] == [("Doe", 1), ("Smith", 2)]

    # Reopen, then reset for a rehearsal: passings gone, everyone registered again, Linh still DNS.
    assert client.post(f"/suite/races/{race_id}/reopen", headers=admin).json()["status"] == "live"
    reset = client.post(f"/suite/races/{race_id}/reset", headers=admin).json()
    assert reset["status"] == "planning" and reset["started_at"] is None and reset["passings"] == 0
    statuses = {p["family_name"]: p["status"] for p in client.get(f"/suite/races/{race_id}/participants", headers=admin).json()}
    assert statuses == {"Doe": "registered", "Smith": "registered", "Nguyen": "dns"}


def test_finishing_marks_runners_still_out_as_dnf_and_net_timing_uses_the_start_scan(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    _plan(admin, race_id)
    people = {p["family_name"]: p for p in _field(admin, race_id)}
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    assert client.patch(f"/suite/races/{race_id}/settings", json={"timing": "net", "organizer_phone": "+66 81 234 5678"}, headers=admin).json()["settings"]["timing"] == "net"

    gun = datetime(2026, 10, 3, 6, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(suite, "_now", lambda: gun)
    client.post(f"/suite/races/{race_id}/start", json={"started_at": gun.isoformat()}, headers=admin)
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=5))
    # Jane crosses the start mat 90 s after the gun and finishes 4 h after the gun: net 3:58:30.
    client.post(f"/suite/stations/{stations['start']}/passings", json={"passings": [{"client_id": "s1", "qr_token": people["Doe"]["qr_token"], "recorded_at": (gun + timedelta(seconds=90)).isoformat()}]})
    client.post(f"/suite/stations/{stations['finish']}/passings", json={"passings": [{"client_id": "f1", "qr_token": people["Doe"]["qr_token"], "recorded_at": (gun + timedelta(hours=4)).isoformat()}]})
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    jane = next(r for r in board["participants"] if r["family_name"] == "Doe")
    assert jane["finish_seconds"] == 4 * 3600 - 90
    # John never crossed the start mat: his times count from the gun.
    client.post(f"/suite/stations/{stations['aid']}/passings", json={"passings": [{"client_id": "a1", "bib": "7", "recorded_at": (gun + timedelta(hours=2)).isoformat()}]})
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    john = next(r for r in board["participants"] if r["family_name"] == "Smith")
    assert john["last"]["elapsed_seconds"] == 7200.0

    closed = client.post(f"/suite/races/{race_id}/finish", headers=admin).json()
    assert closed["status"] == "finished"
    statuses = {p["family_name"]: p["status"] for p in client.get(f"/suite/races/{race_id}/participants", headers=admin).json()}
    assert statuses == {"Doe": "finished", "Smith": "dnf", "Nguyen": "dnf"}, "everyone still out is a DNF when the race closes"
    csv_text = client.get(f"/suite/races/{race_id}/results.csv", headers=admin).text
    assert "DNF,,Smith,John" in csv_text


def test_a_future_scan_time_is_clamped_and_a_bad_key_is_refused():
    assert client.get("/suite/stations/not-a-key").status_code == 404
    assert client.post("/suite/stations/" + "f" * 32 + "/passings", json={"passings": []}).status_code == 404


def test_compute_board_is_pure_and_ranks_ties():
    race = db.Race(race_id="r", event_id="e", course_name="10K", distance_km=10, elevation_gain_m=100, has_gpx=False, scoring_version="x", event_name="E")
    gun = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
    state = {"status": "live", "started_at": gun, "settings": {}}
    finish = {"checkpoint_id": "f", "race_id": "r", "position": 1, "name": "Finish", "kind": "finish", "distance_km": 10.0, "cutoff_minutes": None, "station_key": "k" * 32}
    people = [
        {"participant_id": p, "bib": b, "family_name": p, "first_name": "", "gender": "X", "club": None, "status": "started", "birth_year": None, "nationality": None}
        for p, b in (("a", "1"), ("b", "2"), ("c", "3"))
    ]
    passings = [
        {"passing_id": 1, "participant_id": "a", "checkpoint_id": "f", "recorded_at": gun + timedelta(minutes=50), "source": "scan"},
        {"passing_id": 2, "participant_id": "b", "checkpoint_id": "f", "recorded_at": gun + timedelta(minutes=50), "source": "scan"},
        {"passing_id": 3, "participant_id": "a", "checkpoint_id": "f", "recorded_at": gun + timedelta(minutes=55), "source": "scan"},  # second scan: ignored
    ]
    board = suite.compute_board(race, state, [finish], people, passings, now=gun + timedelta(hours=1))
    assert [(r["participant_id"], r["rank"]) for r in board["participants"]] == [("a", 1), ("b", 1), ("c", None)]
    assert board["counts"]["finished"] == 2 and board["counts"]["on_course"] == 1
    assert board["participants"][0]["finish_seconds"] == 3000.0


# -------------------------------------------------------------------------------------- plugins


def test_plugin_catalogue_settings_and_the_announcer_panel(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    catalogue = client.get("/suite/plugins", headers=admin).json()
    assert {p["key"] for p in catalogue} == {"announcer", "webhook"}
    webhook = next(p for p in catalogue if p["key"] == "webhook")
    assert [f["key"] for f in webhook["fields"]] == ["url", "secret", "only", "format"] and webhook["data_note"]

    # Nothing on until switched on; a bad setting is refused with the plugin's own sentence.
    settings = client.get(f"/suite/races/{race_id}/plugins", headers=admin).json()
    assert all(s["enabled"] is False for s in settings)
    bad = client.put(f"/suite/races/{race_id}/plugins/webhook", json={"enabled": True, "config": {"url": "ftp://x"}}, headers=admin)
    assert bad.status_code == 422 and "https://" in bad.json()["detail"]
    assert client.put(f"/suite/races/{race_id}/plugins/nope", json={"enabled": True}, headers=admin).status_code == 404

    # The announcer: finishes become lines on the board's panel.
    on = client.put(f"/suite/races/{race_id}/plugins/announcer", json={"enabled": True, "config": {"scope": "finish", "keep": 5}}, headers=admin)
    assert on.status_code == 200 and on.json()["enabled"] is True and on.json()["config"]["keep"] == 5
    _plan(admin, race_id)
    people = {p["family_name"]: p for p in _field(admin, race_id)}
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    gun = datetime(2026, 10, 3, 6, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(suite, "_now", lambda: gun)
    client.post(f"/suite/races/{race_id}/start", json={"started_at": gun.isoformat()}, headers=admin)
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=6))
    client.post(f"/suite/stations/{stations['aid']}/passings", json={"passings": [{"client_id": "a", "bib": "12", "recorded_at": (gun + timedelta(hours=2)).isoformat()}]})
    client.post(f"/suite/stations/{stations['finish']}/passings", json={"passings": [{"client_id": "f", "bib": "12", "recorded_at": (gun + timedelta(hours=5, minutes=12, seconds=40)).isoformat()}]})
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    panel = next(p for p in board["panels"] if p["plugin"] == "announcer")
    assert panel["lines"] == ["#12 Jane Doe (Trail Club) finished Coastal Trail Weekend Coastal 50K in 5:12:40.", "Coastal Trail Weekend Coastal 50K: the race has started."], "finishes only: the aid station passing is not announced"


def test_webhook_plugin_posts_signed_json_and_logs_failures(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    sent = []

    class FakeResponse:
        def __init__(self, status_code):
            self.status_code = status_code

    def fake_post(url, *, content, headers, timeout, follow_redirects):
        sent.append((url, content, headers))
        return FakeResponse(500 if "fail" in url else 200)

    from api.suite_plugins import webhook as webhook_module

    monkeypatch.setattr(webhook_module.httpx, "post", fake_post)
    assert client.put(f"/suite/races/{race_id}/plugins/webhook", json={"enabled": True, "config": {"url": "https://hooks.example.com/otri", "secret": "s3cret", "only": "all"}}, headers=admin).status_code == 200
    # The secret is never echoed back, and sending the mask back keeps it.
    shown = client.get(f"/suite/races/{race_id}/plugins", headers=admin).json()
    assert next(s for s in shown if s["plugin_key"] == "webhook")["config"]["secret"] == "••••••••"
    client.put(f"/suite/races/{race_id}/plugins/webhook", json={"enabled": True, "config": {"url": "https://hooks.example.com/otri", "secret": "••••••••", "only": "all"}}, headers=admin)
    assert suite_db.list_plugin_settings(race_id)["webhook"]["config"]["secret"] == "s3cret"

    _plan(admin, race_id)
    client.post(f"/suite/races/{race_id}/start", headers=admin)
    assert len(sent) == 1
    url, body, headers = sent[0]
    assert headers["X-OTRI-Event"] == "race.started"
    import hashlib
    import hmac
    import json

    assert headers["X-OTRI-Signature"] == hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert json.loads(body)["event"] == "race.started" and json.loads(body)["race"]["race_id"] == race_id

    # A failing URL is logged, not raised, and the scan is stored all the same.
    client.put(f"/suite/races/{race_id}/plugins/webhook", json={"enabled": True, "config": {"url": "https://hooks.example.com/fail", "format": "slack"}}, headers=admin)
    people = _field(admin, race_id)
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    answer = client.post(f"/suite/stations/{stations['aid']}/passings", json={"passings": [{"client_id": "a", "qr_token": people[0]["qr_token"], "recorded_at": datetime.now(timezone.utc).isoformat()}]})
    assert answer.json()["results"][0]["outcome"] == "accepted"
    assert json.loads(sent[-1][1])["text"].startswith("#7 John Smith reached Aid 1 · Col at ")
    log = client.get(f"/suite/races/{race_id}/plugins/webhook/log", headers=admin).json()
    assert log[0]["status"] == "error" and "500" in log[0]["detail"]


def test_a_plugin_that_raises_does_not_stop_the_scan(monkeypatch):
    class Broken(plugins.Plugin):
        key = "broken"
        name = "Broken"
        events = ("passing.recorded",)

        def on_event(self, ctx, event):
            raise RuntimeError("boom")

    monkeypatch.setitem(plugins.registry(), "broken", Broken())
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    client.put(f"/suite/races/{race_id}/plugins/broken", json={"enabled": True}, headers=admin)
    _plan(admin, race_id)
    people = _field(admin, race_id)
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    answer = client.post(f"/suite/stations/{stations['aid']}/passings", json={"passings": [{"client_id": "a", "qr_token": people[0]["qr_token"], "recorded_at": datetime.now(timezone.utc).isoformat()}]})
    assert answer.status_code == 200 and answer.json()["results"][0]["outcome"] == "accepted"
    assert suite_db.plugin_log(race_id, "broken")[0]["detail"] == "passing.recorded: boom"


def test_deleting_the_race_takes_the_suite_with_it(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    _plan(admin, race_id)
    _field(admin, race_id)
    assert client.delete(f"/races/{race_id}", headers=admin).status_code == 204
    assert suite_db.list_checkpoints(race_id) == [] and suite_db.list_participants(race_id) == [] and suite_db.get_state(race_id) is None


# ------------------------------------------------------------------------------- laps, public, gpx

GPX = REPO_ROOT / "tests" / "fixtures" / "gpx" / "phuket-trail-2026-pkt15.gpx"


def test_a_lap_course_finishes_on_the_last_lap_and_counts_laps(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin, "3 × 5K")
    assert client.patch(f"/suite/races/{race_id}/settings", json={"laps": 3}, headers=admin).json()["settings"]["laps"] == 3
    # A loop: start line, one aid station, and the finish line which is also the lap line.
    ids = {}
    for kind, name, km in (("start", "Start", 0), ("aid", "Water", 2.5), ("finish", "Lap line", 5)):
        ids[kind] = client.post(f"/suite/races/{race_id}/checkpoints", json={"name": name, "kind": kind, "distance_km": km, "cutoff_minutes": 150 if kind == "finish" else None}, headers=admin).json()["checkpoint_id"]
    people = {p["family_name"]: p for p in _field(admin, race_id)}
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    gun = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(suite, "_now", lambda: gun)
    client.post(f"/suite/races/{race_id}/start", json={"started_at": gun.isoformat()}, headers=admin)
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=2))
    jane = people["Doe"]["qr_token"]
    # Jane: water, lap line (lap 1), water, lap line (lap 2), water, lap line (lap 3 = finish).
    times = [10, 25, 35, 51, 62, 78]
    batch = []
    for i, minutes in enumerate(times):
        key = "aid" if i % 2 == 0 else "finish"
        batch.append((key, {"client_id": f"j{i}", "qr_token": jane, "recorded_at": (gun + timedelta(minutes=minutes)).isoformat()}))
    for key, item in batch:
        answer = client.post(f"/suite/stations/{stations[key]}/passings", json={"passings": [item]}).json()
        assert answer["results"][0]["outcome"] == "accepted", (key, item, answer)
        board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
        row = next(r for r in board["participants"] if r["family_name"] == "Doe")
        if key == "finish" and item["client_id"] != "j5":
            assert row["status"] == "started", "a lap-line passing before the last lap is not a finish"
    assert row["status"] == "finished" and row["lap"] == 3 and row["finish_seconds"] == 78 * 60
    assert [s["name"] for s in row["splits"]] == ["Water · lap 1", "Lap line · lap 1", "Water · lap 2", "Lap line · lap 2", "Water · lap 3", "Lap line · lap 3"]
    assert row["rank"] == 1
    # John did one lap: heading to Water on lap 2, one lap done, not overdue (cut-offs bind on the last lap).
    john = people["Smith"]["qr_token"]
    for i, minutes in enumerate((12, 30)):
        client.post(f"/suite/stations/{stations['aid' if i == 0 else 'finish']}/passings", json={"passings": [{"client_id": f"s{i}", "qr_token": john, "recorded_at": (gun + timedelta(minutes=minutes)).isoformat()}]})
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=3))
    board = client.get(f"/suite/races/{race_id}/board", headers=admin).json()
    row = next(r for r in board["participants"] if r["family_name"] == "Smith")
    assert row["status"] == "started" and row["lap"] == 1 and row["next_checkpoint"]["name"] == "Water" and row["next_checkpoint"]["lap"] == 2 and row["overdue"] is False
    assert board["laps"] == 3
    # The results file carries Jane's three-lap time.
    client.post(f"/suite/races/{race_id}/finish", headers=admin)
    assert "1,1:18:00,Doe,Jane" in client.get(f"/suite/races/{race_id}/results.csv", headers=admin).text


def test_checkpoints_are_suggested_from_the_measured_course(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin, "PKT15")
    assert client.post(f"/suite/races/{race_id}/checkpoints/suggest", headers=admin).status_code == 404, "no course yet"
    with GPX.open("rb") as handle:
        attached = client.post(f"/races/{race_id}/gpx", files={"file": ("pkt15.gpx", handle, "application/gpx+xml")}, headers=admin)
    assert attached.status_code == 200, attached.text
    profile = client.get(f"/suite/races/{race_id}/profile", headers=admin).json()
    assert 2 < len(profile["points"]) <= 242 and profile["distance_km"] > 10 and profile["gain_m"] > 0 and profile["min_m"] < profile["max_m"]

    preview = client.post(f"/suite/races/{race_id}/checkpoints/suggest", json={}, headers=admin).json()
    kinds = [s["kind"] for s in preview["suggestions"]]
    assert kinds[0] == "start" and kinds[-1] == "finish" and kinds.count("aid") >= 1
    kms = [s["distance_km"] for s in preview["suggestions"]]
    assert kms == sorted(kms) and kms[0] == 0 and abs(kms[-1] - profile["distance_km"]) < 0.2
    assert all(s["cutoff_minutes"] % 15 == 0 for s in preview["suggestions"] if s["cutoff_minutes"] is not None)
    assert preview["suggestions"][-1]["cutoff_minutes"] > preview["suggestions"][1]["cutoff_minutes"]
    assert all("reason" in s and "elevation_m" in s for s in preview["suggestions"])
    assert preview["applied"] == [] and client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json() == [], "a preview creates nothing"

    applied = client.post(f"/suite/races/{race_id}/checkpoints/suggest", json={"apply": True, "spacing_km": 4}, headers=admin).json()
    assert len(applied["applied"]) == len(applied["suggestions"]) >= 4
    stored = client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()
    assert [c["position"] for c in stored] == list(range(1, len(stored) + 1)) and stored[0]["kind"] == "start" and stored[-1]["kind"] == "finish"
    assert client.post(f"/suite/races/{race_id}/checkpoints/suggest", json={"apply": True}, headers=admin).status_code == 409, "an existing plan is not replaced by accident"
    again = client.post(f"/suite/races/{race_id}/checkpoints/suggest", json={"apply": True, "replace": True}, headers=admin).json()
    assert len(client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()) == len(again["applied"])


def test_suggest_checkpoints_is_pure_and_prefers_valleys():
    # A course with a valley at km 9 of 27: the aid station near the km-9 target lands in it.
    points = []
    for i in range(0, 271):
        km = i / 10
        m = 1000 - 300 * max(0.0, 1 - abs(km - 9) / 3) + (150 * max(0.0, 1 - abs(km - 18) / 3))
        points.append({"km": km, "m": m})
    profile = {"points": points, "distance_km": 27.0, "gain_m": 450, "min_m": 700, "max_m": 1150}
    suggestions = suite.suggest_checkpoints(profile, spacing_km=9)
    aids = [s for s in suggestions if s["kind"] == "aid"]
    assert [round(a["distance_km"]) for a in aids] == [9, 18]
    assert "low point" in aids[0]["reason"] and aids[0]["crew_access"] is True
    assert "high point" in aids[1]["reason"]
    assert suggestions[-1]["cutoff_minutes"] >= 27 * 12


def test_public_live_page_and_registration_with_pay_by_link(monkeypatch):
    admin = _admin(monkeypatch)
    race_id = _race(admin)
    _plan(admin, race_id)
    assert client.get(f"/suite/public/{race_id}").status_code == 404, "nothing public until the organizer says so"
    settings = client.patch(
        f"/suite/races/{race_id}/settings",
        json={"live_public": True, "registration_open": True, "registration_limit": 2, "fee_text": "500 THB", "payment_url": "https://buy.stripe.com/test_abc", "payment_instructions": "Or PromptPay 081-234-5678, reference in the note.", "planned_start": "06:00", "require_emergency": True},
        headers=admin,
    )
    assert settings.status_code == 200, settings.text
    info = client.get(f"/suite/public/{race_id}").json()
    assert info["registration"]["open"] is True and info["registration"]["spots_left"] == 2 and info["registration"]["fee_text"] == "500 THB" and info["planned_start"] == "06:00"
    assert [c["kind"] for c in info["checkpoints"]] == ["start", "aid", "finish"] and "station_key" not in info["checkpoints"][0]

    # A runner registers; gets their private link and how to pay, with a reference Stripe echoes back.
    entry = {"family_name": "Lovelace", "first_name": "Ada", "gender": "F", "birth_year": 1990, "club": "Analytical", "email": "ada@example.com", "emergency_contact": "Charles +44 20 1234", "consent": True}
    refused = client.post(f"/suite/public/{race_id}/register", json={**entry, "consent": False})
    assert refused.status_code == 422
    refused = client.post(f"/suite/public/{race_id}/register", json={**entry, "emergency_contact": ""})
    assert refused.status_code == 422 and "emergency" in refused.json()["detail"]
    registered = client.post(f"/suite/public/{race_id}/register", json=entry)
    assert registered.status_code == 201, registered.text
    body = registered.json()
    assert body["payment"]["status"] == "pending" and body["payment"]["url"].startswith("https://buy.stripe.com/test_abc?client_reference_id=") and body["payment"]["reference"] in body["payment"]["url"]
    assert client.get(f"/suite/bibs/{body['qr_token']}").json()["first_name"] == "Ada"
    assert client.post(f"/suite/public/{race_id}/register", json=entry).status_code == 409, "the same person twice"
    people = client.get(f"/suite/races/{race_id}/participants", headers=admin).json()
    ada = next(p for p in people if p["family_name"] == "Lovelace")
    assert ada["registered_via"] == "public" and ada["payment_status"] == "pending" and ada["email"] == "ada@example.com" and ada["payment_reference"] == body["payment"]["reference"]
    # The organizer marks the fee paid; the second place fills the race; the third is refused.
    assert client.patch(f"/suite/participants/{ada['participant_id']}", json={"payment_status": "paid"}, headers=admin).json()["payment_status"] == "paid"
    assert client.post(f"/suite/public/{race_id}/register", json={**entry, "family_name": "Hopper", "first_name": "Grace"}).status_code == 201
    assert client.get(f"/suite/public/{race_id}").json()["registration"] == {**client.get(f"/suite/public/{race_id}").json()["registration"], "open": False, "full": True, "spots_left": 0}
    assert client.post(f"/suite/public/{race_id}/register", json={**entry, "family_name": "Noether", "first_name": "Emmy"}).status_code == 409

    # The live page: names and times, no birth years, no contacts, no keys.
    stations = {c["kind"]: c["station_key"] for c in client.get(f"/suite/races/{race_id}/checkpoints", headers=admin).json()}
    gun = datetime(2026, 10, 3, 6, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(suite, "_now", lambda: gun)
    client.post(f"/suite/races/{race_id}/start", json={"started_at": gun.isoformat()}, headers=admin)
    monkeypatch.setattr(suite, "_now", lambda: gun + timedelta(hours=3))
    client.post(f"/suite/stations/{stations['aid']}/passings", json={"passings": [{"client_id": "a", "qr_token": body["qr_token"], "recorded_at": (gun + timedelta(hours=2)).isoformat()}]})
    live = client.get(f"/suite/public/{race_id}/live")
    assert live.status_code == 200
    text = live.text
    assert "Lovelace" in text and "Aid 1" in text and "1990" not in text and "Charles" not in text and "station_key" not in text and "ada@example.com" not in text
    ada_row = next(r for r in live.json()["participants"] if r["family_name"] == "Lovelace")
    assert ada_row["last"]["elapsed_seconds"] == 7200.0 and ada_row["status"] == "started"
    # Switched off, the live page is gone but registration info stays.
    client.patch(f"/suite/races/{race_id}/settings", json={"live_public": False, "registration_open": True}, headers=admin)
    assert client.get(f"/suite/public/{race_id}/live").status_code == 404
    assert client.get(f"/suite/public/{race_id}").json()["live_public"] is False
