"""Measurement contracts tested independently of noisy race reference totals."""
import json
import math
from dataclasses import asdict
from pathlib import Path

import pytest
from geographiclib.geodesic import Geodesic

from course.gpx import GpxParseError, TrackPoint, parse_track_points, read_track_points
from course.features import extract_features
from course.measurement import Measurement, measure_course, prominence
from scoring.measured_demand import compute_measured_demand


def track(elevations, spacing=10, segment_id=0):
    points = []
    for i, z in enumerate(elevations):
        p = Geodesic.WGS84.Direct(8, 98, 0, i * spacing)
        points.append(TrackPoint(p['lat2'], p['lon2'], z, None, segment_id))
    return points


def test_monotonic_subthreshold_climb_and_endpoint_identity():
    m = measure_course(track(range(101)))
    assert m.distance_m == pytest.approx(1000, abs=1e-6)
    assert m.gain_m == pytest.approx(100)
    assert m.loss_m == pytest.approx(0)
    assert m.max_climb_grade == pytest.approx(.1)


def test_final_unconfirmed_reversal_is_not_discarded():
    zs = prominence([0, 10, 5])
    assert sum(max(0,b-a) for a,b in zip(zs,zs[1:])) == 10
    assert sum(max(0,a-b) for a,b in zip(zs,zs[1:])) == 5


def test_no_distance_or_ascent_is_invented_between_segments():
    a = track([100, 110], spacing=100)
    b = [TrackPoint(p.lat + 1, p.lon, p.elevation_m, None, 1) for p in track([500, 510], spacing=100)]
    m = measure_course(a+b)
    assert 199 < m.distance_m < 201
    assert m.gain_m == pytest.approx(20)
    assert len(m.segments) == 2
    assert 'disconnected_track_segments' in m.quality_flags


def test_duplicate_elevations_are_aggregated_not_added_as_vertical_distance():
    points = track([0, 10, 20], spacing=50)
    p = points[1]
    points.insert(1, TrackPoint(p.lat, p.lon, 12, None))
    m = measure_course(points)
    assert m.distance_m == pytest.approx(100)
    assert m.gain_m - m.loss_m == pytest.approx(20)
    assert 'conflicting_duplicate_elevations' in m.quality_flags


def test_identical_duplicate_cannot_trigger_additional_smoothing():
    points = track([0,5,10,9,7,0], spacing=20)
    a = measure_course(points)
    points.insert(2, points[2])
    b = measure_course(points)
    assert a.gain_m == pytest.approx(b.gain_m)
    assert a.segments == b.segments


@pytest.mark.parametrize('zs', [[None,None], [None,1,2], [0,1,None], [0,None,None,None,4]])
def test_incomplete_elevation_is_never_published_as_zero(zs):
    with pytest.raises(GpxParseError, match='no elevation'):
        measure_course(track(zs))


def test_small_missing_gap_interpolates_by_distance():
    m = measure_course(track([0,None,2]))
    assert m.gain_m == pytest.approx(2)
    assert 'short_elevation_gap_interpolated' in m.quality_flags


def test_short_course_grade_unavailable_and_remainder_preserved():
    m = measure_course(track([0,1],spacing=13))
    assert m.distance_m == pytest.approx(13)
    assert m.segments[0][-1][0] == pytest.approx(13)
    assert m.max_climb_grade is None
    assert m.gain_m == pytest.approx(1)


def test_densification_and_height_offset_do_not_change_monotonic_measurement():
    a = measure_course(track([0,10,20],spacing=100))
    b = measure_course(track([100+i for i in range(21)],spacing=10))
    assert a.distance_m == pytest.approx(b.distance_m,abs=1e-6)
    assert a.gain_m == pytest.approx(b.gain_m,abs=1e-6)
    assert a.max_climb_grade == pytest.approx(b.max_climb_grade,abs=1e-6)


def test_flat_jitter_is_suppressed():
    m = measure_course(track([0]+[1,-1]*20+[0]))
    assert m.gain_m <= 2
    assert m.gain_m == pytest.approx(m.loss_m)


def test_reverse_track_exchanges_gain_and_loss():
    p = track([0,1,2,3,9,15,20,18,12,5,4,3],spacing=10)
    a,b = measure_course(p),measure_course(list(reversed(p)))
    assert a.gain_m == pytest.approx(b.loss_m,abs=.01)
    assert a.loss_m == pytest.approx(b.gain_m,abs=.01)


def test_snapshot_replays_without_source_data():
    m = measure_course(track(range(21)))
    restored = Measurement(**json.loads(json.dumps(asdict(m))))
    assert restored.to_dict() == m.to_dict()
    demand = compute_measured_demand(measurement=restored)
    assert demand.elevation_gain_m == round(m.gain_m,1)
    assert demand.physical_distance_km == round(m.distance_m/1000,3)


@pytest.mark.parametrize('point', ['lat="nan" lon="98"', 'lat="91" lon="98"', 'lat="8" lon="181"', 'lat="eight" lon="98"'])
def test_parser_rejects_invalid_coordinates(point):
    with pytest.raises(GpxParseError):
        parse_track_points(f'<gpx><trk><trkseg><trkpt {point}/></trkseg></trk></gpx>')


def test_parser_preserves_segments_and_rejects_entities_and_multiple_tracks():
    xml = '<gpx><trk><trkseg><trkpt lat="8" lon="98"/></trkseg><trkseg><trkpt lat="9" lon="98"/></trkseg></trk></gpx>'
    assert [p.segment_id for p in parse_track_points(xml)] == [0,1]
    for invalid in ['<!DOCTYPE gpx><gpx/>', '<gpx><trk/><trk/></gpx>']:
        with pytest.raises(GpxParseError):
            parse_track_points(invalid)


def test_provider_nodata_fails_closed_and_valid_provider_has_provenance():
    class Provider:
        manifest = {'dataset':'test','release':'1','datum':'test'}
        def sample(self, locations):
            return [100.0]*len(locations)
    m = measure_course(track([None,None],spacing=100),Provider())
    assert m.gain_m == 0
    assert m.source['dataset'] == 'test'
    class Missing(Provider):
        def sample(self, locations):
            return [None]*len(locations)
    # v2: no DEM coverage + no uploaded elevation -> still fails closed ...
    with pytest.raises(GpxParseError, match='coverage'):
        measure_course(track([None,None]),Missing())
    # ... but with uploaded elevation it falls back, announced, and never claims DEM provenance.
    fallback = measure_course(track([0,1]),Missing())
    assert fallback.source['dataset'] == 'uploaded-gpx'
    assert 'terrain_coverage_incomplete_used_uploaded_elevation' in fallback.quality_flags


def test_phuket_2026_is_a_plausible_estimate_not_a_hardcoded_total():
    points = read_track_points(Path(__file__).parents[1]/'fixtures/gpx/phuket-trail-2026-pkt15.gpx')
    m = measure_course(points)
    assert 14.5 < m.distance_m/1000 < 14.7
    assert 580 < m.gain_m < 680  # Broad sanity band, not surveyed ground truth.
    assert m.gain_m-m.loss_m == pytest.approx(points[-1].elevation_m-points[0].elevation_m)
    assert m.max_climb_grade < 1
    assert m.max_descent_grade < 1
    assert compute_measured_demand(measurement=m).elevation_gain_m == extract_features(points).elevation_gain_m


def test_v3_geodesics_and_smoother_agree_with_the_v2_reference_to_nanometres():
    """v3 swaps the pure-Python geographiclib geodesics and statistics-based smoother for
    pyproj + numpy. The maths is the same; this pins how close: distances within 1e-8 m and
    smoothed elevations within 1e-9 m of a geographiclib/statistics reference, on a real course.
    (Not bit-identical - which is why v3 is a new processing version.)"""
    import statistics
    from bisect import bisect_right
    from course.measurement import PARAMETERS, _smooth
    from geographiclib.geodesic import Geodesic

    points = read_track_points(Path(__file__).resolve().parents[1] / "fixtures" / "gpx" / "phuket-trail-2026-pkt15.gpx")
    m = measure_course(points)

    # Reference edge lengths and total distance.
    ref_total = sum(Geodesic.WGS84.Inverse(a.lat, a.lon, b.lat, b.lon)["s12"] for a, b in zip(points, points[1:]))
    assert abs(m.distance_m - ref_total) < 1e-8 * max(1.0, ref_total / 1000)

    # Reference smoother on the same profile input (the stored profile is a stand-in for the
    # pre-smoothing values; the question is reducer and window identity).
    xs, zs = map(list, zip(*m.segments[0]))

    def reference(xs, zs):
        values = zs[:]
        for radius, reducer in [(PARAMETERS["median_radius_m"], statistics.median), (PARAMETERS["mean_radius_m"], statistics.mean)]:
            result = []
            for x in xs:
                lo = max(0, bisect_right(xs, x - radius - 1e-8))
                hi = bisect_right(xs, x + radius + 1e-8)
                result.append(reducer(values[lo:hi]))
            result[0], result[-1] = zs[0], zs[-1]
            values = result
        return values

    fast, slow = _smooth(xs, zs), reference(xs, zs)
    assert len(fast) == len(slow)
    assert max(abs(a - b) for a, b in zip(fast, slow)) < 1e-9
