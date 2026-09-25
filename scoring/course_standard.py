"""OTRI model 0.1.1: course + finish time only, no competitors.

A score is the runner's fraction of the human-ceiling rate for a course of this size, on one power
law: ``score = 1000 * (Q / ceiling(D)) ** 0.692``, where ``D`` is the measured course demand
(gradient-cost integral, adjusted for sustained steep ground and altitude) and ``Q`` is demand-km
per hour. The model also says how far each number can be trusted, and refuses the one kind of
course it would get wrong. Model 0.1.1 differs from 0.1.0 in the exponent alone (0.692 for 0.85,
OEP-004); everything else is as ``docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md`` specifies, and
``docs/methodology/0.1.1/OTRI-MODEL-0.1.1.md`` says what the change does.

Two curves are in the code: ``MODEL_CURVE`` (0.1.1, every new race and estimate) and
``MODEL_0_1_0_CURVE``, kept so that a score published under 0.1.0 can be reproduced. A
change to how scores are computed is a new ``version`` and a new specification, never an edit in
place.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from course.discipline import is_vertical
from course.gpx import TrackPoint
from course.measurement import CONFIDENCE_BLOCKING_FLAGS
from ingestion.records import RaceRecord, ResultRecord

from .course_demand import CourseDemand, demand_from_totals
from .model import RunnerScore, ScoreBreakdown
from .terrain import TERRAIN_MODEL, TerrainModel

SCALE_MIN = 0.0
# What the human-ceiling rate for a course scores. It is a reference point, not a cap: a performance
# faster than the ceiling (the ceiling is a curve through three world bests, and held-out records
# already run up to 2% above it) scores above 1000, and says so, instead of being flattened to it.
SCALE_MAX = 1000.0

# The course size the ceiling rate is quoted at (specification section 5). Scores do not depend on
# it: only the ratio Q / ceiling(D) enters the curve.
REFERENCE_DEMAND_KM = 27.560


def _validate_demand(course_demand_km: float) -> None:
    if not math.isfinite(course_demand_km) or course_demand_km <= 0:
        raise ValueError("course_demand_km must be positive and finite")


@dataclass(frozen=True)
class EnduranceReference:
    """The human-ceiling performance rate as a function of course demand.

    `rate(D)` is the world-best performance rate on a course of demand `D` - a piecewise power
    law in log-log space through the published reference observations in `anchor_demand_km` /
    `anchor_rates`, continuing the end segments' exponents outside the observed range.

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



# --- Reference observations -------------------------------------------------------------------
#
# Published open-category world-best track/road performances, used as the human ceiling. All are
# flat courses, where course demand and physical distance coincide to within about a percent, so
# `demand_km` is the event distance.
#
# Only three anchors are used, chosen for depth of competition and wide spacing. The held-out
# records they were *not* built from land at 92-102% of the resulting curve (see
# docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md section 5.3), which is the validation
# evidence for this shape. They are frozen constants of the model: refreshing them
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

@dataclass(frozen=True)
class ScoreCurve:
    """The score as a function of performance rate: ``1000 * (Q_adjusted / q_1000) ** power_exponent``,
    with ``Q_adjusted = Q * demand_scaling.factor(D)`` the rate restated at the reference course size."""

    version: str
    q_1000: float
    power_exponent: float
    demand_scaling: EnduranceReference
    # What the gradient integral alone does not price (steep mountain terrain, altitude).
    terrain_adjustment: TerrainModel

    def required_q(self, score: float) -> float:
        """The (reference-size) performance rate required to reach `score`."""
        if not math.isfinite(score) or score < SCALE_MIN:
            raise ValueError(f"score must be {SCALE_MIN} or more")
        return self.q_1000 * (score / SCALE_MAX) ** (1.0 / self.power_exponent)

    def raw_score(self, q: float) -> float:
        """Inverse of `required_q`: the score for (reference-size) performance rate `q`."""
        if not math.isfinite(q) or q <= 0:
            raise ValueError("performance rate must be positive and finite")
        return SCALE_MAX * (q / self.q_1000) ** self.power_exponent


# The exponent is a judgement, not a fitted or externally referenced value. Model 0.1.0 chose 0.85,
# between "score is your percentage of world best" (1.0) and the concave 0.692 of the development
# builds; 0.1.1 returns to 0.692 (OEP-004): the top of the scale holds (a world best is 1000 on
# either), and every score below it rises, most in the middle of the field (53 % of the ceiling
# scores 644 rather than 583).
POWER_EXPONENT = 0.692
POWER_EXPONENT_0_1_0 = 0.85

# Where the model itself runs out of evidence (specification section 7.4, OEP-002):
# - the gradient-cost polynomial was measured to +/-45%; when more than a fifth of a course's
#   demand comes from clamped ground, confidence is Low;
# - the ceiling is validated against world bests down to 1500 m; below 1.5 flat-km efforts are
#   anaerobic and would score too high, so confidence is Low;
# - an uphill-only course (more than half its distance at 20% or steeper) is scored with its own,
#   provisional steep coefficient (`scoring/terrain.py`), calibrated on a single performance: its
#   confidence is Low and says why. Without a course file the steep share is unknown, so a race
#   whose official figures average 20% or more is *not scored* until its course is uploaded.
MAX_CLAMPED_DEMAND_FRACTION = 0.20
MIN_VALIDATED_DEMAND_KM = 1.5

MODEL_CURVE = ScoreCurve(
    version='0.11.0-course-standard-model-0.1.1',  # build id of OTRI model 0.1.1
    q_1000=ENDURANCE_REFERENCE.rate(REFERENCE_DEMAND_KM),
    power_exponent=POWER_EXPONENT,
    demand_scaling=ENDURANCE_REFERENCE,
    terrain_adjustment=TERRAIN_MODEL,
)
SCORING_VERSION = MODEL_CURVE.version

# OTRI model 0.1.0: the same course demand, terrain factor and ceiling, exponent 0.85. Not the
# default for anything, and no race carries it since migration 0012 moved every race to 0.1.1; it
# stays so that a score published under it can be reproduced (OEP-004).
MODEL_0_1_0_CURVE = replace(MODEL_CURVE, version='0.10.0-course-standard-vertical', power_exponent=POWER_EXPONENT_0_1_0)


def measured_demand_for(gpx_points, measurement):
    """Course demand from the measured course, plus the Measurement it came from.

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


class CourseNotScoredError(ValueError):
    """Raised by the estimator for a course the model does not score; the message is the reason."""



def not_scored_reason(
    demand: CourseDemand | None = None,
    distance_km: float | None = None,
    elevation_gain_m: float | None = None,
) -> str | None:
    """Why the model gives this course no score, or None when it scores it.

    A measured course is always scored. Official figures alone are refused for an uphill-only
    race: how steep it is decides which terrain coefficient applies, and only the track says that.
    """
    if demand is not None or not (distance_km and elevation_gain_m and is_vertical(distance_km, elevation_gain_m)):
        return None
    return (
        f"course_not_scored: a vertical race needs its course file to be scored. This course averages "
        f"{elevation_gain_m / (distance_km * 1000.0):.0%} grade, and how much of it is steep decides how it is "
        "scored, which a distance and a climb figure cannot say. Finish times are listed, no OTRI score is "
        "given and the result does not count toward a runner index until the GPX is uploaded"
    )


def confidence_for(measurement, demand: CourseDemand | None = None, equivalent_km: float | None = None) -> tuple[str, tuple[str, ...]]:
    """Confidence label plus the flags that explain it.

    `High` only with DEM-sourced elevation on a track whose *route* was measured reproducibly
    (`Measurement.blocks_confidence`) and inside the model's own limits; `Low`, with the reasons,
    otherwise. Without a measured course (official figures only) it is `Low`. A measurement can be
    `needs_review` for an organizer's attention and still `High` here: review and reproducibility
    are different questions.
    """
    if measurement is None:
        return "Low", ()
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
    if demand is not None and demand.clamped_demand_fraction > MAX_CLAMPED_DEMAND_FRACTION:
        reasons.append(
            f"gradient_domain_exceeded: {demand.clamped_demand_fraction:.0%} of this course's demand comes "
            "from ground steeper than 45%, beyond what the gradient-cost model was measured on; those "
            "sections are scored as if they were 45% and are under-credited by an unknown amount"
        )
    if demand is not None and TERRAIN_MODEL.is_vertical(demand.steep_distance_fraction):
        reasons.append(
            f"vertical_calibration_provisional: {demand.steep_distance_fraction:.0%} of this course is at or above "
            "20% grade, so it is scored as an uphill-only course. The steep-terrain coefficient for such courses "
            "rests on a single calibration performance and will be refitted when there is vertical-race data"
        )
    if equivalent_km is not None and equivalent_km < MIN_VALIDATED_DEMAND_KM:
        reasons.append(
            f"course_below_validated_range: {equivalent_km:.3f} flat-km is shorter than the shortest "
            f"performance the ceiling is validated against ({MIN_VALIDATED_DEMAND_KM} flat-km); "
            "shorter efforts are anaerobic and score too high"
        )
    return ('High' if not reasons else 'Low'), tuple(reasons)


def adjusted_demand(demand: CourseDemand, curve: ScoreCurve) -> tuple[float, tuple[str, ...]]:
    """Course demand as `curve` scores it, plus any flags the adjustment raises.

    Terrain adjustment happens here — on the course, before any performance rate exists — so it
    stays a property of the course rather than of the runner, and `score_for_time` keeps taking
    a plain demand figure.
    """
    terrain = curve.terrain_adjustment
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


def score_for_time(equivalent_km: float, finish_time_seconds: float, curve: ScoreCurve = MODEL_CURVE) -> dict:
    q = performance_rate(equivalent_km, finish_time_seconds)
    raw = curve.raw_score(q * curve.demand_scaling.factor(equivalent_km))
    public = round(max(SCALE_MIN, raw))  # no cap at 1000: see SCALE_MAX
    return {
        "performance_rate": q,
        "otri_raw": raw,
        "otri_score": public,
        "quality_flags": curve.demand_scaling.range_flags(equivalent_km),
    }


def target_time_seconds(equivalent_km: float, score: float, curve: ScoreCurve = MODEL_CURVE) -> float:
    if equivalent_km <= 0:
        raise ValueError("equivalent_km must be greater than 0")
    q = curve.required_q(score) / curve.demand_scaling.factor(equivalent_km)
    if q <= 0:
        return math.inf
    return equivalent_km / q * 3600.0


def score_race_course_standard(
    race: RaceRecord,
    results: list[ResultRecord],
    gpx_points: list[TrackPoint] | None = None,
    curve: ScoreCurve = MODEL_CURVE,
    measurement=None,
) -> list[RunnerScore]:
    finishers = [
        result for result in results
        if result.is_finisher and result.finish_time_seconds is not None
    ]
    if not finishers:
        return []

    demand = None
    if gpx_points is not None:
        demand, measurement = measured_demand_for(gpx_points, measurement)
        equivalent_km, quality_flags = adjusted_demand(demand, curve)
    else:
        equivalent_km, quality_flags = demand_from_totals(race.distance_km, race.elevation_gain_m)

    confidence, confidence_flags = confidence_for(measurement if gpx_points is not None else None, demand, equivalent_km)
    quality_flags = tuple(quality_flags) + confidence_flags
    not_scored = not_scored_reason(demand, race.distance_km, race.elevation_gain_m)
    ordered = sorted(
        finishers,
        key=lambda result: (
            result.finish_time_seconds,
            result.bib_number or "",
            result.family_name,
            result.first_name,
        ),
    )

    quality_flags = tuple(quality_flags) + curve.demand_scaling.range_flags(equivalent_km)

    scores = []
    for result in ordered:
        if not_scored is not None:
            breakdown = ScoreBreakdown(
                otri_score=None,
                base_performance=0.0,
                course_adjustment=0.0,
                field_adjustment=0.0,
                environmental_factor=0.0,
                confidence="n/a",
                scoring_version=curve.version,
                quality_flags=(not_scored,),
            )
        else:
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
