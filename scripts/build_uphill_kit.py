"""Export the approved outline geometry to SVG and a downloadable kit. No fonts required."""
from pathlib import Path
import json
import zipfile
ROOT = Path(__file__).resolve().parents[1]
g = json.loads((ROOT / 'src/brand/uphill.json').read_text())
out = ROOT / 'public/brand/uphill'
out.mkdir(parents=True, exist_ok=True)
for name, ink, accent in [('color','#17202c','#3576f6'),('black','#111111','#111111'),('white','#ffffff','#ffffff'),('on-dark','#ffffff','#3576f6')]:
    body = f'<path d="{g["letters"]} {g["stem"]}" fill="{ink}"/><path d="{g["summit"]}" fill="{accent}"/><path d="{g["arrow"]}" fill="none" stroke="{accent}" stroke-width="5" stroke-linejoin="round"/>'
    (out / f'otri-uphill-{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{g["viewBox"]}" role="img" aria-label="OTRI"><title>OTRI — Uphill / Black electric</title>{body}</svg>', encoding='utf8')
domain = json.loads((ROOT / 'src/brand/uphill-domain.json').read_text())
for name, ink, accent in [('color','#17202c','#3576f6'),('black','#111111','#111111'),('white','#ffffff','#ffffff'),('on-dark','#ffffff','#3576f6')]:
    body = f'<path d="{g["letters"]} {g["stem"]}" fill="{ink}"/><path d="{domain["suffix"]}" fill="{accent}"/><path d="{g["summit"]}" fill="{accent}"/><path transform="translate({domain["arrowOffset"]} 0)" d="{g["arrow"]}" fill="none" stroke="{accent}" stroke-width="5" stroke-linejoin="round"/>'
    (out / f'otri-run-{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{domain["viewBox"]}" role="img" aria-label="otri.run"><title>otri.run — Uphill / Black electric</title>{body}</svg>', encoding='utf8')
with zipfile.ZipFile(out / 'otri-uphill-kit.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(out.iterdir()):
        if path.suffix in ['.svg', '.txt']:
            archive.write(path, path.name)
