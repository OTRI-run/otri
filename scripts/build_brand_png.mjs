// Renders the PNGs of the media page and the site's icons from public/brand/*.svg, and zips the kit.
// Second half of scripts/build_brand_kit.py. Needs Chrome (set CHROME to its path if it is not in
// the usual place) and Node 22+.  Usage: node scripts/build_brand_png.mjs
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const brand = join(root, 'public', 'brand')
const INK = '#0b1220'

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
  ['brand/otri-avatar-1024.png', 'otri-mark-on-dark.svg', 1024, 1024, INK, 0.66],
  ['brand/otri-avatar-light-1024.png', 'otri-mark.svg', 1024, 1024, '#ffffff', 0.66],
  // The site's own icons (linked from the pages' <head> and site.webmanifest).
  ['apple-touch-icon.png', 'otri-mark.svg', 180, 180, '#ffffff', 0.78],
  ['favicon-32.png', 'otri-mark.svg', 32, 32, null, 1.1],
  ['icon-192.png', 'otri-mark.svg', 192, 192, '#ffffff', 0.78],
  ['icon-512.png', 'otri-mark.svg', 512, 512, '#ffffff', 0.78],
  ['icon-maskable-512.png', 'otri-mark.svg', 512, 512, '#ffffff', 0.6],
  // The mark in every transactional email (api/email.py LOGO_URL). Shown at 36 px, rendered at
  // four times that for high-density screens. It lived outside this list and was therefore the one
  // asset the brand refresh did not reach: every email went out with the retired logo.
  ['email/otri-mark.png', 'otri-mark.svg', 144, 144, null, 1],
]

// `--only <text>` renders just the outputs whose name contains `text`, so one asset can be
// refreshed without rewriting every other binary in the tree.
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const jobs = only ? JOBS.filter(([out]) => out.includes(only)) : JOBS
if (only && jobs.length === 0) {
  console.error(`No brand output matches --only ${only}`)
  process.exit(1)
}

const chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
const profile = mkdtempSync(join(tmpdir(), 'otri-brand-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=9377', `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250)
  try { target = (await (await fetch('http://127.0.0.1:9377/json')).json()).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } }
const send = (method, params = {}) => new Promise((done) => { pending.set(++id, done); ws.send(JSON.stringify({ id, method, params })) })

await send('Page.enable')
const frame = (await send('Page.getFrameTree')).result.frameTree.frame.id
for (const [out, source, width, wantedHeight, background, fill] of jobs) {
  const svg = readFileSync(join(brand, source), 'utf8')
  const [, , , boxWidth, boxHeight] = svg.match(/viewBox="(\S+) (\S+) (\S+) (\S+)"/).map(Number)
  const height = wantedHeight ?? Math.round((width * boxHeight) / boxWidth)
  const art = svg.replace(/ width="[^"]*" height="[^"]*"/, ` style="width:${fill * 100}%;height:${fill * 100}%;flex:none"`)
  const html = `<html><body style="margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${background ?? 'transparent'}">${art}</body></html>`
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await send('Page.setDocumentContent', { frameId: frame, html })
  await sleep(120)
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })
  writeFileSync(join(root, 'public', out), Buffer.from(shot.result.data, 'base64'))
  console.log(out, `${width}x${height}`)
}
ws.close()
proc.kill()

// The kit as one download: every file of public/brand and the terms they come with. A filtered
// run refreshed one asset and has no business rewriting the kit around it.
if (only) {
  console.log('--only: brand/otri-brand-kit.zip left alone')
  process.exit(0)
}
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
