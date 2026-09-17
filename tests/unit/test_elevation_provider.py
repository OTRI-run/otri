"""Use tiny artificial rasters to verify interpolation; never live DEM APIs."""
from hashlib import sha256
import json

import pytest

rasterio = pytest.importorskip('rasterio')
import numpy as np
from rasterio.transform import from_origin
from course.elevation import RasterProvider
from course.gpx import GpxParseError


def provider(tmp_path, nodata=False):
    tiles = []
    # Adjacent 2x2 tiles: rows [0,10,20,30], [20,30,40,50].
    for i in range(2):
        p = tmp_path/f'{i}.tif'
        values = np.array([[i*20,i*20+10],[i*20+20,i*20+30]],dtype='float32')
        if nodata and i == 1:
            values[0,0] = -9999
        with rasterio.open(p,'w',driver='GTiff',width=2,height=2,count=1,dtype='float32',crs='EPSG:4326',transform=from_origin(i*2,2,1,1),nodata=-9999) as dst:
            dst.write(values,1)
        tiles.append(dict(path=p.name,sha256=sha256(p.read_bytes()).hexdigest()))
    manifest = tmp_path/'manifest.json'
    manifest.write_text(json.dumps(dict(dataset='synthetic',release='1',datum='test',resolution_m=100000,tiles=tiles)))
    return RasterProvider(manifest)


def test_pixel_centers_bilinear_seams_and_zero(tmp_path):
    p=provider(tmp_path)
    assert p.sample([(1.5,.5),(1,1),(1,2),(1,3)]) == pytest.approx([0,15,25,35])


def test_nodata_and_outside_are_not_zero(tmp_path):
    p=provider(tmp_path,nodata=True)
    assert p.sample([(1,2),(10,10)]) == [None,None]


def test_tile_changes_fail_checksum(tmp_path):
    p=provider(tmp_path)
    with (tmp_path/'0.tif').open('ab') as f:
        f.write(b'changed')
    with pytest.raises(GpxParseError, match='checksum'):
        p.sample([(1,1)])
