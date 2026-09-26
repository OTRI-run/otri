"""Storage for the race suite: the plan (checkpoints), the field (participants and bibs), the day
(passings) and the plugin settings of a race.

Everything hangs off ``races.race_id`` and goes with the race when it is deleted. Rows come back as
plain dicts (the pool's ``dict_row``), datetimes timezone-aware, for the API layer to shape.

Design notes:

- A **passing** is a fact: participant P was seen at checkpoint C at time T, by device D. Times are
  the scanning device's clock corrected by the offset it measured against the server when it
  loaded its station page; ``received_at`` is the server's clock and is kept beside it.
- The offline queue on a station sends every passing with a ``client_id`` it made up. The same
  ``client_id`` twice (a retry after a lost answer) is one passing: ``UNIQUE (race_id, client_id)``.
  A second scan of the same runner at the same checkpoint within a couple of minutes, with a new
  client id, is a double scan and is reported as a duplicate, not stored.
- Each checkpoint has a **station key**: an unguessable token in the link the organizer hands the
  volunteer. The key names the checkpoint and permits recording passings there, nothing else.
  Rotating it ends the old link.
- Each participant has a **QR token** printed on the bib. The token is the identity a scan
  resolves; the bib number is what a human types. Both are unique within the race.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

import json

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS suite_races (
    race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'planning',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suite_checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'checkpoint',
    distance_km DOUBLE PRECISION,
    cutoff_minutes INTEGER,
    water BOOLEAN NOT NULL DEFAULT FALSE,
    food BOOLEAN NOT NULL DEFAULT FALSE,
    medical BOOLEAN NOT NULL DEFAULT FALSE,
    drop_bag BOOLEAN NOT NULL DEFAULT FALSE,
    crew_access BOOLEAN NOT NULL DEFAULT FALSE,
    supplies TEXT,
    notes TEXT,
    station_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suite_checkpoints_race ON suite_checkpoints (race_id, position);

CREATE TABLE IF NOT EXISTS suite_participants (
    participant_id TEXT PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    bib TEXT,
    family_name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT 'X',
    birth_year INTEGER,
    nationality TEXT,
    club TEXT,
    emergency_contact TEXT,
    status TEXT NOT NULL DEFAULT 'registered',
    qr_token TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (race_id, bib)
);
CREATE INDEX IF NOT EXISTS suite_participants_race ON suite_participants (race_id);

CREATE TABLE IF NOT EXISTS suite_passings (
    passing_id BIGSERIAL PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    checkpoint_id TEXT NOT NULL REFERENCES suite_checkpoints(checkpoint_id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES suite_participants(participant_id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL DEFAULT 'scan',
    device TEXT,
    client_id TEXT,
    UNIQUE (race_id, client_id)
);
CREATE INDEX IF NOT EXISTS suite_passings_race ON suite_passings (race_id, participant_id, checkpoint_id);

CREATE TABLE IF NOT EXISTS suite_plugins (
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    plugin_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (race_id, plugin_key)
);

CREATE TABLE IF NOT EXISTS suite_plugin_log (
    id BIGSERIAL PRIMARY KEY,
    race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
    plugin_key TEXT NOT NULL,
    hook TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suite_plugin_log_race ON suite_plugin_log (race_id, plugin_key, id DESC);
"""

RACE_STATUSES = ("planning", "live", "finished")
CHECKPOINT_KINDS = ("start", "checkpoint", "aid", "finish")
PARTICIPANT_STATUSES = ("registered", "dns", "started", "finished", "dnf", "dsq")

# Two scans of the same runner at the same checkpoint closer together than this are one scan.
DOUBLE_SCAN_SECONDS = 120

# Kept in a Python module so the table's columns are named once for reads and writes.
CHECKPOINT_FIELDS = ("name", "kind", "distance_km", "cutoff_minutes", "water", "food", "medical", "drop_bag", "crew_access", "supplies", "notes")
PARTICIPANT_FIELDS = ("bib", "family_name", "first_name", "gender", "birth_year", "nationality", "club", "emergency_contact", "status", "notes")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _token(nbytes: int = 16) -> str:
    return secrets.token_hex(nbytes)


# --- Race state ----------------------------------------------------------------------------------


def get_state(race_id: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_races WHERE race_id = %s", (race_id,)).fetchone()


def ensure_state(race_id: str) -> dict:
    """The suite row for a race, made on first use so an existing race needs no setup step."""
    with db.get_connection() as connection:
        connection.execute("INSERT INTO suite_races (race_id) VALUES (%s) ON CONFLICT (race_id) DO NOTHING", (race_id,))
        return connection.execute("SELECT * FROM suite_races WHERE race_id = %s", (race_id,)).fetchone()


def update_state(race_id: str, *, status: str | None = None, started_at: datetime | None = None, finished_at: datetime | None = None, settings: dict | None = None, clear_times: bool = False) -> dict:
    ensure_state(race_id)
    sets, values = ["updated_at = now()"], []
    if status is not None:
        sets.append("status = %s")
        values.append(status)
    if clear_times:
        sets.append("started_at = NULL")
        sets.append("finished_at = NULL")
    else:
        if started_at is not None:
            sets.append("started_at = %s")
            values.append(started_at)
        if finished_at is not None:
            sets.append("finished_at = %s")
            values.append(finished_at)
    if settings is not None:
        sets.append("settings = %s::jsonb")
        values.append(json.dumps(settings))
    with db.get_connection() as connection:
        connection.execute(f"UPDATE suite_races SET {', '.join(sets)} WHERE race_id = %s", (*values, race_id))
        return connection.execute("SELECT * FROM suite_races WHERE race_id = %s", (race_id,)).fetchone()


# --- Checkpoints ---------------------------------------------------------------------------------


def list_checkpoints(race_id: str) -> list[dict]:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_checkpoints WHERE race_id = %s ORDER BY position, created_at", (race_id,)).fetchall()


def find_checkpoint(checkpoint_id: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_checkpoints WHERE checkpoint_id = %s", (checkpoint_id,)).fetchone()


def find_checkpoint_by_key(station_key: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_checkpoints WHERE station_key = %s", (station_key,)).fetchone()


def create_checkpoint(race_id: str, values: dict) -> dict:
    ensure_state(race_id)
    fields = {key: values.get(key) for key in CHECKPOINT_FIELDS}
    for flag in ("water", "food", "medical", "drop_bag", "crew_access"):
        fields[flag] = bool(fields[flag])
    with db.get_connection() as connection:
        with connection.transaction():
            position = values.get("position")
            if position is None:
                row = connection.execute("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM suite_checkpoints WHERE race_id = %s", (race_id,)).fetchone()
                position = row["next"]
            else:
                # Make room: everything at or after the requested slot moves down one.
                connection.execute("UPDATE suite_checkpoints SET position = position + 1 WHERE race_id = %s AND position >= %s", (race_id, position))
            columns = ", ".join(fields)
            placeholders = ", ".join("%s" for _ in fields)
            checkpoint_id = db._insert_with_new_id(
                connection,
                "cp",
                f"INSERT INTO suite_checkpoints (checkpoint_id, race_id, position, station_key, {columns}) VALUES (%s, %s, %s, %s, {placeholders}) ON CONFLICT (checkpoint_id) DO NOTHING RETURNING checkpoint_id",
                (race_id, position, _token(), *fields.values()),
            )
            _renumber(connection, race_id)
            return connection.execute("SELECT * FROM suite_checkpoints WHERE checkpoint_id = %s", (checkpoint_id,)).fetchone()


def _renumber(connection, race_id: str) -> None:
    rows = connection.execute("SELECT checkpoint_id FROM suite_checkpoints WHERE race_id = %s ORDER BY position, created_at", (race_id,)).fetchall()
    for index, row in enumerate(rows, start=1):
        connection.execute("UPDATE suite_checkpoints SET position = %s WHERE checkpoint_id = %s", (index, row["checkpoint_id"]))


def update_checkpoint(checkpoint_id: str, values: dict) -> dict | None:
    sets, params = ["updated_at = now()"], []
    for key in CHECKPOINT_FIELDS:
        if key in values:
            sets.append(f"{key} = %s")
            params.append(values[key])
    with db.get_connection() as connection:
        connection.execute(f"UPDATE suite_checkpoints SET {', '.join(sets)} WHERE checkpoint_id = %s", (*params, checkpoint_id))
        return connection.execute("SELECT * FROM suite_checkpoints WHERE checkpoint_id = %s", (checkpoint_id,)).fetchone()


def reorder_checkpoints(race_id: str, checkpoint_ids: list[str]) -> list[dict]:
    """Put the race's checkpoints in the given order; ids not listed keep their relative order after."""
    with db.get_connection() as connection:
        with connection.transaction():
            for index, checkpoint_id in enumerate(checkpoint_ids, start=1):
                connection.execute("UPDATE suite_checkpoints SET position = %s, updated_at = now() WHERE checkpoint_id = %s AND race_id = %s", (index, checkpoint_id, race_id))
            connection.execute(
                "UPDATE suite_checkpoints SET position = position + %s WHERE race_id = %s AND NOT (checkpoint_id = ANY(%s))",
                (len(checkpoint_ids), race_id, list(checkpoint_ids)),
            )
            _renumber(connection, race_id)
    return list_checkpoints(race_id)


def delete_checkpoint(checkpoint_id: str) -> bool:
    with db.get_connection() as connection:
        with connection.transaction():
            row = connection.execute("DELETE FROM suite_checkpoints WHERE checkpoint_id = %s RETURNING race_id", (checkpoint_id,)).fetchone()
            if row is None:
                return False
            _renumber(connection, row["race_id"])
            return True


def rotate_station_key(checkpoint_id: str) -> dict | None:
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_checkpoints SET station_key = %s, updated_at = now() WHERE checkpoint_id = %s", (_token(), checkpoint_id))
        return connection.execute("SELECT * FROM suite_checkpoints WHERE checkpoint_id = %s", (checkpoint_id,)).fetchone()


# --- Participants --------------------------------------------------------------------------------


def _bib_sort_sql() -> str:
    # Bibs sort as numbers when they are numbers ("2" before "10"), otherwise as text after them.
    return "CASE WHEN bib ~ '^[0-9]+$' THEN bib::bigint ELSE NULL END NULLS LAST, bib, family_name, first_name"


def list_participants(race_id: str) -> list[dict]:
    with db.get_connection() as connection:
        return connection.execute(f"SELECT * FROM suite_participants WHERE race_id = %s ORDER BY {_bib_sort_sql()}", (race_id,)).fetchall()


def count_participants(race_id: str) -> int:
    with db.get_connection() as connection:
        return connection.execute("SELECT COUNT(*) AS n FROM suite_participants WHERE race_id = %s", (race_id,)).fetchone()["n"]


def find_participant(participant_id: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_participants WHERE participant_id = %s", (participant_id,)).fetchone()


def find_participant_by_token(qr_token: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_participants WHERE qr_token = %s", (qr_token,)).fetchone()


def find_participant_by_bib(race_id: str, bib: str) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_participants WHERE race_id = %s AND bib = %s", (race_id, bib)).fetchone()


class BibTaken(Exception):
    def __init__(self, bib: str):
        super().__init__(f"bib {bib} is already taken in this race")
        self.bib = bib


def _clean_participant(values: dict) -> dict:
    fields = {key: values.get(key) for key in PARTICIPANT_FIELDS if key in values}
    if "bib" in fields:
        fields["bib"] = (str(fields["bib"]).strip() or None) if fields["bib"] is not None else None
    if "gender" in fields:
        fields["gender"] = ((fields["gender"] or "X").strip().upper()[:1] or "X") if fields["gender"] is not None else "X"
        if fields["gender"] not in ("M", "F", "X"):
            fields["gender"] = "X"
    for key in ("family_name", "first_name", "club", "nationality", "emergency_contact", "notes"):
        if key in fields and isinstance(fields[key], str):
            fields[key] = fields[key].strip()
    if "nationality" in fields and fields["nationality"]:
        fields["nationality"] = fields["nationality"].upper()[:3]
    return fields


def create_participant(race_id: str, values: dict) -> dict:
    ensure_state(race_id)
    fields = _clean_participant(values)
    fields.setdefault("first_name", "")
    fields.setdefault("gender", "X")
    fields.setdefault("status", "registered")
    with db.get_connection() as connection:
        with connection.transaction():
            if fields.get("bib") and connection.execute("SELECT 1 FROM suite_participants WHERE race_id = %s AND bib = %s", (race_id, fields["bib"])).fetchone():
                raise BibTaken(fields["bib"])
            columns = ", ".join(fields)
            placeholders = ", ".join("%s" for _ in fields)
            participant_id = db._insert_with_new_id(
                connection,
                "pt",
                f"INSERT INTO suite_participants (participant_id, race_id, qr_token, {columns}) VALUES (%s, %s, %s, {placeholders}) ON CONFLICT (participant_id) DO NOTHING RETURNING participant_id",
                (race_id, _token(), *fields.values()),
                nbytes=6,
            )
            return connection.execute("SELECT * FROM suite_participants WHERE participant_id = %s", (participant_id,)).fetchone()


def update_participant(participant_id: str, values: dict) -> dict | None:
    fields = _clean_participant(values)
    with db.get_connection() as connection:
        with connection.transaction():
            current = connection.execute("SELECT race_id, bib FROM suite_participants WHERE participant_id = %s FOR UPDATE", (participant_id,)).fetchone()
            if current is None:
                return None
            if fields.get("bib") and fields["bib"] != current["bib"]:
                taken = connection.execute("SELECT 1 FROM suite_participants WHERE race_id = %s AND bib = %s AND participant_id <> %s", (current["race_id"], fields["bib"], participant_id)).fetchone()
                if taken:
                    raise BibTaken(fields["bib"])
            if fields:
                sets = ", ".join(f"{key} = %s" for key in fields)
                connection.execute(f"UPDATE suite_participants SET {sets}, updated_at = now() WHERE participant_id = %s", (*fields.values(), participant_id))
            return connection.execute("SELECT * FROM suite_participants WHERE participant_id = %s", (participant_id,)).fetchone()


def set_participant_status(participant_id: str, status: str) -> None:
    with db.get_connection() as connection:
        connection.execute("UPDATE suite_participants SET status = %s, updated_at = now() WHERE participant_id = %s", (status, participant_id))


def delete_participant(participant_id: str) -> bool:
    with db.get_connection() as connection:
        return connection.execute("DELETE FROM suite_participants WHERE participant_id = %s RETURNING 1", (participant_id,)).fetchone() is not None


def delete_all_participants(race_id: str) -> int:
    with db.get_connection() as connection:
        return connection.execute("DELETE FROM suite_participants WHERE race_id = %s", (race_id,)).rowcount


def assign_bibs(race_id: str, *, start: int = 1, prefix: str = "", only_missing: bool = True) -> int:
    """Number the race's participants: family name order, from ``start``, skipping bibs in use.

    With ``only_missing`` (the default) participants who already have a bib keep it. Returns how
    many bibs were given.
    """
    with db.get_connection() as connection:
        with connection.transaction():
            rows = connection.execute("SELECT participant_id, bib FROM suite_participants WHERE race_id = %s ORDER BY family_name, first_name, created_at FOR UPDATE", (race_id,)).fetchall()
            if not only_missing:
                connection.execute("UPDATE suite_participants SET bib = NULL WHERE race_id = %s", (race_id,))
                used: set[str] = set()
                todo = rows
            else:
                used = {row["bib"] for row in rows if row["bib"]}
                todo = [row for row in rows if not row["bib"]]
            number = max(1, start)
            given = 0
            for row in todo:
                while f"{prefix}{number}" in used:
                    number += 1
                bib = f"{prefix}{number}"
                connection.execute("UPDATE suite_participants SET bib = %s, updated_at = now() WHERE participant_id = %s", (bib, row["participant_id"]))
                used.add(bib)
                number += 1
                given += 1
            return given


# --- Passings ------------------------------------------------------------------------------------


def list_passings(race_id: str) -> list[dict]:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_passings WHERE race_id = %s ORDER BY recorded_at, passing_id", (race_id,)).fetchall()


def list_passings_for_participant(participant_id: str) -> list[dict]:
    with db.get_connection() as connection:
        return connection.execute("SELECT * FROM suite_passings WHERE participant_id = %s ORDER BY recorded_at, passing_id", (participant_id,)).fetchall()


def record_passing(*, race_id: str, checkpoint_id: str, participant_id: str, recorded_at: datetime, source: str, device: str | None, client_id: str | None) -> tuple[dict | None, str]:
    """Store one passing. Returns ``(row, "accepted")``, ``(row, "replayed")`` when the same
    client id was stored before, or ``(None, "duplicate")`` for a double scan."""
    with db.get_connection() as connection:
        with connection.transaction():
            if client_id:
                existing = connection.execute("SELECT * FROM suite_passings WHERE race_id = %s AND client_id = %s", (race_id, client_id)).fetchone()
                if existing:
                    return existing, "replayed"
            near = connection.execute(
                "SELECT 1 FROM suite_passings WHERE participant_id = %s AND checkpoint_id = %s AND ABS(EXTRACT(EPOCH FROM (recorded_at - %s))) < %s",
                (participant_id, checkpoint_id, recorded_at, DOUBLE_SCAN_SECONDS),
            ).fetchone()
            if near:
                return None, "duplicate"
            row = connection.execute(
                "INSERT INTO suite_passings (race_id, checkpoint_id, participant_id, recorded_at, source, device, client_id) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (race_id, checkpoint_id, participant_id, recorded_at, source, device, client_id),
            ).fetchone()
            return row, "accepted"


def delete_passing(passing_id: int) -> dict | None:
    with db.get_connection() as connection:
        return connection.execute("DELETE FROM suite_passings WHERE passing_id = %s RETURNING *", (passing_id,)).fetchone()


def delete_all_passings(race_id: str) -> int:
    with db.get_connection() as connection:
        return connection.execute("DELETE FROM suite_passings WHERE race_id = %s", (race_id,)).rowcount


# --- Plugins -------------------------------------------------------------------------------------


def list_plugin_settings(race_id: str) -> dict[str, dict]:
    with db.get_connection() as connection:
        rows = connection.execute("SELECT * FROM suite_plugins WHERE race_id = %s", (race_id,)).fetchall()
    return {row["plugin_key"]: row for row in rows}


def set_plugin(race_id: str, plugin_key: str, *, enabled: bool, config: dict) -> dict:
    ensure_state(race_id)
    with db.get_connection() as connection:
        connection.execute(
            "INSERT INTO suite_plugins (race_id, plugin_key, enabled, config) VALUES (%s, %s, %s, %s::jsonb) "
            "ON CONFLICT (race_id, plugin_key) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = now()",
            (race_id, plugin_key, enabled, json.dumps(config)),
        )
        return connection.execute("SELECT * FROM suite_plugins WHERE race_id = %s AND plugin_key = %s", (race_id, plugin_key)).fetchone()


def write_plugin_log(race_id: str, plugin_key: str, hook: str, status: str, detail: str | None) -> None:
    with db.get_connection() as connection:
        connection.execute("INSERT INTO suite_plugin_log (race_id, plugin_key, hook, status, detail) VALUES (%s, %s, %s, %s, %s)", (race_id, plugin_key, hook, status, (detail or "")[:2000] or None))
        # Keep the log short: the newest 500 lines per race and plugin.
        connection.execute(
            "DELETE FROM suite_plugin_log WHERE race_id = %s AND plugin_key = %s AND id < (SELECT COALESCE(MIN(id), 0) FROM (SELECT id FROM suite_plugin_log WHERE race_id = %s AND plugin_key = %s ORDER BY id DESC LIMIT 500) newest)",
            (race_id, plugin_key, race_id, plugin_key),
        )


def plugin_log(race_id: str, plugin_key: str | None = None, *, status: str | None = None, limit: int = 50) -> list[dict]:
    where, params = ["race_id = %s"], [race_id]
    if plugin_key:
        where.append("plugin_key = %s")
        params.append(plugin_key)
    if status:
        where.append("status = %s")
        params.append(status)
    with db.get_connection() as connection:
        return connection.execute(f"SELECT * FROM suite_plugin_log WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT %s", (*params, limit)).fetchall()


# --- Overview ------------------------------------------------------------------------------------


def race_overview(race_ids: list[str]) -> dict[str, dict]:
    """For a list of races: whether the suite is in use and its counts, in one round trip."""
    if not race_ids:
        return {}
    with db.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT r.race_id, s.status, s.started_at,
                   (SELECT COUNT(*) FROM suite_participants p WHERE p.race_id = r.race_id) AS participants,
                   (SELECT COUNT(*) FROM suite_checkpoints c WHERE c.race_id = r.race_id) AS checkpoints,
                   (SELECT COUNT(*) FROM suite_passings x WHERE x.race_id = r.race_id) AS passings
            FROM races r LEFT JOIN suite_races s ON s.race_id = r.race_id
            WHERE r.race_id = ANY(%s)
            """,
            (list(race_ids),),
        ).fetchall()
    return {row["race_id"]: row for row in rows}
