"""The scoring lab gives the production number, and its report's curve is the model's curve."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from course.gpx import read_track_points
from scoring import estimate_score
from scoring.course_standard import score_for_time
from scoring_lab import lab
from scoring_lab.models import LAB_MODELS, MODELS_BY_KEY, select_models

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


def test_report_curve_is_the_model_curve(report):
    """The HTML draws score = 1000 x (world best / t) ^ exponent; that must be score_for_time."""
    data, _ = report
    for course in (c for c in data["courses"] if "models" in c):
        for key, m in course["models"].items():
            for seconds in (m["world_best_seconds"] * 1.3, m["world_best_seconds"] * 2.7):
                expected = score_for_time(m["adjusted_demand_km"], seconds, curve=MODELS_BY_KEY[key].curve)["otri_raw"]
                assert 1000 * (m["world_best_seconds"] / seconds) ** m["exponent"] == pytest.approx(expected, rel=1e-4)


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
