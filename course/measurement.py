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

from pyproj import Geod

from .gpx import GpxParseError, TrackPoint

# v3: geodesics through pyproj's Geod (GeographicLib's Karney algorithm in C, vectorised) instead
# of the pure-Python geographiclib port, and the smoother in numpy. Same maths, same windows, same
# WGS84 ellipsoid; the two agree to ~3e-9 m on distances and ~5e-13 m on smoothed elevations, but
# not bit for bit, so profile hashes change and this is a new processing version (spec section
# 21). On a 1-CPU droplet the measure step drops from ~5 s to well under 1 s for a 171 km course.
VERSION = 'course-measurement-v3'
PARAMETERS = dict(spacing_m=10.0, median_radius_m=10.0, mean_radius_m=10.0,
                  reversal_m=8.0, grade_window_m=50.0, max_missing_gap_m=30.0,
                  smoothing_policy='terrain-or-implausible-local-elevation',
                  geodesic='pyproj.Geod(WGS84), Karney inverse/direct',
                  # v2: a track whose median point spacing exceeds this chords the switchbacks and
                  # measures the course short. Measured on four real courses: at or under 30 m the
                  # demand error stays within ~2-3%; at 45-60 m it reaches 4-8%. Such tracks are still
                  # measured, but the measurement is marked needs_review with a plain reason.
                  max_median_edge_m=30.0)

# Flags that make a measurement `needs_review` rather than `provisional`. Shared with scoring so
# the confidence ladder and the published status can never disagree.
REVIEW_FLAGS = (
    'implausible_local_elevation_change',
    'sustained_grade_outside_scoring_domain',
    'disconnected_track_segments',
    'sparse_geometry_median_over_30m',
)

# Flags that make the *number itself* untrustworthy across devices: the route was not measured
# (chorded switchbacks, missing distance) or the elevation actually used was implausible. These
# gate scoring confidence. `sustained_grade_outside_scoring_domain` is deliberately absent - it is
# a scoring-domain clamp notice, inherent to steep terrain (0.35% of a real alpine 100-miler),
# applied deterministically, and a single 50 m window tipping 0.45 -> 0.47 on a surface-model
# canopy edge says nothing about reproducibility. It still marks the measurement for review.
CONFIDENCE_BLOCKING_FLAGS = (
    'sparse_geometry_median_over_30m',
    'disconnected_track_segments',
    'implausible_local_elevation_change',
)

UPLOADED_SOURCE = {'dataset': 'uploaded-gpx', 'datum': 'unknown', 'sensor': 'unknown'}


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
    #
    # Windows are found exactly as before (searchsorted with the same +/-1e-8 slack on a
    # by-distance radius); on the 10 m grid almost every interior window holds three points,
    # which is reduced in one vectorised call, and the few clipped windows at segment ends are
    # reduced individually.
    import numpy as np

    x = np.asarray(xs, dtype=float)
    values = np.asarray(zs, dtype=float)
    for radius, reducer in ((PARAMETERS['median_radius_m'], np.median), (PARAMETERS['mean_radius_m'], np.mean)):
        lo = np.searchsorted(x, x - radius - 1e-8, side='right')
        hi = np.searchsorted(x, x + radius + 1e-8, side='right')
        result = np.empty_like(values)
        three = (hi - lo) == 3
        if three.any():
            idx = np.nonzero(three)[0]
            start = lo[idx]
            stack = np.stack([values[start], values[start + 1], values[start + 2]], axis=1)
            result[idx] = reducer(stack, axis=1)
        for i in np.nonzero(~three)[0]:
            result[i] = reducer(values[lo[i]:hi[i]])
        result[0], result[-1] = zs[0], zs[-1]
        values = result
    return values.tolist()


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
    # v2. Defaults so v1 snapshots stored before this field existed still replay unchanged.
    median_edge_m: float | None = None

    @property
    def needs_review(self) -> bool:
        return any(flag in self.quality_flags for flag in REVIEW_FLAGS)

    @property
    def blocks_confidence(self) -> bool:
        return any(flag in self.quality_flags for flag in CONFIDENCE_BLOCKING_FLAGS)

    @property
    def dem_sourced(self) -> bool:
        return self.source.get('dataset') != UPLOADED_SOURCE['dataset']

    def to_dict(self):
        profile, offset = [], 0.0
        for sid, segment in enumerate(self.segments):
            for x, z in segment:
                profile.append(dict(distanceKm=(offset + x) / 1000, elevation=z, segmentId=sid))
            offset += segment[-1][0]
        return dict(version=VERSION, parameters=PARAMETERS.copy(), distance_method='WGS84 horizontal',
                    geometry_hash=self.geometry_hash, source=self.source,
                    status='needs_review' if self.needs_review else 'provisional', quality_flags=list(self.quality_flags),
                    median_edge_m=self.median_edge_m,
                    coverage_fraction=1.0, profile=profile,
                    profile_hash=sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest())


def measure_course(points: list[TrackPoint], provider=None) -> Measurement:
    if len(points) < 2:
        raise GpxParseError('at least two valid track points are required')
    flags = {'elevation_estimate_not_field_validated'}
    # Provenance is decided per course, not per configuration: a configured DEM that does not
    # cover this course falls back to the uploaded elevations *announced* (flagged, and the
    # source recorded as uploaded), never silently. Genuine provider failures still stop the
    # measurement below.
    source = provider.manifest if provider is not None else dict(UPLOADED_SOURCE)
    used_provider = provider is not None
    segments = []
    total = gain = loss = steep_up = steep_down = 0.0
    grades = []
    edge_lengths = []
    for _, group in groupby(points, key=lambda p: p.segment_id):
        original = list(group)
        clean = []
        noisy = False
        uploaded_implausible = False
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
        geod = Geod(ellps='WGS84')
        lats = [p.lat for p in clean]
        lons = [p.lon for p in clean]
        azimuths, _, lengths = geod.inv(lons[:-1], lats[:-1], lons[1:], lats[1:])
        azimuths = [float(v) for v in azimuths]
        xs = [0.0]
        for (a, b), length in zip(zip(clean, clean[1:]), (float(v) for v in lengths)):
            if length <= 1e-6:
                raise GpxParseError('consecutive coordinates resolve to the same WGS84 location')
            xs.append(xs[-1] + length)
            edge_lengths.append(length)
            if length > 100:
                flags.add('sparse_geometry_over_100m')
            if a.elevation_m is not None and b.elevation_m is not None and abs(b.elevation_m - a.elevation_m) > max(8, length):
                uploaded_implausible = True
                noisy = True
        if total + xs[-1] > 2_000_000:
            raise GpxParseError('course exceeds the 2,000 km measurement limit')
        grid = boundaries(xs[-1], PARAMETERS['spacing_m'])

        def uploaded_profile():
            known = [(x, p.elevation_m) for x, p in zip(xs, clean) if p.elevation_m is not None]
            if len(known) < 2 or clean[0].elevation_m is None or clean[-1].elevation_m is None:
                raise GpxParseError('This GPX has no elevation (or none at its start or end), and OTRI has no terrain data for this place to fill it in, so the climb cannot be measured. Export the course with elevation: most route planners can add it (“add elevation” or “correct elevation”).')
            for i, p in enumerate(clean):
                if p.elevation_m is None:
                    j = bisect_right([x for x, _ in known], xs[i])
                    if known[j][0] - known[j-1][0] > PARAMETERS['max_missing_gap_m']:
                        raise GpxParseError('This GPX has stretches of more than 30 m with no elevation, and OTRI has no terrain data for this place to fill them in. Export the course with elevation on every point: most route planners can add it (“add elevation” or “correct elevation”).')
                    flags.add('short_elevation_gap_interpolated')
            kx, kz = zip(*known)
            return [interpolate(kx, kz, x) for x in grid]

        zs = None
        if provider is not None:
            # Every grid chainage projected onto its edge in one vectorised direct solve.
            import numpy as np
            grid_arr = np.asarray(grid, dtype=float)
            xs_arr = np.asarray(xs, dtype=float)
            edge = np.clip(np.searchsorted(xs_arr, grid_arr, side='right') - 1, 0, len(xs) - 2)
            lon2, lat2, _ = geod.fwd(np.asarray(lons)[edge], np.asarray(lats)[edge],
                                     np.asarray(azimuths)[edge], grid_arr - xs_arr[edge])
            locations = list(zip(lat2.tolist(), lon2.tolist()))
            try:
                sampled = provider.sample(locations)
            except (OSError, ValueError, KeyError) as error:
                raise GpxParseError(f'terrain lookup failed: {error}') from error
            if len(sampled) == len(grid) and all(z is not None and math.isfinite(z) for z in sampled):
                zs = sampled
            else:
                # Announced fallback: the DEM does not cover this course. Use the file's own
                # elevations if it has them, and say so in the provenance and the flags.
                try:
                    zs = uploaded_profile()
                except GpxParseError:
                    raise GpxParseError('terrain provider has incomplete elevation coverage') from None
                flags.add('terrain_coverage_incomplete_used_uploaded_elevation')
                source = dict(UPLOADED_SOURCE)
                used_provider = False
        if zs is None:
            zs = uploaded_profile()
        if not used_provider:
            flags.add('unknown_elevation_provenance')
        if uploaded_implausible:
            # Only the profile actually used can make a measurement implausible. Under a DEM the
            # uploaded elevations are unused, so their noise is recorded, not held against it.
            flags.add('implausible_local_elevation_change' if not used_provider else 'uploaded_elevation_implausible_unused')
        # Avoid applying both spatial smoothing and a prominence filter to an
        # already smooth route-planner profile. The rule depends on observable
        # geometry/elevation quality, never filenames, race totals or creator.
        if noisy or used_provider:
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
    median_edge = statistics.median(edge_lengths) if edge_lengths else None
    if median_edge is not None and median_edge > PARAMETERS['max_median_edge_m']:
        flags.add('sparse_geometry_median_over_30m')
    elevations = [z for segment in segments for _, z in segment]
    geometry_hash = sha256(json.dumps([(p.lat, p.lon, p.segment_id) for p in points]).encode()).hexdigest()
    return Measurement(tuple(segments), total, gain, loss, steep_up, steep_down,
                       max(0, max(grades)) if grades else None, max(0, -min(grades)) if grades else None,
                       min(elevations), max(elevations), geometry_hash, source, tuple(sorted(flags)),
                       round(median_edge, 1) if median_edge is not None else None)
