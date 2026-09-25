"""Scoring lab: measure every GPX in a folder once, score it with the chosen models, write a report.

Scoring goes through the production functions (`adjusted_demand`, `confidence_for`,
`score_for_time`, `target_time_seconds`, through `LabModel`), so a lab number for the production model is the number
the site would give for the same course measurement. Nothing here writes to the database or
reaches the network.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import pickle
import re
import shutil
import sys
import time
import webbrowser
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from course.gpx import read_track_points
from course.measurement import VERSION as MEASUREMENT_VERSION
from course.measurement import boundaries, interpolate, measure_course
from scoring.course_demand import demand_from_totals, gradient_ratio
from scoring.course_standard import (
    adjusted_demand,
    confidence_for,
)
from scoring.measured_demand import compute_measured_demand

from .models import LAB_MODELS, LabModel, curve_spec, select_models

LAB_DIR = Path(__file__).resolve().parent
REPO_DIR = LAB_DIR.parent
DEFAULT_COURSES_DIR = LAB_DIR / "courses"
DEFAULT_OUT_DIR = LAB_DIR / "reports"
CACHE_DIR = LAB_DIR / ".cache"
TEMPLATE = LAB_DIR / "report_template.html"
LEVELS_SOURCE = REPO_DIR / "src" / "lib" / "scoreLevels.js"

LADDER_SCORES = (1000, 900, 800, 700, 600, 500, 400, 300)
PROFILE_POINTS = 500
STEEP_GRADE = 0.20
GRADE_BANDS = (
    (-math.inf, -0.30, "≤ −30%"),
    (-0.30, -0.20, "−30 to −20%"),
    (-0.20, -0.10, "−20 to −10%"),
    (-0.10, -0.03, "−10 to −3%"),
    (-0.03, 0.03, "flat ±3%"),
    (0.03, 0.10, "3 to 10%"),
    (0.10, 0.20, "10 to 20%"),
    (0.20, 0.30, "20 to 30%"),
    (0.30, math.inf, "≥ 30%"),
)
# A GPX's own timestamps are used as a finish time only when they describe a plausible run on it:
# a course file exported by a route planner often carries made-up times seconds apart.
RECORDED_SCORE_RANGE = (50, 1100)
# What `measure_file` returns changed: bump to leave stale cache entries behind.
LAB_MEASURE_VERSION = "lab-measure-2"


# --- Finish times -------------------------------------------------------------------------------

def parse_duration(text: str) -> int:
    """'4:05:30', '45:10' or '16230' (seconds) -> seconds."""
    text = text.strip()
    if not text:
        raise ValueError("empty time")
    parts = text.split(":")
    if len(parts) > 3 or not all(re.fullmatch(r"\d+(\.\d+)?", part) for part in parts):
        raise ValueError(f"cannot read time {text!r}; use H:MM:SS, MM:SS or seconds")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    if seconds <= 0:
        raise ValueError(f"time {text!r} must be greater than zero")
    return round(seconds)


def _shown(path: Path, directory: Path) -> bool:
    """Folders starting with `_` or `.` are set aside (the lab UI moves removed courses to `_removed/`)."""
    return not any(part.startswith(("_", ".")) for part in path.relative_to(directory).parts[:-1])


def read_times(directories: list[Path]) -> tuple[dict[str, list[dict]], list[str]]:
    """Every `times.csv` under the course folders, keyed by lower-case GPX file name and stem.

    Columns: `gpx` (file name, with or without .gpx), `time`, optional `label`.
    """
    times: dict[str, list[dict]] = {}
    problems: list[str] = []
    for directory in directories:
        for path in sorted(p for p in directory.rglob("times.csv") if _shown(p, directory)):
            with path.open(newline="", encoding="utf-8-sig") as handle:
                for line, row in enumerate(csv.DictReader(handle), start=2):
                    gpx = (row.get("gpx") or "").strip()
                    if not gpx or gpx.startswith("#"):
                        continue
                    try:
                        seconds = parse_duration(row.get("time") or "")
                    except ValueError as error:
                        problems.append(f"{path.name} line {line}: {error}")
                        continue
                    key = gpx.lower().removesuffix(".gpx")
                    label = (row.get("label") or "").strip() or f"time {len(times.get(key, [])) + 1}"
                    times.setdefault(key, []).append({"label": label, "seconds": seconds, "source": _display_path(path)})
    return times, problems


# --- Measurement (cached, parallel) ---------------------------------------------------------------

def _terrain_identity() -> str:
    """What the elevations will come from, so a cached measurement is never reused across sources."""
    manifest = os.environ.get("OTRI_DEM_MANIFEST")
    if not manifest or not os.path.exists(manifest):
        return "uploaded"
    stat = os.stat(manifest)
    return f"dem:{os.path.abspath(manifest)}:{stat.st_mtime_ns}:{stat.st_size}"


def _cache_key(data: bytes) -> str:
    identity = f"{MEASUREMENT_VERSION}|{LAB_MEASURE_VERSION}|{_terrain_identity()}".encode()
    return hashlib.sha256(identity + b"|" + data).hexdigest()


def _grade_detail(measurement) -> dict:
    """Per-band distance and demand, steep stretches and a thinned profile, from the same 50 m
    windows `compute_measured_demand` integrates (the lab re-walks them only to show them)."""
    bands = [{"label": label, "distance_km": 0.0, "demand_km": 0.0} for _, _, label in GRADE_BANDS]
    steep: list[list[float]] = []
    offset = 0.0
    for segment in measurement.segments:
        xs, zs = zip(*segment)
        edges = boundaries(xs[-1], 50.0)
        for a, b in zip(edges, edges[1:]):
            grade = (interpolate(xs, zs, b) - interpolate(xs, zs, a)) / (b - a)
            width_km = (b - a) / 1000
            band = next(i for i, (low, high, _) in enumerate(GRADE_BANDS) if low <= grade < high)
            bands[band]["distance_km"] += width_km
            bands[band]["demand_km"] += width_km * gradient_ratio(max(-0.45, min(0.45, grade)))
            if abs(grade) >= STEEP_GRADE:
                start, end = (offset + a) / 1000, (offset + b) / 1000
                if steep and abs(steep[-1][1] - start) < 1e-9:
                    steep[-1][1] = end
                else:
                    steep.append([start, end])
        offset += xs[-1]
    for band in bands:
        band["distance_km"] = round(band["distance_km"], 3)
        band["demand_km"] = round(band["demand_km"], 3)

    profile = measurement.to_dict()["profile"]
    stride = max(1, math.ceil(len(profile) / PROFILE_POINTS))
    thinned = [p for i, p in enumerate(profile) if i % stride == 0 or i == len(profile) - 1]
    return {
        "bands": bands,
        "steep": [[round(a, 3), round(b, 3)] for a, b in steep],
        "profile": [[round(p["distanceKm"], 3), round(p["elevation"], 1)] for p in thinned],
    }


def measure_file(path: str) -> dict:
    """Everything about one course that does not depend on the model. Top-level so it pickles
    into a worker process."""
    from course.elevation import configured_provider

    points = read_track_points(path)
    measurement = measure_course(points, configured_provider())
    demand = compute_measured_demand(measurement=measurement)
    stamps = [p.time for p in points if p.time is not None]
    recorded = (stamps[-1] - stamps[0]).total_seconds() if len(stamps) >= 2 else None
    timestamps_note = None
    if recorded and recorded > 0:
        # A route planner's export carries times too, one fixed step per point (Trace de Trail: 3 s).
        # A watch never records that evenly for hours. Such times are not a finish time.
        gaps = {round((b - a).total_seconds(), 1) for a, b in zip(stamps, stamps[1:])}
        if len(gaps) == 1 and gaps.pop() >= 2:
            timestamps_note = (f"GPX timestamps are one fixed step apart for every point and span {format_duration(recorded)}: "
                               "generated on export, not a recording; not used as a finish time")
            recorded = None
    return {
        "measurement": measurement,
        "demand": demand,
        "point_count": len(points),
        "recorded_seconds": recorded if recorded and recorded > 0 else None,
        "timestamps_note": timestamps_note,
        "detail": _grade_detail(measurement),
    }


def discover(directories: list[Path]) -> list[Path]:
    found: dict[Path, None] = {}
    for directory in directories:
        for path in sorted(directory.rglob("*")):
            if path.is_file() and path.suffix.lower() == ".gpx" and _shown(path, directory):
                found[path.resolve()] = None
    return list(found)


def measure_all(paths: list[Path], *, jobs: int, use_cache: bool, log=print) -> dict[Path, dict]:
    results: dict[Path, dict] = {}
    pending: list[tuple[Path, str]] = []
    CACHE_DIR.mkdir(exist_ok=True)
    for path in paths:
        data = path.read_bytes()
        key = _cache_key(data)
        entry = {"sha256": hashlib.sha256(data).hexdigest()}
        cached = CACHE_DIR / f"{key}.pkl"
        if use_cache and cached.exists():
            try:
                with cached.open("rb") as handle:
                    results[path] = {**pickle.load(handle), **entry, "cached": True}
                continue
            except Exception:  # a stale or truncated cache file is just a miss
                cached.unlink(missing_ok=True)
        results[path] = entry
        pending.append((path, key))

    def store(path: Path, key: str, outcome: dict) -> None:
        results[path].update(outcome, cached=False)
        if "error" not in outcome:
            with (CACHE_DIR / f"{key}.pkl").open("wb") as handle:
                pickle.dump(outcome, handle)

    if pending:
        log(f"Measuring {len(pending)} course(s)" + (f" on {jobs} processes" if jobs > 1 and len(pending) > 1 else "") + " ...")
    if jobs > 1 and len(pending) > 1:
        with ProcessPoolExecutor(max_workers=min(jobs, len(pending))) as pool:
            futures = {pool.submit(measure_file, str(path)): (path, key) for path, key in pending}
            for future, (path, key) in futures.items():
                try:
                    store(path, key, future.result())
                except Exception as error:  # one bad file never stops the run
                    results[path].update(error=str(error), cached=False)
    else:
        for path, key in pending:
            try:
                store(path, key, measure_file(str(path)))
            except Exception as error:  # one bad file never stops the run
                results[path].update(error=str(error), cached=False)
    return results


# --- Scoring ------------------------------------------------------------------------------------

def score_course(model: LabModel, measured: dict, times: list[dict]) -> dict:
    curve = model.curve
    measurement, demand = measured["measurement"], measured["demand"]
    if model.from_totals:
        adjusted_km, flags = demand_from_totals(demand.physical_distance_km, demand.elevation_gain_m)
        terrain_factor = 1.0
        confidence, confidence_flags = confidence_for(None, None, adjusted_km)
    elif model.demand is not None:
        adjusted_km, flags, terrain_factor = model.demand(measurement)
        # Production's confidence reasons still apply (elevation source, route, domain, length), except
        # the one about its own vertical coefficient, which this demand rule does not have.
        _, confidence_flags = confidence_for(measurement, demand, adjusted_km)
        confidence_flags = tuple(f for f in confidence_flags if not f.startswith("vertical_calibration"))
        confidence = "High" if not confidence_flags else "Low"
    else:
        adjusted_km, flags = adjusted_demand(demand, curve)
        terrain_factor = curve.terrain_adjustment.factor(demand.steep_distance_fraction, demand.altitude_excess_m)
        confidence, confidence_flags = confidence_for(measurement, demand, adjusted_km)
    flags = tuple(flags) + tuple(confidence_flags) + tuple(curve.demand_scaling.range_flags(adjusted_km))
    if model.key == "0.1.7":
        confidence = "Low"
        flags += ("experimental_reference: smooth duration model has not been validated on independent trail results; scores are absolute, not age/sex graded",)

    scored_times = []
    for entry in times:
        raw = model.raw_score(adjusted_km, entry["seconds"])
        if model.key == "0.1.7" and not 755.36 <= entry["seconds"] <= 86400:
            flags += ("duration_outside_reference_range: a finish time is outside the frozen 12:35.36 to 24-hour observations; reference extrapolated",)
        scored_times.append({**entry, "score": round(max(0.0, raw)), "raw": round(raw, 2)})

    return {
        "adjusted_demand_km": round(adjusted_km, 3),
        "terrain_factor": round(terrain_factor, 4),
        "difficulty": round(adjusted_km / demand.physical_distance_km, 4) if demand.physical_distance_km else None,
        "exponent": curve.power_exponent,
        "curve": curve_spec(curve, duration_matched=model.duration_matched),
        # The time at the human ceiling (fraction 1): the report's curve is drawn from it.
        "ceiling_seconds": round(adjusted_km / curve.demand_scaling.rate(adjusted_km) * 3600, 3),
        # None where the curve never reaches the score (a top that bends towards 1000).
        "world_best_seconds": _reachable(model, adjusted_km, 1000.0, 2),
        "ladder": [{"score": score, "seconds": _reachable(model, adjusted_km, score, 0)} for score in LADDER_SCORES],
        "confidence": confidence,
        "flags": list(dict.fromkeys(flags)),
        "times": scored_times,
    }


def _reachable(model: LabModel, demand_km: float, score: float, digits: int) -> float | None:
    try:
        return round(model.target_seconds(demand_km, score), digits or None)
    except ValueError:
        return None


def build(directories: list[Path], models: list[LabModel], *, jobs: int = 1, use_cache: bool = True, log=print) -> dict:
    started = time.perf_counter()
    paths = discover(directories)
    times_by_name, time_problems = read_times(directories)
    measured = measure_all(paths, jobs=jobs, use_cache=use_cache, log=log)

    courses = []
    for path in paths:
        info = measured[path]
        try:
            relative = path.relative_to(REPO_DIR).as_posix()
        except ValueError:
            relative = str(path)
        course = {
            "id": info["sha256"][:12],
            "sha256": info["sha256"],
            "name": path.stem,
            "file": relative,
            "folder": path.parent.name,
            "cached": info.get("cached", False),
        }
        if "error" in info:
            courses.append({**course, "error": info["error"]})
            continue
        m, demand = info["measurement"], info["demand"]
        times = list(times_by_name.get(path.name.lower().removesuffix(".gpx"), []))
        notes = [info["timestamps_note"]] if info.get("timestamps_note") else []
        recorded = info.get("recorded_seconds")
        if recorded:
            prod_check = score_course(models[0], info, [{"label": "check", "seconds": recorded}])["times"][0]["score"]
            if RECORDED_SCORE_RANGE[0] <= prod_check <= RECORDED_SCORE_RANGE[1]:
                times.insert(0, {"label": "GPX timestamps", "seconds": round(recorded), "source": "gpx"})
            else:
                notes.append(f"GPX timestamps span {format_duration(recorded)}, which would score {prod_check}; not used as a finish time")
        course.update(
            points=info["point_count"],
            distance_km=demand.physical_distance_km,
            gain_m=demand.elevation_gain_m,
            loss_m=demand.elevation_loss_m,
            min_elevation_m=round(m.min_elevation_m, 1),
            max_elevation_m=round(m.max_elevation_m, 1),
            median_edge_m=m.median_edge_m,
            course_demand_km=demand.course_demand_km,
            steep_fraction=demand.steep_distance_fraction,
            altitude_excess_m=demand.altitude_excess_m,
            clamped_fraction=demand.clamped_demand_fraction,
            min_grade=demand.minimum_grade,
            max_grade=demand.maximum_grade,
            elevation_source="DEM" if m.dem_sourced else "GPX file",
            measurement_status="needs_review" if m.needs_review else "provisional",
            measurement_flags=list(m.quality_flags),
            notes=notes,
            **info["detail"],
            models={model.key: score_course(model, info, times) for model in models},
        )
        courses.append(course)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "measurement_version": MEASUREMENT_VERSION,
        "terrain": _terrain_identity().split(":")[0],
        "sources": [_display_path(d) for d in directories],
        "models": [
            {"key": m.key, "name": m.name, "description": m.description, "version": m.curve.version,
             "exponent": m.curve.power_exponent, "production": m.production}
            for m in models
        ],
        "levels": read_levels(),
        "courses": courses,
        "problems": time_problems,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
    }


# --- Output -------------------------------------------------------------------------------------

def read_levels() -> list[dict]:
    """Score-band names from the site's own `scoreLevels.js`, so the report says what the site says."""
    try:
        text = LEVELS_SOURCE.read_text(encoding="utf-8")
    except OSError:
        return []
    return [
        {"from": int(start), "name": name}
        for start, name in re.findall(r"from:\s*(\d+),\s*name:\s*'([^']+)'", text)
    ]


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "never"
    seconds = round(seconds)
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def _display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_DIR).as_posix()
    except ValueError:
        return str(path)


def attach_baseline(report: dict, baseline_path: Path) -> None:
    if not baseline_path.exists():
        return
    try:
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    previous = {c["sha256"]: c for c in baseline.get("courses", []) if "models" in c}
    report["baseline"] = {"generated_at": baseline.get("generated_at"), "courses": {
        sha: {key: {"adjusted_demand_km": m["adjusted_demand_km"], "world_best_seconds": m["world_best_seconds"],
                    "scores": {t["label"]: t["score"] for t in m["times"]}}
              for key, m in c["models"].items()}
        for sha, c in previous.items()
    }}


def write_outputs(report: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "latest.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")

    with (out_dir / "results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["course", "model", "distance_km", "gain_m", "course_demand_km", "adjusted_demand_km",
                         "terrain_factor", "confidence", "world_best", "time_label", "time", "score"])
        for course in report["courses"]:
            for key, m in course.get("models", {}).items():
                base = [course["name"], key, course["distance_km"], course["gain_m"], course["course_demand_km"],
                        m["adjusted_demand_km"], m["terrain_factor"], m["confidence"], format_duration(m["world_best_seconds"])]
                for entry in m["times"] or [{"label": "", "seconds": None, "score": ""}]:
                    writer.writerow(base + [entry["label"], format_duration(entry["seconds"]) if entry["seconds"] else "", entry["score"]])

    target = out_dir / "report.html"
    target.write_text(render_html(report), encoding="utf-8")
    return target


def render_html(report: dict) -> str:
    payload = json.dumps(report, ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.read_text(encoding="utf-8").replace("/*__LAB_DATA__*/null", payload)


def print_summary(report: dict, log=print) -> None:
    prod = next(m["key"] for m in report["models"] if m["production"])
    rows = [("course", "km", "gain", "demand", "adj.", "terrain", "1000 =", "conf.", "your times")]
    for c in report["courses"]:
        if "error" in c:
            rows.append((c["name"][:32], "-", "-", "-", "-", "-", "-", "ERROR", c["error"][:60]))
            continue
        m = c["models"][prod]
        rows.append((c["name"][:32], f"{c['distance_km']:.1f}", f"{c['gain_m']:.0f}", f"{c['course_demand_km']:.1f}",
                     f"{m['adjusted_demand_km']:.1f}", f"{m['terrain_factor']:.3f}", format_duration(m["world_best_seconds"]),
                     m["confidence"], ", ".join(f"{t['label']} {format_duration(t['seconds'])} -> {t['score']}" for t in m["times"])))
    widths = [max(len(str(row[i])) for row in rows) for i in range(len(rows[0]) - 1)]
    for row in rows:
        log("  ".join(str(v).ljust(w) for v, w in zip(row, widths)) + "  " + str(row[-1]))


# --- CLI ----------------------------------------------------------------------------------------

def _snapshot(directories: list[Path]) -> tuple:
    return tuple(sorted(
        (str(p), p.stat().st_mtime_ns) for d in directories for p in d.rglob("*")
        if p.is_file() and (p.suffix.lower() == ".gpx" or p.name == "times.csv") and _shown(p, d)
    ))


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["serve"]:
        from .serve import main as serve
        return serve(argv[1:])
    parser = argparse.ArgumentParser(
        prog="python -m scoring_lab",
        description="Score every GPX in a folder with one or more models and write an HTML report.",
    )
    parser.add_argument("dirs", nargs="*", type=Path, help=f"folders to scan for .gpx (default: {_display_path(DEFAULT_COURSES_DIR)})")
    parser.add_argument("-m", "--models", default="all", help="comma list of model keys, or 'all' (default). 'prod' is always included")
    parser.add_argument("--list-models", action="store_true", help="list the models and exit")
    parser.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT_DIR, help="where report.html, latest.json and results.csv go")
    parser.add_argument("-j", "--jobs", type=int, default=max(1, min(8, (os.cpu_count() or 2) - 1)), help="processes for measuring new courses")
    parser.add_argument("--no-cache", action="store_true", help="re-measure every course")
    parser.add_argument("--clear-cache", action="store_true", help="delete cached measurements and exit")
    parser.add_argument("--save-baseline", action="store_true", help="after this run, keep its results as the baseline later reports compare against")
    parser.add_argument("--dem-manifest", type=Path, help="measure elevations from this DEM manifest (sets OTRI_DEM_MANIFEST)")
    parser.add_argument("--open", action="store_true", help="open the report in the browser")
    parser.add_argument("--watch", action="store_true", help="rebuild whenever a GPX or times.csv changes")
    args = parser.parse_args(argv)

    if args.list_models:
        for model in LAB_MODELS:
            print(f"{model.key:18} {model.name}\n{'':18} {model.description}")
        return 0
    if args.clear_cache:
        shutil.rmtree(CACHE_DIR, ignore_errors=True)
        print("Cache cleared.")
        return 0
    if args.dem_manifest:
        os.environ["OTRI_DEM_MANIFEST"] = str(args.dem_manifest.resolve())

    try:
        models = select_models(args.models)
    except ValueError as error:
        parser.error(str(error))
    directories = [d.resolve() for d in (args.dirs or [DEFAULT_COURSES_DIR])]
    missing = [d for d in directories if not d.is_dir()]
    if missing:
        parser.error("not a folder: " + ", ".join(map(str, missing)))

    def run() -> Path:
        report = build(directories, models, jobs=args.jobs, use_cache=not args.no_cache)
        attach_baseline(report, args.out / "baseline.json")
        target = write_outputs(report, args.out)
        if args.save_baseline:
            shutil.copyfile(args.out / "latest.json", args.out / "baseline.json")
        print()
        print_summary(report)
        for problem in report["problems"]:
            print(f"times.csv: {problem}")
        ok = sum("error" not in c for c in report["courses"])
        print(f"\n{ok}/{len(report['courses'])} course(s), {len(models)} model(s), {report['elapsed_seconds']} s, "
              f"elevation from {'DEM' if report['terrain'] == 'dem' else 'the GPX files'}")
        print(f"Report: {target}")
        return target

    if not discover(directories):
        print(f"No .gpx files in {', '.join(map(_display_path, directories))}. Drop some in and run again.")
        if not args.watch:
            return 1
    else:
        target = run()
        if args.open:
            webbrowser.open(target.as_uri())

    if args.watch:
        print("Watching for changes (Ctrl+C to stop) ...")
        seen = _snapshot(directories)
        try:
            while True:
                time.sleep(1.5)
                now = _snapshot(directories)
                if now != seen:
                    seen = now
                    if discover(directories):
                        run()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
