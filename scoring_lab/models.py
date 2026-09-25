"""The models the lab can score with: production plus what-if variants.

The production entry is the registry's own curve (`scoring.registry`), untouched. Every variant is
built from it with `dataclasses.replace`, so it differs in exactly the parameter its name says and
nothing else, and its `version` starts with `lab-` so a lab number can never pass for a published
one. To try an idea, add an entry to `LAB_MODELS`: the report picks it up with no other change.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, fields, replace

from scoring.course_standard import MODEL_CURVE, SCALE_MAX, SCALE_MIN, ScoreCurve
from scoring.registry import DEFAULT_SCORING_VERSION, get_scoring_model_info


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


def curve_spec(curve: ScoreCurve) -> dict:
    """What the report needs to redraw a curve in the browser (scoring_lab/report_template.html)."""
    spec = {"exponent": curve.power_exponent}
    if isinstance(curve, SaturatingScoreCurve):
        spec.update(curve.to_spec())
    return spec


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


def _variant(key: str, **changes) -> ScoreCurve:
    return replace(MODEL_CURVE, version=f"lab-{key}", **changes)


_TERRAIN = MODEL_CURVE.terrain_adjustment

LAB_MODELS: tuple[LabModel, ...] = (
    LabModel(
        key="prod",
        name=get_scoring_model_info(DEFAULT_SCORING_VERSION).name,
        description="The production model, exactly as the site scores (" + DEFAULT_SCORING_VERSION + ").",
        curve=MODEL_CURVE,
        production=True,
    ),
    LabModel(
        key="0.1.1",
        name="Model 0.1.1 (lab): development curve",
        description=(
            "Production with the curve exponent back at 0.692, the concave shape of the development builds "
            "before 0.1.0 chose 0.85 (OTRI-MODEL-0.1.0.md section 6.1). The top holds; the middle and back of "
            "the field score higher again: 53% of the ceiling scores 644 instead of 583. Lab only."
        ),
        curve=_variant("0.1.1", power_exponent=0.692),
    ),
    LabModel(
        key="0.1.2",
        name="Model 0.1.2 (lab): hard top",
        description=(
            "Production up to 990; above it the score bends towards 1100 and never reaches it. A world best "
            "scores about 994, 1000 takes 2% faster than the world best, 1050 about 25% faster. Lab only."
        ),
        curve=SaturatingScoreCurve(**{
            **{f.name: getattr(MODEL_CURVE, f.name) for f in fields(ScoreCurve)},
            "version": "lab-0.1.2", "knee": 990.0, "cap": 1100.0, "softness": 280.0,
        }),
    ),
    LabModel(
        key="no-terrain",
        name="No terrain adjustment",
        description="Gradient-cost integral only: no steep-ground and no altitude factor. Shows what terrain adds.",
        curve=_variant(
            "no-terrain",
            terrain_adjustment=replace(_TERRAIN, steep_coefficient=0.0, altitude_coefficient=0.0, vertical_steep_coefficient=0.0),
        ),
    ),
    LabModel(
        key="no-altitude",
        name="No altitude factor",
        description="Production with the altitude coefficient set to 0; steep-ground factor kept.",
        curve=_variant("no-altitude", terrain_adjustment=replace(_TERRAIN, altitude_coefficient=0.0)),
    ),
    LabModel(
        key="no-vertical-rule",
        name="No vertical rule",
        description="Uphill-only courses get the ordinary steep coefficient instead of the vertical one.",
        curve=_variant("no-vertical-rule", terrain_adjustment=replace(_TERRAIN, vertical_steep_fraction=1.0, vertical_steep_coefficient=0.0)),
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
