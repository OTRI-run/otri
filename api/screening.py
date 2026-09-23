"""What is looked at before a published race is trusted.

Publishing is the organizer's act and nobody approves it; but a race that is obviously not a race
(the example file, invented names, a field of world records, a date that has not happened) should
not sit on the public site while an admin is asleep. So every publish is screened. A clean race is
public at once and is marked verified on its own after a short window unless an admin objects; a
race with a strong sign of being fake or copied is held for an admin instead, with the reasons
written down for the organizer and the admin alike.

Everything here is a pure function of what the race is: no database, no clock of its own. The
handler in api/app.py gathers the inputs and acts on the answer. Each rule is small and named, so a
wrong hold can be traced to one line and a new sign of trouble is one more rule.
"""

from __future__ import annotations

import json
import re
import statistics
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from hashlib import sha256

# --------------------------------------------------------------------------- what a flag is

HOLD = "hold"
WARN = "warn"


@dataclass(frozen=True)
class Flag:
    code: str
    severity: str  # HOLD or WARN
    detail: str

    def to_dict(self) -> dict:
        return {"code": self.code, "severity": self.severity, "detail": self.detail}


@dataclass(frozen=True)
class Screening:
    flags: tuple[Flag, ...]
    fingerprint: str

    @property
    def hold(self) -> bool:
        """Held for an admin: any strong sign, or enough weak ones together."""
        strong = any(flag.severity == HOLD for flag in self.flags)
        weak = sum(1 for flag in self.flags if flag.severity == WARN)
        return strong or weak >= WARNS_THAT_HOLD

    def to_list(self) -> list[dict]:
        order = {HOLD: 0, WARN: 1}
        return [flag.to_dict() for flag in sorted(self.flags, key=lambda f: (order[f.severity], f.code))]


# --------------------------------------------------------------------------- the inputs

@dataclass(frozen=True)
class Finisher:
    family_name: str
    first_name: str
    finish_time_seconds: int
    score: float | None


@dataclass(frozen=True)
class Subject:
    """The race as the screening sees it. Built by the handler from the stored race and its rows."""

    event_name: str
    course_name: str
    event_date: date | None
    has_course_file: bool
    finishers: tuple[Finisher, ...]
    non_finishers: int
    course_geometry_hash: str | None
    organizer_created_at: datetime | None
    previous_review_status: str  # 'none', 'pending', 'verified', 'held', 'rejected'
    # Found by the handler in the database: another race carrying identical results, and whether
    # this exact course geometry is already published under a different organizer.
    duplicate_of_race: str | None = None
    course_published_by_other_organizer: bool = False


# --------------------------------------------------------------------------- the constants

# Weak signs that together are worth an admin's look.
WARNS_THAT_HOLD = 4
# A finisher at or above the human ceiling for the course's demand. The scorer refuses anything
# past 2000 as impossible; between 1000 and 2000 is "faster than anybody has ever run this much",
# which a real race does not produce and a copied or invented one does.
SCORE_AT_CEILING = 1000.0
# A whole field this strong is a field of the best runners alive, not a trail race.
MEDIAN_SCORE_TOO_STRONG = 900.0
BEST_SCORE_WORTH_A_LOOK = 960.0
# Below this many finishers the shape-of-the-field rules do not apply: two people can tie.
FIELD_FOR_SHAPE_RULES = 10
# Share of finishers with a made-up name before the file is treated as made up.
PLACEHOLDER_SHARE = 0.25
# Share of finishers whose time equals another finisher's, and the share of names that repeat.
IDENTICAL_TIME_SHARE = 0.30
REPEATED_NAME_SHARE = 0.40
NEW_ACCOUNT = timedelta(hours=24)
OLD_RACE = timedelta(days=365 * 10)

_PLACEHOLDER_WORDS = re.compile(
    r"\b(test|tester|testing|demo|fake|dummy|sample|example|placeholder|runner\d*|athlete\d*|user\d*|"
    r"person\d*|participant\d*|asdf\w*|qwer\w*|xxx+|aaa+|zzz+|lorem|ipsum|unknown|anonymous|nobody|"
    r"john doe|jane doe|max mustermann|erika mustermann|firstname|lastname|first name|last name|name)\b",
    re.I,
)
_ONLY_SYMBOLS = re.compile(r"^[\W\d_]+$")
_TEST_RACE = re.compile(r"\b(test|testing|demo|fake|dummy|sample|asdf|lorem|ipsum|placeholder)\b", re.I)


# --------------------------------------------------------------------------- helpers

def name_key(family_name: str, first_name: str) -> str:
    """Case- and accent-insensitive, whitespace-collapsed."""
    def fold(value: str) -> str:
        value = unicodedata.normalize("NFKD", value or "")
        value = "".join(ch for ch in value if not unicodedata.combining(ch))
        return " ".join(value.casefold().split())
    return f"{fold(family_name)}|{fold(first_name)}"


def results_fingerprint(finishers: list[tuple[str, str, int | None]]) -> str:
    """One hash for one set of results: who, and in what time, regardless of row order, spelling
    case or accents. Two races with the same fingerprint carry the same results."""
    items = sorted(f"{name_key(family, first)}|{seconds if seconds is not None else '-'}" for family, first, seconds in finishers)
    return sha256(json.dumps(items).encode("utf-8")).hexdigest()


def _placeholder(name: str) -> bool:
    text = " ".join((name or "").split())
    if not text or _ONLY_SYMBOLS.match(text):
        return True
    if len(text.replace(" ", "")) < 2:
        return True
    return bool(_PLACEHOLDER_WORDS.search(text))


# --------------------------------------------------------------------------- the rules

def screen(subject: Subject, *, known_fingerprints: dict[str, str], known_course_hashes: dict[str, str], today: date) -> Screening:
    """Every rule, in one pass. ``known_fingerprints`` and ``known_course_hashes`` map a hash to a
    label ("the example results file", "the sample course"): matching one means the organizer
    published OTRI's own demonstration files as a race."""
    flags: list[Flag] = []
    finishers = subject.finishers
    n = len(finishers)
    fingerprint = results_fingerprint([(f.family_name, f.first_name, f.finish_time_seconds) for f in finishers])

    # -- OTRI's own files, published as if they were a race
    if fingerprint in known_fingerprints:
        flags.append(Flag("example_results", HOLD, f"The results are {known_fingerprints[fingerprint]}, not a race's own results."))
    if subject.course_geometry_hash and subject.course_geometry_hash in known_course_hashes:
        flags.append(Flag("example_course", HOLD, f"The course is {known_course_hashes[subject.course_geometry_hash]}, not the race's own course."))

    # -- a race that says it is a test
    label = f"{subject.event_name} {subject.course_name}"
    if _TEST_RACE.search(label):
        flags.append(Flag("test_name", HOLD, f"The race is called “{label.strip()}”, which reads as a test, not a race."))

    # -- results copied from another race on OTRI
    if subject.duplicate_of_race:
        flags.append(Flag("duplicate_results", HOLD, "Exactly these results (the same names and times) are already published as another race on OTRI."))

    # -- a race that has not happened
    if subject.event_date and subject.event_date > today:
        flags.append(Flag("future_date", HOLD, f"The race date is {subject.event_date.isoformat()}, which is in the future, but the results are already here."))

    # -- a previous admin decision stands until an admin lifts it
    if subject.previous_review_status in ("held", "rejected"):
        flags.append(Flag("previous_review", HOLD, "An admin held or took down this race before. Publishing again puts it in front of an admin, not on the site."))

    # -- the names
    if n:
        placeholders = sum(1 for f in finishers if _placeholder(f"{f.first_name} {f.family_name}"))
        if placeholders / n >= PLACEHOLDER_SHARE:
            flags.append(Flag("placeholder_names", HOLD, f"{placeholders} of {n} finishers have names that look made up (test, runner 1, John Doe, empty)."))
        if n >= FIELD_FOR_SHAPE_RULES:
            keys = Counter(name_key(f.family_name, f.first_name) for f in finishers)
            repeated = sum(count for count in keys.values() if count > 1)
            if repeated / n >= REPEATED_NAME_SHARE:
                flags.append(Flag("repeated_names", HOLD, f"{repeated} of {n} finishers share a name with another finisher: the same people appear over and over."))

    # -- the times
    if n >= FIELD_FOR_SHAPE_RULES:
        times = sorted(f.finish_time_seconds for f in finishers)
        counts = Counter(times)
        identical = sum(count for count in counts.values() if count > 1)
        if identical / n >= IDENTICAL_TIME_SHARE:
            flags.append(Flag("identical_times", HOLD, f"{identical} of {n} finish times are exactly equal to another finisher's. Real fields do not tie this often."))
        gaps = [b - a for a, b in zip(times, times[1:])]
        if gaps and len(set(gaps)) == 1 and gaps[0] > 0:
            flags.append(Flag("uniform_times", HOLD, f"Every finisher is exactly {gaps[0]} seconds behind the one before: a generated list, not a race."))

    # -- the performances
    scores = [f.score for f in finishers if f.score is not None]
    if scores:
        best = max(scores)
        if best >= SCORE_AT_CEILING:
            flags.append(Flag("score_at_ceiling", HOLD, f"The best score is {best:.0f}: at or above the fastest a human has ever run this much course. A real result would be world news."))
        elif best >= BEST_SCORE_WORTH_A_LOOK:
            flags.append(Flag("score_near_ceiling", WARN, f"The best score is {best:.0f}, in world-class territory. Worth a look."))
        if n >= FIELD_FOR_SHAPE_RULES and statistics.median(scores) >= MEDIAN_SCORE_TOO_STRONG:
            flags.append(Flag("field_too_strong", HOLD, f"The median score is {statistics.median(scores):.0f}: half the field would be among the best runners alive."))

    # -- weak signs, for the admin's eye and to add up
    if subject.organizer_created_at is not None:
        age = datetime.now(subject.organizer_created_at.tzinfo) - subject.organizer_created_at
        if age < NEW_ACCOUNT:
            flags.append(Flag("new_account", WARN, "The organizer account is less than a day old."))
    if n < 3:
        flags.append(Flag("tiny_field", WARN, f"Only {n} finisher{'s' if n != 1 else ''}."))
    if not subject.has_course_file:
        flags.append(Flag("no_course_file", WARN, "No course file: scored from typed distance and climb only."))
    if subject.event_date and (today - subject.event_date) > OLD_RACE:
        flags.append(Flag("old_race", WARN, f"The race date is {subject.event_date.isoformat()}, more than ten years ago."))
    if subject.course_published_by_other_organizer:
        flags.append(Flag("course_of_another_organizer", WARN, "This exact course is already published by a different organizer."))
    if n > 3000:
        flags.append(Flag("very_large_field", WARN, f"{n} finishers, larger than almost any trail race."))

    return Screening(tuple(flags), fingerprint)
