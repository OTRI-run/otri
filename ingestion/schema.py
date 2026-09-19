"""Declarative field specifications for OTRI race and result files.

Each ``FieldSpec`` documents the canonical field name, the organizer header
aliases it recognizes, whether it is required, and how a single cell value
is validated. This module is the Python-side mirror of the published
contracts in ``data/schemas/*.json`` — keep both in sync when a field changes.

The result layout is the one timing companies and organizers already export:
one file per race distance, one row per participant, with rank, time, names,
gender and optionally birthdate, nationality, bib, city, team and a status
column. Header names vary a lot between exports, so every field carries the
variants seen in practice; matching is case- and punctuation-insensitive.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Callable

Severity = str  # "error" | "warning"
FieldIssue = tuple[Severity, str]
FieldValidator = Callable[[str], list[FieldIssue]]


_THAI = (chr(0x0E00), chr(0x0E7F))  # Thai vowel and tone marks are part of the word, not accents to drop


def _normalize_header(name: str) -> str:
    """A header as a key: lower case, accents dropped ("Prénom" = "prenom"), punctuation and
    underscores as spaces. Letters of every script are kept, so Thai headers match too."""
    text = unicodedata.normalize("NFKD", name.strip().lower())
    kept = []
    for ch in text:
        if _THAI[0] <= ch <= _THAI[1] or ch.isalnum():
            kept.append(ch)
        elif not unicodedata.combining(ch):
            kept.append(" ")
    return " ".join("".join(kept).split())


def clean_cell(value: str) -> str:
    """A cell's text with whitespace and placeholder dashes ("-", "–", "—") removed."""
    return value.strip().strip("-–—").strip()


@dataclass(frozen=True)
class FieldSpec:
    canonical: str
    aliases: tuple[str, ...]
    required: bool
    validate: FieldValidator

    @property
    def normalized_aliases(self) -> tuple[str, ...]:
        return tuple(_normalize_header(alias) for alias in self.aliases)


def _required_nonempty(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    return []


def _optional(_value: str) -> list[FieldIssue]:
    return []


def _iso_date_required(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        date.fromisoformat(value.strip())
    except ValueError:
        return [("error", "must be an ISO 8601 date (YYYY-MM-DD)")]
    return []


def _iso_date_optional(value: str) -> list[FieldIssue]:
    if not clean_cell(value):
        return []
    try:
        date.fromisoformat(value.strip())
    except ValueError:
        return [("warning", "must be an ISO 8601 date (YYYY-MM-DD)")]
    return []


def _birth_year(value: str) -> list[FieldIssue]:
    if not clean_cell(value):
        return []
    raw = value.strip()
    if not re.fullmatch(r"(19|20)\d\d", raw):
        return [("warning", "expected a four-digit year of birth")]
    return []


def _positive_float(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        parsed = float(value)
    except ValueError:
        return [("error", "must be a number")]
    if parsed <= 0:
        return [("error", "must be greater than 0")]
    return []


def _nonnegative_float(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    try:
        parsed = float(value)
    except ValueError:
        return [("error", "must be a number")]
    if parsed < 0:
        return [("error", "must be 0 or greater")]
    return []


# ---------------------------------------------------------------------------- rank & status

NON_FINISHER_CODES = {"DNF", "DNS", "DSQ"}

_NON_FINISHER_ALIASES = {
    "DNF": {"dnf", "did not finish", "not finished", "abandon", "abandoned", "ab", "abd", "ret", "retired", "withdrawn", "withdrew", "dropped", "drop", "unfinished"},
    "DNS": {"dns", "did not start", "not started", "absent", "no show", "ns"},
    "DSQ": {"dsq", "dq", "disqualified", "disq"},
}
_FINISHER_STATUS = {"finisher", "finished", "finish", "fin", "ok", "f", "classified", "official", "complete", "completed", "arrived", "ranked", "result"}
_ORDINAL = re.compile(r"(?<=\d)(st|nd|rd|th|\.)$", re.IGNORECASE)


def non_finisher_code(value: str) -> str | None:
    """'DNF', 'DNS' or 'DSQ' for any of the usual spellings of not finishing; None otherwise."""
    key = re.sub(r"[^a-z]+", " ", value.strip().lower()).strip()
    if not key:
        return None
    for code, aliases in _NON_FINISHER_ALIASES.items():
        if key in aliases:
            return code
    return None


def rank_position(value: str) -> int | None:
    """The finishing position in a rank cell ('12', '12.', '12th'), or None."""
    raw = _ORDINAL.sub("", clean_cell(value))
    if not raw.isdigit():
        return None
    parsed = int(raw)
    return parsed if parsed > 0 else None


def resolve_rank(rank_raw: str, status_raw: str = "") -> int | str | None:
    """A finishing position, a non-finisher code, or None when the row says neither.

    The rank cell wins when it carries a code or a position; otherwise a Status column
    ("DNF", "Did not finish", "Abandon", …) explains an empty rank.
    """
    code = non_finisher_code(rank_raw)
    if code:
        return code
    position = rank_position(rank_raw)
    if position is not None:
        return position
    return non_finisher_code(status_raw)


def _rank(value: str) -> list[FieldIssue]:
    raw = clean_cell(value)
    if not raw:
        return []  # requiredness is decided with the Status column in cross-field validation
    if non_finisher_code(raw) or rank_position(raw) is not None:
        return []
    return [("error", "must be a finishing position (a whole number) or DNF, DNS or DSQ")]


def _status(value: str) -> list[FieldIssue]:
    raw = clean_cell(value)
    if not raw:
        return []
    key = re.sub(r"[^a-z]+", " ", raw.lower()).strip()
    if non_finisher_code(raw) or key in _FINISHER_STATUS:
        return []
    return [("warning", "unrecognised status (expected Finisher, DNF, DNS or DSQ); the rank column decides")]


# ---------------------------------------------------------------------------- times

_TIME_PATTERN = re.compile(r"^\d{1,3}:[0-5]\d:[0-5]\d(?:[.,]\d{1,3})?$")
_SHORT_TIME_PATTERN = re.compile(r"^\d{1,3}:[0-5]\d$")


def _finish_time(value: str) -> list[FieldIssue]:
    raw = clean_cell(value)
    if not raw:
        return []  # requiredness for finishers is enforced in cross-field validation
    if _TIME_PATTERN.match(raw):
        return []
    if _SHORT_TIME_PATTERN.match(raw):
        return [("warning", "time has no hours part and is read as MM:SS")]
    return [("error", "must be a finish time in HH:MM:SS format")]


# ---------------------------------------------------------------------------- gender

_GENDER_ALIASES = {
    "M": {"m", "male", "man", "men", "h", "homme", "hommes", "masculin", "masculino", "hombre", "herren", "männlich", "mannlich", "boy", "mr", "ชาย"},
    "F": {"f", "female", "woman", "women", "w", "femme", "femmes", "feminin", "féminin", "femenino", "mujer", "damen", "weiblich", "girl", "ms", "mrs", "หญิง"},
    "X": {"x", "nb", "non binary", "nonbinary", "other", "diverse", "d", "u", "unknown"},
}


def normalize_gender(value: str) -> str | None:
    key = value.strip().lower()
    key = re.sub(r"[^a-z฀-๿é]+", " ", key).strip()
    if not key:
        return None
    for code, aliases in _GENDER_ALIASES.items():
        if key in aliases:
            return code
    return None


def _gender(value: str) -> list[FieldIssue]:
    if not value.strip():
        return [("error", "value is required")]
    if normalize_gender(value) is None:
        return [("warning", "expected one of M, F, X (or Male / Female)")]
    return []


# ---------------------------------------------------------------------------- misc

_NATIONALITY_PATTERN = re.compile(r"^[A-Za-z]{3}$")


def _nationality(value: str) -> list[FieldIssue]:
    if not clean_cell(value):
        return []
    if not _NATIONALITY_PATTERN.match(value.strip()):
        return [("warning", "expected a 3-letter country code (ISO 3166-1 alpha-3)")]
    return []


RACE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("race_id", ("race id",), True, _required_nonempty),
    FieldSpec("race_name", ("race name", "name"), True, _required_nonempty),
    FieldSpec("event_date", ("event date", "date"), True, _iso_date_required),
    FieldSpec("course_name", ("course name", "course"), True, _required_nonempty),
    FieldSpec("distance_km", ("distance km", "distance"), True, _positive_float),
    FieldSpec("elevation_gain_m", ("elevation gain m", "elevation gain"), True, _nonnegative_float),
    FieldSpec("location", ("location", "place", "city"), False, _optional),
    FieldSpec("country", ("country", "country code", "nation"), False, _nationality),
)

# Aliases are matched after lower-casing, dropping accents and collapsing punctuation, so
# "Last Name", "LASTNAME", "last_name" and "Prénom" / "prenom" need one entry each. A unit or hint in
# brackets is ignored ("Time (hh:mm:ss)"). Where two aliases could appear in the same file, the
# first listed wins: "Time" before "Chip time" before "Gun time". They cover the exports seen in
# practice: the ITRA and UTMB results sheets, RaceResult / my.raceresult, LiveTrail, ChronoTrack,
# Sportstiming, and spreadsheets in English, French, German, Spanish, Italian, Portuguese, Dutch
# and Thai.
#
# Only the finish time and a name are required as columns. Positions are worked out from the times
# when there is no rank column, and gender may come from a category column, or be missing (those
# runners are scored and left out of the gender rankings): see `ingestion/normalize.py`.
RESULT_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec(
        "rank",
        (
            "ranking", "rank", "position", "place", "overall", "overall rank", "overall position", "overall place", "overall ranking", "pos", "pos overall", "place overall",
            "general ranking", "scratch", "scratch rank", "classement", "classement general", "classement scratch", "clt", "clt scratch", "clas", "rang", "general", "gen",
            "platz", "rang gesamt", "gesamtrang", "gesamtplatz", "platz gesamt", "plaats", "posicion", "puesto", "clasificacion", "posizione", "classifica", "pos ass",
            "posicao", "classificacao", "อันดับ", "ลำดับ", "อันดับรวม", "ลำดับที่",
        ),
        False,
        _rank,
    ),
    FieldSpec(
        "finish_time",
        (
            "time", "finish time", "finish", "final time", "race time", "official time", "chip time", "net time", "nett time", "gun time", "total time", "elapsed", "elapsed time",
            "result", "performance", "duration", "finishing time", "temps", "temps officiel", "temps final", "chrono", "zeit", "endzeit", "zielzeit", "laufzeit", "nettozeit", "bruttozeit",
            "tiempo", "tiempo oficial", "tempo", "tempo finale", "tempo ufficiale", "tijd", "eindtijd", "netto tijd", "เวลา", "เวลารวม", "เวลาที่ทำได้",
        ),
        True,
        _finish_time,
    ),
    FieldSpec(
        "family_name",
        ("family name", "last name", "lastname", "surname", "last", "family", "familyname", "name last", "nom", "nom de famille", "apellido", "apellidos", "nachname", "familienname", "cognome", "achternaam", "sobrenome", "apelido", "นามสกุล", "สกุล"),
        False,
        _optional,
    ),
    FieldSpec(
        "first_name",
        ("first name", "firstname", "given name", "givenname", "forename", "first", "name first", "prenom", "nombre", "vorname", "nome", "voornaam", "primeiro nome", "ชื่อ"),
        False,
        _optional,
    ),
    FieldSpec("gender", ("gender", "sex", "sexe", "genre", "sexo", "genero", "geschlecht", "sesso", "geslacht", "m f", "f m", "g", "เพศ"), False, _gender),
    FieldSpec("status", ("status", "result status", "finish status", "race status", "state", "statut", "etat", "estado", "stato", "สถานะ"), False, _status),
    FieldSpec("birthdate", ("birthdate", "date of birth", "dob", "birth date", "birthday", "born", "date de naissance", "naissance", "geburtsdatum", "fecha de nacimiento", "data di nascita", "geboortedatum", "วันเกิด"), False, _optional),
    FieldSpec("birth_year", ("yob", "year of birth", "birth year", "born year", "year", "jahrgang", "jg", "annee de naissance", "annee", "ano de nacimiento", "anno di nascita", "anno", "geboortejaar", "ปีเกิด"), False, _birth_year),
    FieldSpec(
        "nationality",
        ("nationality", "country", "nat", "nation", "country code", "ioc", "noc", "ctry", "cio", "nationalite", "pays", "land", "nationalitat", "staatsangehorigkeit", "nacionalidad", "pais", "nazionalita", "nazione", "nationaliteit", "สัญชาติ", "ประเทศ"),
        False,
        _nationality,
    ),
    FieldSpec(
        "bib_number",
        ("bib number", "bib", "bib no", "bib nr", "bib #", "bibnumber", "race number", "race no", "start number", "startnummer", "startnr", "stnr", "start nr", "number", "no", "num", "dossard", "dos", "pettorale", "pett", "dorsal", "rugnummer", "หมายเลข", "เลขบิบ", "หมายเลขวิ่ง", "บิบ"),
        False,
        _optional,
    ),
    FieldSpec("city", ("city", "town", "hometown", "residence", "ville", "ort", "wohnort", "ciudad", "localidad", "citta", "woonplaats", "จังหวัด"), False, _optional),
    FieldSpec("team", ("team", "club", "team name", "club name", "team club", "equipe", "verein", "equipo", "squadra", "societa", "vereniging", "sponsor", "ทีม", "ชมรม", "สังกัด"), False, _optional),
    # Used only to catch files that mix several distances; never stored.
    FieldSpec("race", ("race", "distance", "course", "event", "competition", "contest", "epreuve", "strecke", "wettbewerb", "bewerb", "carrera", "prueba", "gara", "ระยะ", "ประเภท"), False, _optional),
)

# Columns that are not a result field themselves but from which one is read: a single name column is
# split into family and first name, and a category or age group may carry the gender.
EXTRA_RESULT_ALIASES: dict[str, tuple[str, ...]] = {
    "full_name": (
        "name", "full name", "fullname", "runner", "runner name", "athlete", "athlete name", "participant", "participant name", "competitor", "racer", "finisher",
        "nom prenom", "nom et prenom", "prenom nom", "nom prenom du coureur", "coureur", "concurrent", "laufer", "teilnehmer", "sportler", "nombre y apellidos", "nombre completo",
        "corredor", "atleta", "nome e cognome", "cognome e nome", "concorrente", "nome completo", "naam", "deelnemer", "ชื่อ นามสกุล", "ชื่อ สกุล", "ชื่อนามสกุล", "ชื่อผู้เข้าแข่งขัน", "นักวิ่ง",
    ),
    "category": (
        "category", "cat", "categorie", "age group", "agegroup", "age category", "ag", "age grp", "division", "div", "class", "klasse", "ak", "altersklasse", "categoria",
        "kategorie", "leeftijdscategorie", "gender category", "รุ่น", "รุ่นอายุ", "กลุ่มอายุ",
    ),
}
