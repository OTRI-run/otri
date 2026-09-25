"""Lab-only monotone cubic reference in log(distance), log(time).

Interior derivatives use the weighted harmonic mean; endpoint derivatives retain
the observed end-segment power laws. No fitted physiological parameters.
"""

import math
from functools import cached_property

from scoring.course_standard import EnduranceReference


class SmoothReference(EnduranceReference):
    @cached_property
    def knots(self):
        x = [math.log(d) for d in self.anchor_demand_km]
        y = [math.log(3600 * d / q) for d, q in zip(self.anchor_demand_km, self.anchor_rates)]
        h = [b - a for a, b in zip(x, x[1:])]
        delta = [(b - a) / width for a, b, width in zip(y, y[1:], h)]
        slopes = [delta[0]]
        for i in range(1, len(x) - 1):
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            slopes.append((w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]))
        slopes.append(delta[-1])
        return tuple(zip(x, y, slopes))

    def log_seconds(self, x):
        knots = self.knots
        if x <= knots[0][0] or x >= knots[-1][0]:
            a, b, slope = knots[0] if x <= knots[0][0] else knots[-1]
            return b + slope * (x - a)
        i = next(i for i in range(len(knots) - 1) if x <= knots[i + 1][0])
        a, b, m = knots[i]
        c, d, n = knots[i + 1]
        width = c - a
        u = (x - a) / width
        return (2*u**3 - 3*u**2 + 1)*b + (u**3 - 2*u**2 + u)*width*m + (-2*u**3 + 3*u**2)*d + (u**3 - u**2)*width*n

    def rate(self, course_demand_km):
        if not math.isfinite(course_demand_km) or course_demand_km <= 0:
            raise ValueError("demand must be positive and finite")
        return course_demand_km * 3600 / math.exp(self.log_seconds(math.log(course_demand_km)))

    def distance(self, seconds):
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("seconds must be positive and finite")
        y = math.log(seconds)
        if y <= self.knots[0][1] or y >= self.knots[-1][1]:
            x, b, slope = self.knots[0] if y <= self.knots[0][1] else self.knots[-1]
            return math.exp(x + (y - b) / slope)
        lo, hi = self.knots[0][0], self.knots[-1][0]
        for _ in range(60):
            mid = (lo + hi) / 2
            if self.log_seconds(mid) < y:
                lo = mid
            else:
                hi = mid
        return math.exp((lo + hi) / 2)
