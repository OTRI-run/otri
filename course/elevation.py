"""Optional pinned local GeoTIFF terrain provider; no remote uploads or fallbacks.

Set OTRI_DEM_MANIFEST to a JSON manifest with dataset, release, datum,
resolution_m and tiles [{path, sha256}]. Paths are relative to that manifest.
Install course/requirements-terrain.txt to enable this adapter.

Performance notes (a 1-CPU, 1 GB droplet measures a 171 km course in ~60 s
without them, ~3 s with them):

- A tile is checksummed and opened **once per process, the first time a course
  needs it**, and `configured_provider()` reuses one provider per process for as
  long as the manifest is unchanged. With tiles fetched on demand
  (`course/dem_fetch.py`) a manifest can name hundreds of them and changes
  whenever one is added: verifying all of them on every change would read
  gigabytes to measure one course. Which tiles a course needs is read from the
  Copernicus file name (its 1x1 degree cell); a tile with any other name is
  always opened, as before.
- Sampling is vectorised: one bounding-window read per tile per course, then
  bilinear interpolation over all locations in numpy. The first version issued
  a separate windowed GDAL read for every bilinear neighbour of every point.

The numerical result is identical to the scalar reference implementation
(`_sample_scalar`, kept for the equivalence test): pixel-centre bilinear
interpolation, neighbours with negligible weight skipped, a location is `None`
if any neighbour it uses is nodata or outside every tile, and a neighbour that
falls past one tile's edge is read from whichever tile contains it.
"""
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import threading

from .gpx import GpxParseError

# Bilinear neighbour offsets (row, col) and their weight expressions.
_NEIGHBOURS = ((0, 0), (0, 1), (1, 0), (1, 1))
_WEIGHT_EPS = 1e-12

# Largest window (pixels) read in one go per tile; bigger courses are sampled in row bands so a
# tiny droplet never has to hold more than a few MB of raster at once.
_MAX_WINDOW_PIXELS = 4_000_000


# Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif -> the cell whose south-west corner is 45N 6E.
_CELL = re.compile(r"_([NS])(\d{2})_00_([EW])(\d{3})_00_")
# Tiles are aligned to pixel centres, so a tile reaches half a pixel past its cell; a course point
# that close to the edge also needs the neighbour. One hundredth of a degree covers both.
_CELL_MARGIN = 0.01
# Open rasters kept per process; the least recently used is closed beyond this.
_MAX_OPEN_RASTERS = 24

# Checksums already verified in this process, by (path, size, mtime): a rebuilt provider (the
# manifest changed because a tile was added) does not read every other tile again.
_verified: dict[tuple[str, int, int], str] = {}


def cell_of(name: str) -> tuple[int, int] | None:
    """(lat, lon) of the south-west corner of the 1x1 degree cell a Copernicus tile name covers."""
    match = _CELL.search(name)
    if not match:
        return None
    ns, lat, ew, lon = match.groups()
    return (int(lat) if ns == "N" else -int(lat), int(lon) if ew == "E" else -int(lon))


def _sha256_of(path: Path) -> str:
    digest = sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


class RasterProvider:
    def __init__(self, manifest_path):
        self.path = Path(manifest_path)
        self.manifest = json.loads(self.path.read_text(encoding='utf-8'))
        for key in ('dataset', 'release', 'datum', 'resolution_m'):
            if not self.manifest.get(key):
                raise ValueError(f'terrain manifest requires {key}')
        if not isinstance(self.manifest.get('tiles'), list):
            raise ValueError('terrain manifest requires tiles')
        self.manifest['interpolation'] = 'bilinear-pixel-centers'
        self._rasters = None  # {tile path: open raster}, least recently used first
        self._row_height = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ tiles
    def _raster(self, tile):
        """The open raster for one manifest entry: checksum verified and geometry checked the first
        time this process uses the tile, then kept open."""
        if self._rasters is None:
            self._rasters = {}
        name = tile['path']
        raster = self._rasters.pop(name, None)
        if raster is None:
            try:
                import rasterio
            except ImportError as error:
                raise GpxParseError('terrain configured but rasterio is not installed') from error
            path = self.path.parent / name
            stat = path.stat()
            key = (str(path), stat.st_size, stat.st_mtime_ns)
            if _verified.get(key) != tile['sha256']:
                if _sha256_of(path) != tile['sha256']:
                    raise GpxParseError(f'terrain tile checksum mismatch: {path.name}')
                _verified[key] = tile['sha256']
            raster = rasterio.open(path)
            # Copernicus tiles narrow towards the poles (1" of longitude up to 50 degrees, 1.5" to
            # 60, ...), so pixel widths may differ between tiles; rows are 1" everywhere. Bilinear
            # interpolation runs in the home tile's grid and a neighbour past its edge is read by
            # location from whichever tile holds it, so mixed widths are sound.
            if raster.crs != rasterio.crs.CRS.from_epsg(4326) or raster.transform.b or raster.transform.d or raster.transform.a <= 0 or raster.transform.e >= 0:
                raster.close()
                raise GpxParseError('terrain tiles must be north-up EPSG:4326 rasters')
            if self._row_height is None:
                self._row_height = raster.transform.e
            elif raster.transform.e != self._row_height:
                raster.close()
                raise GpxParseError('terrain tiles must share one native row height')
        self._rasters[name] = raster  # most recently used last
        while len(self._rasters) > _MAX_OPEN_RASTERS:
            self._rasters.pop(next(iter(self._rasters))).close()
        return raster

    def _rasters_for(self, lats, lons):
        """The tiles that can hold these locations, opened; in manifest order, as before."""
        south, north = float(min(lats)) - _CELL_MARGIN, float(max(lats)) + _CELL_MARGIN
        west, east = float(min(lons)) - _CELL_MARGIN, float(max(lons)) + _CELL_MARGIN
        needed = []
        for tile in self.manifest['tiles']:
            cell = cell_of(tile['path'])
            if cell is None or (cell[0] <= north and cell[0] + 1 >= south and cell[1] <= east and cell[1] + 1 >= west):
                needed.append(tile)
        if len(needed) > _MAX_OPEN_RASTERS:
            raise GpxParseError('this course spans more terrain tiles than can be read at once')
        return [self._raster(tile) for tile in needed]

    def _open(self):
        """Every tile, verified and opened. For small manifests and the tests; sampling opens only
        what a course needs."""
        return [self._raster(tile) for tile in self.manifest['tiles']]

    def close(self):
        if self._rasters:
            for raster in self._rasters.values():
                raster.close()
        self._rasters = None

    # --------------------------------------------------------------- sampling
    def sample(self, locations):
        """Elevation (m) at each (lat, lon), or None where the tiles cannot answer."""
        import numpy as np

        n = len(locations)
        if n == 0:
            return []
        lats = np.array([lat for lat, _ in locations], dtype=float)
        lons = np.array([lon for _, lon in locations], dtype=float)
        result = np.full(n, np.nan, dtype=float)
        ok = np.ones(n, dtype=bool)          # becomes False once any needed neighbour is missing
        assigned = np.zeros(n, dtype=bool)   # location has a home tile

        with self._lock:
            rasters = self._rasters_for(lats, lons)
            # 1. Each location's neighbour grid is defined by the first tile that contains it.
            for raster in rasters:
                b = raster.bounds
                home = (~assigned) & (lons >= b.left) & (lons < b.right) & (lats > b.bottom) & (lats <= b.top)
                if not home.any():
                    continue
                assigned |= home
                idx = np.nonzero(home)[0]
                inv = ~raster.transform
                cols, rows = inv * (lons[idx], lats[idx])
                cols, rows = np.asarray(cols) - 0.5, np.asarray(rows) - 0.5
                left, top = np.floor(cols), np.floor(rows)
                fx, fy = cols - left, rows - top
                acc = np.zeros(len(idx), dtype=float)
                for dy, dx in _NEIGHBOURS:
                    weight = ((1 - fx) if dx == 0 else fx) * ((1 - fy) if dy == 0 else fy)
                    use = weight > _WEIGHT_EPS
                    if not use.any():
                        continue
                    # Neighbour pixel centres, in geographic coordinates, so a neighbour past this
                    # tile's edge is fetched from whichever tile holds it.
                    x, y = raster.transform * (left[use] + dx + 0.5, top[use] + dy + 0.5)
                    values = self._values_at(rasters, np.asarray(x), np.asarray(y))
                    missing = np.isnan(values)
                    sub = idx[use]
                    ok[sub[missing]] = False
                    acc[use] += np.where(missing, 0.0, values) * weight[use]
                result[idx] = acc

        out = []
        for i in range(n):
            out.append(None if (not assigned[i] or not ok[i] or not math.isfinite(result[i])) else float(result[i]))
        return out

    def _values_at(self, rasters, xs, ys):
        """Pixel values at exact pixel-centre coordinates, from whichever tile contains each."""
        import numpy as np

        values = np.full(len(xs), np.nan, dtype=float)
        pending = np.ones(len(xs), dtype=bool)
        for raster in rasters:
            b = raster.bounds
            inside = pending & (xs >= b.left) & (xs < b.right) & (ys > b.bottom) & (ys <= b.top)
            if not inside.any():
                continue
            pending &= ~inside
            idx = np.nonzero(inside)[0]
            # What rasterio's `index()` does, minus its cast to Python ints: inverse affine, floor.
            cols_f, rows_f = ~raster.transform * (xs[idx], ys[idx])
            rows = np.floor(np.asarray(rows_f)).astype(int)
            cols = np.floor(np.asarray(cols_f)).astype(int)
            values[idx] = self._read_pixels(raster, rows, cols)
        return values

    @staticmethod
    def _read_pixels(raster, rows, cols):
        """Read the rows x cols pixels through one bounding window (or a few row bands)."""
        import numpy as np
        from rasterio.windows import Window

        out = np.full(len(rows), np.nan, dtype=float)
        valid = (rows >= 0) & (rows < raster.height) & (cols >= 0) & (cols < raster.width)
        if not valid.any():
            return out
        r0, r1 = int(rows[valid].min()), int(rows[valid].max()) + 1
        c0, c1 = int(cols[valid].min()), int(cols[valid].max()) + 1
        width = c1 - c0
        band_rows = max(1, _MAX_WINDOW_PIXELS // max(width, 1))
        for start in range(r0, r1, band_rows):
            stop = min(r1, start + band_rows)
            sel = valid & (rows >= start) & (rows < stop)
            if not sel.any():
                continue
            block = raster.read(1, window=Window(c0, start, width, stop - start), masked=True)
            data = np.ma.filled(block.astype(float), np.nan)
            out[sel] = data[rows[sel] - start, cols[sel] - c0]
        return out

    # --------------------------------------------------- reference implementation
    def _sample_scalar(self, locations):
        """The original per-pixel implementation. Slow; kept only so tests can prove `sample`
        returns exactly the same numbers."""
        rasters = self._open()

        def pixel(lon, lat):
            for r in rasters:
                if r.bounds.left <= lon < r.bounds.right and r.bounds.bottom < lat <= r.bounds.top:
                    row, col = r.index(lon, lat)
                    value = r.read(1, window=((row, row + 1), (col, col + 1)), masked=True)
                    if value.size and not value.mask.any():
                        return float(value[0, 0])
            return None

        result = []
        for lat, lon in locations:
            r = next((r for r in rasters if r.bounds.left <= lon < r.bounds.right and r.bounds.bottom < lat <= r.bounds.top), None)
            if r is None:
                result.append(None)
                continue
            c, row = (~r.transform) * (lon, lat)
            c, row = c - 0.5, row - 0.5
            left, top = math.floor(c), math.floor(row)
            fx, fy = c - left, row - top
            values = []
            for dy, dx, weight in [(0, 0, (1 - fx) * (1 - fy)), (0, 1, fx * (1 - fy)), (1, 0, (1 - fx) * fy), (1, 1, fx * fy)]:
                if weight <= _WEIGHT_EPS:
                    continue
                x, y = r.transform * (left + dx + 0.5, top + dy + 0.5)
                values.append((pixel(x, y), weight))
            result.append(None if any(v is None for v, w in values) else sum(v * w for v, w in values))
        return result


# One provider per process per manifest, rebuilt only if the manifest file changes.
_provider_cache = {}
_provider_lock = threading.Lock()


def configured_provider():
    path = os.environ.get('OTRI_DEM_MANIFEST')
    if not path:
        return None
    # With tiles fetched on demand (course/dem_fetch.py) the manifest may not exist yet, or may
    # only record cells that have no tile: there is no terrain to measure from, which is not an error.
    if not os.path.exists(path) and os.environ.get('OTRI_DEM_AUTOFETCH'):
        return None
    try:
        stat = os.stat(path)
        key = (os.path.abspath(path), stat.st_mtime_ns, stat.st_size)
        with _provider_lock:
            provider = _provider_cache.get(key)
            if provider is None:
                for stale in list(_provider_cache.values()):
                    stale.close()
                _provider_cache.clear()
                provider = RasterProvider(path)
                _provider_cache[key] = provider
            return provider if provider.manifest['tiles'] else None
    except (OSError, ValueError, KeyError) as error:
        raise GpxParseError(f'invalid terrain configuration: {error}') from error
