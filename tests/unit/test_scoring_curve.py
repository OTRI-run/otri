"""OTRI model 0.1.0's score curve and human-ceiling reference (scoring/course_standard.py):
score = 1000 x (fraction of the ceiling rate for a course of this size) ** 0.85."""

from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    ENDURANCE_REFERENCE,
    MODEL_CURVE,
    POWER_EXPONENT,
    REFERENCE_DEMAND_KM,
    SCALE_MAX,
    performance_rate,
    score_for_time,
    score_race_course_standard,
    target_time_seconds,
)

# Open-category world bests, flat courses: (demand-km, seconds). The first three are the anchors
# the ceiling is built from; the rest are held out and must still land near the top.
WORLD_BESTS = {
    "5000 m track": (5.0, 755.36),
    "marathon road": (42.195, 2 * 3600 + 35),
    "24 h road": (319.614, 24 * 3600),
    "1500 m track": (1.5, 206.0),
    "3000 m track": (3.0, 440.67),
    "10000 m track": (10.0, 1571.0),
    "half marathon road": (21.0975, 57 * 60 + 30),
    "50 km road": (50.0, 2 * 3600 + 42 * 60 + 7),
    "100 km road": (100.0, 6 * 3600 + 5 * 60 + 35),
    "100 miles road": (160.934, 10 * 3600 + 51 * 60 + 39),
}


def _race(distance_km=10.0, elevation_gain_m=0.0):
    return RaceRecord(race_id="R", race_name="R", event_date=date(2026, 1, 1), course_name="C", distance_km=distance_km, elevation_gain_m=elevation_gain_m)


def _finisher(bib, seconds, rank=1):
    return ResultRecord(rank=rank, finish_time_seconds=seconds, family_name="F", first_name="N", gender="M", bib_number=bib)


# --- the curve ---------------------------------------------------------------------------


def test_the_model_is_one_power_law_anchored_on_the_ceiling():
    assert MODEL_CURVE.version == "0.10.0-course-standard-vertical"
    assert MODEL_CURVE.power_exponent == POWER_EXPONENT == 0.85
    assert MODEL_CURVE.q_1000 == ENDURANCE_REFERENCE.rate(REFERENCE_DEMAND_KM)


@pytest.mark.parametrize("fraction", [0.05, 0.2, 0.5, 0.85, 1.0, 1.1])
def test_score_is_1000_times_fraction_to_the_exponent(fraction):
    q = fraction * MODEL_CURVE.q_1000
    assert MODEL_CURVE.raw_score(q) == pytest.approx(SCALE_MAX * fraction**POWER_EXPONENT, rel=1e-12)


@pytest.mark.parametrize("demand_km", [3.0, 27.56, 100.0, 218.671, 700.0])
def test_target_time_is_the_inverse_of_the_score(demand_km):
    for score in (50, 200, 400, 600, 800, 950, 1000):
        target = target_time_seconds(demand_km, score)
        assert score_for_time(demand_km, target)["otri_score"] == pytest.approx(score, abs=1)


@pytest.mark.parametrize("demand_km", [5.0, 27.56, 218.671])
def test_a_faster_time_never_scores_lower(demand_km):
    times = [1800, 3600, 7200, 18000, 36000, 65789, 100000, 250000]
    raws = [score_for_time(demand_km, t)["otri_raw"] for t in times]
    assert raws == sorted(raws, reverse=True)


def test_the_public_score_is_clipped_to_the_scale_and_the_raw_one_is_not():
    beyond = score_for_time(10.0, 600)  # 60 km/h
    assert beyond["otri_score"] == 1000 and beyond["otri_raw"] > 1000
    assert score_for_time(10.0, 10_000_000)["otri_score"] <= 1  # a power law approaches zero, never below


@pytest.mark.parametrize("fraction", [0.3, 0.55, 0.8, 0.95])
def test_equal_calibre_scores_the_same_at_every_course_size(fraction):
    scores = set()
    for demand_km in (5.0, 27.56, 100.0, 218.671, 700.0):
        seconds = demand_km / (ENDURANCE_REFERENCE.rate(demand_km) * fraction) * 3600.0
        scores.add(score_for_time(demand_km, seconds)["otri_score"])
    assert max(scores) - min(scores) <= 1


@pytest.mark.parametrize("name", sorted(WORLD_BESTS))
def test_every_world_best_scores_near_the_top_of_the_scale(name):
    """Including the held-out records the ceiling was not built from (the lowest, 50 km road, is 928)."""
    demand_km, seconds = WORLD_BESTS[name]
    score = score_for_time(demand_km, seconds)["otri_score"]
    assert 920 <= score <= 1000, f"{name} scored {score}"


def test_the_reported_performance_rate_is_the_plain_physical_one():
    computed = score_for_time(218.671, 65789)
    assert computed["performance_rate"] == pytest.approx(performance_rate(218.671, 65789))


def test_bad_inputs_are_rejected():
    for demand_km, seconds in ((10.0, 0), (0.0, 3600), (-1.0, 3600), (float("nan"), 3600)):
        with pytest.raises(ValueError):
            score_for_time(demand_km, seconds)
    for score in (-1, SCALE_MAX + 1, float("nan")):
        with pytest.raises(ValueError):
            target_time_seconds(10.0, score)
    with pytest.raises(ValueError):
        target_time_seconds(0.0, 500)


# --- the human ceiling -------------------------------------------------------------------


def test_the_ceiling_passes_through_its_three_published_observations():
    for demand_km, seconds in (WORLD_BESTS["5000 m track"], WORLD_BESTS["marathon road"], WORLD_BESTS["24 h road"]):
        assert ENDURANCE_REFERENCE.rate(demand_km) == pytest.approx(demand_km / (seconds / 3600.0), rel=1e-12)


def test_the_ceiling_rate_falls_as_courses_get_longer():
    demands = [1.0, 5.0, 10.0, 27.56, 42.195, 100.0, 219.0, 319.614, 700.0]
    rates = [ENDURANCE_REFERENCE.rate(d) for d in demands]
    assert rates == sorted(rates, reverse=True)


def test_short_segment_reproduces_riegels_published_exponent():
    """Built only from the 5 km and marathon world bests, the short segment lands on Riegel's own
    published b=1.06: independent corroboration of the ceiling's shape where his data reached."""
    assert ENDURANCE_REFERENCE.riegel_exponent(20.0) == pytest.approx(1.06, abs=0.01)


def test_fatigue_decay_never_gets_gentler_as_courses_get_longer():
    exponents = [ENDURANCE_REFERENCE.riegel_exponent(d) for d in (1.0, 5.0, 20.0, 42.195, 100.0, 320.0, 800.0)]
    assert exponents == sorted(exponents) and exponents[0] > 1.0


def test_courses_outside_the_observed_range_are_flagged_not_silently_extrapolated():
    assert any("above_reference_range" in flag for flag in score_for_time(400.0, 40 * 3600)["quality_flags"])
    assert any("below_reference_range" in flag for flag in score_for_time(2.0, 600)["quality_flags"])
    assert score_for_time(100.0, 12 * 3600)["quality_flags"] == ()
    scored = score_race_course_standard(_race(distance_km=400.0), [_finisher("1", 60 * 3600)])
    assert any("above_reference_range" in flag for flag in scored[0].score.quality_flags)


# --- scoring a race ----------------------------------------------------------------------


def test_a_score_does_not_depend_on_who_else_raced():
    race = _race()
    solo = score_race_course_standard(race, [_finisher("1", 3600)])[0].score.otri_score
    field = score_race_course_standard(race, [_finisher("1", 3600), _finisher("2", 1800, 2), _finisher("3", 7200, 3)])
    assert next(x for x in field if x.bib_number == "1").score.otri_score == solo


def test_non_finishers_are_not_scored_and_ties_are_ordered_deterministically():
    rows = [
        _finisher("9", 4000, 2),
        _finisher("3", 4000, 2),
        ResultRecord(rank="DNF", finish_time_seconds=None, family_name="F", first_name="N", gender="M", bib_number="7"),
        _finisher("1", 3600, 1),
    ]
    scored = score_race_course_standard(_race(), rows)
    assert [s.bib_number for s in scored] == ["1", "3", "9"]
    assert score_race_course_standard(_race(), list(reversed(rows))) == scored
    assert all(s.score.scoring_version == MODEL_CURVE.version and s.score.confidence == "Low" for s in scored), "official figures only: Low"
