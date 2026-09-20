"""Build OTRI's geometric wordmark, avatars and site icons from identity.json.

No font files are needed for the wordmark. Render PNG files and the ZIP kit
with scripts/build_brand_png.mjs.
"""
from pathlib import Path
import json
import zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/brand'
IDENTITY=json.loads((ROOT/'src/brand/identity.json').read_text())
INK=IDENTITY['ink']; ACCENT=IDENTITY['accent']; WHITE='#ffffff'

def svg(w,h,body,title='OTRI — Open Trail Running Index'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
def word(color=INK):
    return ''.join(f'<path d="{d}" fill="{color}" fill-rule="evenodd"/>' for d in IDENTITY['wordmark'])
def mark(color=ACCENT):
    # The full, closed O is the app symbol. One small survey point identifies the ascent.
    return f'<g transform="translate(7 8)"><path d="{IDENTITY["wordmark"][0]}" fill="{color}" fill-rule="evenodd"/><circle cx="24" cy="24" r="3" fill="{color}"/></g>'
def main():
    OUT.mkdir(exist_ok=True,parents=True)
    for suffix,ink,accent in [('',INK,ACCENT),('-white',WHITE,WHITE),('-black',INK,INK),('-on-dark',WHITE,'#c6afea')]:
        (OUT/f'otri-logo-compact{suffix}.svg').write_text(svg(180,48,word(ink)))
        full=word(ink)+f'<path d="M197 8v32" stroke="{accent}" stroke-opacity=".4"/><text x="215" y="21" font-family="Arial,sans-serif" font-size="12" fill="{accent}">Open Trail</text><text x="215" y="37" font-family="Arial,sans-serif" font-size="12" fill="{accent}">Running Index</text>'
        (OUT/f'otri-logo{suffix}.svg').write_text(svg(305,48,full))
        (OUT/f'otri-mark{suffix}.svg').write_text(svg(64,64,mark(accent)))
    for suffix,bg,ink in [('', '#f0e9fa',INK),('-dark',INK,WHITE)]:
        body=f'<rect width="230" height="48" rx="9" fill="{bg}"/><text x="16" y="29" font-size="13" font-family="Arial,sans-serif" fill="{ink}">Scored with</text><g transform="translate(110 10) scale(.56)">{word(ink)}</g>'
        (OUT/f'otri-badge-scored{suffix}.svg').write_text(svg(230,48,body,'Scored with OTRI'))
    (ROOT/'public/favicon.svg').write_text(svg(64,64,mark()))
    (OUT/'README.txt').write_text('OTRI — Open Trail Running Index\n\nGeometric wordmark / violet identity.\nUse the full wordmark when introducing OTRI. The closed O symbol is for places where the name is already known.\nDo not stretch, recolour, obscure the O, or imply that OTRI approves/certifies a race.\nInk #21152F; violet #6336B6; lavender #C6AFEA; light #FAF9FF.\nhttps://otri.run/prototype/#media\n')
    share=svg(1200,630,f'<rect width="1200" height="630" fill="#f2ecfb"/><g transform="translate(75 70) scale(1.1)">{word()}</g><text x="75" y="300" font-family="Arial,sans-serif" font-size="78" font-weight="bold" fill="{INK}">Open Trail</text><text x="75" y="390" font-family="Arial,sans-serif" font-size="78" font-weight="bold" fill="{ACCENT}">Running Index.</text><text x="80" y="510" font-family="Arial,sans-serif" font-size="27" fill="#735a94">Your course. Your time. Your score.</text><text x="80" y="580" font-family="Arial,sans-serif" font-size="20" fill="#735a94">otri.run</text>')
    (OUT/'otri-share-card.svg').write_text(share)
    media=ROOT/'media/brand'
    media.mkdir(parents=True,exist_ok=True)
    for dest,source in [('otri-logo.svg','otri-logo.svg'),('otri-logo-dark.svg','otri-logo-on-dark.svg'),('otri-mark.svg','otri-mark.svg'),('otri-mark-dark.svg','otri-mark-on-dark.svg')]:
        (media/dest).write_text((OUT/source).read_text())
    avatar=svg(64,64,f'<rect width="64" height="64" fill="{INK}"/><g transform="translate(10.88 10.88) scale(.66)">{mark(WHITE)}</g>')
    for name in ['otri-github-avatar.svg','otri-github-avatar-512.svg']:(media/name).write_text(avatar)
    print('SVG files generated. Run build_brand_png.mjs to render PNGs and package the kit.')
if __name__=='__main__':main()
