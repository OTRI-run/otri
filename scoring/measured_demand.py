"""Scoring adapter for the shared v1 physical measurement (legacy demand unchanged).

Also measures the two terrain inputs `scoring/terrain.py` needs — the share of distance on
sustained steep ground and the distance-weighted altitude excess — off the same 50 m segment
profile, so no second pass over the course is required and they cannot disagree with demand.
"""
from course.measurement import boundaries, interpolate, measure_course
from course.elevation import configured_provider
from .course_demand import CourseDemand, gradient_ratio
from .terrain import ALTITUDE_THRESHOLD_M, STEEP_GRADE_THRESHOLD


def compute_measured_demand(points=None, *, measurement=None):
    m = measurement if measurement is not None else measure_course(points, configured_provider())
    demand, grades = 0.0, []
    flags = list(m.quality_flags)
    total_m = steep_m = altitude_excess_m_m = clamped_demand = 0.0
    for segment in m.segments:
        xs, zs = zip(*segment)
        edges = boundaries(xs[-1], 50.0)
        for a, b in zip(edges, edges[1:]):
            elevation_a, elevation_b = interpolate(xs, zs, a), interpolate(xs, zs, b)
            grade = (elevation_b-elevation_a)/(b-a)
            grades.append(grade)
            if abs(grade) > 0.45:
                flags.append(f'gradient_out_of_supported_domain: {a:.0f}-{b:.0f} m; scoring only clamped')
            segment_demand = (b-a)/1000 * gradient_ratio(max(-0.45, min(0.45, grade)))
            demand += segment_demand
            if abs(grade) > 0.45:
                clamped_demand += segment_demand
            width = b-a
            total_m += width
            if abs(grade) >= STEEP_GRADE_THRESHOLD:
                steep_m += width
            altitude_excess_m_m += width * max(0.0, (elevation_a+elevation_b)/2 - ALTITUDE_THRESHOLD_M)
    steep_fraction = steep_m/total_m if total_m else 0.0
    altitude_excess = altitude_excess_m_m/total_m if total_m else 0.0
    return CourseDemand(round(m.distance_m/1000, 3), round(demand, 3), round(m.gain_m, 1),
                        round(m.loss_m, 1), len(grades), round(min(grades),4), round(max(grades),4), tuple(flags),
                        round(steep_fraction, 6), round(altitude_excess, 3),
                        round(clamped_demand/demand, 6) if demand else 0.0)
