"""Writes OTRI's logo files from src/brand/identity.json: the mark, the compact logo, the full
logo, the "Scored with OTRI" badge, the favicon, the share card and the copies in media/brand.

The mark is a closed ring — the letter O — with a ridge inside it and a volt dot on the summit.
It is a symbol, never a letter: the wordmark always spells OTRI in full, drawn once as outlines
from Space Grotesk Bold (SIL OFL) so a file looks the same wherever it is opened and needs no
font. Render the PNGs and the ZIP with scripts/build_brand_png.mjs.

Usage:  python scripts/build_brand_kit.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "brand"
IDENTITY = json.loads((ROOT / "src" / "brand" / "identity.json").read_text(encoding="utf-8"))
C = IDENTITY["colours"]
INK, VOLT, CHALK, NIGHT = C["ink"], C["volt"], C["chalk"], C["night"]
GRAPHITE, BG, MUTED, CHALK_MUTED, CYAN = C["graphite"], C["bg"], C["muted"], C["chalkMuted"], C["cyan"]
WHITE = "#ffffff"
BLACK = "#000000"
TITLE = "OTRI — Open Trail Running Index"
MARK, WORD = IDENTITY["mark"], IDENTITY["wordmark"]


def svg(width: float, height: float, body: str, title: str = TITLE) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" width="{width:g}" height="{height:g}" '
        f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


def mark(stroke: str = INK, summit: str = VOLT, x: float = 0, y: float = 0, scale: float = 1) -> str:
    ring = MARK["ring"]
    s = MARK["summit"]
    return (
        f'<g transform="translate({x:g} {y:g}) scale({scale:g})" fill="none">'
        f'<circle cx="{ring["cx"]}" cy="{ring["cy"]}" r="{ring["r"]}" stroke="{stroke}" stroke-width="{ring["width"]}"/>'
        f'<path d="{MARK["ridge"]}" stroke="{stroke}" stroke-width="{MARK["ridgeWidth"]}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<circle cx="{s["cx"]}" cy="{s["cy"]}" r="{s["r"]}" fill="{summit}"/></g>'
    )


def wordmark(colour: str, x: float, scale: float = 1) -> str:
    return f'<g transform="translate({x:g} 0) scale({scale:g})" fill="{colour}"><path d="{WORD["path"]}"/></g>'


def full_name(colour: str, rule: str, x: float) -> str:
    """The two mono lines beside the name, as live text with a generous fallback stack: the kit's
    PNGs are rendered with the real face, and an SVG opened elsewhere still reads correctly."""
    style = 'font-family="IBM Plex Mono, ui-monospace, Consolas, monospace" font-size="9.5" font-weight="600" letter-spacing="1.6"'
    return (
        f'<rect x="{x - 14:g}" y="9" width="1.6" height="30" fill="{rule}"/>'
        f'<text x="{x:g}" y="21" {style} fill="{colour}">OPEN TRAIL</text>'
        f'<text x="{x:g}" y="34" {style} fill="{colour}">RUNNING INDEX</text>'
    )


def lockup(stroke: str, summit: str, letters: str, name: str | None, rule: str) -> tuple[str, float]:
    gap, word_width = 10, WORD["box"][0]
    body = mark(stroke, summit) + wordmark(letters, MARK["box"] + gap)
    width = MARK["box"] + gap + word_width
    if name:
        name_x = width + 30
        body += full_name(name, rule, name_x)
        width = name_x + 92
    return body, round(width + 2, 1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    variants = {
        # suffix: ring and ridge, summit dot, letters, the full name, the rule
        "": (INK, VOLT, INK, MUTED, VOLT),
        "-on-dark": (CHALK, VOLT, CHALK, CHALK_MUTED, VOLT),
        "-white": (WHITE, WHITE, WHITE, WHITE, WHITE),
        "-black": (BLACK, BLACK, BLACK, BLACK, BLACK),
    }
    for suffix, (stroke, summit, letters, name, rule) in variants.items():
        body, width = lockup(stroke, summit, letters, name, rule)
        (OUT / f"otri-logo{suffix}.svg").write_text(svg(width, 48, body), encoding="utf-8")
        body, width = lockup(stroke, summit, letters, None, rule)
        (OUT / f"otri-logo-compact{suffix}.svg").write_text(svg(width, 48, body), encoding="utf-8")
        (OUT / f"otri-mark{suffix}.svg").write_text(svg(48, 48, mark(stroke, summit), "OTRI mark"), encoding="utf-8")

    # "Scored with OTRI": the badge a results page shows.
    for suffix, ground, text_colour, stroke in [("", BG, INK, INK), ("-dark", NIGHT, CHALK, CHALK)]:
        body = (
            f'<rect width="232" height="48" rx="4" fill="{ground}"/>'
            f'<rect x=".5" y=".5" width="231" height="47" rx="3.5" fill="none" stroke="{text_colour}" stroke-opacity=".2"/>'
            f'<text x="14" y="29" font-family="IBM Plex Sans, Segoe UI, Arial, sans-serif" font-size="14" font-weight="500" fill="{text_colour}">Scored with</text>'
            f'{mark(stroke, VOLT, 104, 10, 0.58)}{wordmark(text_colour, 140, 0.58)}'
        )
        (OUT / f"otri-badge-scored{suffix}.svg").write_text(svg(232, 48, body, "Scored with OTRI"), encoding="utf-8")

    (ROOT / "public" / "favicon.svg").write_text(svg(48, 48, mark(INK, VOLT)), encoding="utf-8")

    # The share card: the dark instrument ground, the lockup, the promise.
    grid = "".join(
        f'<path d="M{x} 0V630" stroke="{CHALK}" stroke-opacity=".05" stroke-width="1"/>' for x in range(0, 1201, 40)
    ) + "".join(
        f'<path d="M0 {y}H1200" stroke="{CHALK}" stroke-opacity=".05" stroke-width="1"/>' for y in range(0, 631, 40)
    )
    rings = "".join(
        f'<ellipse cx="1010" cy="300" rx="{r}" ry="{r * 0.78:.0f}" fill="none" stroke="{CYAN}" stroke-opacity=".16" stroke-width="1.2"/>'
        for r in (300, 250, 200, 150, 100, 55)
    )
    body, _ = lockup(CHALK, VOLT, CHALK, CHALK_MUTED, VOLT)
    share = (
        f'<rect width="1200" height="630" fill="{GRAPHITE}"/>{grid}{rings}'
        f'<g transform="translate(80 74) scale(1.35)">{body}</g>'
        f'<text x="80" y="330" font-family="Space Grotesk, Arial, sans-serif" font-size="88" font-weight="700" letter-spacing="-4" fill="{CHALK}">One open score</text>'
        f'<text x="80" y="424" font-family="Space Grotesk, Arial, sans-serif" font-size="88" font-weight="700" letter-spacing="-4" fill="{VOLT}">for any trail race.</text>'
        f'<text x="82" y="492" font-family="IBM Plex Sans, Segoe UI, Arial, sans-serif" font-size="27" fill="{CHALK_MUTED}">Course + finish time = one explained, reproducible score. Free, open, no account.</text>'
        f'<rect x="80" y="540" width="10" height="2" fill="{VOLT}"/>'
        f'<text x="104" y="547" font-family="IBM Plex Mono, Consolas, monospace" font-size="17" font-weight="600" letter-spacing="3" fill="{CHALK_MUTED}">OTRI.RUN · OPEN TRAIL RUNNING INDEX</text>'
    )
    (OUT / "otri-share-card.svg").write_text(svg(1200, 630, share), encoding="utf-8")

    (OUT / "README.txt").write_text(
        "OTRI brand kit · Open Trail Running Index · https://otri.run\n\n"
        "You may use these files to refer to OTRI: in an article, on a race's website next to results\n"
        "scored with OTRI, in a talk, in an app that uses the OTRI API. You need not ask.\n\n"
        "The mark is a closed ring — the letter O — with a ridge inside it and a volt dot on the summit.\n"
        "It is a symbol, not a letter: the wordmark always spells OTRI in full, so the name can never be\n"
        "read as \"TRI\". Use the mark alone only where OTRI is already named.\n\n"
        "Please\n"
        "- use the files as they are: do not redraw, recolour, stretch, rotate or add effects;\n"
        "- keep clear space around the logo of at least half the height of the mark;\n"
        "- do not show the mark below 20 px, or the logo with the full name below 160 px wide;\n"
        "- use the colour logo on light backgrounds, the on-dark one on dark grounds and photographs,\n"
        "  the white one on colour, the black one where only one ink prints.\n\n"
        "Please do not\n"
        "- suggest that OTRI approves, certifies, sanctions or sponsors a race, a product or a runner.\n"
        "  OTRI scores courses and results with an open method; it approves nothing. \"Scored with OTRI\"\n"
        "  says what happened. \"OTRI certified\" or \"OTRI approved\" does not exist;\n"
        "- use the logo as, or as part of, your own logo, app icon or product name.\n\n"
        "Files\n"
        "  otri-logo*            the mark, the name and what it stands for\n"
        "  otri-logo-compact*    the mark and the name, where space is tight\n"
        "  otri-mark*            the mark alone: the ring, the ridge and the summit\n"
        "  otri-avatar*          a square profile picture that survives being cut to a circle\n"
        "  otri-badge-scored*    \"Scored with OTRI\", for results pages\n"
        "  otri-share-card       the link preview image\n"
        "  (no suffix) colour · -on-dark for dark grounds · -white · -black\n\n"
        f"Colours   ink {INK} · graphite {GRAPHITE} · night {NIGHT} · paper {BG}\n"
        f"          volt {VOLT} (the one action to press, always with ink on it) · cyan {CYAN} (data, links)\n"
        "Letters   the wordmark is Space Grotesk Bold, the full name IBM Plex Mono (both SIL OFL);\n"
        "          the wordmark is drawn as outlines, so it needs no font.\n\n"
        "The OTRI code and methodology are open source (see the repository for their licences). The name\n"
        "and the logo are not part of that licence: they identify the project.\n\n"
        "Questions, other formats, press: hello@otri.run\n",
        encoding="utf-8",
    )

    media = ROOT / "media" / "brand"
    media.mkdir(parents=True, exist_ok=True)
    for dest, source in [
        ("otri-logo.svg", "otri-logo.svg"),
        ("otri-logo-dark.svg", "otri-logo-on-dark.svg"),
        ("otri-mark.svg", "otri-mark.svg"),
        ("otri-mark-dark.svg", "otri-mark-on-dark.svg"),
    ]:
        (media / dest).write_text((OUT / source).read_text(encoding="utf-8"), encoding="utf-8")
    avatar = svg(64, 64, f'<rect width="64" height="64" rx="6" fill="{GRAPHITE}"/>{mark(CHALK, VOLT, 11.2, 11.2, 0.866)}')
    for name in ["otri-github-avatar.svg", "otri-github-avatar-512.svg"]:
        (media / name).write_text(avatar, encoding="utf-8")
    print("SVG files written. Run `node scripts/build_brand_png.mjs` for the PNGs and the kit.")


if __name__ == "__main__":
    main()
