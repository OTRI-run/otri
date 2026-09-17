"""Scoring adapter for the shared v1 physical measurement (legacy demand unchanged)."""
from course.measurement import boundaries, interpolate, measure_course
from course.elevation import configured_provider
from .course_demand import CourseDemand, gradient_ratio


def compute_measured_demand(points=None, *, measurement=None):
    m = measurement if measurement is not None else measure_course(points, configured_provider())
    demand, grades = 0.0, []
    flags = list(m.quality_flags)
    for segment in m.segments:
        xs, zs = zip(*segment)
        edges = boundaries(xs[-1], 50.0)
        for a, b in zip(edges, edges[1:]):
            grade = (interpolate(xs, zs, b)-interpolate(xs, zs, a))/(b-a)
            grades.append(grade)
            if abs(grade) > 0.45:
                flags.append(f'gradient_out_of_supported_domain: {a:.0f}-{b:.0f} m; scoring only clamped')
            demand += (b-a)/1000 * gradient_ratio(max(-0.45, min(0.45, grade)))
    return CourseDemand(round(m.distance_m/1000, 3), round(demand, 3), round(m.gain_m, 1),
                        round(m.loss_m, 1), len(grades), round(min(grades),4), round(max(grades),4), tuple(flags))
