"""Course Standard scoring models - course + finish time only, no competitors.

The current default is `ENDURANCE_REFERENCED_CURVE` (`0.4.0-course-standard-endurance-referenced`):
the V0.2 measured course-demand pipeline, V0.1's three real score anchors, and a course-size
scaling built from published world-best performances so that a score means the same thing on a
5 km race and on a 100-mile mountain race. See
`docs/methodology/OTRI-MODEL-0.1.0.md` section 5.

`OFFICIAL_CURVE` (`0.1.0-course-standard-calibrated`) is the retired first development build
(`docs/methodology/OTRI-MODEL-0.1.0.md` section 14): the 50 m GPX course-demand
integral plus its piecewise power-law score-to-Q curve, calibrated from demo/test race anchors.
`MEASURED_CURVE`, `DURATION_SCALED_CURVE` and the legacy logarithmic curves (`SPEC_CURVE`,
`CALIBRATED_CURVE`) remain selectable so historical scores stay reproducible (spec section 21).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from course.gpx import TrackPoint
from course.measurement import CONFIDENCE_BLOCKING_FLAGS
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import CourseDemand, compute_course_demand, equivalent_flat_distance_from_totals
from .model import RunnerScore, ScoreBreakdown
from .terrain import TERRAIN_MODEL, TerrainModel

SCALE_MIN = 0.0
SCALE_MAX = 1000.0


@dataclass(frozen=True)
class ScoreCurve:
    """Immutable score-curve definition."""

    version: str
    q_500: float
    q_1000: float
    curve_type: str = "logarithmic"
    anchor_scores: tuple[float, ...] = ()
    anchor_qs: tuple[float, ...] = ()
    # How an observed performance rate is rescaled for course size before the anchor-table
    # lookup. `None` means "no rescaling" — the V0.1/V0.2 duration-invariant behaviour.
    demand_scaling: "DemandScaling | None" = None
    # What the gradient integral alone does not price (steep mountain terrain, altitude).
    # `None` means course demand is used exactly as the integral produced it.
    terrain_adjustment: "TerrainModel | None" = None
    # `curve_type == "power"` only: score = 1000 * (Q / q_1000) ** power_exponent. One published
    # constant, no anchor table (V0.8).
    power_exponent: float = 1.0

    @property
    def is_curved(self) -> bool:
        return self.curve_type != "logarithmic"

    @property
    def k(self) -> float:
        return 500.0 / math.log(self.q_1000 / self.q_500)

    def _piecewise_required_q(self, score: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if score == 0.0:
            return qs[0]
        if score <= scores[1]:
            p = math.log(qs[1] / qs[0]) / math.log(scores[1])
            return qs[0] * score**p
        for i in range(1, len(scores) - 1):
            s1, s2 = scores[i], scores[i + 1]
            q1, q2 = qs[i], qs[i + 1]
            if score <= s2:
                p = math.log(q2 / q1) / math.log(s2 / s1)
                return q1 * (score / s1) ** p
        raise AssertionError("unreachable")

    def _piecewise_raw_score(self, q: float) -> float:
        scores = self.anchor_scores
        qs = self.anchor_qs
        if q <= qs[0]:
            return SCALE_MIN
        if q < qs[1]:
            p = math.log(qs[1] / qs[0]) / math.log(scores[1])
            return q ** (1.0 / p)
        for i in range(1, len(qs) - 1):
            q1, q2 = qs[i], qs[i + 1]
            s1, s2 = scores[i], scores[i + 1]
            if q <= q2:
                p = math.log(q2 / q1) / math.log(s2 / s1)
                return s1 * (q / q1) ** (1.0 / p)
        s1, s2 = scores[-2:]
        q1, q2 = qs[-2:]
        p = math.log(q2 / q1) / math.log(s2 / s1)
        return s1 * (q / q1) ** (1.0 / p)

    def required_q(self, score: float) -> float:
        """`Q(S)` — the performance rate required to reach `score` (spec section 13)."""
        if not math.isfinite(score) or not SCALE_MIN <= score <= SCALE_MAX:
            raise ValueError(f"score must be between {SCALE_MIN} and {SCALE_MAX}")
        if self.curve_type == "piecewise_power":
            return self._piecewise_required_q(score)
        if self.curve_type == "power":
            return self.q_1000 * (score / SCALE_MAX) ** (1.0 / self.power_exponent)
        return self.q_500 * math.exp((score - 500.0) / self.k)

    def raw_score(self, q: float) -> float:
        """Inverse of `required_q` — the (unclipped) score for performance rate `q` (spec section 14)."""
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        if self.curve_type == "piecewise_power":
            return self._piecewise_raw_score(q)
        if self.curve_type == "power":
            return SCALE_MAX * (q / self.q_1000) ** self.power_exponent
        return 500.0 + self.k * math.log(q / self.q_500)


SPEC_CURVE = ScoreCurve(version="1.0.0-course-standard", q_500=15.0, q_1000=22.5)
CALIBRATED_CURVE = ScoreCurve(version="1.1.0-course-standard", q_500=3.5, q_1000=10.5)

# Development build V0.1 (retired; docs/methodology/OTRI-MODEL-0.1.0.md section 14).
# Piecewise power law through demo/test race reference anchors:
#   6:29:58 -> 349, 3:05:04 -> 544, 2:20:30 -> 692 (course demand ~27.560 demand-km).
# The final segment continues the same exponent up to Q~17.94 at score 1000.
OFFICIAL_CURVE = ScoreCurve(
    version="0.1.0-course-standard-calibrated",
    q_500=7.755256,
    q_1000=17.93986234619293,
    curve_type="piecewise_power",
    anchor_scores=(0.0, 349.0, 544.0, 692.0, 1000.0),
    anchor_qs=(1.0, 4.240362424138815, 8.935158501440922, 11.769395017793594, 17.93986234619293),
)

SCORING_VERSION = OFFICIAL_CURVE.version
MEASURED_CURVE = replace(OFFICIAL_CURVE, version='0.2.0-course-standard-measured')

# ---------------------------------------------------------------------------
# Course-size (duration) scaling
# ---------------------------------------------------------------------------
#
# V0.1's anchor table was calibrated entirely from one course of course demand 27.560 demand-km
# (spec section 12.1) and treats Q (demand-km/h) as duration-invariant: the same Q always means
# the same score, whatever the size of the course. That is wrong, and wrong in a way that
# systematically punishes long races - nobody holds their 3-hour rate for 18 hours, so on a big
# course every runner posts a lower Q and every runner is scored as if they had run badly.
#
# A `DemandScaling` rescales the *observed* performance rate to its reference-course equivalent
# before the (unchanged) anchor-table lookup:
#
#     adjusted_Q = Q_observed * scaling.factor(D)
#
# Every scaling is normalised so `factor(REFERENCE_DEMAND_KM) == 1.0`, which makes each scaled
# curve reduce to its unscaled parent exactly at the reference course size. `performance_rate`
# in output and API responses stays the raw, unscaled Q - a plain physical quantity. Only the
# score lookup is scaled.

REFERENCE_DEMAND_KM = 27.560


def _validate_demand(course_demand_km: float) -> None:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("course_demand_km must be positive and finite")


@dataclass(frozen=True)
class RiegelScaling:
    """V0.3's scaling: one constant Riegel exponent applied to course demand.

    Riegel's race-time-prediction formula (T2 = T1 * (D2/D1)^b, b=1.06 - Riegel, P.S.
    "Athletic Records and Human Endurance," American Scientist 69(3):285-290, 1981), applied to
    course demand instead of raw distance. Retained for reproducibility of V0.3 scores only:
    b=1.06 was derived from the 3.5-230 minute road-racing range and badly under-corrects beyond
    it (see `ENDURANCE_REFERENCE`, which supersedes it).
    """

    reference_demand_km: float
    exponent: float

    def factor(self, course_demand_km: float) -> float:
        _validate_demand(course_demand_km)
        return (course_demand_km / self.reference_demand_km) ** (self.exponent - 1.0)

    def range_flags(self, course_demand_km: float) -> tuple[str, ...]:
        return ()


@dataclass(frozen=True)
class EnduranceReference:
    """V0.4's scaling: the human-ceiling performance rate as a function of course demand.

    `rate(D)` is the world-best performance rate on a course of demand `D` - a piecewise power
    law in log-log space through the published reference observations in `anchor_demand_km` /
    `anchor_rates` (the same interpolation idiom V0.1 uses for its score curve), continuing the
    end segments' exponents outside the observed range.

    Because `factor(D) = rate(D_ref) / rate(D)`, the adjusted Q depends only on the ratio
    `Q_observed / rate(D)` - the runner's *fraction of the human ceiling for a course of this
    size*. That is the whole point: the score becomes a measure of calibre, and stops being a
    measure of how long the race was.
    """

    reference_demand_km: float
    anchor_demand_km: tuple[float, ...]
    anchor_rates: tuple[float, ...]

    def _segment(self, course_demand_km: float) -> int:
        """Index of the segment to use, clamped so both ends extrapolate their end segment."""
        demands = self.anchor_demand_km
        index = 0
        for i in range(len(demands) - 1):
            if course_demand_km >= demands[i]:
                index = i
        return index

    def rate(self, course_demand_km: float) -> float:
        """World-best performance rate (demand-km/h) on a course of this course demand."""
        _validate_demand(course_demand_km)
        i = self._segment(course_demand_km)
        d1, d2 = self.anchor_demand_km[i], self.anchor_demand_km[i + 1]
        q1, q2 = self.anchor_rates[i], self.anchor_rates[i + 1]
        exponent = math.log(q2 / q1) / math.log(d2 / d1)
        return q1 * (course_demand_km / d1) ** exponent

    def riegel_exponent(self, course_demand_km: float) -> float:
        """The equivalent Riegel `b` on this segment - a published, checkable property.

        Between the 5 km and marathon anchors this comes out at ~1.059, independently
        reproducing Riegel's own published 1.06 over the range his data covered.
        """
        _validate_demand(course_demand_km)
        i = self._segment(course_demand_km)
        d1, d2 = self.anchor_demand_km[i], self.anchor_demand_km[i + 1]
        q1, q2 = self.anchor_rates[i], self.anchor_rates[i + 1]
        return 1.0 - math.log(q2 / q1) / math.log(d2 / d1)

    def factor(self, course_demand_km: float) -> float:
        return self.rate(self.reference_demand_km) / self.rate(course_demand_km)

    def range_flags(self, course_demand_km: float) -> tuple[str, ...]:
        """Flag courses outside the observed range, where `rate` is extrapolating.

        Above the top anchor this matters in practice: multi-day mountain ultras include sleep
        stops, so their true rate decay is steeper than the continued 24-hour exponent and this
        model under-credits them. Surfaced rather than silently absorbed.
        """
        _validate_demand(course_demand_km)
        low, high = self.anchor_demand_km[0], self.anchor_demand_km[-1]
        if course_demand_km < low:
            return (
                f"course_demand_below_reference_range: {course_demand_km:.3f} demand-km is below the "
                f"shortest reference observation ({low:.3f} demand-km); the human-ceiling rate is "
                "extrapolated",
            )
        if course_demand_km > high:
            return (
                f"course_demand_above_reference_range: {course_demand_km:.3f} demand-km is beyond the "
                f"longest reference observation ({high:.3f} demand-km); the human-ceiling rate is "
                "extrapolated and is likely conservative for multi-day events",
            )
        return ()


DemandScaling = RiegelScaling | EnduranceReference

ENDURANCE_EXPONENT = 1.06
RIEGEL_SCALING = RiegelScaling(reference_demand_km=REFERENCE_DEMAND_KM, exponent=ENDURANCE_EXPONENT)
DURATION_SCALED_CURVE = replace(
    OFFICIAL_CURVE,
    version='0.3.0-course-standard-duration-scaled',
    demand_scaling=RIEGEL_SCALING,
)

# --- V0.4 reference observations -------------------------------------------------------------
#
# Published open-category world-best track/road performances, used as the human ceiling. All are
# flat courses, where course demand and physical distance coincide to within about a percent, so
# `demand_km` is the event distance.
#
# Only three anchors are used, chosen for depth of competition and wide spacing. The held-out
# records they were *not* built from land at 92-102% of the resulting curve (see
# docs/methodology/OTRI-MODEL-0.1.0.md section 5.3), which is the validation
# evidence for this shape. They are frozen constants of model version 0.4.0: refreshing them
# when a record falls is a new model version, never an edit in place (spec section 21).
ENDURANCE_REFERENCE_OBSERVATIONS: tuple[tuple[str, float, float], ...] = (
    ("5000 m track, 12:35.36", 5.0, 755.36),
    ("marathon road, 2:00:35", 42.195, 7235.0),
    ("24-hour road, 319.614 km", 319.614, 86400.0),
)

ENDURANCE_REFERENCE = EnduranceReference(
    reference_demand_km=REFERENCE_DEMAND_KM,
    anchor_demand_km=tuple(demand for _label, demand, _seconds in ENDURANCE_REFERENCE_OBSERVATIONS),
    anchor_rates=tuple(
        demand / (seconds / 3600.0) for _label, demand, seconds in ENDURANCE_REFERENCE_OBSERVATIONS
    ),
)

# V0.1's own 1000-anchor was never an observation - the spec labels it "upper-scale
# continuation", a pure extrapolation. It sits at Q=17.940 at the reference course size, which
# real world-class road performances comfortably exceed, so under V0.1/V0.3 everything from a
# 15:06 5 km upwards clipped to 1000 while a 100-mile mountain-race winner scored 783. V0.4
# replaces that one invented number with the measured human ceiling at the same reference course
# size, so 1000 means "world best" at every course size. V0.1's three real demo/test anchors
# (349, 544, 692) are kept exactly as published.
ENDURANCE_REFERENCED_Q_1000 = ENDURANCE_REFERENCE.rate(REFERENCE_DEMAND_KM)

ENDURANCE_REFERENCED_CURVE = replace(
    OFFICIAL_CURVE,
    version='0.4.0-course-standard-endurance-referenced',
    q_1000=ENDURANCE_REFERENCED_Q_1000,
    anchor_qs=OFFICIAL_CURVE.anchor_qs[:-1] + (ENDURANCE_REFERENCED_Q_1000,),
    demand_scaling=ENDURANCE_REFERENCE,
)

# V0.4 scores a mountain 100-miler's winner at 889 — 82.5% of the road-referenced human
# ceiling — because course demand measures gradient but not what mountain terrain actually
# costs. V0.5 closes that gap by adjusting demand itself (see `scoring/terrain.py`), leaving the
# endurance-referenced curve untouched. Road courses have a terrain factor of exactly 1.0 and
# are unaffected; steep courses rise together, including the V0.1 reference race, whose winner
# moves from 692 to 737 as a result. See docs/methodology/OTRI-MODEL-0.1.0.md section 4.
TERRAIN_ADJUSTED_CURVE = replace(
    ENDURANCE_REFERENCED_CURVE,
    version='0.5.0-course-standard-terrain-adjusted',
    terrain_adjustment=TERRAIN_MODEL,
)

# V0.1's 692 demo anchor makes the 544->692 segment ~45% more elastic than the segments either
# side of it (score ~ Q^0.87 there, ~Q^0.60 below and above). Any uniform course-level
# correction — V0.4's duration scaling, V0.5's terrain factor — is therefore amplified in the
# 550-700 band: on the reference race V0.5 lifted the 2:40 finisher by 63 points but the winner
# by only 50. That is an artifact of fitting through three arbitrary demo finishers, not a
# property of running. V0.6 drops the 692 anchor so a single power law runs from the 544 anchor
# to the world-best 1000 anchor; everything at or below 544 is untouched. Being the universal
# score shape, this also lowers road runners in the same band (~20-30 points around 700), who
# were sitting in the same inflated segment. See docs/methodology/OTRI-MODEL-0.1.0.md section 14.
SMOOTHED_UPPER_CURVE = replace(
    TERRAIN_ADJUSTED_CURVE,
    version='0.6.0-course-standard-smoothed-upper',
    anchor_scores=(0.0, 349.0, 544.0, 1000.0),
    anchor_qs=(
        OFFICIAL_CURVE.anchor_qs[0],
        OFFICIAL_CURVE.anchor_qs[1],
        OFFICIAL_CURVE.anchor_qs[2],
        ENDURANCE_REFERENCED_Q_1000,
    ),
)

# V0.7 changes nothing about the curve. It changes what the score is allowed to *claim*. The same
# route recorded by two devices measured up to 25% apart under V0.6, and the score said nothing.
# V0.7 scores from course-measurement-v2 (median-spacing gate) and grades its own confidence:
# `High` only when elevation came from a pinned DEM and the track is dense enough to measure the
# route rather than a chord of it; `Low`, with the reason surfaced, when either fails. See
# docs/methodology/OTRI-MODEL-0.1.0.md section 7.
DEM_GATED_CURVE = replace(SMOOTHED_UPPER_CURVE, version='0.7.0-course-standard-dem-gated')

# Above 544, V0.6/V0.7 were already exactly score = 1000 * f**0.692 with f the runner's fraction
# of the human-ceiling rate; an exponent below 1 is concave and flatters the middle of the field
# (53% of the ceiling scored 64% of the scale). V0.8 makes the whole scale one power law with a
# single published exponent and retires the last two V0.1 demo anchors (349, 544). The top of the
# scale stays where it is - world bests 949-1000, the 100-mile mountain winner 958 - and every
# score below it drops, more so further down (a runner at 53% of the ceiling: 643 -> 581; at 22%:
# 371 -> 274). 0.85 is a judgement between "score is your percentage of world best" (1.0) and the
# old curve, not a fitted or externally referenced value.
# See docs/methodology/OTRI-MODEL-0.1.0.md section 6.
POWER_EXPONENT = 0.85
POWER_CURVE = replace(
    DEM_GATED_CURVE,
    version='0.8.0-course-standard-power',
    curve_type='power',
    power_exponent=POWER_EXPONENT,
    anchor_scores=(),
    anchor_qs=(),
)

# Curves scored from the V0.2 measured-demand pipeline rather than the raw V0.1 integral.
MEASURED_DEMAND_VERSIONS = frozenset(
    {
        MEASURED_CURVE.version,
        DURATION_SCALED_CURVE.version,
        ENDURANCE_REFERENCED_CURVE.version,
        TERRAIN_ADJUSTED_CURVE.version,
        SMOOTHED_UPPER_CURVE.version,
        DEM_GATED_CURVE.version,
        POWER_CURVE.version,
    }
)


def measured_demand_for(gpx_points, measurement, curve: ScoreCurve):
    """Course demand for a measured-pipeline curve, plus the Measurement it came from.

    Measures the course here (with whatever terrain provider is configured) when no stored
    measurement is supplied, so the scorer can see the measurement's provenance and status
    rather than only its numbers.
    """
    from course.elevation import configured_provider
    from course.measurement import measure_course
    from .measured_demand import compute_measured_demand

    if measurement is None:
        measurement = measure_course(gpx_points, configured_provider())
    return compute_measured_demand(measurement=measurement), measurement


def confidence_for(measurement, curve: ScoreCurve, has_gpx: bool) -> tuple[str, tuple[str, ...]]:
    """Confidence label plus the flags that explain it.

    Pre-V0.7 curves keep their historical rule (Medium with a GPX, Low without). V0.7 earns
    `High` only with DEM-sourced elevation on a track whose *route* was measured reproducibly
    (`Measurement.blocks_confidence`), and says exactly why otherwise. A measurement can be
    `needs_review` for an organizer's attention and still `High` here - review and
    reproducibility are different questions.
    """
    if curve.version not in (DEM_GATED_CURVE.version, POWER_CURVE.version) or measurement is None:
        return _confidence_for_course(has_gpx), ()
    reasons = []
    if not measurement.dem_sourced:
        reasons.append(
            "elevation_not_dem_sourced: elevation came from the uploaded file, not a pinned terrain "
            "dataset; the same route recorded by another device may measure differently"
        )
    if measurement.blocks_confidence:
        blocking = [flag for flag in measurement.quality_flags if flag in CONFIDENCE_BLOCKING_FLAGS]
        detail = ', '.join(blocking)
        if 'sparse_geometry_median_over_30m' in blocking:
            detail += (
                f" (median point spacing {measurement.median_edge_m} m; tracks sparser than 30 m chord the "
                "switchbacks and measure the course short)"
            )
        reasons.append(f"route_not_reproducible: {detail}")
    return ('High' if not reasons else 'Low'), tuple(reasons)


def adjusted_demand(demand: CourseDemand, curve: ScoreCurve) -> tuple[float, tuple[str, ...]]:
    """Course demand as `curve` scores it, plus any flags the adjustment raises.

    Terrain adjustment happens here — on the course, before any performance rate exists — so it
    stays a property of the course rather than of the runner, and `score_for_time` keeps taking
    a plain demand figure.
    """
    terrain = curve.terrain_adjustment
    if terrain is None:
        return demand.course_demand_km, tuple(demand.quality_flags)
    factor = terrain.factor(demand.steep_distance_fraction, demand.altitude_excess_m)
    flags = tuple(demand.quality_flags) + terrain.flags(
        demand.steep_distance_fraction, demand.altitude_excess_m
    )
    return demand.course_demand_km * factor, flags


def performance_rate(equivalent_km: float, finish_time_seconds: float) -> float:
    if not math.isfinite(equivalent_km) or equivalent_km <= 0:
        raise ValueError("equivalent_km must be a positive, finite number")
    if not math.isfinite(finish_time_seconds) or finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be a positive, finite number")
    return equivalent_km / (finish_time_seconds / 3600.0)


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = OFFICIAL_CURVE) -> dict:
    q = performance_rate(equivalent_km, finish_time_seconds)
    scaling = curve.demand_scaling
    lookup_q = q * scaling.factor(equivalent_km) if scaling is not None else q
    raw = curve.raw_score(lookup_q)
    public = round(max(SCALE_MIN, min(SCALE_MAX, raw)))
    return {
        "performance_rate": q,
        "otri_raw": raw,
        "otri_score": public,
        "quality_flags": scaling.range_flags(equivalent_km) if scaling is not None else (),
    }


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = OFFICIAL_CURVE) -> float:
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    q = curve.required_q(score)
    if curve.demand_scaling is not None:
        q = q / curve.demand_scaling.factor(equivalent_km)
    if q <= 0:
        return math.inf
    return equivalent_km / q * 3600.0


def _confidence_for_course(has_gpx: bool) -> str:
    return "Medium" if has_gpx else "Low"


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = OFFICIAL_CURVE,
    measurement=None,
) -> list[RunnerScore]:
    finishers = [
        result for result in results
        if result.is_finisher and result.finish_time_seconds is not None
    ]
    if not finishers:
        return []

    if gpx_points is not None:
        if curve.version in MEASURED_DEMAND_VERSIONS:
            demand, measurement = measured_demand_for(gpx_points, measurement, curve)
        else:
            demand = compute_course_demand(gpx_points)
        equivalent_km, quality_flags = adjusted_demand(demand, curve)
    else:
        equivalent_km = equivalent_flat_distance_from_totals(race.distance_km, race.elevation_gain_m)
        quality_flags = ()

    confidence, confidence_flags = confidence_for(measurement if gpx_points is not None else None, curve, gpx_points is not None)
    quality_flags = tuple(quality_flags) + confidence_flags
    ordered = sorted(
        finishers,
        key=lambda result: (
            result.finish_time_seconds,
            result.bib_number or "",
            result.family_name,
            result.first_name,
        ),
    )

    scaling_flags = curve.demand_scaling.range_flags(equivalent_km) if curve.demand_scaling else ()
    quality_flags = tuple(quality_flags) + scaling_flags

    scores = []
    for result in ordered:
        computed = score_for_time(equivalent_km, result.finish_time_seconds, curve=curve)
        breakdown = ScoreBreakdown(
            otri_score=computed["otri_score"],
            base_performance=round(computed["otri_raw"], 2),
            course_adjustment=0.0,
            field_adjustment=0.0,
            environmental_factor=0.0,
            confidence=confidence,
            scoring_version=curve.version,
            performance_rate=round(computed["performance_rate"], 3),
            quality_flags=quality_flags,
        )
        scores.append(
            RunnerScore(
                rank=result.rank,
                bib_number=result.bib_number,
                family_name=result.family_name,
                first_name=result.first_name,
                score=breakdown,
            )
        )
    return scores


def score_race_course_standard_spec(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
) -> list[RunnerScore]:
    """The spec's original (v0.2.0) literal Q_500=15.0/Q_1000=22.5 anchors — see module
docstring."""
    return score_race_course_standard(race, results, gpx_points=gpx_points, curve=SPEC_CURVE)
