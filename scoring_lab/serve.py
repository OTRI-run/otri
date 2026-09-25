"""The scoring lab as a local app: `Scoring Lab.bat` (or `python -m scoring_lab serve`) opens it in
the browser, where course files can be dropped in, finish times saved and courses removed.

Standard library only. It listens on 127.0.0.1, answers only requests addressed to it by that name
(no DNS rebinding) and takes a change only with its own `X-Lab` header, which a page on another
site cannot send without a preflight this server never grants. It writes only inside the courses
folder.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from course.gpx import GpxParseError, decode_gpx, parse_track_points

from . import lab
from .models import select_models

MAX_UPLOAD_BYTES = 64 * 1024 * 1024
REMOVED_DIR = "_removed"


class Lab:
    """The courses folder, and the report built from it (rebuilt only when a file changes)."""

    def __init__(self, courses_dir: Path, extra_dirs: list[Path], jobs: int):
        self.courses_dir = courses_dir
        self.directories = [courses_dir, *extra_dirs]
        self.times_file = courses_dir / "times.csv"
        self.models = select_models("all")
        self.jobs = jobs
        self.lock = threading.Lock()
        self._built: tuple[str, dict] | None = None

    def version(self) -> str:
        return hashlib.sha256(repr(lab._snapshot(self.directories)).encode()).hexdigest()[:16]

    def report(self) -> dict:
        with self.lock:
            version = self.version()
            if self._built is None or self._built[0] != version:
                report = lab.build(self.directories, self.models, jobs=self.jobs)
                lab.attach_baseline(report, lab.DEFAULT_OUT_DIR / "baseline.json")
                report["server"] = {
                    "version": version,
                    "courses_dir": lab._display_path(self.courses_dir),
                    "times_file": lab._display_path(self.times_file),
                    "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
                }
                self._built = (version, report)
            return self._built[1]

    # --- changes ---------------------------------------------------------------------------------

    def upload(self, name: str, data: bytes) -> str:
        parse_track_points(decode_gpx(data))  # refuse anything that is not a readable GPX track
        stem = re.sub(r"[^\w .()\-]+", "_", Path(name).stem).strip(" .") or "course"
        target = self.courses_dir / f"{stem}.gpx"
        n = 2
        while target.exists():
            if target.read_bytes() == data:
                return target.name
            target = self.courses_dir / f"{stem} ({n}).gpx"
            n += 1
        target.write_bytes(data)
        return target.name

    def _course_path(self, file: str) -> Path:
        path = (lab.REPO_DIR / file).resolve()
        if not any(path.is_relative_to(d) for d in self.directories) or path.suffix.lower() != ".gpx" or not path.is_file():
            raise ValueError("not a course file in the lab")
        return path

    def remove(self, file: str) -> None:
        path = self._course_path(file)
        if not path.is_relative_to(self.courses_dir):
            raise ValueError("only courses in the lab's own folder can be removed here")
        removed = self.courses_dir / REMOVED_DIR
        removed.mkdir(exist_ok=True)
        target = removed / path.name
        n = 2
        while target.exists():
            target = removed / f"{path.stem} ({n}){path.suffix}"
            n += 1
        shutil.move(str(path), target)

    def set_times(self, file: str, times: list[dict]) -> None:
        """Replace this course's rows in the lab's own times.csv; other times.csv files are left alone."""
        path = self._course_path(file)
        key = path.stem.lower()
        rows: list[dict] = []
        for entry in times:
            label = str(entry.get("label") or "").strip()[:60]
            seconds = lab.parse_duration(str(entry.get("time") or ""))
            rows.append({"gpx": path.name, "time": lab.format_duration(seconds), "label": label})
        kept: list[dict] = []
        if self.times_file.exists():
            with self.times_file.open(newline="", encoding="utf-8-sig") as handle:
                kept = [row for row in csv.DictReader(handle)
                        if (row.get("gpx") or "").strip().lower().removesuffix(".gpx") != key]
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=["gpx", "time", "label"], extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(kept + rows)
        self.times_file.write_text(out.getvalue(), encoding="utf-8")


def make_handler(state: Lab, port: int):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        server_version = "OTRIScoringLab"

        def log_message(self, fmt, *args):  # quiet: the console shows what the lab does, not every poll
            pass

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, payload) -> None:
            self._send(status, json.dumps(payload, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def _trusted(self) -> bool:
            if self.headers.get("Host") not in hosts:
                self._json(403, {"error": "wrong host"})
                return False
            return True

        def do_GET(self):
            if not self._trusted():
                return
            path = urlparse(self.path).path
            if path == "/":
                self._send(200, lab.render_html(state.report()).encode(), "text/html; charset=utf-8")
            elif path == "/api/report":
                self._json(200, state.report())
            elif path == "/api/state":
                self._json(200, {"version": state.version()})
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            if not self._trusted():
                return
            if self.headers.get("X-Lab") != "1":
                return self._json(403, {"error": "missing X-Lab header"})
            url = urlparse(self.path)
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_UPLOAD_BYTES:
                return self._json(413, {"error": f"file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"})
            body = self.rfile.read(length)
            try:
                if url.path == "/api/upload":
                    name = parse_qs(url.query).get("name", ["course.gpx"])[0]
                    saved = state.upload(name, body)
                    print(f"Added {saved}")
                    return self._json(200, {"saved": saved})
                payload = json.loads(body or b"{}")
                if url.path == "/api/remove":
                    state.remove(payload["file"])
                    print(f"Removed {payload['file']} (moved to {REMOVED_DIR}/)")
                elif url.path == "/api/times":
                    state.set_times(payload["file"], payload.get("times", []))
                else:
                    return self._json(404, {"error": "not found"})
                return self._json(200, {"ok": True})
            except (GpxParseError, ValueError, KeyError) as error:
                return self._json(400, {"error": str(error)})

    return Handler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m scoring_lab serve", description="Open the scoring lab in the browser.")
    parser.add_argument("dirs", nargs="*", type=Path, help="extra folders to include, read-only (the lab's own folder is always included)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="do not open the browser")
    parser.add_argument("-j", "--jobs", type=int, default=4, help="processes for measuring new courses")
    args = parser.parse_args(argv)
    sys.stdout.reconfigure(line_buffering=True)  # the console window shows each line as it happens

    lab.DEFAULT_COURSES_DIR.mkdir(exist_ok=True)
    state = Lab(lab.DEFAULT_COURSES_DIR, [d.resolve() for d in args.dirs], args.jobs)
    server = None
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state, port))
            break
        except OSError:
            continue
    if server is None:
        print(f"No free port from {args.port} to {args.port + 19}.")
        return 1
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print(f"OTRI Scoring Lab at {url}")
    print(f"Course files: {state.courses_dir}")
    print("Close this window (or press Ctrl+C) to stop.")
    state.report()  # measure anything new before the browser asks
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
