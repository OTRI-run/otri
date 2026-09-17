"""Optional pinned local GeoTIFF terrain provider; no remote uploads or fallbacks.

Set OTRI_DEM_MANIFEST to a JSON manifest with dataset, release, datum,
resolution_m and tiles [{path, sha256}]. Paths are relative to that manifest.
Install course/requirements-terrain.txt to enable this adapter.

Performance notes (a 1-CPU, 1 GB droplet measures a 171 km course in ~60 s
without them, ~3 s with them):

- Tiles are checksummed and opened **once**, when the provider is built, and
  `configured_provider()` reuses one provider per process for as long as the
  manifest is unchanged. The first version re-hashed every tile (hundreds of
  MB) on every call.
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
import threading

from .gpx import GpxParseError

# Bilinear neighbour offsets (row, col) and their weight expressions.
_NEIGHBOURS = ((0, 0), (0, 1), (1, 0), (1, 1))
_WEIGHT_EPS = 1e-12

# Largest window (pixels) read in one go per tile; bigger courses are sampled in row bands so a
# tiny droplet never has to hold more than a few MB of raster at once.
_MAX_WINDOW_PIXELS = 4_000_000


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
        for key in ('dataset', 'release', 'datum', 'resolution_m', 'tiles'):
            if not self.manifest.get(key):
                raise ValueError(f'terrain manifest requires {key}')
        self.manifest['interpolation'] = 'bilinear-pixel-centers'
        self._rasters = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ tiles
    def _open(self):
        """Verify checksums and open every tile once; keep the handles for the process."""
        if self._rasters is not None:
            return self._rasters
        try:
            import rasterio
        except ImportError as error:
            raise GpxParseError('terrain configured but rasterio is not installed') from error
        rasters = []
        for tile in self.manifest['tiles']:
            path = self.path.parent / tile['path']
            if _sha256_of(path) != tile['sha256']:
                raise GpxParseError(f'terrain tile checksum mismatch: {path.name}')
            raster = rasterio.open(path)
            if raster.crs != rasterio.crs.CRS.from_epsg(4326) or raster.transform.b or raster.transform.d or raster.transform.a <= 0 or raster.transform.e >= 0:
                raise GpxParseError('terrain tiles must be north-up EPSG:4326 rasters')
            if rasters and (raster.transform.a, raster.transform.e) != (rasters[0].transform.a, rasters[0].transform.e):
                raise GpxParseError('terrain tiles must share one native resolution')
            rasters.append(raster)
        self._rasters = rasters
        return rasters

    def close(self):
        if self._rasters:
            for raster in self._rasters:
                raster.close()
        self._rasters = None

    # --------------------------------------------------------------- sampling
    def sample(self, locations):
        """Elevation (m) at each (lat, lon), or None where the tiles cannot answer."""
        import numpy as np

        rasters = self._open()
        n = len(locations)
        if n == 0:
            return []
        lats = np.array([lat for lat, _ in locations], dtype=float)
        lons = np.array([lon for _, lon in locations], dtype=float)
        result = np.full(n, np.nan, dtype=float)
        ok = np.ones(n, dtype=bool)          # becomes False once any needed neighbour is missing
        assigned = np.zeros(n, dtype=bool)   # location has a home tile

        with self._lock:
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
            return provider
    except (OSError, ValueError, KeyError) as error:
        raise GpxParseError(f'invalid terrain configuration: {error}') from error
