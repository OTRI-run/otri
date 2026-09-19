"""Does a new event look like one already on the calendar?

An organizer who creates their event from scratch while it is already listed (unclaimed) would put
the same race on the calendar twice. Names rarely match exactly ("Doi Trail" against "Doi Suthep
Trail 2027"), and a listing's date can be a day off its source, so the match is deliberately loose:
it only ever produces a suggestion the organizer confirms, never a merge.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher

# How far apart two dates may be and still be the same edition (a listing taken from a third-party
# calendar, or a race weekend entered by its first or its main day).
DATE_WINDOW_DAYS = 3

_NOISE = {"the", "a", "an", "of", "by", "and", "de", "du", "la", "le", "el", "edition", "presented"}
# Words most trail races share; they do not tell two races apart.
_GENERIC = {"trail", "trails", "ultra", "ultramarathon", "marathon", "run", "running", "race", "mountain", "mountains", "challenge", "festival", "international"}


def _tokens(name: str) -> list[str]:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\b(?:19|20)\d{2}\b", " ", text)  # the year of the edition
    text = re.sub(r"\b\d+(?:st|nd|rd|th|e|eme)\b", " ", text)  # "5th", "10e"
    return [token for token in re.findall(r"[a-z0-9]+", text) if token not in _NOISE]


def name_key(name: str) -> str:
    """Two spellings of one name share a key ("Doi Trail 2027", "doi-trail"). With the same date it
    is safe enough to merge on without asking, which the bulk import of listings does."""
    return " ".join(_tokens(name)) or name.strip().lower()


def names_match(a: str, b: str) -> bool:
    tokens_a, tokens_b = _tokens(a), _tokens(b)
    if not tokens_a or not tokens_b:
        return False
    if tokens_a == tokens_b:
        return True
    distinct_a, distinct_b = set(tokens_a) - _GENERIC, set(tokens_b) - _GENERIC
    if distinct_a and distinct_b and (distinct_a <= distinct_b or distinct_b <= distinct_a):
        return True
    return SequenceMatcher(None, " ".join(tokens_a), " ".join(tokens_b)).ratio() >= 0.85


def same_edition(name_a: str, date_a: date, name_b: str, date_b: date) -> bool:
    return abs((date_a - date_b).days) <= DATE_WINDOW_DAYS and names_match(name_a, name_b)
