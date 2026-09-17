"""Tests for course-measurement-v2 and the V0.7 DEM-gated scoring model.

A synthetic GeoTIFF stands in for a real Copernicus tile so the DEM path runs end to end
(manifest, checksum, bilinear sampling, provenance) without shipping terrain data.
"""

import hashlib
import json
import math
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pytest
import rasterio
from geographiclib.geodesic import Geodesic
from rasterio.transform import from_origin

from course.elevation import RasterProvider
from course.gpx import GpxParseError, TrackPoint, parse_track_points
from course.measurement import PARAMETERS, REVIEW_FLAGS, VERSION, Measurement, measure_course
from scoring.course_standard import DEM_GATED_CURVE, SMOOTHED_UPPER_CURVE, confidence_for
from scoring.estimator import estimate_score
from scoring.measured_demand import compute_measured_demand

REPO_ROOT = Path(__file__).resolve().parents[2]
UTMB = REPO_ROOT / "data" / "demo" / "gpx" / "utmb_174km_universal.gpx"
needs_real_courses = pytest.mark.skipif(not UTMB.exists(), reason="real demo GPX not present (see DATA_POLICY.md)")

# The synthetic world: a 30 m raster over 97.99-98.05 E, 7.96-8.15 N with gentle 600 m-wavelength
# hills, and a 12 km switchbacking track through it heading north from (8.0, 98.0). The raster
# must contain the whole track with margin: a course that leaves the tiles is, correctly, a
# coverage failure (tested separately below).
ORIGIN_LON, ORIGIN_LAT, PIXEL_DEG = 97.99, 8.15, 30 / 111_320
RASTER_ROWS, RASTER_COLS = 700, 200

# The raster path multiplies Affine transforms with `*`, which rasterio/affine now flag as pending
# deprecation on every sample. That is pre-existing provider code, not under test here.
pytestmark = pytest.mark.filterwarnings("ignore::PendingDeprecationWarning", "ignore::DeprecationWarning")


@pytest.fixture(scope="module")
def dem(tmp_path_factory):
    folder = tmp_path_factory.mktemp("dem")
    rows, cols = RASTER_ROWS, RASTER_COLS
    z = np.fromfunction(lambda r, c: 100 + 50 * np.sin(c / 20) + 30 * np.cos(r / 25), (rows, cols), dtype=float).astype("float32")
    tif = folder / "synthetic.tif"
    with rasterio.open(tif, "w", driver="GTiff", height=rows, width=cols, count=1, dtype="float32", crs="EPSG:4326",
                       transform=from_origin(ORIGIN_LON, ORIGIN_LAT, PIXEL_DEG, PIXEL_DEG)) as ds:
        ds.write(z, 1)
    manifest = folder / "manifest.json"
    manifest.write_text(json.dumps({
        "dataset": "synthetic-test-dem", "release": "t1", "datum": "test", "resolution_m": 30,
        "tiles": [{"path": tif.name, "sha256": hashlib.sha256(tif.read_bytes()).hexdigest()}],
    }), encoding="utf-8")
    return RasterProvider(manifest)


def switchback_track(n_points=1200, spacing_m=10.0, amplitude_m=60.0, wavelength_points=40):
    """Northbound track that zigzags east-west, so decimation chords the corners."""
    points = []
    for i in range(n_points):
        north = Geodesic.WGS84.Direct(8.0, 98.0, 0, i * spacing_m)
        east = Geodesic.WGS84.Direct(north["lat2"], north["lon2"], 90, amplitude_m * math.sin(2 * math.pi * i / wavelength_points))
        points.append(TrackPoint(east["lat2"], east["lon2"], None, None, 0))
    return points


def with_uploaded_elevation(points, z=120.0):
    return [TrackPoint(p.lat, p.lon, z + 10 * math.sin(i / 30), p.time, p.segment_id) for i, p in enumerate(points)]


# ------------------------------------------------------------------ measurement v2: the gate


def test_measurement_version_is_v2_and_records_median_spacing():
    m = measure_course(with_uploaded_elevation(switchback_track()))
    assert VERSION == "course-measurement-v2"
    assert m.to_dict()["version"] == "course-measurement-v2"
    assert m.median_edge_m is not None and 10 < m.median_edge_m < 20


def test_dense_track_is_not_flagged_sparse():
    m = measure_course(with_uploaded_elevation(switchback_track()))
    assert "sparse_geometry_median_over_30m" not in m.quality_flags
    assert not m.needs_review


def test_sparse_track_is_marked_needs_review_with_the_gate_flag():
    m = measure_course(with_uploaded_elevation(switchback_track()[::4]))
    assert m.median_edge_m > PARAMETERS["max_median_edge_m"]
    assert "sparse_geometry_median_over_30m" in m.quality_flags
    assert m.needs_review
    assert m.to_dict()["status"] == "needs_review"


def test_review_flags_are_shared_between_status_and_scoring():
    assert "sparse_geometry_median_over_30m" in REVIEW_FLAGS


def test_v1_snapshot_without_median_edge_still_replays():
    """Stored measurements predate the new field; replay must not need it."""
    m = measure_course(with_uploaded_elevation(switchback_track(200)))
    snapshot = json.loads(json.dumps(asdict(m)))
    del snapshot["median_edge_m"]
    restored = Measurement(**snapshot)
    assert restored.median_edge_m is None
    assert compute_measured_demand(measurement=restored).course_demand_km == compute_measured_demand(measurement=m).course_demand_km


# ------------------------------------------------------------------ the DEM path


def test_dem_provider_supplies_elevation_and_provenance(dem):
    m = measure_course(switchback_track(), dem)
    assert m.dem_sourced
    assert m.source["dataset"] == "synthetic-test-dem"
    assert "unknown_elevation_provenance" not in m.quality_flags
    assert m.gain_m > 0


def test_uploaded_elevations_are_ignored_when_the_dem_covers_the_course(dem):
    """Two devices with different barometers produce the same measurement."""
    a = measure_course(with_uploaded_elevation(switchback_track(), z=100.0), dem)
    b = measure_course(with_uploaded_elevation(switchback_track(), z=900.0), dem)
    assert a.gain_m == b.gain_m and a.loss_m == b.loss_m
    assert a.to_dict()["profile_hash"] == b.to_dict()["profile_hash"]


def test_course_outside_dem_coverage_falls_back_announced(dem):
    """Far from the raster: use the file's elevations, say so, and never pretend it was DEM."""
    far = [TrackPoint(p.lat + 5.0, p.lon, p.elevation_m, p.time, p.segment_id) for p in with_uploaded_elevation(switchback_track(300))]
    m = measure_course(far, dem)
    assert not m.dem_sourced
    assert "terrain_coverage_incomplete_used_uploaded_elevation" in m.quality_flags
    assert "unknown_elevation_provenance" in m.quality_flags


def test_course_outside_dem_coverage_with_no_uploaded_elevation_still_fails_closed(dem):
    far = [TrackPoint(p.lat + 5.0, p.lon, None, p.time, p.segment_id) for p in switchback_track(300)]
    with pytest.raises(GpxParseError, match="coverage"):
        measure_course(far, dem)


def test_accepted_density_keeps_demand_within_three_percent_on_the_same_dem(dem):
    """The V0.7 claim, tested as stated: with elevation fixed by the DEM, every thinning whose
    median spacing passes the gate measures within 3% of the full-density track, and every
    thinning that fails the gate is marked needs_review. Which side each step lands on is read
    from the measurement (the zigzag lengthens edges beyond the nominal 10 m x step), not assumed."""
    full = switchback_track()
    base = compute_measured_demand(measurement=measure_course(full, dem)).course_demand_km
    passed, flagged = [], []
    for step in (2, 3, 4, 6):
        m = measure_course(full[::step], dem)
        d = compute_measured_demand(measurement=m).course_demand_km
        if m.median_edge_m <= PARAMETERS["max_median_edge_m"]:
            assert not m.needs_review, step
            assert abs(d / base - 1) <= 0.03, (step, m.median_edge_m, d, base)
            passed.append(step)
        else:
            assert "sparse_geometry_median_over_30m" in m.quality_flags, step
            assert m.needs_review, step
            flagged.append(step)
    # The gate must actually be exercised on both sides by this track.
    assert passed and flagged, (passed, flagged)


# ------------------------------------------------------------------ V0.7 confidence ladder


def test_confidence_is_high_only_with_dem_on_a_dense_track(dem):
    dense = measure_course(switchback_track(), dem)
    assert confidence_for(dense, DEM_GATED_CURVE, True) == ("High", ())

    sparse = measure_course(switchback_track()[::4], dem)
    label, reasons = confidence_for(sparse, DEM_GATED_CURVE, True)
    assert label == "Low" and any(r.startswith("measurement_needs_review") for r in reasons)
    assert any("median point spacing" in r for r in reasons)

    uploaded = measure_course(with_uploaded_elevation(switchback_track()))
    label, reasons = confidence_for(uploaded, DEM_GATED_CURVE, True)
    assert label == "Low" and any(r.startswith("elevation_not_dem_sourced") for r in reasons)


def test_older_curves_keep_their_historical_confidence_rule(dem):
    dense = measure_course(switchback_track(), dem)
    assert confidence_for(dense, SMOOTHED_UPPER_CURVE, True) == ("Medium", ())
    assert confidence_for(None, DEM_GATED_CURVE, False) == ("Low", ())


def test_estimate_carries_confidence_and_reasons(dem):
    pts = switchback_track()
    high = estimate_score(3600, gpx_points=pts, measurement=measure_course(pts, dem))
    assert high.confidence == "High"
    assert high.to_dict()["confidence"] == "High"
    low = estimate_score(3600, gpx_points=with_uploaded_elevation(pts))
    assert low.confidence == "Low"
    assert any(f.startswith("elevation_not_dem_sourced") for f in low.quality_flags)


def test_v07_scores_identically_to_v06_for_the_same_measurement(dem):
    """V0.7 changes what a score claims, not what it is."""
    pts = switchback_track()
    m = measure_course(pts, dem)
    v6 = estimate_score(3600, gpx_points=pts, measurement=m, curve=SMOOTHED_UPPER_CURVE)
    v7 = estimate_score(3600, gpx_points=pts, measurement=m, curve=DEM_GATED_CURVE)
    assert v7.predicted_score == v6.predicted_score
    assert v7.otri_raw == v6.otri_raw


@needs_real_courses
def test_real_course_is_dense_enough_to_pass_the_gate():
    pts = parse_track_points(UTMB.read_text(encoding="utf-8"))
    m = measure_course(pts)
    assert m.median_edge_m <= PARAMETERS["max_median_edge_m"]
    assert "sparse_geometry_median_over_30m" not in m.quality_flags
    sparse = measure_course(pts[::5])
    assert "sparse_geometry_median_over_30m" in sparse.quality_flags
