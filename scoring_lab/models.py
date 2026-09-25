"""The models the lab can score with: production plus what-if variants.

The production entry is the registry's own curve (`scoring.registry`), untouched. Every variant is
built from it with `dataclasses.replace`, so it differs in exactly the parameter its name says and
nothing else, and its `version` starts with `lab-` so a lab number can never pass for a published
one. To try an idea, add an entry to `LAB_MODELS`: the report picks it up with no other change.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, fields, replace

from course.measurement import boundaries, interpolate
from scoring.course_demand import MAX_GRADE, gradient_ratio
from scoring.course_standard import MODEL_0_1_0_CURVE, MODEL_CURVE, SCALE_MAX, SCALE_MIN, EnduranceReference, ScoreCurve, score_for_time, target_time_seconds
from scoring.registry import DEFAULT_SCORING_VERSION, get_scoring_model_info
from .smooth_reference import SmoothReference


@dataclass(frozen=True)
class SaturatingScoreCurve(ScoreCurve):
    """The production power curve up to `knee`; above it the score bends towards `cap` and never
    reaches it: ``knee + (cap - knee) * (1 - exp(-(power_score - knee) / softness))``.

    `softness` sets how hard the top is: the larger it is, the more speed each point above the
    knee costs. Below the knee the score is exactly the production score.
    """

    knee: float = 990.0
    cap: float = 1100.0
    softness: float = 280.0

    def raw_score(self, q: float) -> float:
        power = super().raw_score(q)
        if power <= self.knee:
            return power
        return self.knee + (self.cap - self.knee) * (1.0 - math.exp(-(power - self.knee) / self.softness))

    def required_q(self, score: float) -> float:
        if not math.isfinite(score) or score < SCALE_MIN:
            raise ValueError(f"score must be {SCALE_MIN} or more")
        if score >= self.cap:
            raise ValueError(f"a score of {self.cap:g} or more cannot be reached on this curve")
        power = score if score <= self.knee else self.knee - self.softness * math.log(1.0 - (score - self.knee) / (self.cap - self.knee))
        return self.q_1000 * (power / SCALE_MAX) ** (1.0 / self.power_exponent)

    def to_spec(self) -> dict:
        return {"knee": self.knee, "cap": self.cap, "softness": self.softness}


def ceiling_seconds(reference: EnduranceReference, demand_km: float) -> float:
    """How long the human ceiling takes over `demand_km` flat-equivalent km."""
    return demand_km / reference.rate(demand_km) * 3600.0


def ceiling_distance(reference: EnduranceReference, seconds: float) -> float:
    """How far the human ceiling goes in `seconds`: the inverse of `ceiling_seconds`, in closed form.

    On each segment rate(D) = q_i (D / d_i)^e_i, so time = 3600 D^(1-e_i) d_i^e_i / q_i; solve every
    segment and keep the one whose range the answer falls in. Time rises strictly with distance on
    every segment (the fatigue exponent 1 - e_i is positive), so exactly one does.
    """
    if isinstance(reference, SmoothReference):
        return reference.distance(seconds)
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("seconds must be positive and finite")
    d, q = reference.anchor_demand_km, reference.anchor_rates
    for i in range(len(d) - 1):
        e = math.log(q[i + 1] / q[i]) / math.log(d[i + 1] / d[i])
        distance = (seconds / 3600.0 * q[i] / d[i] ** e) ** (1.0 / (1.0 - e))
        if reference._segment(distance) == i:
            return distance
    raise ValueError("no segment of the ceiling covers this time")  # unreachable for a valid reference


def curve_spec(curve: ScoreCurve, *, duration_matched: bool = False) -> dict:
    """What the report needs to redraw a curve in the browser (scoring_lab/report_template.html)."""
    spec = {"exponent": curve.power_exponent}
    if isinstance(curve, SaturatingScoreCurve):
        spec.update(curve.to_spec())
    if duration_matched:
        ref = curve.demand_scaling
        spec.update(duration_matched=True, anchors=[[d, q] for d, q in zip(ref.anchor_demand_km, ref.anchor_rates)])
        if isinstance(ref, SmoothReference):
            spec["smooth_knots"] = ref.knots
    return spec


# --- Model 0.1.6: course demand from published evidence only ----------------------------------
#
# Descents. Minetti's polynomial is a metabolic cost, and going downhill is not metabolically
# limited: braking, impact and footing set the speed. Measured pace says how much a descent is
# really worth. Strava's grade-adjusted pace, fitted to heart-rate effort on millions of runs
# (Robb 2017): a km at -9 % costs 0.88 flat km, the most any descent is worth, and by -18 % a
# descent costs a full flat km again, with no further change on steeper ground. Townshend et al.
# 2010 measured the same asymmetry on a hilly time trial: 23 % slower on the climbs, only 13.8 %
# faster on the descents. Minetti would credit -20 % at 0.50 flat km.
DESCENT_BEST_GRADE = -0.09
DESCENT_BEST_RATIO = 0.88
DESCENT_NO_CREDIT_GRADE = -0.18



def descent_ratio(g: float) -> float:
    """Flat km per km of descent at grade `g` (< 0), from measured pace rather than metabolic cost."""
    if not math.isfinite(g) or g >= 0:
        raise ValueError("descent_ratio takes a negative grade")
    if g >= DESCENT_BEST_GRADE:
        return 1.0 + (DESCENT_BEST_RATIO - 1.0) * g / DESCENT_BEST_GRADE
    if g >= DESCENT_NO_CREDIT_GRADE:
        return DESCENT_BEST_RATIO + (1.0 - DESCENT_BEST_RATIO) * (g - DESCENT_BEST_GRADE) / (DESCENT_NO_CREDIT_GRADE - DESCENT_BEST_GRADE)
    return 1.0


def evidence_ratio(g: float) -> float:
    """Flat km per km at grade `g`: Minetti's running cost uphill (clamped at +45 % as in production),
    the pace-based descent rule downhill."""
    return gradient_ratio(min(g, MAX_GRADE)) if g >= 0 else descent_ratio(g)


def evidence_demand(measurement) -> tuple[float, tuple[str, ...], float]:
    """Scored demand for model 0.1.6 from the same 50 m windows production integrates:
    (adjusted_km, flags, altitude_factor). No steep-ground coefficient: the production value is
    calibrated on one performance and has no published counterpart, so it is left out rather than
    guessed, and the course says so in its flags."""
    demand = total_m = altitude_m_m = clamped_m = 0.0
    for segment in measurement.segments:
        xs, zs = zip(*segment)
        edges = boundaries(xs[-1], 50.0)
        for a, b in zip(edges, edges[1:]):
            za, zb = interpolate(xs, zs, a), interpolate(xs, zs, b)
            grade = (zb - za) / (b - a)
            width = b - a
            demand += width / 1000.0 * evidence_ratio(grade)
            total_m += width
            altitude_m_m += width * max(0.0, (za + zb) / 2.0 - ALTITUDE_FLOOR_M)
            if grade > MAX_GRADE:
                clamped_m += width
    altitude_excess = altitude_m_m / total_m if total_m else 0.0
    factor = 1.0 + ALTITUDE_PER_1000_M * altitude_excess / 1000.0
    flags = [
        "descents_priced_by_pace: a descent is worth at most 0.88 flat km per km (at -9 %) and a full km "
        "from -18 % down, from measured pace rather than metabolic cost (Strava GAP 2017, Townshend 2010)",
        "steep_ground_not_priced: no steep-terrain coefficient; production's is calibrated on one "
        "performance and has no published counterpart, so this course's footing is unpriced",
    ]
    if factor > 1.0:
        flags.append(f"altitude_adjustment_applied: course demand scaled by {factor:.3f} "
                     f"({altitude_excess:.0f} m mean altitude above {ALTITUDE_FLOOR_M:.0f} m, 3.6 % per 1,000 m for "
                     "acclimatised athletes; Pühringer et al. 2022)")
    if clamped_m:
        flags.append(f"gradient_out_of_supported_domain: {clamped_m:.0f} m of climb steeper than 45 %, scored as 45 %")
    return demand * factor, tuple(flags), factor


@dataclass(frozen=True)
class LabModel:
    key: str
    name: str
    description: str
    curve: ScoreCurve
    # Score from the course's measured distance and climb only (one average grade), the way a race
    # is scored before its GPX is attached. Terrain inputs are unknown there, so no terrain factor.
    from_totals: bool = False
    production: bool = False
    # Compare with the human ceiling over the runner's own finish time, not over the course
    # (model 0.1.3): score = 1000 x (D / ceiling_distance(T)) ^ exponent.
    duration_matched: bool = False
    # Course demand by another rule than production's (model 0.1.6): measurement -> (km, flags, factor).
    demand: object = None

    def raw_score(self, demand_km: float, seconds: float) -> float:
        if not math.isfinite(demand_km) or demand_km <= 0:
            raise ValueError("demand must be positive and finite")
        if self.duration_matched:
            share = demand_km / ceiling_distance(self.curve.demand_scaling, seconds)
            return SCALE_MAX * share ** self.curve.power_exponent
        return score_for_time(demand_km, seconds, curve=self.curve)["otri_raw"]

    def target_seconds(self, demand_km: float, score: float) -> float:
        if not math.isfinite(demand_km) or demand_km <= 0:
            raise ValueError("demand must be positive and finite")
        if self.duration_matched:
            if not math.isfinite(score) or score <= 0:
                raise ValueError("score must be positive")
            return ceiling_seconds(self.curve.demand_scaling, demand_km * (SCALE_MAX / score) ** (1.0 / self.curve.power_exponent))
        return target_time_seconds(demand_km, score, curve=self.curve)


def _variant(key: str, **changes) -> ScoreCurve:
    """Production's curve with `changes`, on the lab's altitude rule unless `changes` says otherwise."""
    return replace(MODEL_CURVE, version=f"lab-{key}", **{"terrain_adjustment": LAB_TERRAIN, **changes})


def _saturating(key: str, **changes) -> "SaturatingScoreCurve":
    base = {f.name: getattr(MODEL_CURVE, f.name) for f in fields(ScoreCurve)}
    return SaturatingScoreCurve(**{**base, "version": f"lab-{key}", "terrain_adjustment": LAB_TERRAIN, **changes})


_TERRAIN = MODEL_CURVE.terrain_adjustment

# Altitude, for every lab model. Production prices 7 % per 1,000 m above 1,500 m. The published
# acute figure is steeper (Wehrlin & Hallén 2006: 6.3 % per 1,000 m from 300 m, sea-level athletes
# in a chamber), but the people near the top of a mountain race are acclimatised, and for them the
# loss is about half: Pühringer et al. 2022 tested 128 acclimatised mountain guides at 600 m and
# 2,000 m and found VO2max 5 % lower at 2,000 m in the fit ones, and unchanged in the less fit.
# That is 3.6 % per 1,000 m above 600 m, and it is what every lab model uses; `prod` and `0.1.0`
# keep production's rule so the two can be compared.
ALTITUDE_FLOOR_M = 600.0
ALTITUDE_PER_1000_M = 0.036
LAB_TERRAIN = replace(_TERRAIN, altitude_threshold_m=ALTITUDE_FLOOR_M, altitude_coefficient=ALTITUDE_PER_1000_M)
_SMOOTH_REFERENCE = SmoothReference(**{
    f.name: getattr(MODEL_CURVE.demand_scaling, f.name) for f in fields(EnduranceReference)
})

LAB_MODELS: tuple[LabModel, ...] = (
    LabModel(
        key="prod",
        name=get_scoring_model_info(DEFAULT_SCORING_VERSION).name,
        description="The production model, exactly as the site scores (" + DEFAULT_SCORING_VERSION + "; OTRI model 0.1.1, curve exponent 0.692).",
        curve=MODEL_CURVE,
        production=True,
    ),
    LabModel(
        key="0.1.0",
        name="OTRI model 0.1.0",
        description=(
            "The model before 0.1.1, exactly as the site scored until 25 September 2026: the same course demand, "
            "terrain factor and ceiling, with the curve exponent 0.85 instead of 0.692 (53% of the ceiling scores "
            "583 instead of 644). Its version is the published one, not a lab one."
        ),
        curve=MODEL_0_1_0_CURVE,
    ),
    LabModel(
        key="0.1.2",
        name="Model 0.1.2 (lab): hard top",
        description=(
            "Production up to 990; above it the score bends towards 1100 and never reaches it. A world best "
            "scores about 994, 1000 takes 2% faster than the world best, 1050 about 25% faster. Lab only."
        ),
        curve=_saturating("0.1.2", knee=990.0, cap=1100.0, softness=280.0),
    ),
    LabModel(
        key="0.1.3",
        name="Model 0.1.3 (lab): same-time ceiling, linear",
        description=(
            "Each runner is compared with the best humans over the same time they were out, not over the same "
            "course, and the score is that share, times 1000, with no chosen exponent: in the time you took, "
            "the best humans cover X flat-km; you covered D; score = 1000 x D / X. A world best still scores "
            "1000. Lab only; the reasoning is in scoring_lab/README.md."
        ),
        curve=_variant("0.1.3", power_exponent=1.0),
        duration_matched=True,
    ),
    LabModel(
        key="0.1.4",
        name="Model 0.1.4 (lab): tuned by feel",
        description=(
            "Tuned to three results judged by eye: Sierre-Zinal's record scored too high, Phuket 15k in "
            "1:33:40 and 75k in 13:24:40 too low. Exponent 0.70 lifts the middle; above 900 the score bends "
            "towards 1000 and never reaches it, so no result passes 1000 and road world bests score about 971. "
            "A curve cannot put Sierre-Zinal below the road records: it measures faster than them. Lab only."
        ),
        curve=_saturating("0.1.4", power_exponent=0.70, knee=900.0, cap=1000.0, softness=80.0),
    ),
    LabModel(
        key="0.1.5",
        name="Model 0.1.5 (lab): tuned by feel, open top",
        description=(
            "0.1.4 with room above 1000: exponent 0.70 lifts the middle, and above 900 the score bends gently "
            "towards 1100 and never reaches it. The same scores as 0.1.4 below 900; road world bests about 966; "
            "1000 takes 11% faster than the road world bests, 1022 20% faster. Lab only."
        ),
        curve=_saturating("0.1.5", power_exponent=0.70, knee=900.0, cap=1100.0, softness=250.0),
    ),
    LabModel(
        key="0.1.7",
        name="Model 0.1.7 (lab): smooth duration reference",
        description=(
            "Evidence-informed candidate: score = 1000 x course demand / reference distance over your "
            "finish time. Smooth between the three frozen benchmarks; each still scores 1000. "
            "No subjective score exponent or cap. Absolute performance, not age/sex grading or a "
            "measurement of effort. Smoothing is a modelling choice, not proven fairer; trail and "
            "runner-group validation remains necessary. Outside 12:35 to 24 hours the reference is extrapolated."
        ),
        curve=_variant("0.1.7", power_exponent=1.0, demand_scaling=_SMOOTH_REFERENCE,
                       q_1000=_SMOOTH_REFERENCE.rate(_SMOOTH_REFERENCE.reference_demand_km)),
        duration_matched=True,
    ),
    LabModel(
        key="0.1.6",
        name="Model 0.1.6 (lab): evidence-only course demand",
        description=(
            "Production's curve on a course demand that uses only published evidence: descents are priced "
            "by measured pace (at most 0.88 flat km per km, none below -18 %; Strava GAP, Townshend 2010) "
            "instead of Minetti's metabolic credit of up to 0.50; altitude costs 3.6 % per 1,000 m from 600 m, the "
            "measured loss in acclimatised athletes (Pühringer et al. 2022), as in every lab model; and the "
            "steep-ground coefficient, calibrated on one performance, is dropped. The demand-by-grade chart still shows production's bands. Lab only; "
            "the reasoning is in scoring_lab/README.md."
        ),
        curve=_variant("0.1.6"),
        demand=evidence_demand,
    ),
    LabModel(
        key="no-terrain",
        name="No terrain adjustment",
        description="Gradient-cost integral only: no steep-ground and no altitude factor. Shows what terrain adds.",
        curve=_variant(
            "no-terrain",
            terrain_adjustment=replace(LAB_TERRAIN, steep_coefficient=0.0, altitude_coefficient=0.0, vertical_steep_coefficient=0.0),
        ),
    ),
    LabModel(
        key="no-altitude",
        name="No altitude factor",
        description="No altitude factor at all; steep-ground factor kept.",
        curve=_variant("no-altitude", terrain_adjustment=replace(LAB_TERRAIN, altitude_coefficient=0.0)),
    ),
    LabModel(
        key="no-vertical-rule",
        name="No vertical rule",
        description="Uphill-only courses get the ordinary steep coefficient instead of the vertical one.",
        curve=_variant("no-vertical-rule", terrain_adjustment=replace(LAB_TERRAIN, vertical_steep_fraction=1.0, vertical_steep_coefficient=0.0)),
    ),
    LabModel(
        key="linear",
        name="Linear curve (exponent 1.0)",
        description="Score = 1000 x share of the human ceiling, with no 0.85 power.",
        curve=_variant("linear", power_exponent=1.0),
    ),
    LabModel(
        key="totals",
        name="Totals only (no GPX profile)",
        description="Measured distance and climb as one average grade, as a race without a course file is scored.",
        curve=MODEL_CURVE,
        from_totals=True,
    ),
)

MODELS_BY_KEY = {model.key: model for model in LAB_MODELS}


def select_models(spec: str | None) -> list[LabModel]:
    """`None`/"" -> production only; "all" -> every model; else a comma list of keys (production always first)."""
    if not spec:
        return [MODELS_BY_KEY["prod"]]
    if spec.strip().lower() == "all":
        return list(LAB_MODELS)
    keys = [key.strip() for key in spec.split(",") if key.strip()]
    unknown = [key for key in keys if key not in MODELS_BY_KEY]
    if unknown:
        raise ValueError(f"unknown model(s) {', '.join(unknown)}; choose from {', '.join(MODELS_BY_KEY)}")
    if "prod" not in keys:
        keys.insert(0, "prod")
    return [MODELS_BY_KEY[key] for key in dict.fromkeys(keys)]
