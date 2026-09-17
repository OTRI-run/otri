"""Versioned course measurement. No network requests or race-specific tuning.

The GPX fallback is a denoised estimate, not a surveyed terrain measurement.
All distances are horizontal WGS84 chainages; resampling never cuts corners.
"""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from hashlib import sha256
from itertools import groupby
import json
import math
import statistics

from geographiclib.geodesic import Geodesic

from .gpx import GpxParseError, TrackPoint

VERSION = 'course-measurement-v1'
PARAMETERS = dict(spacing_m=10.0, median_radius_m=10.0, mean_radius_m=10.0,
                  reversal_m=8.0, grade_window_m=50.0, max_missing_gap_m=30.0,
                  smoothing_policy='terrain-or-implausible-local-elevation')


def interpolate(xs, ys, x):
    i = max(0, min(len(xs) - 2, bisect_right(xs, x) - 1))
    return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i])


def boundaries(length, step):
    result = [i * step for i in range(math.ceil(length / step))]
    if len(result) > 1 and length - result[-1] < 1e-6:
        result[-1] = length
        return result
    return result + [length]


def prominence(values, threshold=8.0):
    """Retain confirmed extrema AND the final endpoint, including residual reversal."""
    if not values:
        return []
    retained = [values[0]]
    extreme = values[0]
    direction = 0
    for z in values[1:]:
        if direction == 0:
            direction = 1 if z > extreme else -1 if z < extreme else 0
            extreme = z
        elif direction == 1:
            if z >= extreme:
                extreme = z
            elif extreme - z >= threshold:
                retained.append(extreme)
                direction, extreme = -1, z
        else:
            if z <= extreme:
                extreme = z
            elif z - extreme >= threshold:
                retained.append(extreme)
                direction, extreme = 1, z
    retained.extend([extreme, values[-1]])
    return retained


def _smooth(xs, zs):
    # Uniform interior spacing prevents the original recorder's sampling density
    # from weighting the filter. Preserve endpoints; clip windows, never pad.
    values = zs[:]
    for radius, reducer in [(PARAMETERS['median_radius_m'], statistics.median),
                            (PARAMETERS['mean_radius_m'], statistics.mean)]:
        result = []
        for i, x in enumerate(xs):
            lo = max(0, bisect_right(xs, x - radius - 1e-8))
            hi = bisect_right(xs, x + radius + 1e-8)
            result.append(reducer(values[lo:hi]))
        result[0], result[-1] = zs[0], zs[-1]
        values = result
    return values


@dataclass(frozen=True)
class Measurement:
    # Each segment holds (local chainage m, cleaned elevation m).
    segments: tuple
    distance_m: float
    gain_m: float
    loss_m: float
    steep_climb_m: float
    steep_descent_m: float
    max_climb_grade: float | None
    max_descent_grade: float | None
    min_elevation_m: float
    max_elevation_m: float
    geometry_hash: str
    source: dict
    quality_flags: tuple[str, ...]

    def to_dict(self):
        profile, offset = [], 0.0
        for sid, segment in enumerate(self.segments):
            for x, z in segment:
                profile.append(dict(distanceKm=(offset + x) / 1000, elevation=z, segmentId=sid))
            offset += segment[-1][0]
        return dict(version=VERSION, parameters=PARAMETERS.copy(), distance_method='WGS84 horizontal',
                    geometry_hash=self.geometry_hash, source=self.source,
                    status='needs_review' if any(f in self.quality_flags for f in ('implausible_local_elevation_change', 'sustained_grade_outside_scoring_domain', 'disconnected_track_segments')) else 'provisional', quality_flags=list(self.quality_flags),
                    coverage_fraction=1.0, profile=profile,
                    profile_hash=sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest())


def measure_course(points: list[TrackPoint], provider=None) -> Measurement:
    if len(points) < 2:
        raise GpxParseError('at least two valid track points are required')
    flags = {'elevation_estimate_not_field_validated'}
    source = {'dataset': 'uploaded-gpx', 'datum': 'unknown', 'sensor': 'unknown'}
    if provider is not None:
        source = provider.manifest
    else:
        flags.add('unknown_elevation_provenance')
    segments = []
    total = gain = loss = steep_up = steep_down = 0.0
    grades = []
    for _, group in groupby(points, key=lambda p: p.segment_id):
        original = list(group)
        clean = []
        noisy = False
        for _, duplicates in groupby(original, key=lambda p: (p.lat, p.lon)):
            duplicates = list(duplicates)
            p = duplicates[0]
            if not math.isfinite(p.lat) or not math.isfinite(p.lon) or not -90 <= p.lat <= 90 or not -180 <= p.lon <= 180:
                raise GpxParseError('invalid coordinates')
            zs = [q.elevation_m for q in duplicates if q.elevation_m is not None and math.isfinite(q.elevation_m)]
            if len(duplicates) > 1:
                flags.add('consecutive_duplicate_coordinates')
                if zs and max(zs) != min(zs):
                    flags.add('conflicting_duplicate_elevations')
                    noisy = True
            clean.append(TrackPoint(p.lat, p.lon, statistics.median(zs) if zs else None, p.time, p.segment_id))
        if len(clean) < 2:
            raise GpxParseError('each track segment needs two distinct coordinates')
        xs = [0.0]
        for a, b in zip(clean, clean[1:]):
            length = Geodesic.WGS84.Inverse(a.lat, a.lon, b.lat, b.lon)['s12']
            if length <= 1e-6:
                raise GpxParseError('consecutive coordinates resolve to the same WGS84 location')
            xs.append(xs[-1] + length)
            if length > 100:
                flags.add('sparse_geometry_over_100m')
            if a.elevation_m is not None and b.elevation_m is not None and abs(b.elevation_m - a.elevation_m) > max(8, length):
                flags.add('implausible_local_elevation_change')
                noisy = True
        if total + xs[-1] > 2_000_000:
            raise GpxParseError('course exceeds the 2,000 km measurement limit')
        grid = boundaries(xs[-1], PARAMETERS['spacing_m'])
        if provider is None:
            known = [(x, p.elevation_m) for x, p in zip(xs, clean) if p.elevation_m is not None]
            if len(known) < 2 or clean[0].elevation_m is None or clean[-1].elevation_m is None:
                raise GpxParseError('elevation coverage incomplete: missing endpoint or profile; provide an elevation-complete GPX or configure a terrain provider')
            for i, p in enumerate(clean):
                if p.elevation_m is None:
                    j = bisect_right([x for x, _ in known], xs[i])
                    if known[j][0] - known[j-1][0] > PARAMETERS['max_missing_gap_m']:
                        raise GpxParseError('elevation coverage incomplete: missing interval exceeds 30 m')
                    flags.add('short_elevation_gap_interpolated')
            kx, kz = zip(*known)
            zs = [interpolate(kx, kz, x) for x in grid]
        else:
            locations = []
            for x in grid:
                i = max(0, min(len(xs)-2, bisect_right(xs, x)-1))
                a, b = clean[i:i+2]
                edge = Geodesic.WGS84.Inverse(a.lat, a.lon, b.lat, b.lon)
                pos = Geodesic.WGS84.Direct(a.lat, a.lon, edge['azi1'], x-xs[i])
                locations.append((pos['lat2'], pos['lon2']))
            try:
                zs = provider.sample(locations)
            except (OSError, ValueError, KeyError) as error:
                raise GpxParseError(f'terrain lookup failed: {error}') from error
            if len(zs) != len(grid) or any(z is None or not math.isfinite(z) for z in zs):
                raise GpxParseError('terrain provider has incomplete elevation coverage')
        # Avoid applying both spatial smoothing and a prominence filter to an
        # already smooth route-planner profile. The rule depends on observable
        # geometry/elevation quality, never filenames, race totals or creator.
        if noisy or provider is not None:
            filtered = _smooth(grid, zs)
            flags.add('spatial_smoothing_applied')
        else:
            filtered = zs
        extrema = prominence(filtered, PARAMETERS['reversal_m'])
        gain += sum(max(0, b-a) for a, b in zip(extrema, extrema[1:]))
        loss += sum(max(0, a-b) for a, b in zip(extrema, extrema[1:]))
        bins = boundaries(xs[-1], PARAMETERS['grade_window_m'])
        for a, b in zip(bins, bins[1:]):
            dz = interpolate(grid, filtered, b) - interpolate(grid, filtered, a)
            if dz / (b-a) >= 0.15:
                steep_up += b-a
            elif dz / (b-a) <= -0.15:
                steep_down += b-a
        window = PARAMETERS['grade_window_m']
        if xs[-1] >= window:
            starts = sorted(set([x for x in grid if x + window <= xs[-1]] +
                                [x-window for x in grid if x >= window]))
            grades.extend((interpolate(grid, filtered, x+window)-interpolate(grid, filtered, x))/window for x in starts)
        else:
            flags.add('segment_shorter_than_grade_window')
        segments.append(tuple(zip(grid, filtered)))
        total += xs[-1]
    if len(segments) > 1:
        flags.add('disconnected_track_segments')
    if grades and max(abs(g) for g in grades) > 0.45:
        flags.add('sustained_grade_outside_scoring_domain')
    elevations = [z for segment in segments for _, z in segment]
    geometry_hash = sha256(json.dumps([(p.lat, p.lon, p.segment_id) for p in points]).encode()).hexdigest()
    return Measurement(tuple(segments), total, gain, loss, steep_up, steep_down,
                       max(0, max(grades)) if grades else None, max(0, -min(grades)) if grades else None,
                       min(elevations), max(elevations), geometry_hash, source, tuple(sorted(flags)))
