"""Unit tests for the spec-compliant course-demand engine (docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md section 3).

Run with: pytest tests/unit
"""

import pytest

from scoring.course_demand import (
    MAX_GRADE,
    MIN_GRADE,
    UnsupportedGradientError,
    equivalent_flat_distance_from_totals,
    gradient_cost,
    gradient_ratio,
)


def test_gradient_cost_at_flat_matches_published_constant():
    assert gradient_cost(0.0) == pytest.approx(3.6)


def test_gradient_ratio_is_one_on_flat_ground():
    assert gradient_ratio(0.0) == pytest.approx(1.0)


def test_uphill_costs_more_than_flat():
    assert gradient_ratio(0.10) > 1.0
    assert gradient_ratio(0.20) > gradient_ratio(0.10)


def test_gentle_downhill_costs_less_than_flat():
    assert gradient_ratio(-0.10) < 1.0


def test_positive_and_negative_grades_are_not_collapsed_to_absolute_value():
    """Spec section 22: gradient asymmetry must be preserved."""
    assert gradient_ratio(0.10) != gradient_ratio(-0.10)


def test_gradient_cost_rejects_out_of_domain_grade():
    """Spec section 13: V0 must fail explicitly, not silently clamp or extrapolate."""
    with pytest.raises(UnsupportedGradientError):
        gradient_cost(MAX_GRADE + 0.01)
    with pytest.raises(UnsupportedGradientError):
        gradient_cost(MIN_GRADE - 0.01)


def test_gradient_cost_rejects_non_finite_grade():
    with pytest.raises(ValueError):
        gradient_cost(float("nan"))


def test_boundary_grades_are_accepted():
    # +/-0.45 exactly must NOT raise (only strictly outside the domain does).
    gradient_cost(MAX_GRADE)
    gradient_cost(MIN_GRADE)


def test_totals_fallback_matches_distance_when_no_elevation():
    assert equivalent_flat_distance_from_totals(10.0, 0.0) == pytest.approx(10.0)


def test_totals_fallback_exceeds_distance_with_gain():
    assert equivalent_flat_distance_from_totals(10.0, 500.0) > 10.0


def test_totals_fallback_rejects_non_positive_distance():
    with pytest.raises(ValueError):
        equivalent_flat_distance_from_totals(0.0, 100.0)
