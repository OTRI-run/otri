"""Runner index v1: one number per runner from their best recent race scores.

The rule, chosen after comparing how established ranking systems in other sports handle the
same problem (docs/methodology/runner-index/RUNNER-INDEX-v1.md):

- Only results from the last 24 months are eligible (the window).
- Each result carries a recency weight: 1.0 for the first 12 months after the race, then a
  straight line down to 0.0 at 24 months. A result therefore fades out instead of vanishing
  on an anniversary.
- The best 3 eligible results (by race score) count. The index is their weighted mean,
  normalised by the weights, so old results lose influence without dragging the level down.
- Fewer than 3 eligible results still yield an index, marked provisional.

Pure functions only: no database, no clock. ``as_of`` is always explicit so the number is
reproducible for any date.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

VERSION = "runner-index-v1"
WINDOW_MONTHS = 24
FULL_WEIGHT_MONTHS = 12
COUNTED_RESULTS = 3


@dataclass(frozen=True)
class IndexInput:
    """One scored result, as the index sees it."""

    result_id: str
    event_date: date
    score: int


@dataclass(frozen=True)
class IndexedResult:
    result_id: str
    event_date: date
    score: int
    weight: float
    counts: bool
    status: str  # "counting" | "eligible" | "expired"
    full_until: date
    expires_on: date


@dataclass(frozen=True)
class RunnerIndex:
    version: str
    as_of: date
    index: int | None
    provisional: bool
    counted: int
    window_months: int
    full_weight_months: int
    results: tuple[IndexedResult, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "as_of": self.as_of.isoformat(),
            "index": self.index,
            "provisional": self.provisional,
            "counted": self.counted,
            "window_months": self.window_months,
            "full_weight_months": self.full_weight_months,
        }


def add_months(day: date, months: int) -> date:
    """The same day-of-month `months` later, clamped to the month's length (31 Jan + 1 -> 28/29 Feb)."""
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day = [31, 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(day.day, last_day))


def recency_weight(event_date: date, as_of: date) -> float:
    """1.0 for the first FULL_WEIGHT_MONTHS, then linear to 0.0 at WINDOW_MONTHS; 0.0 beyond.

    Measured in days against the calendar boundaries, so the fade is exact on month ends.
    """
    if event_date > as_of:
        return 1.0  # a result dated in the future (timezone slack) counts fully
    full_until = add_months(event_date, FULL_WEIGHT_MONTHS)
    expires_on = add_months(event_date, WINDOW_MONTHS)
    if as_of < full_until:
        return 1.0
    if as_of >= expires_on:
        return 0.0
    fade_days = (expires_on - full_until).days
    remaining = (expires_on - as_of).days
    return max(0.0, min(1.0, remaining / fade_days)) if fade_days > 0 else 0.0


def compute_runner_index(results: list[IndexInput], as_of: date) -> RunnerIndex:
    annotated: list[IndexedResult] = []
    eligible: list[tuple[IndexInput, float]] = []
    for result in results:
        weight = recency_weight(result.event_date, as_of)
        if weight > 0.0:
            eligible.append((result, weight))
    # Best by score; ties go to the more recent result (it has the higher weight).
    eligible.sort(key=lambda pair: (-pair[0].score, pair[0].event_date), reverse=False)
    eligible.sort(key=lambda pair: (-pair[0].score, -pair[0].event_date.toordinal()))
    counted = eligible[:COUNTED_RESULTS]
    counted_ids = {pair[0].result_id for pair in counted}

    for result in results:
        weight = recency_weight(result.event_date, as_of)
        counts = result.result_id in counted_ids
        status = "counting" if counts else ("eligible" if weight > 0.0 else "expired")
        annotated.append(
            IndexedResult(
                result_id=result.result_id,
                event_date=result.event_date,
                score=result.score,
                weight=round(weight, 4),
                counts=counts,
                status=status,
                full_until=add_months(result.event_date, FULL_WEIGHT_MONTHS),
                expires_on=add_months(result.event_date, WINDOW_MONTHS),
            )
        )

    if counted:
        total_weight = sum(weight for _, weight in counted)
        index = round(sum(pair.score * weight for pair, weight in counted) / total_weight)
    else:
        index = None

    annotated.sort(key=lambda item: (item.event_date, item.result_id), reverse=True)
    return RunnerIndex(
        version=VERSION,
        as_of=as_of,
        index=index,
        provisional=len(counted) < COUNTED_RESULTS,
        counted=len(counted),
        window_months=WINDOW_MONTHS,
        full_weight_months=FULL_WEIGHT_MONTHS,
        results=tuple(annotated),
    )
