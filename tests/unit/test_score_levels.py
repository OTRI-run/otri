"""The calculator's scale (Beginner to World class) names ranges of the score and says what each
means on a flat road marathon. It copies two numbers from the model; they must stay the model's."""

import re
from pathlib import Path

from scoring import course_standard

LEVELS_JS = (Path(__file__).resolve().parents[2] / "src" / "lib" / "scoreLevels.js").read_text(encoding="utf-8")


def test_the_scale_uses_the_models_exponent_and_marathon_anchor():
    exponent = float(re.search(r"MODEL_EXPONENT = ([\d.]+)", LEVELS_JS).group(1))
    assert exponent == course_standard.POWER_EXPONENT
    hours, seconds = re.search(r"MARATHON_WORLD_BEST_SECONDS = (\d+) \* 3600 \+ (\d+)", LEVELS_JS).groups()
    marathon = next(seconds_ for label, km, seconds_ in course_standard.ENDURANCE_REFERENCE_OBSERVATIONS if km == 42.195)
    assert int(hours) * 3600 + int(seconds) == marathon


def test_the_marathon_times_said_in_words_are_what_the_model_gives():
    """The FAQ and the code comment name times for round scores: 700 is 3:22, 600 is 4:12, ..."""
    marathon = next(seconds_ for label, km, seconds_ in course_standard.ENDURANCE_REFERENCE_OBSERVATIONS if km == 42.195)
    said = {700: "3:22", 600: "4:12", 500: "5:28", 400: "7:33"}
    faq = (Path(__file__).resolve().parents[2] / "src" / "data" / "faq.js").read_text(encoding="utf-8")
    for score, words in said.items():
        share = (score / 1000) ** (1 / course_standard.POWER_EXPONENT)
        minutes = round(marathon / share / 60)
        assert f"{minutes // 60}:{minutes % 60:02d}" == words
        assert f"{score} is {words}" in faq and f"{score} is {words}" in LEVELS_JS


def test_the_levels_are_contiguous_round_bands_from_the_top_down():
    edges = [int(value) for value in re.findall(r"\bfrom: (\d+)", LEVELS_JS)]
    assert edges == [1000, 900, 800, 700, 600, 500, 400, 300, 0]
