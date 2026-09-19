"""Builds the logo files of the media page (public/brand/*.svg) from the site's own lockup.

On the site the wordmark is live text in the visitor's system font (src/components/Logo.jsx and
src/styles.css), which is fine on a page and useless as a file: it looks different on every
machine. Here the letters are drawn as outlines, from two open-licence fonts (SIL OFL), so a file
looks the same wherever it is opened and needs no font:

    Inter Bold            https://github.com/rsms/inter            (the wordmark, "TRI")
    JetBrains Mono Bold   https://github.com/JetBrains/JetBrainsMono   (the full name, the badge)

Usage:  python scripts/build_brand_kit.py <Inter-Bold.ttf> <JetBrainsMono-Bold.ttf>
Needs fonttools (pip install fonttools). The PNGs and the zip are made from these SVGs by
scripts/build_brand_png.mjs, which needs Chrome.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parents[1] / "public" / "brand"

INK = "#0b1220"
BLUE = "#2563eb"
WHITE = "#ffffff"
GRADIENT_MARK = ("#60a5fa", "#2563eb", "#1d4ed8")  # as in Logo.jsx
GRADIENT_NAME = ("#2563eb", "#06b6d4")  # as in styles.css

# The mark, in the 40-unit box of Logo.jsx.
RING = '<circle cx="20" cy="20" r="17" fill="none" stroke="{a}" stroke-width="5"/>'
RIDGE = '<path d="M7 26.5 15.5 20l4 2.7L26 16l7 6" fill="none" stroke="{a}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
TRAIL = '<path d="M9 30c5-6 10-7 17-10" fill="none" stroke="{b}" stroke-width="3.4" stroke-linecap="round"/>'


class Face:
    def __init__(self, path: str):
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font["head"].unitsPerEm
        self.cap = getattr(self.font["OS/2"], "sCapHeight", 0) or int(self.upm * 0.72)

    def outline(self, text: str, size: float, x: float, baseline: float, tracking_em: float = 0.0) -> tuple[str, float]:
        """(path data, x where the text ends) for `text` set at `size` px from `x` on `baseline`."""
        scale = size / self.upm
        pen = SVGPathPen(self.glyphs, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
        cursor = x
        for character in text:
            name = self.cmap[ord(character)]
            self.glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
            cursor += self.glyphs[name].width * scale + tracking_em * size
        return pen.getCommands(), cursor

    def cap_height(self, size: float) -> float:
        return self.cap * size / self.upm


def mark(colours: dict, scale: float = 1.0, x: float = 0.0, y: float = 0.0) -> str:
    body = RING.format(a=colours["a"]) + RIDGE.format(a=colours["a"]) + TRAIL.format(b=colours["b"])
    return f'<g transform="translate({x:g} {y:g}) scale({scale:g})">{body}</g>'


def gradients(prefix: str, *, name_top: float = 0, name_bottom: float = 0) -> str:
    a, b, c = GRADIENT_MARK
    out = (
        f'<linearGradient id="{prefix}m" x1="5" y1="4" x2="35" y2="37" gradientUnits="userSpaceOnUse">'
        f'<stop stop-color="{a}"/><stop offset=".48" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></linearGradient>'
    )
    if name_bottom:
        top, bottom = GRADIENT_NAME
        out += (
            f'<linearGradient id="{prefix}n" x1="0" y1="{name_top:g}" x2="0" y2="{name_bottom:g}" gradientUnits="userSpaceOnUse">'
            f'<stop stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>'
        )
    return f"<defs>{out}</defs>"


def svg(width: float, height: float, title: str, body: str, pad: float = 0.0) -> str:
    box = f"{-pad:g} {-pad:g} {width + 2 * pad:g} {height + 2 * pad:g}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" width="{(width + 2 * pad) * 8:g}" height="{(height + 2 * pad) * 8:g}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


PALETTES = {
    # a: ring and ridge, b: the trail under the ridge, word: "TRI", name: the full name, rule: the line before it
    "": {"a": "url(#{p}m)", "b": BLUE, "word": INK, "name": "url(#{p}n)", "rule": BLUE},
    "-white": {"a": WHITE, "b": WHITE, "word": WHITE, "name": WHITE, "rule": WHITE},
    "-black": {"a": INK, "b": INK, "word": INK, "name": INK, "rule": INK},
    # For dark pages that still want the colour: the site's own dark variant.
    "-on-dark": {"a": "url(#{p}m)", "b": WHITE, "word": WHITE, "name": "url(#{p}n)", "rule": BLUE},
}


def build(inter_path: str, mono_path: str) -> list[Path]:
    inter, mono = Face(inter_path), Face(mono_path)
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    def write(name: str, text: str) -> None:
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        written.append(OUT / name)

    for suffix, palette in PALETTES.items():
        prefix = "o" + (suffix.replace("-", "") or "c")
        colours = {key: value.format(p=prefix) for key, value in palette.items()}

        # --- the mark alone
        write(f"otri-mark{suffix}.svg", svg(40, 40, "OTRI", gradients(prefix) + mark(colours), pad=4))

        # --- the lockup, measured as on the site: a 36 px mark and "TRI" at 26 px. The site tracks it
        # at -0.09em in a system font; Inter is wider, and at that its R and I run into each other.
        height, size, tracking = 36.0, 26.0, -0.035
        baseline = height / 2 + inter.cap_height(size) / 2
        word, end = inter.outline("TRI", size, 36 + 5, baseline, tracking)
        end -= tracking * size  # the last letter's tracking is not part of the word
        compact = gradients(prefix) + mark(colours, 0.9) + f'<path d="{word}" fill="{colours["word"]}"/>'
        write(f"otri-logo-compact{suffix}.svg", svg(end, height, "OTRI", compact, pad=4))

        # --- with the full name: a 2 px rule, then two lines at 8 px, 1.45 line height, 0.12em tracking
        name_size, line = 8.0, 8.0 * 1.45
        top = (height - 2 * line) / 2
        rule_x = end + 12
        text_x = rule_x + 2 + 12
        lines, right = [], text_x
        for index, words in enumerate(("OPEN TRAIL", "RUNNING INDEX")):
            base = top + index * line + line / 2 + mono.cap_height(name_size) / 2
            data, line_end = mono.outline(words, name_size, text_x, base, 0.12)
            lines.append(data)
            right = max(right, line_end - 0.12 * name_size)
        full = (
            gradients(prefix, name_top=top, name_bottom=top + 2 * line)
            + mark(colours, 0.9)
            + f'<path d="{word}" fill="{colours["word"]}"/>'
            + f'<rect x="{rule_x:g}" y="{top:g}" width="2" height="{2 * line:g}" fill="{colours["rule"]}"/>'
            + f'<path d="{" ".join(lines)}" fill="{colours["name"]}"/>'
        )
        write(f"otri-logo{suffix}.svg", svg(right, height, "OTRI, Open Trail Running Index", full, pad=4))

    # --- "Scored with OTRI": for a race's own site, next to results that were scored here. It says
    # what was done, not that anybody approved anything: OTRI approves no races.
    for suffix, (fill, border, text_colour, palette) in {
        "": (WHITE, "#cbd5e1", INK, PALETTES[""]),
        "-dark": (INK, INK, WHITE, PALETTES["-on-dark"]),
    }.items():
        prefix = "b" + (suffix.replace("-", "") or "l")
        colours = {key: value.format(p=prefix) for key, value in palette.items()}
        height, size = 32.0, 9.0
        base = height / 2 + mono.cap_height(size) / 2
        label, end = mono.outline("SCORED WITH", size, 12, base, 0.1)
        mark_x = end + 5
        word, word_end = inter.outline("TRI", 15, mark_x + 20 + 2.5, height / 2 + inter.cap_height(15) / 2, -0.035)
        width = word_end + 0.035 * 15 + 12
        body = (
            gradients(prefix)
            + f'<rect x=".5" y=".5" width="{width - 1:g}" height="{height - 1:g}" rx="{(height - 1) / 2:g}" fill="{fill}" stroke="{border}"/>'
            + f'<path d="{label}" fill="{text_colour}" opacity=".72"/>'
            + mark(colours, 0.5, mark_x, 6)
            + f'<path d="{word}" fill="{text_colour}"/>'
        )
        write(f"otri-badge-scored{suffix}.svg", svg(width, height, "Scored with OTRI", body))
    return written


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    for path in build(sys.argv[1], sys.argv[2]):
        print(path.relative_to(OUT.parents[1]))
