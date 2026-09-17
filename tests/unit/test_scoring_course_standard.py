"""Unit tests for the Course Standard scoring models."""

import math
from datetime import date

import pytest

from ingestion.records import RaceRecord, ResultRecord
from scoring.course_standard import (
    CALIBRATED_CURVE,
    DURATION_SCALED_CURVE,
    ENDURANCE_REFERENCE,
    ENDURANCE_REFERENCED_CURVE,
    OFFICIAL_CURVE,
    REFERENCE_DEMAND_KM,
    SCALE_MAX,
    SPEC_CURVE,
    performance_rate,
    score_for_time,
    score_race_course_standard,
    target_time_seconds,
)


def _race(distance_km=10.0, elevation_gain_m=0.0) -> RaceRecord:
    return RaceRecord(
        race_id="R1", race_name="Test Race", event_date=date(2026, 1, 1),
        course_name="Test Course", distance_km=distance_km, elevation_gain_m=elevation_gain_m,
    )


def _finisher(bib: str, finish_time_seconds: int) -> ResultRecord:
    return ResultRecord(
        rank=1, bib_number=bib, family_name="Runner", first_name=bib,
        gender="M", finish_time_seconds=finish_time_seconds,
    )


def test_k_constant_matches_spec_for_legacy_log_curves():
    for curve in [SPEC_CURVE, CALIBRATED_CURVE]:
        assert curve.k == pytest.approx(500.0 / math.log(curve.q_1000 / curve.q_500))


def test_official_curve_is_the_default():
    assert score_for_time(10.0, 3600)["otri_score"] == score_for_time(
        10.0, 3600, curve=OFFICIAL_CURVE
    )["otri_score"]


def test_performance_rate_is_demand_km_per_hour():
    assert performance_rate(10.0, 7200) == pytest.approx(5.0)


@pytest.mark.parametrize(
    "score, expected_q",
    [
        (0, 1.0),
        (349, 4.240362424138815),
        (544, 8.935158501440922),
        (692, 11.769395017793594),
        (1000, 17.93986234619293),
    ],
)
def test_official_curve_scale_anchors(score, expected_q):
    assert OFFICIAL_CURVE.required_q(score) == pytest.approx(expected_q, rel=1e-12, abs=1e-12)


def test_official_curve_is_monotonic():
    scores = list(range(0, 1001, 25))
    qs = [OFFICIAL_CURVE.required_q(s) for s in scores]
    assert qs == sorted(qs)


def test_official_curve_cm6_reference_anchors():
    demand_km = 27.560
    references = [
        (6 * 3600 + 29 * 60 + 58, 349),
        (3 * 3600 + 5 * 60 + 4, 544),
        (2 * 3600 + 20 * 60 + 30, 692),
    ]
    for finish_time, expected_score in references:
        result = score_for_time(demand_km, finish_time, curve=OFFICIAL_CURVE)
        assert result["otri_score"] == expected_score


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, OFFICIAL_CURVE])
def test_clipping_above_1000(curve):
    result = score_for_time(10.0, 10, curve=curve)
    assert result["otri_score"] == 1000
    assert result["otri_raw"] > 1000


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, OFFICIAL_CURVE])
def test_score_is_monotonic_in_finish_time(curve):
    times = [1000, 1600, 2000, 2400, 3000, 3600, 5000, 10000, 20000, 50000]
    scores = [score_for_time(10.0, t, curve=curve)["otri_score"] for t in times]
    assert scores == sorted(scores, reverse=True)


def test_score_race_does_not_depend_on_other_finishers():
    race = _race(distance_km=10.0)
    solo = score_race_course_standard(race, [_finisher("1", 3600)])[0].score.otri_score
    with_field = score_race_course_standard(
        race,
        [_finisher("1", 3600), _finisher("2", 1800), _finisher("3", 7200)],
    )
    runner_one_score = next(x for x in with_field if x.bib_number == "1").score.otri_score
    assert solo == runner_one_score


@pytest.mark.parametrize("curve", [SPEC_CURVE, CALIBRATED_CURVE, OFFICIAL_CURVE])
def test_target_time_inverse(curve):
    for score in [100, 200, 300, 349, 400, 500, 544, 600, 692, 700, 800, 900, 1000]:
        target = target_time_seconds(10.0, score, curve=curve)
        recovered = score_for_time(10.0, target, curve=curve)["otri_score"]
        assert recovered == pytest.approx(score, abs=1)


def test_target_time_rejects_out_of_range_score():
    with pytest.raises(ValueError):
        target_time_seconds(10.0, -1)
    with pytest.raises(ValueError):
        target_time_seconds(10.0, SCALE_MAX + 1)


def test_score_for_time_rejects_non_positive_inputs():
    with pytest.raises(ValueError):
        score_for_time(10.0, 0)
    with pytest.raises(ValueError):
        score_for_time(0.0, 3600)
    with pytest.raises(ValueError):
        score_for_time(-1.0, 3600)


def test_confidence_is_low_without_gpx_and_medium_with_gpx():
    race = _race(distance_km=10.0)
    assert score_race_course_standard(race, [_finisher("1", 3600)])[0].score.confidence == "Low"
    from course.gpx import TrackPoint
    points = [TrackPoint(lat=0.0, lon=0.0, elevation_m=0.0, time=None), TrackPoint(lat=0.01, lon=0.0, elevation_m=0.0, time=None)]
    assert score_race_course_standard(race, [_finisher("1", 3600)], gpx_points=points)[0].score.confidence == "Medium"


def test_scoring_version_is_official():
    scores = score_race_course_standard(_race(), [_finisher("1", 3600)])
    assert scores[0].score.scoring_version == OFFICIAL_CURVE.version


def test_scoring_version_reflects_chosen_curve():
    scores = score_race_course_standard(_race(), [_finisher("1", 3600)], curve=SPEC_CURVE)
    assert scores[0].score.scoring_version == SPEC_CURVE.version


def test_duration_scaled_curve_matches_official_at_reference_demand():
    """At the exact reference course demand, duration scaling must be a no-op (spec: it must
    reduce to V0.1 exactly at the calibration course's own size)."""
    for score in [0, 100, 349, 544, 692, 900, 1000]:
        official_time = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=OFFICIAL_CURVE)
        scaled_time = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=DURATION_SCALED_CURVE)
        assert scaled_time == pytest.approx(official_time, rel=1e-9)


def test_duration_scaled_curve_credits_a_real_ultra_winner_more_than_v01():
    """Regression test for the reported bug: a real elite 100-mile mountain-race winning
    performance (course demand ~218.7 demand-km, finish 18:16:29) should score meaningfully
    higher under duration scaling than under V0.1's duration-invariant curve, without saturating
    at 1000 for a merely-elite (not superhuman) performance."""
    demand_km = 218.671
    finish_seconds = 18 * 3600 + 16 * 60 + 29
    official = score_for_time(demand_km, finish_seconds, curve=OFFICIAL_CURVE)["otri_score"]
    scaled = score_for_time(demand_km, finish_seconds, curve=DURATION_SCALED_CURVE)["otri_score"]
    assert scaled > official
    assert scaled < 1000


def test_duration_scaled_curve_does_not_saturate_for_absurd_paces():
    """A physically-impossible performance rate must not clip to the same score as a real elite
    performance \u2014 the bug a naive single-anchor patch produced."""
    demand_km = 218.671
    elite_seconds = 18 * 3600 + 16 * 60 + 29
    impossible_seconds = elite_seconds // 2
    elite_score = score_for_time(demand_km, elite_seconds, curve=DURATION_SCALED_CURVE)["otri_score"]
    impossible_score = score_for_time(demand_km, impossible_seconds, curve=DURATION_SCALED_CURVE)["otri_score"]
    assert impossible_score > elite_score
    assert elite_score < 1000


@pytest.mark.parametrize("demand_km", [5.0, REFERENCE_DEMAND_KM, 50.0, 218.671])
def test_duration_scaled_target_time_inverse(demand_km):
    for score in [100, 300, 544, 692, 900, 1000]:
        target = target_time_seconds(demand_km, score, curve=DURATION_SCALED_CURVE)
        recovered = score_for_time(demand_km, target, curve=DURATION_SCALED_CURVE)["otri_score"]
        assert recovered == pytest.approx(score, abs=1)


def test_duration_scaled_curve_is_monotonic_in_finish_time():
    times = [3600, 7200, 18000, 36000, 65789, 100000]
    scores = [score_for_time(218.671, t, curve=DURATION_SCALED_CURVE)["otri_score"] for t in times]
    assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# V0.4 endurance-referenced curve
# ---------------------------------------------------------------------------
#
# Published world-best reference performances, flat courses (course demand ~= distance).
# The first three are V0.4's own anchors; the rest are held out and were not used to build
# the curve, so they are genuine validation.
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

REFERENCE_100MI_DEMAND_KM = 218.671
REFERENCE_WIN_SECONDS = 18 * 3600 + 16 * 60 + 29


def test_endurance_referenced_curve_matches_official_shape_at_reference_demand():
    """V0.4 keeps V0.1's three real demo/test anchors and only replaces the invented 1000-anchor,
    so at the reference course size the two curves must still agree below score 692."""
    assert ENDURANCE_REFERENCED_CURVE.anchor_scores == OFFICIAL_CURVE.anchor_scores
    assert ENDURANCE_REFERENCED_CURVE.anchor_qs[:-1] == OFFICIAL_CURVE.anchor_qs[:-1]
    for score in [0, 100, 349, 544, 692]:
        official = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=OFFICIAL_CURVE)
        referenced = target_time_seconds(REFERENCE_DEMAND_KM, score, curve=ENDURANCE_REFERENCED_CURVE)
        assert referenced == pytest.approx(official, rel=1e-9)


def test_demand_scaling_is_a_no_op_at_the_reference_course_size():
    assert ENDURANCE_REFERENCE.factor(REFERENCE_DEMAND_KM) == pytest.approx(1.0, rel=1e-12)


def test_short_segment_reproduces_riegels_published_exponent():
    """Built only from the 5 km and marathon world bests, the short segment lands on Riegel's
    own published b=1.06 - independent corroboration that the reference curve has the right
    shape over the range Riegel's data covered."""
    assert ENDURANCE_REFERENCE.riegel_exponent(20.0) == pytest.approx(1.06, abs=0.01)


def test_fatigue_decay_never_gets_gentler_as_courses_get_longer():
    """The equivalent Riegel exponent must be non-decreasing in course demand: a physical
    requirement, and what guarantees the scaling factor stays monotone."""
    exponents = [ENDURANCE_REFERENCE.riegel_exponent(d) for d in (1.0, 5.0, 20.0, 42.195, 100.0, 320.0, 800.0)]
    assert exponents == sorted(exponents)
    assert exponents[0] > 1.0


def test_reference_rate_falls_monotonically_with_course_demand():
    demands = [1.0, 5.0, 10.0, 27.56, 42.195, 100.0, 219.0, 319.614, 700.0]
    rates = [ENDURANCE_REFERENCE.rate(d) for d in demands]
    assert rates == sorted(rates, reverse=True)


@pytest.mark.parametrize("name", sorted(WORLD_BESTS))
def test_every_world_best_scores_near_the_top_of_the_scale(name):
    """The bug this model fixes: under V0.1/V0.3 world-best performances scored anywhere from
    702 to 1000 depending only on how long the race was. Every one of them must now land near
    the top, including the held-out records the curve was not built from."""
    demand_km, seconds = WORLD_BESTS[name]
    score = score_for_time(demand_km, seconds, curve=ENDURANCE_REFERENCED_CURVE)["otri_score"]
    assert 940 <= score <= 1000, f"{name} scored {score}"


def test_world_best_scores_no_longer_depend_on_race_length():
    """The spread across world bests must be far tighter than under the models it replaces."""
    def spread(curve):
        scores = [
            score_for_time(demand_km, seconds, curve=curve)["otri_score"]
            for demand_km, seconds in WORLD_BESTS.values()
        ]
        return max(scores) - min(scores)

    assert spread(OFFICIAL_CURVE) == 229
    assert spread(DURATION_SCALED_CURVE) == 123
    assert spread(ENDURANCE_REFERENCED_CURVE) <= 60


@pytest.mark.parametrize("fraction", [0.55, 0.7, 0.85, 0.95])
def test_equal_calibre_scores_the_same_at_every_course_size(fraction):
    """The core invariant: a runner at a fixed fraction of the human ceiling scores the same
    whether the course is 5 demand-km or 700. Nothing about race length may move the score."""
    scores = set()
    for demand_km in (5.0, 27.56, 42.195, 100.0, 218.671, 319.614, 700.0):
        seconds = demand_km / (ENDURANCE_REFERENCE.rate(demand_km) * fraction) * 3600.0
        scores.add(score_for_time(demand_km, seconds, curve=ENDURANCE_REFERENCED_CURVE)["otri_score"])
    assert max(scores) - min(scores) <= 1


def test_short_course_no_longer_saturates_for_a_merely_good_runner():
    """Under V0.1/V0.3 a 15:06 5 km clipped to 1000 while a 100-mile winner scored 783. A 15:06
    5 km is a good club run, not a world best, and must now score well short of the top."""
    fifteen_oh_six = 15 * 60 + 6
    assert score_for_time(5.0, fifteen_oh_six, curve=DURATION_SCALED_CURVE)["otri_score"] == 1000
    assert score_for_time(5.0, fifteen_oh_six, curve=ENDURANCE_REFERENCED_CURVE)["otri_score"] < 950


def test_real_ultra_winner_is_credited_far_more_than_by_the_models_it_replaces():
    kwargs = dict(equivalent_km=REFERENCE_100MI_DEMAND_KM, finish_time_seconds=REFERENCE_WIN_SECONDS)
    official = score_for_time(**kwargs, curve=OFFICIAL_CURVE)["otri_score"]
    scaled = score_for_time(**kwargs, curve=DURATION_SCALED_CURVE)["otri_score"]
    referenced = score_for_time(**kwargs, curve=ENDURANCE_REFERENCED_CURVE)["otri_score"]
    assert official == 702
    assert scaled == 783
    assert referenced > scaled + 80
    assert referenced < 1000


def test_raw_performance_rate_is_reported_unscaled():
    """Scaling is a scoring-lookup concern only; the reported rate stays a plain physical
    quantity, identical across every curve."""
    computed = score_for_time(REFERENCE_100MI_DEMAND_KM, REFERENCE_WIN_SECONDS, curve=ENDURANCE_REFERENCED_CURVE)
    assert computed["performance_rate"] == pytest.approx(
        performance_rate(REFERENCE_100MI_DEMAND_KM, REFERENCE_WIN_SECONDS)
    )


@pytest.mark.parametrize("demand_km", [3.0, 5.0, REFERENCE_DEMAND_KM, 50.0, 218.671, 319.614, 700.0])
def test_endurance_referenced_target_time_inverse(demand_km):
    for score in [100, 300, 544, 692, 900, 1000]:
        target = target_time_seconds(demand_km, score, curve=ENDURANCE_REFERENCED_CURVE)
        recovered = score_for_time(demand_km, target, curve=ENDURANCE_REFERENCED_CURVE)["otri_score"]
        assert recovered == pytest.approx(score, abs=1)


@pytest.mark.parametrize("demand_km", [5.0, REFERENCE_DEMAND_KM, 218.671, 700.0])
def test_endurance_referenced_curve_is_monotonic_in_finish_time(demand_km):
    times = [1800, 3600, 7200, 18000, 36000, 65789, 100000, 250000]
    scores = [score_for_time(demand_km, t, curve=ENDURANCE_REFERENCED_CURVE)["otri_raw"] for t in times]
    assert scores == sorted(scores, reverse=True)


def test_courses_outside_the_reference_range_are_flagged_not_silently_extrapolated():
    assert score_for_time(400.0, 40 * 3600, curve=ENDURANCE_REFERENCED_CURVE)["quality_flags"]
    assert score_for_time(2.0, 600, curve=ENDURANCE_REFERENCED_CURVE)["quality_flags"]
    assert score_for_time(100.0, 12 * 3600, curve=ENDURANCE_REFERENCED_CURVE)["quality_flags"] == ()


def test_scaling_flags_reach_the_scored_output():
    scores = score_race_course_standard(
        _race(distance_km=400.0, elevation_gain_m=0.0),
        [_finisher("1", 60 * 3600)],
        curve=ENDURANCE_REFERENCED_CURVE,
    )
    assert any("above_reference_range" in flag for flag in scores[0].score.quality_flags)


def test_duration_scaled_curve_still_reproduces_its_published_scores():
    """V0.3 is superseded but must stay byte-for-byte reproducible (spec section 21)."""
    assert score_for_time(REFERENCE_100MI_DEMAND_KM, REFERENCE_WIN_SECONDS, curve=DURATION_SCALED_CURVE)["otri_score"] == 783
    assert score_for_time(REFERENCE_DEMAND_KM, 2 * 3600 + 20 * 60 + 30, curve=DURATION_SCALED_CURVE)["otri_score"] == 692
