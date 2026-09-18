"""One-off: reduce course files stored before uploads were sanitized (course/sanitize.py).

Rewrites every race's stored GPX and every shared course to positions and elevations only, and
keeps what each file said about its origin in the private record. Measurements are untouched:
a sanitized file measures identically, and ``raw_sha256`` still names the original upload.
Safe to run again; already-clean files are skipped. Dry run unless ``--apply`` is given.

    python scripts/sanitize_stored_gpx.py            # report
    python scripts/sanitize_stored_gpx.py --apply    # rewrite
"""

from __future__ import annotations

import gzip
import json
import os
import sys
from hashlib import sha256
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from psycopg.types.json import Jsonb  # noqa: E402

from api import db  # noqa: E402
from course.gpx import GpxParseError  # noqa: E402
from course.sanitize import sanitize_gpx, source_metadata  # noqa: E402

SHARED_DIR = Path(__file__).resolve().parents[1] / "data" / "cache" / "shared-courses"


def main(apply: bool) -> None:
    changed = skipped = failed = 0
    with db.get_connection() as connection:
        rows = connection.execute(
            "SELECT r.race_id, r.course_name, r.gpx_content, r.measurement, e.event_name "
            "FROM races r JOIN events e ON e.event_id = r.event_id WHERE r.gpx_content IS NOT NULL"
        ).fetchall()
        for row in rows:
            try:
                clean = sanitize_gpx(row["gpx_content"], name=f"{row['event_name'] or ''} {row['course_name']}".strip())
            except GpxParseError as error:
                failed += 1
                print(f"race {row['race_id']}: left alone ({error})")
                continue
            if clean == row["gpx_content"]:
                skipped += 1
                continue
            changed += 1
            print(f"race {row['race_id']}: {len(row['gpx_content']):,} -> {len(clean):,} characters")
            if apply:
                measurement = dict(row["measurement"] or {})
                if measurement:
                    measurement.setdefault("source_metadata", source_metadata(row["gpx_content"]))
                    measurement["stored_sha256"] = sha256(clean.encode("utf-8")).hexdigest()
                connection.execute(
                    "UPDATE races SET gpx_content = %s, measurement = %s WHERE race_id = %s",
                    (clean, Jsonb(measurement) if measurement else None, row["race_id"]),
                )

    for path in sorted(SHARED_DIR.glob("*.gpx.gz")) if SHARED_DIR.exists() else []:
        try:
            text = gzip.decompress(path.read_bytes()).decode("utf-8")
            clean = sanitize_gpx(text)
        except (OSError, UnicodeError, GpxParseError) as error:
            failed += 1
            print(f"shared {path.name}: left alone ({error})")
            continue
        if clean == text:
            skipped += 1
            continue
        changed += 1
        print(f"shared {path.name}: {len(text):,} -> {len(clean):,} characters")
        if apply:
            meta_path = path.with_name(path.name.replace(".gpx.gz", ".json"))
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                meta = {}
            meta.setdefault("source_metadata", source_metadata(text))
            stamp = path.stat()
            path.write_bytes(gzip.compress(clean.encode("utf-8"), compresslevel=6))
            meta_path.write_text(json.dumps(meta), encoding="utf-8")
            os.utime(path, (stamp.st_atime, stamp.st_mtime))  # eviction order is by age: keep it

    print(f"{'rewrote' if apply else 'would rewrite'} {changed}, already clean {skipped}, left alone {failed}")


if __name__ == "__main__":
    main("--apply" in sys.argv[1:])
