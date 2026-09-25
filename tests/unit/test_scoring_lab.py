"""The scoring lab gives the production number, and its report's curve is the model's curve."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from course.gpx import read_track_points
from scoring import estimate_score
from scoring.course_standard import score_for_time, target_time_seconds
from scoring_lab import lab
from scoring.course_standard import ENDURANCE_REFERENCE_OBSERVATIONS
from scoring.course_demand import gradient_ratio
from scoring_lab.models import LAB_MODELS, MODELS_BY_KEY, ceiling_distance, ceiling_seconds, descent_ratio, evidence_demand, evidence_ratio, select_models

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "gpx"


@pytest.fixture()
def report(tmp_path, monkeypatch):
    monkeypatch.delenv("OTRI_DEM_MANIFEST", raising=False)
    monkeypatch.setattr(lab, "CACHE_DIR", tmp_path / "cache")
    courses = tmp_path / "courses"
    courses.mkdir()
    for name in ("alps-terrain-check.gpx", "out-and-back.gpx"):
        shutil.copy(FIXTURES / name, courses / name)
    (courses / "broken.gpx").write_text("not a gpx", encoding="utf-8")
    (courses / "times.csv").write_text("gpx,time,label\nalps-terrain-check,1:10:00,winner\nout-and-back.gpx,nope,\n", encoding="utf-8")
    return lab.build([courses], list(LAB_MODELS), jobs=1, log=lambda *_: None), courses


def test_select_models_always_includes_production_first():
    assert [m.key for m in select_models(None)] == ["prod"]
    assert [m.key for m in select_models("linear")] == ["prod", "linear"]
    assert len(select_models("all")) == len(LAB_MODELS)
    with pytest.raises(ValueError):
        select_models("nope")


def test_variants_never_carry_the_production_version():
    versions = [m.curve.version for m in LAB_MODELS if not m.production and not m.from_totals]
    assert versions and all(v.startswith("lab-") for v in versions)


def test_lab_0_1_1_lifts_the_middle_and_keeps_the_top():
    curve = MODELS_BY_KEY["0.1.1"].curve
    assert curve.power_exponent == 0.692
    top = curve.q_1000
    assert curve.raw_score(top) == pytest.approx(1000)
    assert round(curve.raw_score(0.53 * top)) == 644
    assert round(MODELS_BY_KEY["prod"].curve.raw_score(0.53 * top)) == 583


@pytest.mark.parametrize("text, seconds", [("4:05:30", 14730), ("45:10", 2710), ("600", 600)])
def test_parse_duration(text, seconds):
    assert lab.parse_duration(text) == seconds


def test_production_matches_the_estimator(report):
    data, courses = report
    course = next(c for c in data["courses"] if c["name"] == "alps-terrain-check")
    estimate = estimate_score(4200, gpx_points=read_track_points(courses / "alps-terrain-check.gpx"))
    prod = course["models"]["prod"]
    [time] = prod["times"]
    assert time["source"].endswith("times.csv")
    assert (time["label"], time["seconds"], time["score"], time["raw"]) == ("winner", 4200, estimate.predicted_score, estimate.otri_raw)
    assert prod["adjusted_demand_km"] == estimate.breakdown.adjusted_demand_km
    assert prod["world_best_seconds"] == pytest.approx(estimate.breakdown.world_best_time_seconds, abs=0.1)
    assert prod["confidence"] == estimate.confidence


def _page_ceiling_distance(anchors, t):
    """ceilingDistance in report_template.html, line for line."""
    for i in range(len(anchors) - 1):
        (d1, q1), (d2, q2) = anchors[i], anchors[i + 1]
        e = math.log(q2 / q1) / math.log(d2 / d1)
        d = (t / 3600 * q1 / d1 ** e) ** (1 / (1 - e))
        if max([j for j in range(len(anchors) - 1) if d >= anchors[j][0]], default=0) == i:
            return d
    return math.nan


def _page_rate(anchors, d):
    i = max([j for j in range(len(anchors) - 1) if d >= anchors[j][0]], default=0)
    (d1, q1), (d2, q2) = anchors[i], anchors[i + 1]
    return q1 * (d / d1) ** (math.log(q2 / q1) / math.log(d2 / d1))


def _page_score(m, t):
    """scoreAt in report_template.html, line for line."""
    c = m["curve"]
    if c.get("smooth_knots"):
        return _browser_value("scoreAt", m, t)
    if c.get("duration_matched"):
        return 1000 * (m["adjusted_demand_km"] / _page_ceiling_distance(c["anchors"], t)) ** c["exponent"]
    power = 1000 * (m["ceiling_seconds"] / t) ** c["exponent"]
    if "knee" not in c or power <= c["knee"]:
        return power
    return c["knee"] + (c["cap"] - c["knee"]) * (1 - math.exp(-(power - c["knee"]) / c["softness"]))


def _page_time(m, score):
    """timeFor in report_template.html, line for line."""
    c = m["curve"]
    if c.get("smooth_knots"):
        return _browser_value("timeFor", m, score)
    if c.get("duration_matched"):
        d = m["adjusted_demand_km"] * (1000 / score) ** (1 / c["exponent"])
        return d / _page_rate(c["anchors"], d) * 3600
    power = score if "knee" not in c or score <= c["knee"] else c["knee"] - c["softness"] * math.log(1 - (score - c["knee"]) / (c["cap"] - c["knee"]))
    return m["ceiling_seconds"] * (1000 / power) ** (1 / c["exponent"])


def _browser_value(function, model, value):
    """Execute the real report functions, rather than a second copy of the algorithm."""
    template = (Path(lab.__file__).parent / "report_template.html").read_text(encoding="utf-8")
    source = template.split("function rateAt(", 1)[1].split("const LEVELS", 1)[0]
    script = "function rateAt(" + source + f"\nconsole.log(JSON.stringify({function}({json.dumps(model)}, {value})));"
    return json.loads(subprocess.run(["node", "--input-type=module", "-e", script], check=True, capture_output=True, text=True).stdout)


def test_lab_0_1_7_reference_and_fairness_invariants():
    model = MODELS_BY_KEY["0.1.7"]
    reference = model.curve.demand_scaling
    for _, distance, seconds in ENDURANCE_REFERENCE_OBSERVATIONS:
        assert model.raw_score(distance, seconds) == pytest.approx(1000)
        # Continuous score and derivative at each anchor, including extrapolation joins.
        eps = 1e-5
        left = (reference.log_seconds(math.log(distance)) - reference.log_seconds(math.log(distance) - eps)) / eps
        right = (reference.log_seconds(math.log(distance) + eps) - reference.log_seconds(math.log(distance))) / eps
        assert left == pytest.approx(right, abs=1e-5)
    previous = 0
    for i in range(150):
        seconds = 60 * (200000 / 60) ** (i / 149)
        distance = ceiling_distance(reference, seconds)
        assert distance > previous
        previous = distance
        assert ceiling_seconds(reference, distance) == pytest.approx(seconds)
        assert model.raw_score(distance / 2, seconds) == pytest.approx(500)
        assert model.raw_score(distance * 1.1, seconds) == pytest.approx(1100)
    for distance in (1, 5, 21.0975, 42.195, 100, 500):
        scores = [model.raw_score(distance, t) for t in (600, 3600, 7200, 86400)]
        assert all(a > b for a, b in zip(scores, scores[1:]))
        for score in (100, 500, 1000, 1200):
            assert model.raw_score(distance, model.target_seconds(distance, score)) == pytest.approx(score)
    for bad in (0, -1, math.nan, math.inf):
        with pytest.raises(ValueError):
            model.raw_score(bad, 3600)
        with pytest.raises(ValueError):
            model.raw_score(10, bad)
        with pytest.raises(ValueError):
            model.target_seconds(10, bad)


def test_lab_0_1_7_report_marks_experimental_confidence(report):
    data, _ = report
    for course in data["courses"]:
        if "models" in course:
            m = course["models"]["0.1.7"]
            assert m["confidence"] == "Low"
            assert any("experimental_reference" in flag for flag in m["flags"])


def test_report_curve_is_the_model_curve(report):
    """The HTML redraws each model's curve from `curve` and `ceiling_seconds`; it must be the model's own."""
    data, _ = report
    for course in (c for c in data["courses"] if "models" in c):
        for key, m in course["models"].items():
            model = MODELS_BY_KEY[key]
            for share in (0.2, 0.6, 0.97, 1.0, 1.05, 1.4):
                seconds = m["ceiling_seconds"] / share
                assert _page_score(m, seconds) == pytest.approx(model.raw_score(m["adjusted_demand_km"], seconds), rel=1e-4), (key, share)
            for score in (300, 500, 990, 1000):
                if "cap" in m["curve"] and score >= m["curve"]["cap"]:
                    continue
                assert _page_time(m, score) == pytest.approx(model.target_seconds(m["adjusted_demand_km"], score), rel=1e-4), (key, score)


def test_lab_0_1_4_moves_the_three_judged_results_and_never_reaches_1000():
    model = MODELS_BY_KEY["0.1.4"]
    top = model.curve.q_1000
    score = lambda share: model.curve.raw_score(share * top)
    assert round(score(1.036)) == 979  # Sierre-Zinal's record: 1030 in production
    assert round(score(0.546)) == 655  # Phuket 15k in 1:33:40: 598
    assert round(score(0.503)) == 618  # Phuket 75k in 13:24:40: 557
    assert round(score(1.0)) == 971  # the road world bests
    assert score(5.0) < 1000
    assert score(0.3) == 1000 * 0.3 ** 0.70  # below the knee it is the plain power curve
    with pytest.raises(ValueError):
        model.target_seconds(42.195, 1000)


def test_lab_0_1_5_keeps_0_1_4s_judged_results_and_lets_the_best_pass_1000():
    model, tuned = MODELS_BY_KEY["0.1.5"], MODELS_BY_KEY["0.1.4"]
    top = model.curve.q_1000
    score = lambda m, share: m.curve.raw_score(share * top)
    for share in (1.036, 0.546, 0.503):  # Sierre-Zinal's record, Phuket 15k and 75k
        assert round(score(model, share)) == round(score(tuned, share))
    assert round(score(model, 1.0)) == 966  # the road world bests
    assert score(model, 1.2) > 1020  # 20 % faster than the road world bests passes 1000
    assert score(model, 5.0) < 1100  # five times world-best speed
    assert model.raw_score(42.195, model.target_seconds(42.195, 1000)) == pytest.approx(1000)


def test_lab_0_1_6_descent_rule_follows_measured_pace():
    assert descent_ratio(-1e-9) == pytest.approx(1.0)
    assert descent_ratio(-0.09) == pytest.approx(0.88)  # the most a descent is worth
    assert descent_ratio(-0.045) == pytest.approx(0.94)
    assert descent_ratio(-0.135) == pytest.approx(0.94)
    assert descent_ratio(-0.18) == pytest.approx(1.0)
    assert descent_ratio(-0.30) == 1.0 == descent_ratio(-0.60)
    assert evidence_ratio(0.10) == gradient_ratio(0.10)  # uphill is Minetti, as in production
    assert evidence_ratio(0.60) == gradient_ratio(0.45)
    for g in (-0.25, -0.15, -0.05):
        assert descent_ratio(g) > gradient_ratio(g)  # never as generous as the metabolic credit


def test_lab_0_1_6_prices_a_flat_low_course_as_its_distance(report):
    data, courses = report
    from course.elevation import configured_provider
    from course.measurement import measure_course
    shutil.copy(FIXTURES / "flat-loop.gpx", courses / "flat-loop.gpx")
    measurement = measure_course(read_track_points(courses / "flat-loop.gpx"), configured_provider())
    km, flags, factor = evidence_demand(measurement)
    assert factor == 1.0  # 100 m above sea level: below the 300 m floor
    assert km == pytest.approx(measurement.distance_m / 1000, rel=1e-6)
    assert any(f.startswith("steep_ground_not_priced") for f in flags)
    alps = next(c for c in data["courses"] if c["name"] == "alps-terrain-check")
    m = alps["models"]["0.1.6"]
    assert m["terrain_factor"] > 1.05  # 1,200-2,400 m: altitude priced from 300 m
    assert any(f.startswith("altitude_adjustment_applied") for f in m["flags"])
    assert not any(f.startswith("vertical_calibration") for f in m["flags"])


def test_standard_models_score_through_the_production_functions():
    for key in ("prod", "0.1.1", "0.1.2", "linear"):
        model = MODELS_BY_KEY[key]
        assert model.raw_score(42.195, 14400) == score_for_time(42.195, 14400, curve=model.curve)["otri_raw"]
        assert model.target_seconds(42.195, 600) == target_time_seconds(42.195, 600, curve=model.curve)


def test_lab_0_1_3_compares_with_the_ceiling_over_the_same_time():
    model = MODELS_BY_KEY["0.1.3"]
    reference = model.curve.demand_scaling
    for distance in (1.5, 5.0, 42.195, 100.0, 319.614, 700.0):
        assert ceiling_distance(reference, ceiling_seconds(reference, distance)) == pytest.approx(distance, rel=1e-12)
    for _label, distance, seconds in ENDURANCE_REFERENCE_OBSERVATIONS:  # the world bests it is built on
        assert model.raw_score(distance, seconds) == pytest.approx(1000, abs=1e-6)
    # Linear share of what the best humans cover in the same time: half of it is 500, at any duration.
    for hours in (0.5, 4, 30):
        seconds = hours * 3600
        assert model.raw_score(ceiling_distance(reference, seconds) / 2, seconds) == pytest.approx(500)
    # The longer a runner is out, the more the same-time ceiling has slowed: a slow finish on a long
    # course scores more than under production (the spec's calibration course in 46 h: 437).
    assert round(model.raw_score(245.626, 46 * 3600)) == 452
    assert round(MODELS_BY_KEY["prod"].raw_score(245.626, 46 * 3600)) == 437
    for score in (300, 700, 1000, 1050):
        assert model.raw_score(42.195, model.target_seconds(42.195, score)) == pytest.approx(score)


def test_lab_0_1_2_makes_the_top_nearly_unreachable():
    hard, prod = MODELS_BY_KEY["0.1.2"].curve, MODELS_BY_KEY["prod"].curve
    top = prod.q_1000
    for share in (0.3, 0.6, 0.9, 0.98):  # below 990 nothing changes
        assert hard.raw_score(share * top) == prod.raw_score(share * top)
    assert round(hard.raw_score(top)) == 994  # a world best
    assert hard.raw_score(1.02 * top) == pytest.approx(1000, abs=0.5)
    assert hard.raw_score(1.25 * top) == pytest.approx(1050, abs=1)  # 25% faster than a world best
    assert hard.raw_score(10 * top) < 1100  # ten times world-best speed
    scores = [hard.raw_score(share * top) for share in (0.99, 1.0, 1.1, 1.5, 3.0)]
    assert scores == sorted(scores)
    for score in (995, 1000, 1080):
        assert hard.raw_score(hard.required_q(score)) == pytest.approx(score)
    with pytest.raises(ValueError):
        hard.required_q(1100)


def test_bad_files_and_times_are_reported_not_fatal(report, tmp_path):
    data, _ = report
    assert next(c for c in data["courses"] if c["name"] == "broken")["error"]
    assert any("nope" in p for p in data["problems"])
    target = lab.write_outputs(data, tmp_path / "out")
    html = target.read_text(encoding="utf-8")
    assert "/*__LAB_DATA__*/null" not in html and "alps-terrain-check" in html
    assert json.loads((tmp_path / "out" / "latest.json").read_text(encoding="utf-8"))["courses"]


def test_second_run_comes_from_the_cache(report):
    _, courses = report
    again = lab.build([courses], select_models(None), jobs=1, log=lambda *_: None)
    assert all(c["cached"] for c in again["courses"] if "error" not in c)
