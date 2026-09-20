import identity from '../src/brand/identity.json'
// Share images, drawn in the browser on a <canvas>: a race's top finishers for the organizer, a
// target time for the runner. Nothing is uploaded to make them; the PNG exists only where it is
// drawn. They wear the site's identity: night-to-pine ground with faint contours, paper text,
// the numbers in sun, the trail in blaze, and the OTRI mark in the corner.

export const FORMATS = {
  post: { label: 'Post 4:5', width: 1080, height: 1350, hint: 'Facebook and Instagram feed' },
  square: { label: 'Square 1:1', width: 1080, height: 1080, hint: 'Works everywhere' },
  story: { label: 'Story 9:16', width: 1080, height: 1920, hint: 'Stories, Reels, WhatsApp status' },
}

// Brand colours come from identity.json; the rest mirror src/ui/tokens.css (--sun, --gold, --silver, --bronze).
const { night: NIGHT, pine: PINE, paper: PAPER, blaze: BLAZE, fern: FERN } = identity.colours
const SUN = '#f2c14e'
const MEDALS = ['#d4a017', '#8a94a6', '#b0713b']

// A hex colour with an alpha, for the soft text and hairlines.
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const INK = PAPER
const SOFT = alpha(PAPER, 0.72)
const FAINT = alpha(PAPER, 0.16)
const ACCENT = SUN
const LABEL = FERN

// The same three faces as the site (src/ui/fonts.css), with the system fallbacks behind them.
const DISPLAY = "'Barlow Condensed', 'Barlow', 'Arial Narrow', system-ui, sans-serif"
const SANS = "'Barlow', 'Segoe UI', Roboto, system-ui, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"

// The canvas takes whatever face is loaded when it draws: ask for ours first. The first paint uses
// what is there; when the faces arrive the latest drawing of each canvas is painted again.
let fontsLoaded = false
const fontsReady = (() => {
  if (typeof document === 'undefined' || !document.fonts?.load) {
    fontsLoaded = true
    return Promise.resolve()
  }
  return Promise.all([
    document.fonts.load("800 76px 'Barlow Condensed'"),
    document.fonts.load("700 32px 'Barlow'"),
    document.fonts.load("500 32px 'Barlow'"),
    document.fonts.load("600 26px 'JetBrains Mono'"),
    document.fonts.load("400 26px 'JetBrains Mono'"),
  ])
    .catch(() => {})
    .then(() => {
      fontsLoaded = true
    })
})()
const latestPaint = new WeakMap()
function withFonts(canvas, paint) {
  paint()
  if (fontsLoaded) return
  latestPaint.set(canvas, paint)
  fontsReady.then(() => {
    if (latestPaint.get(canvas) === paint) paint()
  })
}

// The site's contour tile (src/ui/patterns.css, --topo-dark): nine bezier strokes on a 520 square,
// tiled down the image. Built on first use, so importing this file needs no canvas.
const CONTOUR_TILE = 520
const CONTOUR_PATHS = [
  'M-20 380c70-50 110-140 200-150s110 80 190 50 110-110 190-90',
  'M-20 420c80-50 120-160 210-170s120 90 200 60 110-120 190-100',
  'M-20 460c80-40 130-170 220-180s130 100 210 70 110-130 190-110',
  'M-20 500c90-40 140-180 230-190s140 110 220 80 110-140 190-120',
  'M60 70c50-40 110-50 160-10s70 110 130 100 90-90 170-80',
  'M30 110c60-50 130-70 190-20s70 120 140 110 100-100 180-90',
  'M0 150c70-60 140-100 210-40s70 140 160 130 110-110 190-100',
  'M-30 190c80-70 160-120 230-50s70 150 170 140 120-120 200-110',
  'M100 40c40-20 80-30 110-5s50 70 100 65 60-50 120-45',
]
let contourPaths = null

function contours(ctx, width, height) {
  contourPaths ??= CONTOUR_PATHS.map((d) => new Path2D(d))
  const scale = width / CONTOUR_TILE
  ctx.save()
  ctx.strokeStyle = alpha(FERN, 0.12)
  ctx.lineCap = 'round'
  for (let y = 0; y < height; y += CONTOUR_TILE * scale) {
    ctx.save()
    ctx.translate(0, y)
    ctx.scale(scale, scale)
    ctx.lineWidth = 2.2 / scale // 2.2 image pixels whatever the tile scale
    for (const path of contourPaths) ctx.stroke(path)
    ctx.restore()
  }
  ctx.restore()
}

function setup(canvas, format) {
  const { width, height } = FORMATS[format] ?? FORMATS.post
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, NIGHT)
  background.addColorStop(1, PINE)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  contours(ctx, width, height)
  ctx.textBaseline = 'alphabetic'
  return { ctx, width, height, pad: 84 }
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = fit(ctx, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxWidth)
    return kept
  }
  return lines.map((entry) => fit(ctx, entry, maxWidth))
}

// The eyebrow as on the site: a painted blaze, then the label in mono.
function eyebrow(ctx, text, x, y) {
  ctx.fillStyle = BLAZE
  ctx.fillRect(x, y - 22, 12, 22)
  ctx.font = `600 26px ${MONO}`
  ctx.fillStyle = LABEL
  ctx.fillText(text.toUpperCase().split('').join('\u200a'), x + 26, y)
}

// The OTRI mark from identity.json: three contour rings opened where the trail climbs through
// them, the trail in blaze, the summit dot. Drawn at `size` pixels with its top-left at (x, y).
function mark(ctx, x, y, size) {
  const { box, rings, trail, trailWidth, trailDash, summit } = identity.mark
  const scale = size / box
  const rad = (deg) => (deg * Math.PI) / 180
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  for (const ring of rings) {
    const [visible] = ring.dash.split(' ').map(Number) // pathLength 360: the dash is in degrees
    ctx.lineWidth = ring.width
    ctx.beginPath()
    ctx.arc(box / 2, box / 2, ring.r, rad(ring.rotate), rad(ring.rotate + visible))
    ctx.stroke()
  }
  ctx.strokeStyle = BLAZE
  ctx.lineWidth = trailWidth
  ctx.setLineDash(trailDash.split(' ').map(Number))
  ctx.stroke(new Path2D(trail))
  ctx.setLineDash([])
  ctx.fillStyle = BLAZE
  ctx.beginPath()
  ctx.arc(summit.cx, summit.cy, summit.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// The wordmark's letters beside the mark, from the outlines in identity.json.
function wordmark(ctx, x, y, height) {
  const [boxWidth, boxHeight] = identity.wordmark.box
  const scale = height / boxHeight
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = INK
  ctx.fill(new Path2D(identity.wordmark.path))
  ctx.restore()
  return boxWidth * scale
}

function footer(ctx, { width, height, pad }, text) {
  const y = height - pad
  ctx.strokeStyle = FAINT
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, y - 66)
  ctx.lineTo(width - pad, y - 66)
  ctx.stroke()
  const markSize = 64
  const wordHeight = 46
  const top = y - 40 - markSize / 2
  mark(ctx, pad, top, markSize)
  const wordWidth = wordmark(ctx, pad + markSize + 12, top + (markSize - wordHeight) / 2, wordHeight)
  const logoWidth = markSize + 12 + wordWidth
  ctx.font = `500 25px ${SANS}`
  ctx.fillStyle = SOFT
  ctx.textAlign = 'right'
  ctx.fillText(fit(ctx, text, width - pad * 2 - logoWidth - 40), width - pad, y - 4)
  ctx.textAlign = 'left'
}

/** A race's top finishers. `rows`: [{ place, name, time, score }], already cut to the number wanted. */
export function drawLeaderboard(canvas, { format = 'post', raceName, facts, heading, rows, note }) {
  withFonts(canvas, () => {
    const frame = setup(canvas, format)
    const { ctx, width, height, pad } = frame
    const inner = width - pad * 2
    let y = pad + (format === 'story' ? 120 : 20)

    eyebrow(ctx, heading, pad, y)
    y += 78
    ctx.font = `800 76px ${DISPLAY}`
    ctx.fillStyle = INK
    for (const line of wrap(ctx, raceName, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 86
    }
    ctx.font = `500 32px ${SANS}`
    ctx.fillStyle = SOFT
    ctx.fillText(fit(ctx, facts, inner), pad, y - 8)
    y += 40

    const bottom = height - pad - 110
    // A podium of three fills the frame as ten rows do: rows grow up to a limit, and what is left
    // over is shared above and below them rather than pooling at the bottom.
    const rowHeight = Math.min(250, (bottom - y) / rows.length)
    y += Math.max(0, (bottom - y - rowHeight * rows.length) / 2)
    // Ten rows on a square leave no room for two lines each: name and time then share one line.
    const compact = rowHeight < 88
    const nameSize = compact ? Math.max(24, Math.min(34, rowHeight * 0.5)) : Math.max(30, Math.min(64, rowHeight * 0.3))
    const scoreSize = compact ? Math.max(28, Math.min(44, rowHeight * 0.62)) : Math.max(40, Math.min(112, rowHeight * 0.46))
    rows.forEach((row, index) => {
      const top = y + index * rowHeight
      const middle = top + rowHeight / 2
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pad, top)
      ctx.lineTo(width - pad, top)
      ctx.stroke()

      // place, as a medal for the podium
      const radius = Math.min(52, rowHeight * (compact ? 0.4 : 0.24))
      ctx.beginPath()
      ctx.arc(pad + radius, middle, radius, 0, Math.PI * 2)
      ctx.fillStyle = index < 3 ? MEDALS[index] : alpha(PAPER, 0.12)
      ctx.fill()
      ctx.font = `800 ${Math.round(radius * 0.95)}px ${DISPLAY}`
      ctx.fillStyle = index < 3 ? PINE : INK
      ctx.textAlign = 'center'
      ctx.fillText(String(row.place), pad + radius, middle + radius * 0.33)
      ctx.textAlign = 'left'

      // score on the right, name and time between
      ctx.font = `800 ${scoreSize}px ${DISPLAY}`
      ctx.fillStyle = ACCENT
      ctx.textAlign = 'right'
      const scoreText = row.score == null ? '' : String(row.score)
      ctx.fillText(scoreText, width - pad, middle + scoreSize * 0.34)
      const scoreWidth = scoreText ? ctx.measureText(scoreText).width + 36 : 0
      ctx.textAlign = 'left'

      const textX = pad + radius * 2 + 30
      const textWidth = width - pad - scoreWidth - textX
      if (compact) {
        ctx.font = `400 ${Math.round(nameSize * 0.8)}px ${MONO}`
        ctx.fillStyle = SOFT
        ctx.textAlign = 'right'
        ctx.fillText(row.time, width - pad - scoreWidth, middle + nameSize * 0.3)
        const timeWidth = ctx.measureText(row.time).width + 28
        ctx.textAlign = 'left'
        ctx.font = `700 ${nameSize}px ${SANS}`
        ctx.fillStyle = INK
        ctx.fillText(fit(ctx, row.name, textWidth - timeWidth), textX, middle + nameSize * 0.34)
      } else {
        ctx.font = `700 ${nameSize}px ${SANS}`
        ctx.fillStyle = INK
        ctx.fillText(fit(ctx, row.name, textWidth), textX, middle - 2)
        ctx.font = `400 ${Math.round(nameSize * 0.68)}px ${MONO}`
        ctx.fillStyle = SOFT
        ctx.fillText(row.time, textX, middle + nameSize * 0.86)
      }
    })

    footer(ctx, frame, note)
  })
}

/** One runner's target (or result) on one course. */
export function drawScoreCard(canvas, { format = 'post', heading, courseName, facts, time, score, detail, note }) {
  withFonts(canvas, () => {
    const frame = setup(canvas, format)
    const { ctx, width, height, pad } = frame
    const inner = width - pad * 2
    let y = pad + (format === 'story' ? 160 : 20)

    eyebrow(ctx, heading, pad, y)
    y += 78
    ctx.font = `800 70px ${DISPLAY}`
    ctx.fillStyle = INK
    for (const line of wrap(ctx, courseName, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 80
    }
    ctx.font = `500 32px ${SANS}`
    ctx.fillStyle = SOFT
    ctx.fillText(fit(ctx, facts, inner), pad, y - 6)

    // the score, as large as the frame allows, centred in what is left
    const bottom = height - pad - 110
    const centre = y + (bottom - y) / 2
    ctx.textAlign = 'center'
    ctx.font = `800 ${format === 'square' ? 300 : 360}px ${DISPLAY}`
    const number = ctx.createLinearGradient(pad, 0, width - pad, 0)
    number.addColorStop(0, PAPER)
    number.addColorStop(1, ACCENT)
    ctx.fillStyle = number
    ctx.fillText(String(score), width / 2, centre + 70)
    ctx.font = `600 30px ${MONO}`
    ctx.fillStyle = LABEL
    ctx.fillText('O T R I   S C O R E', width / 2, centre + 140)
    ctx.font = `700 64px ${DISPLAY}`
    ctx.fillStyle = INK
    ctx.fillText(time, width / 2, centre - (format === 'square' ? 210 : 260))
    if (detail) {
      ctx.font = `500 32px ${SANS}`
      ctx.fillStyle = SOFT
      ctx.fillText(fit(ctx, detail, inner), width / 2, centre + 210)
    }
    ctx.textAlign = 'left'

    footer(ctx, frame, note)
  })
}

/** A runner's index and their best results. `results`: [{ race, detail, score }], best first. */
export function drawRunnerCard(canvas, { format = 'post', heading, name, facts, index, indexLabel, results = [], note }) {
  withFonts(canvas, () => {
    const frame = setup(canvas, format)
    const { ctx, width, height, pad } = frame
    const inner = width - pad * 2
    let y = pad + (format === 'story' ? 160 : 20)

    eyebrow(ctx, heading, pad, y)
    y += 78
    ctx.font = `800 76px ${DISPLAY}`
    ctx.fillStyle = INK
    for (const line of wrap(ctx, name, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 84
    }
    if (facts) {
      ctx.font = `500 32px ${SANS}`
      ctx.fillStyle = SOFT
      ctx.fillText(fit(ctx, facts, inner), pad, y - 8)
    }

    // the rows of results sit above the footer; the index takes what is left between
    const rows = results.slice(0, format === 'square' ? 2 : 3)
    const rowHeight = format === 'story' ? 132 : 112
    const listTop = height - pad - 96 - rows.length * rowHeight
    const centre = y + (listTop - y) / 2
    const size = format === 'square' ? 220 : format === 'story' ? 340 : 280
    ctx.textAlign = 'center'
    ctx.font = `800 ${size}px ${DISPLAY}`
    const number = ctx.createLinearGradient(pad, 0, width - pad, 0)
    number.addColorStop(0, PAPER)
    number.addColorStop(1, ACCENT)
    ctx.fillStyle = number
    ctx.fillText(index == null ? '—' : String(index), width / 2, centre + size * 0.3)
    ctx.font = `600 28px ${MONO}`
    ctx.fillStyle = LABEL
    ctx.fillText(indexLabel.toUpperCase().split('').join(' '), width / 2, centre + size * 0.3 + 62)
    ctx.textAlign = 'left'

    rows.forEach((row, position) => {
      const top = listTop + position * rowHeight
      ctx.fillStyle = FAINT
      ctx.fillRect(pad, top, inner, 2)
      ctx.font = `800 ${Math.round(rowHeight * 0.46)}px ${DISPLAY}`
      ctx.fillStyle = ACCENT
      ctx.textAlign = 'right'
      const score = row.score == null ? '' : String(row.score)
      ctx.fillText(score, width - pad, top + rowHeight * 0.64)
      const scoreWidth = ctx.measureText(score).width + 36
      ctx.textAlign = 'left'
      ctx.font = `700 ${Math.round(rowHeight * 0.33)}px ${SANS}`
      ctx.fillStyle = INK
      ctx.fillText(fit(ctx, row.race, inner - scoreWidth), pad, top + rowHeight * 0.46)
      ctx.font = `400 ${Math.round(rowHeight * 0.23)}px ${MONO}`
      ctx.fillStyle = SOFT
      ctx.fillText(fit(ctx, row.detail, inner - scoreWidth), pad, top + rowHeight * 0.8)
    })

    footer(ctx, frame, note)
  })
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not draw the image'))), 'image/png'))
}
