"""Legacy feature regression values preserved while v1 has independent contract tests."""
"""Unit tests for GPX reading and course-feature extraction.

Expected values for pure north-south fixtures (single-climb, out-and-back)
have a closed-form check: for two points differing only in latitude, the
haversine distance reduces exactly to ``EARTH_RADIUS_M * radians(delta_lat)``,
so the segment distance and resulting elevation grades can be verified by
hand, not just by re-running the code under test.

Run with: pytest tests/unit
"""

import math
from pathlib import Path

from course import read_track_points
from course.features import extract_features_legacy as extract_features
from course.features import _EARTH_RADIUS_M

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "gpx"

# All north-south fixtures below step by exactly this many degrees of
# latitude per point, at the same longitude.
_LAT_STEP_DEG = 0.0010
_SEGMENT_M = _EARTH_RADIUS_M * math.radians(_LAT_STEP_DEG)  # ~111.19 m, hand-derivable closed form


def test_flat_loop_has_zero_elevation_change():
    points = read_track_points(FIXTURES / "flat-loop.gpx")
    features = extract_features(points)

    assert features.elevation_gain_m == 0.0
    assert features.elevation_loss_m == 0.0
    assert features.min_elevation_m == 100.0
    assert features.max_elevation_m == 100.0
    # Two longitude segments (shortened by cos(latitude)) + two latitude segments.
    assert features.distance_km == round(2 * _SEGMENT_M / 1000 + 2 * _SEGMENT_M * math.cos(math.radians(13.0)) / 1000, 3)


def test_single_climb_filters_gps_noise_and_flags_steep_segments():
    points = read_track_points(FIXTURES / "single-climb.gpx")
    features = extract_features(points)

    # Deltas per segment: +10, +0.5, +19.5, -20. The +0.5 blip doesn't reverse
    # direction, so hysteresis folds it into the climbing run: 10 + 0.5 + 19.5 = 30.
    assert features.elevation_gain_m == 30.0
    assert features.elevation_loss_m == 20.0
    assert features.min_elevation_m == 1000.0
    assert features.max_elevation_m == 1030.0
    assert features.distance_km == round(4 * _SEGMENT_M / 1000, 3)

    # +19.5 m and -20 m over one ~111.19 m segment are both >= the 15% steep threshold.
    assert features.steep_climb_distance_km == round(_SEGMENT_M / 1000, 3)
    assert features.steep_descent_distance_km == round(_SEGMENT_M / 1000, 3)

    # Grades are now per-run averages, not a single noisy segment: the climb run
    # spans all 3 segments (10 + 0.5 + 19.5 = 30 m over 3 * _SEGMENT_M), while the
    # descent is exactly one final segment (20 m over _SEGMENT_M) so it matches
    # what a single-segment calculation would have given.
    assert features.max_climb_grade == round(30.0 / (3 * _SEGMENT_M), 4)
    assert features.max_descent_grade == round(20.0 / _SEGMENT_M, 4)


def test_out_and_back_gain_equals_loss():
    points = read_track_points(FIXTURES / "out-and-back.gpx")
    features = extract_features(points)

    # Same 100 m climb outbound, then the identical 100 m descent on the return leg.
    assert features.elevation_gain_m == 100.0
    assert features.elevation_loss_m == 100.0
    assert features.min_elevation_m == 500.0
    assert features.max_elevation_m == 600.0
    assert features.distance_km == round(2 * (10 * _SEGMENT_M) / 1000, 3)  # 0.01 deg = 10x the 0.001 deg step


def test_feature_extraction_is_deterministic_across_runs():
    points = read_track_points(FIXTURES / "single-climb.gpx")
    first = extract_features(points).to_dict()
    second = extract_features(points).to_dict()
    assert first == second


def test_real_loop_course_has_balanced_gain_and_loss():
    # Real device/DEM-derived elevation from an actual course (ultraPacer
    # export), not a synthetic fixture — kept as a regression check because it
    # caught a real bug: a naive per-run noise filter silently discarded small
    # reversals and let gain/loss drift apart by ~10 m even though this is a
    # loop course (start and finish at the same point), where they should match.
    points = read_track_points(FIXTURES / "phuket-trail-2026-pkt15.gpx")
    features = extract_features(points)

    assert features.elevation_gain_m == features.elevation_loss_m == 628.4
    assert features.distance_km == 14.611

    # Also a regression check for run-averaged (not single noisy segment)
    # steepest climb/descent grade: a per-segment calculation on this file
    # spikes to an implausible 40%.
    assert features.max_climb_grade == 0.1737
    assert features.max_descent_grade == 0.2032
