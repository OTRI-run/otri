// The site's icons, the social avatars and the share image, all drawn from the current mark
// (src/brand/uphill.json), so that the favicon in the tab, the app icon on a phone, the profile
// picture on Instagram and the card a shared link shows are the same mark as the site's header.
//
// The small icons carry the monogram: the "ı" of the wordmark with its summit and the arrow, on
// an ink tile. A whole wordmark is a smudge at 16 px; the monogram is still a summit and an arrow.
// The avatars come in three: the monogram on ink, the monogram on white, and the whole wordmark
// on ink for a profile where the name should read.
//
// Needs Chrome for the PNGs (set CHROME to its path if it is not in the usual place) and Node 22+.
//   node scripts/build_icons.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const geometry = JSON.parse(readFileSync(join(root, 'src/brand/uphill.json'), 'utf8'))
const domain = JSON.parse(readFileSync(join(root, 'src/brand/uphill-domain.json'), 'utf8'))
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
if (!CHROME) throw new Error('Chrome not found; set CHROME to its path')

const INK = '#17202c'
const ELECTRIC = '#3576f6'
const WHITE = '#ffffff'

// The monogram's own box in the wordmark's coordinates: stem x 173–189, summit apex y 14, stem
// foot y 82, arrow to x 222 (plus its stroke).
const MONO = { x: 170, y: 11.5, w: 55, h: 70.5 }

/** The monogram, scaled to `fit` of a `size` square and centred in it. */
function monogram(size, fit, ink, accent) {
  const s = (size * fit) / MONO.h
  const tx = size / 2 - (MONO.x + MONO.w / 2) * s
  const ty = size / 2 - (MONO.y + MONO.h / 2) * s
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">
<path d="${geometry.stem}" fill="${ink}"/>
<path d="${geometry.summit}" fill="${accent}"/>
<path d="${geometry.arrow}" fill="none" stroke="${accent}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
</g>`
}

/** The whole wordmark, scaled to `fit` of the width and centred. */
function wordmark(size, fit, ink, accent) {
  const [vx, vy, vw, vh] = geometry.viewBox.split(' ').map(Number)
  const s = (size * fit) / vw
  const tx = size / 2 - (vx + vw / 2) * s
  const ty = size / 2 - (vy + vh / 2) * s
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">
<path d="${geometry.letters} ${geometry.stem}" fill="${ink}"/>
<path d="${geometry.summit}" fill="${accent}"/>
<path d="${geometry.arrow}" fill="none" stroke="${accent}" stroke-width="5" stroke-linejoin="round"/>
</g>`
}

/** A square tile: rounded or not, on a ground or transparent, with the monogram or the wordmark. */
function tile({ size, radius, ground, body }) {
  const back = ground ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${ground}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="OTRI"><title>OTRI</title>${back}${body}</svg>`
}

const outputs = [
  // the tab and the app: the monogram on an ink tile with rounded corners
  { file: 'public/favicon-32.png', size: 32, svg: (n) => tile({ size: n, radius: n * 0.2, ground: INK, body: monogram(n, 0.68, WHITE, ELECTRIC) }) },
  { file: 'public/icon-192.png', size: 192, svg: (n) => tile({ size: n, radius: n * 0.2, ground: INK, body: monogram(n, 0.62, WHITE, ELECTRIC) }) },
  { file: 'public/icon-512.png', size: 512, svg: (n) => tile({ size: n, radius: n * 0.2, ground: INK, body: monogram(n, 0.62, WHITE, ELECTRIC) }) },
  // maskable: the platform cuts its own shape, so the tile fills the square and the mark keeps to the safe middle
  { file: 'public/icon-maskable-512.png', size: 512, svg: (n) => tile({ size: n, radius: 0, ground: INK, body: monogram(n, 0.5, WHITE, ELECTRIC) }) },
  // iOS rounds the corners itself
  { file: 'public/apple-touch-icon.png', size: 180, svg: (n) => tile({ size: n, radius: 0, ground: INK, body: monogram(n, 0.62, WHITE, ELECTRIC) }) },
  // the image in mail already delivered (api/email.py): new mail carries no image, but the old links keep working
  { file: 'public/email/otri-mark.png', size: 144, svg: (n) => tile({ size: n, radius: n * 0.2, ground: INK, body: monogram(n, 0.62, WHITE, ELECTRIC) }) },
  // profile pictures: platforms crop to a circle, so the mark keeps clear of the corners
  { file: 'public/brand/uphill/otri-avatar-1024.png', size: 1024, svg: (n) => tile({ size: n, radius: 0, ground: INK, body: monogram(n, 0.56, WHITE, ELECTRIC) }) },
  { file: 'public/brand/uphill/otri-avatar-light-1024.png', size: 1024, svg: (n) => tile({ size: n, radius: 0, ground: WHITE, body: monogram(n, 0.56, INK, ELECTRIC) }) },
  { file: 'public/brand/uphill/otri-avatar-wordmark-1024.png', size: 1024, svg: (n) => tile({ size: n, radius: 0, ground: INK, body: wordmark(n, 0.64, WHITE, ELECTRIC) }) },
]

/** The card a shared link shows: the lockup, the home page's own headline, the address. */
function shareCard() {
  const [vx, vy, vw, vh] = domain.viewBox.split(' ').map(Number)
  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${domain.viewBox}" width="${(vw / vh) * 84}" height="84"><path d="${geometry.letters} ${geometry.stem}" fill="${WHITE}"/><path d="${domain.suffix}" fill="${ELECTRIC}"/><path d="${geometry.summit}" fill="${ELECTRIC}"/><path transform="translate(${domain.arrowOffset} 0)" d="${geometry.arrow}" fill="none" stroke="${ELECTRIC}" stroke-width="5" stroke-linejoin="round"/></svg>`
  void vx
  void vy
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b1220;color:#fff;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1200px;height:630px;background:radial-gradient(circle at 82% 18%,rgba(53,118,246,.28),transparent 34%),linear-gradient(160deg,#0b1220 0%,#111c33 100%)}
.top{position:absolute;left:72px;top:64px}
h1{position:absolute;left:72px;top:196px;margin:0;font-size:96px;line-height:1.02;letter-spacing:-.05em;font-weight:800}
h1 span{display:block;background:linear-gradient(90deg,#3576f6,#60a5fa 60%,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.08em}
p{position:absolute;left:72px;top:446px;margin:0;font-size:28px;line-height:1.35;color:#c7d2e3;max-width:900px}
.foot{position:absolute;left:72px;right:72px;bottom:44px;display:flex;justify-content:space-between;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;letter-spacing:.14em;color:#8fa3c0}
</style></head><body><div class="card">
<div class="top">${lockup}</div>
<h1>Know your score.<span>Before you race.</span></h1>
<p>Free, explained trail scores from a course file and race results. Open method, public code, no account to try.</p>
<div class="foot"><span>OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT</span><span>OTRI.RUN</span></div>
</div></body></html>`
}

const work = mkdtempSync(join(tmpdir(), 'otri-icons-'))
try {
  // the vector favicon is the same tile as the PNGs
  writeFileSync(join(root, 'public/favicon.svg'), tile({ size: 128, radius: 26, ground: INK, body: monogram(128, 0.64, WHITE, ELECTRIC) }) + '\n')
  console.log('public/favicon.svg')
  for (const { file, size, svg } of outputs) {
    const page = join(work, `${size}-${Math.random().toString(36).slice(2)}.html`)
    writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg(size)}</body></html>`)
    const out = join(root, file)
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${out}`, `file:///${page.replace(/\\/g, '/')}`], { stdio: 'ignore' })
    console.log(file)
  }
  const card = join(work, 'share.html')
  writeFileSync(card, shareCard())
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630', `--screenshot=${join(root, 'public/og-image.png')}`, `file:///${card.replace(/\\/g, '/')}`], { stdio: 'ignore' })
  console.log('public/og-image.png')
} finally {
  rmSync(work, { recursive: true, force: true })
}
