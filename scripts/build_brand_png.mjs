// Renders the PNGs of the media page, the site's icons, the share image and the email mark from
// public/brand/*.svg, and zips the kit. Second half of scripts/build_brand_kit.py. Needs a
// Chromium browser (Chrome or Edge; set CHROME to its path if it is not in the usual place) and
// Node 22+.  Usage: node scripts/build_brand_png.mjs
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const brand = join(root, 'public', 'brand')
const identity = JSON.parse(readFileSync(join(root, 'src', 'brand', 'identity.json'), 'utf8'))
const { night, graphite, bg } = identity.colours

// [output, source svg, width, height, background or null for transparent, share of the box the artwork fills]
const JOBS = [
  ['brand/otri-mark-512.png', 'otri-mark.svg', 512, 512, null, 1],
  ['brand/otri-mark-1024.png', 'otri-mark.svg', 1024, 1024, null, 1],
  ['brand/otri-mark-white-1024.png', 'otri-mark-white.svg', 1024, 1024, null, 1],
  ['brand/otri-logo-1600.png', 'otri-logo.svg', 1600, null, null, 1],
  ['brand/otri-logo-white-1600.png', 'otri-logo-white.svg', 1600, null, null, 1],
  ['brand/otri-logo-on-dark-1600.png', 'otri-logo-on-dark.svg', 1600, null, null, 1],
  ['brand/otri-logo-compact-1200.png', 'otri-logo-compact.svg', 1200, null, null, 1],
  ['brand/otri-logo-compact-white-1200.png', 'otri-logo-compact-white.svg', 1200, null, null, 1],
  // Profile pictures: a square that survives being cut to a circle.
  ['brand/otri-avatar-1024.png', 'otri-mark-on-dark.svg', 1024, 1024, graphite, 0.66],
  ['brand/otri-avatar-light-1024.png', 'otri-mark.svg', 1024, 1024, bg, 0.66],
  // The site's own icons (linked from the pages' <head> and site.webmanifest).
  ['apple-touch-icon.png', 'otri-mark.svg', 180, 180, bg, 0.78],
  ['favicon-32.png', 'otri-mark.svg', 32, 32, null, 1.1],
  ['icon-192.png', 'otri-mark.svg', 192, 192, bg, 0.78],
  ['icon-512.png', 'otri-mark.svg', 512, 512, bg, 0.78],
  ['icon-maskable-512.png', 'otri-mark.svg', 512, 512, bg, 0.6],
  // The link preview and the mark in transactional email.
  ['og-image.png', 'otri-share-card.svg', 1200, 630, null, 1],
  ['email/otri-mark.png', 'otri-mark.svg', 160, 160, null, 1],
]

const chrome =
  process.env.CHROME ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(existsSync)
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME to the browser executable.')
const profile = mkdtempSync(join(tmpdir(), 'otri-brand-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=9377', `--user-data-dir=${profile}`, '--hide-scrollbars', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250)
  try {
    target = (await (await fetch('http://127.0.0.1:9377/json')).json()).find((t) => t.type === 'page')
  } catch {}
}
if (!target) throw new Error('The browser did not answer on port 9377.')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) => new Promise((done) => { pending.set(++id, done); ws.send(JSON.stringify({ id, method, params })) })

// The fonts the share card names, so the rendered PNG matches the site.
const fontFaces = ['SpaceGrotesk-700-latin', 'IBMPlexSans-400-latin', 'IBMPlexMono-600-latin']
  .map((file) => {
    const [family, weight] = file.split('-')
    const name = family === 'SpaceGrotesk' ? 'Space Grotesk' : family === 'IBMPlexMono' ? 'IBM Plex Mono' : 'IBM Plex Sans'
    const data = readFileSync(join(root, 'src', 'ui', 'fonts', `${file}.woff2`)).toString('base64')
    return `@font-face{font-family:'${name}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`
  })
  .join('')

await send('Page.enable')
const frame = (await send('Page.getFrameTree')).result.frameTree.frame.id
for (const [out, source, width, wantedHeight, background, fill] of JOBS) {
  const svg = readFileSync(join(brand, source), 'utf8')
  const [, , , boxWidth, boxHeight] = svg.match(/viewBox="(\S+) (\S+) (\S+) (\S+)"/).map(Number)
  const height = wantedHeight ?? Math.round((width * boxHeight) / boxWidth)
  const art = svg.replace(/ width="[^"]*" height="[^"]*"/, ` style="width:${fill * 100}%;height:${fill * 100}%;flex:none"`)
  const html = `<html><head><style>${fontFaces}</style></head><body style="margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${background ?? 'transparent'}">${art}</body></html>`
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await send('Page.setDocumentContent', { frameId: frame, html })
  await sleep(200)
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })
  mkdirSync(dirname(join(root, 'public', out)), { recursive: true })
  writeFileSync(join(root, 'public', out), Buffer.from(shot.result.data, 'base64'))
  console.log(out, `${width}x${height}`)
}
ws.close()
proc.kill()
await new Promise((r) => proc.once('exit', r))
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  // Windows may still hold the profile for a moment; a stray temp folder is harmless.
}

// The kit as one download: every file of public/brand and the terms they come with.
const zip = join(brand, 'otri-brand-kit.zip')
rmSync(zip, { force: true })
execFileSync('python', ['-c', `
import zipfile, pathlib
brand = pathlib.Path(r"${brand}")
with zipfile.ZipFile(brand / "otri-brand-kit.zip", "w", zipfile.ZIP_DEFLATED) as kit:
    for path in sorted(brand.iterdir()):
        if path.suffix in (".svg", ".png", ".txt"):
            kit.write(path, f"otri-brand-kit/{path.name}")
`])
console.log('brand/otri-brand-kit.zip')
