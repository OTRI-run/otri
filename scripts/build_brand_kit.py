"""Builds the logo files of the media page (public/brand/*.svg) from the site's own lockup.

On the site the wordmark is live text, so that it stays selectable and scales with the page. In a
file that is useless, because the reader may not have the face. Here the same letters are drawn as
outlines, so a file looks identical wherever it is opened and needs no font at all.

Two open-licence faces (SIL OFL 1.1), both kept in the repository:

    Archivo Black       src/fonts/archivo-black-latin.woff2    the wordmark, "otrı"
    JetBrains Mono Bold scripts/fonts/jetbrains-mono-bold.woff2 the full name and the badge

Archivo Black is the face the site loads for the wordmark, so the letters in these files and the
letters on the page are the same shapes.

The wordmark is the word and nothing else. Only two things are drawn: the summit that stands in
for the tittle of the i, and the arrow that follows the word. The i is written with a dotless ı
(U+0131) so the summit has the place to itself.

Usage:  python scripts/build_brand_kit.py
Needs fonttools and brotli (pip install fonttools brotli). The PNGs and the zip are made from
these SVGs by scripts/build_brand_png.mjs, which needs Chrome.
"""

from __future__ import annotations

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "brand"
WORD_FONT = ROOT / "src" / "fonts" / "archivo-black-latin.woff2"
MONO_FONT = ROOT / "scripts" / "fonts" / "jetbrains-mono-bold.woff2"

INK = "#17202c"
BLUE = "#3576f6"
WHITE = "#ffffff"

CAP = 100.0          # the wordmark is drawn on a 100 unit cap height
TRACK = -0.045       # the tracking used on the site, in em
NAME = "Open Trail Running Index"


class Face:
    """Draws a string as one SVG path, on a 100 unit cap height."""

    def __init__(self, path: Path):
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.hmtx = self.font["hmtx"]
        self.scale = CAP / self.font["OS/2"].sCapHeight
        # the stylesheet sizes the summit and the arrow in em, not in cap heights
        self.em_per_cap = self.font["head"].unitsPerEm / self.font["OS/2"].sCapHeight

    def draw(self, text: str, size: float, track_em: float = 0.0, x: float = 0.0, y: float = 0.0):
        """Returns (path data, advance width) with the baseline at `y` and the left edge at `x`."""
        k = self.scale * size / CAP
        track = track_em * size * self.em_per_cap
        cursor = x
        parts = []
        for ch in text:
            name = self.cmap[ord(ch)]
            pen = SVGPathPen(self.glyphs)
            # font space is y-up, SVG is y-down
            self.glyphs[name].draw(TransformPen(pen, Transform(k, 0, 0, -k, cursor, y)))
            data = pen.getCommands()
            if data:
                parts.append(data)
            cursor += self.hmtx[name][0] * k + track
        return " ".join(parts), cursor - track - x


def summit(cx: float, baseline: float, em: float, colour: str) -> str:
    """The tittle of the i: a summit, sized and placed as the stylesheet places it."""
    width = 0.32 * em
    height = 0.26 * em
    bottom = baseline - 0.63 * em
    return (
        f'<path d="M{cx:.2f} {bottom - height:.2f}'
        f'L{cx + width / 2:.2f} {bottom:.2f}'
        f'H{cx - width / 2:.2f}Z" fill="{colour}"/>'
    )


def arrow(x: float, baseline: float, em: float, colour: str) -> str:
    """The arrow after the word, drawn at the same weight as the site's."""
    s = 0.33 * em / 12.0            # the site draws it in a 12 unit box at 0.33em
    top = baseline - 0.92 * em
    w = 2.2 * s
    return (
        f'<g transform="translate({x:.2f} {top:.2f}) scale({s:.4f})" fill="none" stroke="{colour}" '
        f'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="M2.4 9.6 9.6 2.4"/><path d="M4 2.4h5.6V8"/></g>'
    ), 12 * s + w


def wordmark(word: Face, size: float, letters: str, accent: str, x: float = 0.0, baseline: float = 0.0):
    """The word, its summit and its arrow. Returns (svg, width)."""
    em = size * word.em_per_cap
    otr, otr_w = word.draw("otr", size, TRACK, x, baseline)
    i_x = x + otr_w + TRACK * em
    dotless, i_w = word.draw("ı", size, TRACK, i_x, baseline)
    arrow_svg, arrow_w = arrow(i_x + i_w + 0.06 * em, baseline, em, accent)
    svg = (
        f'<path d="{otr} {dotless}" fill="{letters}"/>'
        + summit(i_x + i_w / 2, baseline, em, accent)
        + arrow_svg
    )
    return svg, (i_x + i_w + 0.06 * em + arrow_w) - x


def document(width: float, height: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" '
        f'width="{width:.0f}" height="{height:.0f}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def build_compact(word: Face, name: str, letters: str, accent: str, ground: str | None) -> None:
    size = 100.0
    pad = 24.0
    baseline = pad + size
    svg, width = wordmark(word, size, letters, accent, pad, baseline)
    w, h = width + pad * 2, size * 1.34 + pad * 2
    body = (f'<rect width="{w:.0f}" height="{h:.0f}" fill="{ground}"/>' if ground else "") + svg
    (OUT / name).write_text(document(w, h, body, "OTRI"), encoding="utf-8")


def build_full(word: Face, mono: Face, name: str, letters: str, accent: str, rule: str, sub: str, ground: str | None) -> None:
    size = 100.0
    pad = 24.0
    baseline = pad + size
    mark, mark_w = wordmark(word, size, letters, accent, pad, baseline)

    gap = 28.0
    rule_x = pad + mark_w + gap
    name_size = 26.0
    name_path, name_w = mono.draw(NAME, name_size, 0.06, rule_x + gap, baseline - size * 0.30)
    w = rule_x + gap + name_w + pad
    h = size * 1.34 + pad * 2
    body = (
        (f'<rect width="{w:.0f}" height="{h:.0f}" fill="{ground}"/>' if ground else "")
        + mark
        + f'<rect x="{rule_x:.1f}" y="{pad + size * 0.22:.1f}" width="2" height="{size * 0.72:.1f}" fill="{rule}"/>'
        + f'<path d="{name_path}" fill="{sub}"/>'
    )
    (OUT / name).write_text(document(w, h, body, "OTRI — Open Trail Running Index"), encoding="utf-8")


def build_mark(name: str, letters: str, accent: str, ground: str | None) -> None:
    """The icon: the summit and the arrow, the two drawn parts of the lockup, in a square."""
    box = 128.0
    body = (f'<rect width="128" height="128" rx="26" fill="{ground}"/>' if ground else "")
    body += f'<path d="M64 34 96 90H32Z" fill="{accent}"/>'
    body += (
        f'<g transform="translate(78 24)" fill="none" stroke="{letters}" stroke-width="9" '
        f'stroke-linecap="round" stroke-linejoin="round"><path d="M2 26 26 2"/><path d="M7 2h19v19"/></g>'
    )
    (OUT / name).write_text(document(box, box, body, "OTRI"), encoding="utf-8")


def main() -> None:
    word = Face(WORD_FONT)
    mono = Face(MONO_FONT)
    OUT.mkdir(parents=True, exist_ok=True)

    build_full(word, mono, "otri-logo.svg", INK, BLUE, "#d3deeb", "#6b7d96", None)
    build_full(word, mono, "otri-logo-on-dark.svg", WHITE, BLUE, "#33415c", "#94a3b8", None)
    build_full(word, mono, "otri-logo-white.svg", WHITE, WHITE, "#ffffff59", "#ffffffb3", None)
    build_full(word, mono, "otri-logo-black.svg", INK, INK, "#17202c40", INK, None)

    build_compact(word, "otri-logo-compact.svg", INK, BLUE, None)
    build_compact(word, "otri-logo-compact-on-dark.svg", WHITE, BLUE, None)
    build_compact(word, "otri-logo-compact-white.svg", WHITE, WHITE, None)
    build_compact(word, "otri-logo-compact-black.svg", INK, INK, None)

    build_mark("otri-mark.svg", INK, BLUE, None)

    for path in sorted(OUT.glob("otri-logo*.svg")) + [OUT / "otri-mark.svg"]:
        print(f"{path.name:34} {path.stat().st_size:6} bytes")


if __name__ == "__main__":
    main()
