"""Writes OTRI's logo files from src/brand/identity.json: the mark, the compact logo, the full
logo, the "Scored with OTRI" badge, the favicon, the share card and the copies in media/brand.

The wordmark and the full name are outlines drawn once from Barlow Condensed ExtraBold and
JetBrains Mono Bold (both SIL OFL), stored in identity.json, so a file needs no font and looks
the same wherever it is opened. Render the PNGs and the ZIP with scripts/build_brand_png.mjs.

Usage:  python scripts/build_brand_kit.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "brand"
IDENTITY = json.loads((ROOT / "src" / "brand" / "identity.json").read_text(encoding="utf-8"))
C = IDENTITY["colours"]
PINE, PAPER, BLAZE, NIGHT, STONE = C["pine"], C["paper"], C["blaze"], C["night"], C["stone"]
WHITE = "#ffffff"
BLACK = "#000000"
TITLE = "OTRI — Open Trail Running Index"


def svg(width: float, height: float, body: str, title: str = TITLE) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" width="{width:g}" height="{height:g}" '
        f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


def mark(rings: str = PINE, trail: str = BLAZE, x: float = 0, y: float = 0, scale: float = 1) -> str:
    m = IDENTITY["mark"]
    parts = [
        f'<circle cx="24" cy="24" r="{r["r"]}" fill="none" stroke="{rings}" stroke-width="{r["width"]}" pathLength="360" '
        f'stroke-dasharray="{r["dash"]}" transform="rotate({r["rotate"]} 24 24)" stroke-linecap="round"/>'
        for r in m["rings"]
    ]
    parts.append(
        f'<path d="{m["trail"]}" fill="none" stroke="{trail}" stroke-width="{m["trailWidth"]}" stroke-linecap="round" '
        f'stroke-linejoin="round" stroke-dasharray="{m["trailDash"]}"/>'
    )
    s = m["summit"]
    parts.append(f'<circle cx="{s["cx"]}" cy="{s["cy"]}" r="{s["r"]}" fill="{trail}"/>')
    return f'<g transform="translate({x:g} {y:g}) scale({scale:g})">{"".join(parts)}</g>'


def wordmark(colour: str = PINE, x: float = 56, y: float = 0) -> str:
    return f'<path transform="translate({x:g} {y:g})" d="{IDENTITY["wordmark"]["path"]}" fill="{colour}"/>'


def full_name(colour: str, rule: str, x: float) -> str:
    n = IDENTITY["fullNameOutline"]
    return (
        f'<rect x="{x - 9:g}" y="9" width="1.6" height="30" rx=".8" fill="{rule}"/>'
        f'<g transform="translate({x:g} 0)" fill="{colour}"><path d="{n["line1"]}"/><path d="{n["line2"]}"/></g>'
    )


def lockup(rings: str, trail: str, letters: str, name: str | None, rule: str) -> tuple[str, float]:
    tri_width = IDENTITY["wordmark"]["box"][0]
    body = mark(rings, trail) + wordmark(letters)
    width = 56 + tri_width
    if name:
        name_x = width + 18
        body += full_name(name, rule, name_x)
        width = name_x + IDENTITY["fullNameOutline"]["width"]
    return body, round(width + 2, 1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    variants = {
        # suffix: rings, trail, letters, full name, rule
        "": (PINE, BLAZE, PINE, STONE, BLAZE),
        "-on-dark": (PAPER, BLAZE, PAPER, "#b9c9b3", BLAZE),
        "-white": (WHITE, WHITE, WHITE, WHITE, WHITE),
        "-black": (BLACK, BLACK, BLACK, BLACK, BLACK),
    }
    for suffix, (rings, trail, letters, name, rule) in variants.items():
        body, width = lockup(rings, trail, letters, name, rule)
        (OUT / f"otri-logo{suffix}.svg").write_text(svg(width, 48, f'<g transform="translate(1 0)">{body}</g>'), encoding="utf-8")
        body, width = lockup(rings, trail, letters, None, rule)
        (OUT / f"otri-logo-compact{suffix}.svg").write_text(svg(width, 48, f'<g transform="translate(1 0)">{body}</g>'), encoding="utf-8")
        (OUT / f"otri-mark{suffix}.svg").write_text(svg(48, 48, mark(rings, trail), "OTRI mark"), encoding="utf-8")

    # "Scored with OTRI": the badge a results page shows.
    for suffix, bg, ink, rings, trail in [("", PAPER, PINE, PINE, BLAZE), ("-dark", NIGHT, PAPER, PAPER, BLAZE)]:
        body = (
            f'<rect width="236" height="48" rx="8" fill="{bg}"/><rect x=".5" y=".5" width="235" height="47" rx="7.5" fill="none" stroke="{ink}" stroke-opacity=".18"/>'
            f'<text x="16" y="29" font-family="Barlow, Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" fill="{ink}">Scored with</text>'
            f'{mark(rings, trail, 112, 8, 0.66)}<g transform="translate(150 8) scale(.66)">{wordmark(ink, 0, 0)}</g>'
        )
        (OUT / f"otri-badge-scored{suffix}.svg").write_text(svg(236, 48, body, "Scored with OTRI"), encoding="utf-8")

    (ROOT / "public" / "favicon.svg").write_text(svg(48, 48, mark(PINE, BLAZE)), encoding="utf-8")

    # The share card (og-image): the lockup, the promise, the address.
    body, width = lockup(PINE, BLAZE, PINE, STONE, BLAZE)
    share = (
        f'<rect width="1200" height="630" fill="{PAPER}"/>'
        '<g fill="none" stroke="#17261f" stroke-opacity=".08" stroke-width="1.4">'
        '<path d="M-20 520c120-90 200-260 340-270s200 150 330 100 180-200 310-170 200 40 260 0"/>'
        '<path d="M-20 570c130-90 220-280 360-290s210 160 340 110 180-210 320-180 200 50 260 10"/>'
        '<path d="M-20 620c140-80 240-300 380-310s220 170 350 120 180-220 330-190 200 60 260 20"/>'
        '<path d="M300 90c80-60 200-70 280-10s120 200 240 180 150-160 300-150"/>'
        '<path d="M260 140c90-70 220-100 300-10s120 220 260 200 170-180 320-170"/></g>'
        f'<g transform="translate(80 72) scale(1.5)">{body}</g>'
        f'<text x="80" y="330" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-size="96" font-weight="800" letter-spacing="-2" fill="{PINE}">One honest score</text>'
        f'<text x="80" y="428" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-size="96" font-weight="800" letter-spacing="-2" fill="#d4562a">for any trail race.</text>'
        f'<text x="82" y="500" font-family="Barlow, Segoe UI, Arial, sans-serif" font-size="30" fill="{STONE}">Course + finish time = one explained, reproducible score. Free, open, no account.</text>'
        f'<rect x="80" y="548" width="9" height="15" rx="2" fill="{BLAZE}"/>'
        f'<text x="102" y="561" font-family="JetBrains Mono, Consolas, monospace" font-size="18" font-weight="700" letter-spacing="3" fill="{STONE}">OTRI.RUN · OPEN TRAIL RUNNING INDEX</text>'
    )
    (OUT / "otri-share-card.svg").write_text(svg(1200, 630, share), encoding="utf-8")

    (OUT / "README.txt").write_text(
        "OTRI brand kit · Open Trail Running Index · https://otri.run\n\n"
        "You may use these files to refer to OTRI: in an article, on a race's website next to results\n"
        "scored with OTRI, in a talk, in an app that uses the OTRI API. You need not ask.\n\n"
        "Please\n"
        "- use the files as they are: do not redraw, recolour, stretch, rotate or add effects;\n"
        "- keep clear space around the logo of at least half the height of the mark;\n"
        "- do not show the mark smaller than 20 px, or the logo with the full name narrower than 160 px;\n"
        "- use the colour logo on paper-light backgrounds, the on-dark one on dark backgrounds and\n"
        "  photographs, the white one on colour, the black one where only one ink prints.\n\n"
        "Please do not\n"
        "- suggest that OTRI approves, certifies, sanctions or sponsors a race, a product or a runner.\n"
        "  OTRI scores courses and results with an open method; it approves nothing. \"Scored with OTRI\"\n"
        "  says what happened. \"OTRI certified\" or \"OTRI approved\" does not exist;\n"
        "- use the logo as, or as part of, your own logo, app icon or product name.\n\n"
        "Files\n"
        "  otri-logo*            the mark, the wordmark and the full name\n"
        "  otri-logo-compact*    the mark and the wordmark, where space is tight\n"
        "  otri-mark*            the mark alone: the contour rings, the trail and the summit\n"
        "  otri-avatar*          a square profile picture that survives being cut to a circle\n"
        "  otri-badge-scored*    \"Scored with OTRI\", for results pages\n"
        "  otri-share-card       the link preview image\n"
        "  (no suffix) colour · -on-dark for dark backgrounds · -white · -black\n\n"
        f"Colours   pine {PINE} · paper {PAPER} · blaze {BLAZE} · moss {C['moss']} · fern {C['fern']} · night {NIGHT}\n"
        "Letters   the wordmark is Barlow Condensed ExtraBold, the full name JetBrains Mono Bold (both SIL OFL),\n"
        "          drawn as outlines: the files need no font.\n\n"
        "The OTRI code and methodology are open source (see the repository for their licences). The name\n"
        "and the logo are not part of that licence: they identify the project.\n\n"
        "Questions, other formats, press: hello@otri.run\n",
        encoding="utf-8",
    )

    media = ROOT / "media" / "brand"
    media.mkdir(parents=True, exist_ok=True)
    for dest, source in [("otri-logo.svg", "otri-logo.svg"), ("otri-logo-dark.svg", "otri-logo-on-dark.svg"), ("otri-mark.svg", "otri-mark.svg"), ("otri-mark-dark.svg", "otri-mark-on-dark.svg")]:
        (media / dest).write_text((OUT / source).read_text(encoding="utf-8"), encoding="utf-8")
    avatar = svg(64, 64, f'<rect width="64" height="64" fill="{NIGHT}"/>{mark(PAPER, BLAZE, 11.2, 11.2, 0.866)}')
    for name in ["otri-github-avatar.svg", "otri-github-avatar-512.svg"]:
        (media / name).write_text(avatar, encoding="utf-8")
    print("SVG files written. Run `node scripts/build_brand_png.mjs` for the PNGs and the kit.")


if __name__ == "__main__":
    main()
