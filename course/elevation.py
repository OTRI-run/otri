"""Optional pinned local GeoTIFF terrain provider; no remote uploads or fallbacks.

Set OTRI_DEM_MANIFEST to a JSON manifest with dataset, release, datum,
resolution_m and tiles [{path, sha256}]. Paths are relative to that manifest.
Install course/requirements-terrain.txt to enable this adapter.
"""
from contextlib import ExitStack
from hashlib import sha256
import json
import math
import os
from pathlib import Path

from .gpx import GpxParseError


class RasterProvider:
    def __init__(self, manifest_path):
        self.path = Path(manifest_path)
        self.manifest = json.loads(self.path.read_text(encoding='utf-8'))
        for key in ('dataset', 'release', 'datum', 'resolution_m', 'tiles'):
            if not self.manifest.get(key):
                raise ValueError(f'terrain manifest requires {key}')
        self.manifest['interpolation'] = 'bilinear-pixel-centers'

    def sample(self, locations):
        try:
            import rasterio
        except ImportError as error:
            raise GpxParseError('terrain configured but rasterio is not installed') from error
        with ExitStack() as stack:
            rasters = []
            for tile in self.manifest['tiles']:
                path = self.path.parent / tile['path']
                digest = sha256()
                with path.open('rb') as f:
                    for chunk in iter(lambda: f.read(1024*1024), b''):
                        digest.update(chunk)
                if digest.hexdigest() != tile['sha256']:
                    raise GpxParseError(f'terrain tile checksum mismatch: {path.name}')
                raster = stack.enter_context(rasterio.open(path))
                if raster.crs != rasterio.crs.CRS.from_epsg(4326) or raster.transform.b or raster.transform.d or raster.transform.a <= 0 or raster.transform.e >= 0:
                    raise GpxParseError('terrain tiles must be north-up EPSG:4326 rasters')
                if rasters and (raster.transform.a, raster.transform.e) != (rasters[0].transform.a, rasters[0].transform.e):
                    raise GpxParseError('terrain tiles must share one native resolution')
                rasters.append(raster)

            def pixel(lon, lat):
                for r in rasters:
                    if r.bounds.left <= lon < r.bounds.right and r.bounds.bottom < lat <= r.bounds.top:
                        row, col = r.index(lon, lat)
                        value = r.read(1, window=((row, row+1), (col, col+1)), masked=True)
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
                c, row = c-0.5, row-0.5
                left, top = math.floor(c), math.floor(row)
                fx, fy = c-left, row-top
                values = []
                for dy, dx, weight in [(0,0,(1-fx)*(1-fy)), (0,1,fx*(1-fy)), (1,0,(1-fx)*fy), (1,1,fx*fy)]:
                    if weight <= 1e-12:
                        continue
                    x, y = r.transform * (left+dx+0.5, top+dy+0.5)
                    values.append((pixel(x,y), weight))
                result.append(None if any(v is None for v,w in values) else sum(v*w for v,w in values))
            return result


def configured_provider():
    path = os.environ.get('OTRI_DEM_MANIFEST')
    if not path:
        return None
    try:
        return RasterProvider(path)
    except (OSError, ValueError, KeyError) as error:
        raise GpxParseError(f'invalid terrain configuration: {error}') from error
