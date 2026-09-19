"""Terrain tiles on demand (course/dem_fetch.py). No network: the download is replaced by a function
that writes a tiny synthetic GeoTIFF where the real tile would go."""

import json
import os
import time

import pytest

rasterio = pytest.importorskip("rasterio")
import numpy as np  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402

from course import dem_fetch  # noqa: E402
from course.elevation import RasterProvider, cell_of, configured_provider  # noqa: E402
from course.gpx import TrackPoint  # noqa: E402


def _point(lat, lon):
    return TrackPoint(lat=lat, lon=lon, elevation_m=None, time=None)


def _write_tile(path, lat, lon, value=500.0, crs="EPSG:4326"):
    """A 4x4 raster over the 1x1 degree cell whose south-west corner is (lat, lon)."""
    with rasterio.open(path, "w", driver="GTiff", width=4, height=4, count=1, dtype="float32", crs=crs, transform=from_origin(lon, lat + 1, 0.25, 0.25), nodata=-9999) as dst:
        dst.write(np.full((4, 4), value, dtype="float32"), 1)


@pytest.fixture
def autofetch(tmp_path, monkeypatch):
    """Autofetch switched on, with a fake bucket that has every cell except open sea at 0N 0E."""
    manifest = tmp_path / "dem" / "manifest.json"
    monkeypatch.setenv("OTRI_DEM_MANIFEST", str(manifest))
    monkeypatch.setenv("OTRI_DEM_AUTOFETCH", "1")
    downloads = []

    def fake_download(name, target):
        downloads.append(name)
        lat, lon = cell_of(name)
        if (lat, lon) == (0, 0):
            return False
        _write_tile(target, lat, lon, value=1000.0 + lat)
        return True

    monkeypatch.setattr(dem_fetch, "_download", fake_download)
    return manifest, downloads


def test_tile_names_and_cells_follow_the_copernicus_convention():
    assert dem_fetch.tile_name(45, 6) == "Copernicus_DSM_COG_10_N45_00_E006_00_DEM"
    assert dem_fetch.tile_name(-9, -74) == "Copernicus_DSM_COG_10_S09_00_W074_00_DEM"
    assert cell_of(dem_fetch.tile_name(-9, -74) + ".tif") == (-9, -74)
    assert cell_of("0.tif") is None
    # A point at 45.9N 6.9E lives in the N45E006 cell; one at -8.2, -73.5 in S09W074.
    assert dem_fetch.cells_for([_point(45.9, 6.9)]) == {(45, 6)}
    assert dem_fetch.cells_for([_point(-8.2, -73.5)]) == {(-9, -74)}
    # Within a hair of a corner, the three neighbours are wanted too.
    assert dem_fetch.cells_for([_point(46.001, 7.001)]) == {(45, 6), (45, 7), (46, 6), (46, 7)}


def test_it_is_off_unless_asked_for(tmp_path, monkeypatch):
    monkeypatch.setenv("OTRI_DEM_MANIFEST", str(tmp_path / "manifest.json"))
    monkeypatch.delenv("OTRI_DEM_AUTOFETCH", raising=False)
    assert dem_fetch.ensure_tiles([_point(45.5, 6.5)])["skipped"] == "disabled"
    assert not (tmp_path / "manifest.json").exists()


def test_a_course_somewhere_new_gets_its_tiles_once_and_is_measured_from_them(autofetch):
    manifest, downloads = autofetch
    course = [_point(45.5, 6.5), _point(45.6, 6.6)]
    assert configured_provider() is None, "no manifest yet: measure from the file, as before"

    outcome = dem_fetch.ensure_tiles(course)
    assert outcome["fetched"] == ["Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif"] and outcome["skipped"] is None
    data = json.loads(manifest.read_text(encoding="utf-8"))
    assert data["dataset"] == "Copernicus DEM GLO-30"
    (tile,) = data["tiles"]
    assert tile["cell"] == [45, 6] and tile["bytes"] > 0 and tile["fetched_at"] and len(tile["sha256"]) == 64

    # Pinned like any installed tile: the provider verifies the checksum and reads it.
    assert RasterProvider(manifest).sample([(45.5, 6.5)]) == [pytest.approx(1045.0)]
    assert configured_provider().sample([(45.5, 6.5)]) == [pytest.approx(1045.0)]
    # A second course in the same cell downloads nothing.
    assert dem_fetch.ensure_tiles(course)["fetched"] == [] and len(downloads) == 1


def test_open_sea_is_remembered_and_not_asked_for_again(autofetch):
    manifest, downloads = autofetch
    first = dem_fetch.ensure_tiles([_point(0.5, 0.5)])
    assert first["absent"] == ["Copernicus_DSM_COG_10_N00_00_E000_00_DEM.tif"] and first["fetched"] == []
    assert dem_fetch.ensure_tiles([_point(0.5, 0.5)])["absent"] == [] and len(downloads) == 1
    assert configured_provider() is None, "a manifest with no tiles measures from the file"


def test_a_course_across_half_a_continent_fetches_nothing(autofetch):
    _manifest, downloads = autofetch
    sprawl = [_point(40.5 + i, 5.5 + i) for i in range(8)]
    outcome = dem_fetch.ensure_tiles(sprawl)
    assert "more than" in outcome["skipped"] and downloads == []


def test_a_failed_or_broken_download_changes_nothing_and_never_raises(autofetch, monkeypatch):
    manifest, _downloads = autofetch

    def failing(name, target):
        raise OSError("connection reset")

    monkeypatch.setattr(dem_fetch, "_download", failing)
    assert "connection reset" in dem_fetch.ensure_tiles([_point(45.5, 6.5)])["skipped"]
    assert not manifest.exists()

    def wrong_projection(name, target):
        _write_tile(target, 45, 6, crs="EPSG:3857")
        return True

    monkeypatch.setattr(dem_fetch, "_download", wrong_projection)
    assert "EPSG:4326" in dem_fetch.ensure_tiles([_point(45.5, 6.5)])["skipped"]
    assert not manifest.exists() and not list(manifest.parent.glob("*.tif")), "a tile the provider would refuse never reaches the manifest"
    assert not manifest.with_suffix(".lock").exists()


def test_the_budget_deletes_the_fetched_tiles_unused_longest_and_never_the_installed_ones(autofetch, monkeypatch):
    manifest, _downloads = autofetch
    folder = manifest.parent
    folder.mkdir(parents=True)
    installed = "Copernicus_DSM_COG_10_N18_00_E098_00_DEM.tif"  # put there by 06-install-dem.sh: no fetched_at
    _write_tile(folder / installed, 18, 98)
    from course.elevation import _sha256_of

    manifest.write_text(json.dumps({**dem_fetch.MANIFEST_HEADER, "tiles": [{"path": installed, "sha256": _sha256_of(folder / installed)}]}), encoding="utf-8")

    for lat in (45, 46, 47):
        dem_fetch.ensure_tiles([_point(lat + 0.5, 6.5)])
    tile_size = (folder / installed).stat().st_size
    old = folder / "Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif"
    os.utime(old, (time.time() - 86400, time.time() - 86400))

    # Room for two fetched tiles: the next fetch pushes out the one unused for longest.
    monkeypatch.setattr(dem_fetch, "budget_bytes", lambda: int(tile_size * 3.5))
    outcome = dem_fetch.ensure_tiles([_point(48.5, 6.5)])
    assert outcome["evicted"] == [old.name] and not old.exists()
    paths = {tile["path"] for tile in json.loads(manifest.read_text(encoding="utf-8"))["tiles"]}
    assert installed in paths and old.name not in paths and "Copernicus_DSM_COG_10_N48_00_E006_00_DEM.tif" in paths
    assert (folder / installed).exists()


def test_tiles_of_different_widths_work_together(tmp_path):
    """Copernicus tiles narrow towards the poles: 1 arc-second of longitude up to 50 degrees, 1.5 beyond."""
    names = [dem_fetch.tile_name(49, 6) + ".tif", dem_fetch.tile_name(50, 6) + ".tif"]
    from course.elevation import _sha256_of

    with rasterio.open(tmp_path / names[0], "w", driver="GTiff", width=4, height=4, count=1, dtype="float32", crs="EPSG:4326", transform=from_origin(6, 50, 0.25, 0.25)) as dst:
        dst.write(np.full((4, 4), 100.0, dtype="float32"), 1)
    with rasterio.open(tmp_path / names[1], "w", driver="GTiff", width=2, height=4, count=1, dtype="float32", crs="EPSG:4326", transform=from_origin(6, 51, 0.5, 0.25)) as dst:
        dst.write(np.full((4, 2), 300.0, dtype="float32"), 1)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({**dem_fetch.MANIFEST_HEADER, "tiles": [{"path": name, "sha256": _sha256_of(tmp_path / name)} for name in names]}), encoding="utf-8")
    assert RasterProvider(manifest).sample([(49.5, 6.5), (50.5, 6.5)]) == [pytest.approx(100.0), pytest.approx(300.0)]


def test_a_tile_fetched_elsewhere_keeps_every_other_courses_cached_measurement(autofetch):
    import importlib

    app_module = importlib.import_module("api.app")

    alps, andes = [_point(45.5, 6.5)], [_point(-32.5, -69.5)]
    dem_fetch.ensure_tiles(alps)
    before = app_module._manifest_fingerprint(configured_provider(), alps)
    dem_fetch.ensure_tiles(andes)
    provider = configured_provider()
    assert app_module._manifest_fingerprint(provider, alps) == before
    assert app_module._manifest_fingerprint(provider, andes) != before
