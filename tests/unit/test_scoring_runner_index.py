"""Runner index v1: window, fade, best-3 selection, provisional flag (docs/methodology/runner-index/RUNNER-INDEX-v1.md)."""

from datetime import date

import pytest

from scoring.runner_index import COUNTED_RESULTS, IndexInput, add_months, compute_runner_index, recency_weight

AS_OF = date(2026, 9, 18)


def test_add_months_clamps_to_month_end():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2026, 9, 18), 24) == date(2028, 9, 18)


def test_recency_weight_is_full_for_a_year_then_fades_linearly_to_zero_at_two_years():
    assert recency_weight(AS_OF, AS_OF) == 1.0
    assert recency_weight(add_months(AS_OF, -12), AS_OF) == pytest.approx(1.0)  # last full-weight day
    assert recency_weight(add_months(AS_OF, -18), AS_OF) == pytest.approx(0.5, abs=0.01)
    assert recency_weight(add_months(AS_OF, -24), AS_OF) == 0.0
    assert recency_weight(add_months(AS_OF, -30), AS_OF) == 0.0
    assert recency_weight(date(2026, 12, 1), AS_OF) == 1.0  # a future-dated result counts fully


def _result(result_id, months_ago, score):
    return IndexInput(result_id=result_id, event_date=add_months(AS_OF, -months_ago), score=score)


def test_best_three_in_window_weighted_mean():
    results = [
        _result("a", 2, 600),
        _result("b", 6, 650),
        _result("c", 15, 700),  # weight 0.75
        _result("d", 20, 800),  # weight ~0.33: still one of the best three by score
        _result("e", 3, 500),   # eligible but not counted
        _result("f", 27, 900),  # expired
    ]
    index = compute_runner_index(results, AS_OF)
    counted = {r.result_id: r for r in index.results if r.counts}
    assert set(counted) == {"b", "c", "d"}, "best three by score among eligible results"
    weights = {r.result_id: r.weight for r in index.results}
    expected = (650 * weights["b"] + 700 * weights["c"] + 800 * weights["d"]) / (weights["b"] + weights["c"] + weights["d"])
    assert index.index == round(expected)
    assert index.provisional is False and index.counted == COUNTED_RESULTS
    statuses = {r.result_id: r.status for r in index.results}
    assert statuses == {"a": "eligible", "b": "counting", "c": "counting", "d": "counting", "e": "eligible", "f": "expired"}
    assert [r.result_id for r in index.results] == ["a", "e", "b", "c", "d", "f"], "profile order: newest first"


def test_fewer_than_three_results_is_provisional_and_old_results_do_not_drag_the_level_down():
    index = compute_runner_index([_result("a", 20, 700)], AS_OF)
    assert index.index == 700, "one old result: its own score, not scaled down by its weight"
    assert index.provisional is True and index.counted == 1
    assert compute_runner_index([], AS_OF).index is None
    assert compute_runner_index([_result("x", 30, 999)], AS_OF).index is None, "only expired results: no index"


def test_the_index_is_reproducible_for_any_as_of_date():
    results = [_result("a", 2, 600), _result("b", 6, 650), _result("c", 15, 700)]
    now = compute_runner_index(results, AS_OF)
    assert now.index == 645 and now.counted == 3  # (600 + 650 + 700 x 0.748) / 2.748
    later = compute_runner_index(results, add_months(AS_OF, 12))
    assert later.counted == 2 and later.provisional, "the 15-month-old result has expired a year later"
    assert later.index == 619  # (600 x 0.831 + 650 x 0.497) / 1.328
    assert compute_runner_index(results, AS_OF).to_dict() == now.to_dict()
