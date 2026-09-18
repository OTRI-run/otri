"""Apply or inspect schema migrations by hand (the API also applies them on every start).

    python scripts/migrate.py status    # baseline + which numbered migrations are applied/pending
    python scripts/migrate.py upgrade   # apply the baseline and every pending migration

Uses DATABASE_URL like the API. Exit code 1 if anything is pending after `status`, so a deploy
script can assert an up-to-date database.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import db, migrations  # noqa: E402


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "status"
    if command == "upgrade":
        applied = db.init_db()
        print("applied:", ", ".join(applied) if applied else "nothing (already up to date)")
        return 0
    if command == "status":
        with db.get_connection() as connection:
            done = migrations.applied_names(connection)
            todo = [m.name for m in migrations.pending(connection)]
        for name in done:
            print(f"applied  {name}")
        for name in todo:
            print(f"pending  {name}")
        if not done and not todo:
            print("no migrations recorded")
        return 1 if todo else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
