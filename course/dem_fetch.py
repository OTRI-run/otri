"""Terrain tiles on demand.

OTRI measures a course's elevation from Copernicus DEM GLO-30 tiles kept on its own disk, pinned by
checksum in a manifest (`course/elevation.py`). Installing them by hand region by region
(`scripts/deploy/06-install-dem.sh`) left every course anywhere else at Low confidence, and the
whole dataset is some 26,000 tiles and several hundred GB.

With `OTRI_DEM_AUTOFETCH=1`, the tiles a course needs are downloaded the first time a course needs
them, from the same public bucket the install script uses, checksummed, checked to be a readable
GeoTIFF of the right shape, and added to the manifest. From then on they are pinned like any other
tile: the measurement still runs on local files with no third-party service in the loop, and a
stored race keeps its own measurement snapshot whatever happens to the tile later.

Disk use is bounded by `OTRI_DEM_BUDGET_MB` (default 8192). Beyond it, the fetched tiles that have
gone longest without being used are deleted. Tiles installed by hand are never deleted.

Guard rails, because any visitor can upload a course anywhere on Earth: at most
`MAX_TILES_PER_COURSE` per course, a cell with no tile (open sea) is remembered and not asked for
again, and any failure leaves the course measured exactly as before this module existed: from its
own elevations, at Low confidence.

A request that fetches holds one of the API's worker threads while it does, and there are forty.
So the time a request may spend here is bounded, whatever the network and however many ask:

- the caller says whether these tiles may be fetched at all (`allow`: the API keeps a daily
  allowance per visitor and per account and an hourly one for everyone, `api/app.py`);
- at most `MAX_CONCURRENT_FETCHES` downloads run at once across all workers, and a request that
  finds them taken does not queue, it measures without;
- a tile somebody else is already fetching is waited for, briefly, not fetched twice;
- a download has `DOWNLOAD_SECONDS` in all, not per read, and a course `COURSE_SECONDS`;
- the manifest lock is held for the moment the manifest is rewritten, never across a download.
  It used to be held across all of a course's downloads: eight requests for eight new tiles ran
  one after the other, the last one waiting for the seven before it with its thread in hand.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .elevation import _CELL_MARGIN, _sha256_of, cell_of

log = logging.getLogger("otri.dem")

BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
MAX_TILES_PER_COURSE = 6
DOWNLOAD_TIMEOUT_SECONDS = 20  # one read from the socket
DOWNLOAD_SECONDS = 60  # one tile, start to end
COURSE_SECONDS = 90  # everything one request may spend fetching
MAX_CONCURRENT_FETCHES = 3
LOCK_STALE_SECONDS = 300
LOCK_WAIT_SECONDS = 10  # the lock covers a manifest rewrite, which takes milliseconds
ABSENT_RETRY_DAYS = 30

MANIFEST_HEADER = {
    "dataset": "Copernicus DEM GLO-30",
    "release": "COG public bucket, 2022-05",
    "datum": "EGM2008 (orthometric)",
    "resolution_m": 30,
    "attribution": (
        "Produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH "
        "2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved."
    ),
}


def enabled() -> bool:
    return os.environ.get("OTRI_DEM_AUTOFETCH", "").strip().lower() in ("1", "true", "yes") and bool(os.environ.get("OTRI_DEM_MANIFEST"))


def budget_bytes() -> int:
    try:
        return max(256, int(os.environ.get("OTRI_DEM_BUDGET_MB", "8192"))) * 1024 * 1024
    except ValueError:
        return 8192 * 1024 * 1024


def status() -> dict:
    """For the admin overview: whether tiles are fetched on demand, and how much of the budget the
    fetched ones use."""
    info = {"autofetch": enabled(), "budget_mb": budget_bytes() // (1024 * 1024), "fetched_tiles": 0, "fetched_mb": 0}
    try:
        manifest = Path(os.environ.get("OTRI_DEM_MANIFEST", ""))
        if enabled() and manifest.exists():
            fetched = [tile for tile in _read(manifest)["tiles"] if tile.get("fetched_at")]
            info["fetched_tiles"] = len(fetched)
            info["fetched_mb"] = round(sum(tile.get("bytes", 0) for tile in fetched) / (1024 * 1024))
    except Exception:  # noqa: BLE001 - a dashboard figure
        pass
    return info


def tile_name(lat: int, lon: int) -> str:
    """The Copernicus name of the tile whose south-west corner is (lat, lon)."""
    return f"Copernicus_DSM_COG_10_{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00_DEM"


def cells_for(points) -> set[tuple[int, int]]:
    """Every 1x1 degree cell the course touches, counting a point within a hair of an edge as touching
    the neighbour too (bilinear interpolation reads across the edge)."""
    cells = set()
    for point in points:
        for dlat in (-_CELL_MARGIN, _CELL_MARGIN):
            for dlon in (-_CELL_MARGIN, _CELL_MARGIN):
                lat, lon = point.lat + dlat, point.lon + dlon
                if -90 <= lat < 90 and -180 <= lon < 180:
                    cells.add((math.floor(lat), math.floor(lon)))
    return cells


@contextmanager
def _manifest_lock(manifest: Path):
    """One writer at a time across gunicorn workers: a lock file created exclusively, taken over if
    its holder died."""
    lock = manifest.with_suffix(".lock")
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while True:
        try:
            handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(handle)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > LOCK_STALE_SECONDS:
                    lock.unlink(missing_ok=True)
                    continue
            except OSError:
                continue
            if time.monotonic() > deadline:
                raise TimeoutError("terrain tiles are being fetched by another request")
            time.sleep(0.05)
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)


def _read(manifest: Path) -> dict:
    if manifest.exists():
        return json.loads(manifest.read_text(encoding="utf-8"))
    return {**MANIFEST_HEADER, "tiles": []}


def _write(manifest: Path, data: dict) -> None:
    temporary = manifest.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, manifest)


class _Busy(Exception):
    """Every download slot is taken, or the tile did not arrive in time: measure without it."""


def _take(path: Path) -> bool:
    """Create a marker file if nobody holds it; a marker whose holder died is taken over."""
    try:
        os.close(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        return True
    except FileExistsError:
        try:
            if time.time() - path.stat().st_mtime > LOCK_STALE_SECONDS:
                path.unlink(missing_ok=True)
        except OSError:
            pass
        return False


@contextmanager
def _fetch_slot(manifest: Path, file_name: str, deadline: float):
    """The right to download one tile: a marker for the tile, so it is not fetched twice, and one
    of the few numbered slots, so not many are fetched at once. Yields False when another request
    fetched this very tile while we waited for it (nothing left to download)."""
    folder = manifest.parent
    marker = folder / (file_name + ".fetching")
    while not _take(marker):  # somebody is fetching this tile: wait for theirs
        if time.monotonic() > deadline:
            raise _Busy(f"{file_name} is still being fetched by another request")
        time.sleep(0.5)
    slot = None
    try:
        if any(tile.get("path") == file_name for tile in _read(manifest)["tiles"]):
            yield False
            return
        slot = next((path for path in (folder / f"slot-{n}.fetching" for n in range(MAX_CONCURRENT_FETCHES)) if _take(path)), None)
        if slot is None:
            raise _Busy("terrain tiles are being fetched for other courses")
        yield True
    finally:
        marker.unlink(missing_ok=True)
        if slot is not None:
            slot.unlink(missing_ok=True)


def _download(name: str, target: Path) -> bool:
    """Fetch one tile. False when the bucket has none for this cell (sea); raises on anything else."""
    part = target.with_suffix(".part")
    request = urllib.request.Request(f"{BUCKET}/{name}/{name}.tif", headers={"User-Agent": "otri-dem-fetch"})
    give_up = time.monotonic() + DOWNLOAD_SECONDS
    try:
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, part.open("wb") as out:  # noqa: S310 - fixed https host
            while chunk := response.read(1 << 20):
                out.write(chunk)
                if time.monotonic() > give_up:  # the socket timeout is per read: a trickle would never trip it
                    raise TimeoutError(f"{name} did not download within {DOWNLOAD_SECONDS} s")
    except urllib.error.HTTPError as error:
        part.unlink(missing_ok=True)
        if error.code in (403, 404):  # the bucket answers 403/404 for keys that do not exist
            return False
        raise
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    os.replace(part, target)
    return True


def _check_geotiff(path: Path) -> None:
    """A tile that would make the provider refuse every course must never reach the manifest."""
    import rasterio

    with rasterio.open(path) as raster:
        ok = raster.crs == rasterio.crs.CRS.from_epsg(4326) and not raster.transform.b and not raster.transform.d and raster.transform.a > 0 and raster.transform.e < 0 and raster.count >= 1
    if not ok:
        raise ValueError(f"{path.name} is not a north-up EPSG:4326 raster")


def _evict(manifest: Path, data: dict, keep: set[str]) -> list[str]:
    """Delete the fetched tiles unused for longest until the fetched set fits the budget. Tiles
    without `fetched_at` were installed by hand and stay."""
    folder = manifest.parent
    fetched = [tile for tile in data["tiles"] if tile.get("fetched_at")]
    total = sum((folder / tile["path"]).stat().st_size for tile in fetched if (folder / tile["path"]).exists())
    removed = []
    for tile in sorted(fetched, key=lambda entry: (folder / entry["path"]).stat().st_mtime if (folder / entry["path"]).exists() else 0):
        if total <= budget_bytes():
            break
        if tile["path"] in keep:
            continue
        path = folder / tile["path"]
        total -= path.stat().st_size if path.exists() else 0
        path.unlink(missing_ok=True)
        data["tiles"].remove(tile)
        removed.append(tile["path"])
    return removed


def _record(manifest: Path, now: float, *, tile: dict | None = None, absent: str | None = None, keep: set[str] = frozenset()) -> list[str]:
    """Add one fetched tile (or one cell known to have none) to the manifest, and evict to the
    budget. The only place the manifest is written, and the only thing done under its lock."""
    with _manifest_lock(manifest):
        data = _read(manifest)
        data["absent"] = {name: at for name, at in (data.get("absent") or {}).items() if now - at < ABSENT_RETRY_DAYS * 86400}
        if absent:
            data["absent"][absent] = now
        if tile and all(entry["path"] != tile["path"] for entry in data["tiles"]):
            data["tiles"].append(tile)
        evicted = _evict(manifest, data, keep=keep)
        data["tiles"].sort(key=lambda entry: entry["path"])
        _write(manifest, data)
    return evicted


def ensure_tiles(points, allow=None) -> dict:
    """Make sure the tiles under `points` are installed, fetching what is missing. Never raises:
    the answer says what happened and the caller measures with whatever is there.

    `allow(n)` is asked once, when `n` tiles are missing, whether they may be fetched for this
    caller; None means yes."""
    outcome = {"fetched": [], "absent": [], "evicted": [], "skipped": None}
    if not enabled():
        outcome["skipped"] = "disabled"
        return outcome
    manifest = Path(os.environ["OTRI_DEM_MANIFEST"])
    try:
        cells = cells_for(points)
        if not cells or len(cells) > MAX_TILES_PER_COURSE:
            outcome["skipped"] = "no points" if not cells else f"course spans {len(cells)} tiles, more than {MAX_TILES_PER_COURSE}"
            return outcome
        wanted = {tile_name(lat, lon) + ".tif" for lat, lon in cells}
        current = _read(manifest)
        installed = {tile["path"] for tile in current["tiles"]}
        now = time.time()
        for path in wanted & installed:  # used: keep it away from eviction
            try:
                os.utime(manifest.parent / path)
            except OSError:
                pass
        absent = {name: at for name, at in (current.get("absent") or {}).items() if now - at < ABSENT_RETRY_DAYS * 86400}
        missing = sorted(wanted - installed - set(absent))
        if not missing:
            return outcome
        if allow is not None and not allow(len(missing)):
            outcome["skipped"] = "the caller's allowance of new terrain tiles is used up"
            return outcome

        manifest.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + COURSE_SECONDS
        for file_name in missing:
            if time.monotonic() > deadline:
                raise _Busy(f"no time left for {file_name}")
            with _fetch_slot(manifest, file_name, deadline) as mine:
                if not mine:
                    continue  # another request fetched it while we waited
                target = manifest.parent / file_name
                if not _download(file_name[:-4], target):
                    _record(manifest, now, absent=file_name)
                    outcome["absent"].append(file_name)
                    continue
                try:
                    _check_geotiff(target)
                    tile = {
                        "path": file_name,
                        "sha256": _sha256_of(target),
                        "bytes": target.stat().st_size,
                        "cell": list(cell_of(file_name)),
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }
                    outcome["evicted"] += _record(manifest, now, tile=tile, keep=wanted)
                except Exception:
                    target.unlink(missing_ok=True)
                    raise
                outcome["fetched"].append(file_name)
        if outcome["fetched"] or outcome["evicted"]:
            log.info("terrain tiles: fetched %s, evicted %s", outcome["fetched"], outcome["evicted"])
    except Exception as error:  # noqa: BLE001 - terrain is an improvement, never a reason to fail a course
        outcome["skipped"] = f"{type(error).__name__}: {error}"
        log.warning("terrain tiles not fetched: %s", outcome["skipped"])
    return outcome
