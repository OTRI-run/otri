"""GPX -> score predictor, powered by the current Course Standard scoring model.

Pre-race prediction and real post-race scoring use the exact same course-demand
and score functions. No competitor or 'assumed winner' value is involved.
"""

from __future__ import annotations

from dataclasses import dataclass

from course.gpx import TrackPoint

from .course_demand import compute_course_demand, equivalent_flat_distance_from_totals
from .course_standard import (
    MEASURED_DEMAND_VERSIONS,
    POWER_CURVE,
    ScoreCurve,
    adjusted_demand,
    confidence_for,
    measured_demand_for,
    score_for_time,
    target_time_seconds,
)

DISCLAIMER = (
    "Provisional course estimate. Scores match only when the race uses the same course measurement "
    "and scoring version. Uploaded elevations are not independently verified terrain measurements."
)


@dataclass(frozen=True)
class EstimateBreakdown:
    """Every intermediate the score passed through, so a UI can *explain* it rather than
    re-derive it. All values come from the same call that produced the score; nothing here is
    recomputed client-side. Fields that a given curve does not use are `None`."""

    physical_distance_km: float
    course_demand_km: float          # gradient integral, before any terrain adjustment
    terrain_factor: float            # 1.0 when the curve has no terrain model or the course is flat
    steep_distance_fraction: float
    altitude_excess_m: float
    adjusted_demand_km: float        # course_demand_km * terrain_factor — what the score is computed on
    performance_rate: float          # adjusted_demand_km / hours
    reference_rate: float | None     # world-best rate on a course of this demand (endurance reference)
    fraction_of_ceiling: float | None  # performance_rate / reference_rate
    reference_factor: float | None   # rate(D_ref) / rate(D): the course-size scaling applied before lookup
    lookup_rate: float | None        # performance_rate * reference_factor — the value looked up in the anchor table
    riegel_exponent: float | None    # equivalent Riegel b on this course's segment of the reference curve
    world_best_time_seconds: float   # the finish time that would score 1000 on this course

    def to_dict(self) -> dict:
        return {
            "physical_distance_km": self.physical_distance_km,
            "course_demand_km": self.course_demand_km,
            "terrain_factor": self.terrain_factor,
            "steep_distance_fraction": self.steep_distance_fraction,
            "altitude_excess_m": self.altitude_excess_m,
            "adjusted_demand_km": self.adjusted_demand_km,
            "performance_rate": self.performance_rate,
            "reference_rate": self.reference_rate,
            "fraction_of_ceiling": self.fraction_of_ceiling,
            "reference_factor": self.reference_factor,
            "lookup_rate": self.lookup_rate,
            "riegel_exponent": self.riegel_exponent,
            "world_best_time_seconds": self.world_best_time_seconds,
        }


@dataclass(frozen=True)
class ScoreEstimate:
    equivalent_distance_km: float
    performance_rate: float
    otri_raw: float
    predicted_score: int
    scoring_version: str
    disclaimer: str
    quality_flags: tuple[str, ...] = ()
    breakdown: EstimateBreakdown | None = None
    # V0.7: how far this number can be trusted, and why (see course_standard.confidence_for).
    confidence: str = "Low"

    def to_dict(self) -> dict:
        return {
            "equivalent_distance_km": self.equivalent_distance_km,
            "performance_rate": self.performance_rate,
            "otri_raw": self.otri_raw,
            "predicted_score": self.predicted_score,
            "scoring_version": self.scoring_version,
            "disclaimer": self.disclaimer,
            "quality_flags": list(self.quality_flags),
            "breakdown": self.breakdown.to_dict() if self.breakdown is not None else None,
            "confidence": self.confidence,
        }


def _breakdown(
    curve: ScoreCurve,
    *,
    physical_distance_km: float,
    course_demand_km: float,
    steep_distance_fraction: float,
    altitude_excess_m: float,
    adjusted_km: float,
    finish_time_seconds: float,
    performance_rate: float,
) -> EstimateBreakdown:
    terrain = curve.terrain_adjustment
    terrain_factor = terrain.factor(steep_distance_fraction, altitude_excess_m) if terrain is not None else 1.0

    scaling = curve.demand_scaling
    reference_factor = scaling.factor(adjusted_km) if scaling is not None else None
    # Only the endurance reference knows the human ceiling; V0.3's constant Riegel scaling does not.
    has_reference = scaling is not None and hasattr(scaling, "rate")
    reference_rate = scaling.rate(adjusted_km) if has_reference else None
    riegel_exponent = scaling.riegel_exponent(adjusted_km) if has_reference else None

    return EstimateBreakdown(
        physical_distance_km=round(physical_distance_km, 3),
        course_demand_km=round(course_demand_km, 3),
        terrain_factor=round(terrain_factor, 6),
        steep_distance_fraction=round(steep_distance_fraction, 6),
        altitude_excess_m=round(altitude_excess_m, 3),
        adjusted_demand_km=round(adjusted_km, 3),
        performance_rate=round(performance_rate, 3),
        reference_rate=round(reference_rate, 3) if reference_rate is not None else None,
        fraction_of_ceiling=round(performance_rate / reference_rate, 6) if reference_rate else None,
        reference_factor=round(reference_factor, 6) if reference_factor is not None else None,
        lookup_rate=round(performance_rate * reference_factor, 3) if reference_factor is not None else None,
        riegel_exponent=round(riegel_exponent, 6) if riegel_exponent is not None else None,
        world_best_time_seconds=round(target_time_seconds(adjusted_km, 1000.0, curve=curve), 1),
    )


def estimate_score(
    finish_time_seconds: int,
    *,
    gpx_points: list[TrackPoint] | None = None,
    distance_km: float | None = None,
    elevation_gain_m: float | None = None,
    curve: ScoreCurve = POWER_CURVE,
    measurement=None,
) -> ScoreEstimate:
    """Predict the Course Standard score for `finish_time_seconds` on this course.

    Prefer passing `gpx_points` (the 50 m segment-by-segment Minetti course-demand
    integral) over `distance_km`/`elevation_gain_m` (a coarser constant-average-grade
    approximation) when a GPX is available.
    """
    if finish_time_seconds <= 0:
        raise ValueError("finish_time_seconds must be greater than 0")

    if gpx_points is not None:
        if curve.version in MEASURED_DEMAND_VERSIONS:
            demand, measurement = measured_demand_for(gpx_points, measurement, curve)
        else:
            demand = compute_course_demand(gpx_points)
        equivalent_km, quality_flags = adjusted_demand(demand, curve)
        physical_distance_km = demand.physical_distance_km
        course_demand_km = demand.course_demand_km
        steep_fraction, altitude_excess = demand.steep_distance_fraction, demand.altitude_excess_m
    elif distance_km is not None and elevation_gain_m is not None:
        equivalent_km = equivalent_flat_distance_from_totals(distance_km, elevation_gain_m)
        quality_flags = ()
        # The totals fallback has no segment profile, so no terrain inputs: factor is exactly 1.
        physical_distance_km, course_demand_km = distance_km, equivalent_km
        steep_fraction, altitude_excess = 0.0, 0.0
    else:
        raise ValueError("either gpx_points or both distance_km and elevation_gain_m must be provided")

    computed = score_for_time(equivalent_km, finish_time_seconds, curve=curve)
    confidence, confidence_flags = confidence_for(
        measurement if gpx_points is not None else None, curve, gpx_points is not None
    )
    quality_flags = tuple(quality_flags) + tuple(computed["quality_flags"]) + confidence_flags

    return ScoreEstimate(
        equivalent_distance_km=round(equivalent_km, 3),
        performance_rate=round(computed["performance_rate"], 3),
        otri_raw=round(computed["otri_raw"], 2),
        predicted_score=computed["otri_score"],
        scoring_version=curve.version,
        disclaimer=DISCLAIMER,
        quality_flags=quality_flags,
        confidence=confidence,
        breakdown=_breakdown(
            curve,
            physical_distance_km=physical_distance_km,
            course_demand_km=course_demand_km,
            steep_distance_fraction=steep_fraction,
            altitude_excess_m=altitude_excess,
            adjusted_km=equivalent_km,
            finish_time_seconds=finish_time_seconds,
            performance_rate=computed["performance_rate"],
        ),
    )
