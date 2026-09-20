import identity from '../src/brand/identity.json'
// Share images, drawn in the browser on a <canvas>: a race's top finishers for the organizer, a
// target time for the runner. Nothing is uploaded to make them; the PNG exists only where it is
// drawn. They wear the site's identity: a night-to-graphite ground with the measurement grid and
// faint cyan contour rings behind it, chalk text, the big numbers in volt, mono labels in cyan,
// and the OTRI lockup — the ring, the ridge, the volt summit, then all four letters — at the foot.

export const FORMATS = {
  post: { label: 'Post 4:5', width: 1080, height: 1350, hint: 'Facebook and Instagram feed' },
  square: { label: 'Square 1:1', width: 1080, height: 1080, hint: 'Works everywhere' },
  story: { label: 'Story 9:16', width: 1080, height: 1920, hint: 'Stories, Reels, WhatsApp status' },
}

// The brand colours come from identity.json. The three podium metals have no place in the
// interface, so they live only in the tokens; these mirror src/ui/tokens.css (--gold, --silver,
// --bronze).
const { night: NIGHT, graphite: GRAPHITE, ink: DARK_INK, chalk: CHALK, chalkMuted: CHALK_MUTED, volt: VOLT, cyan: CYAN } = identity.colours
const GOLD = '#e0ae37'
const SILVER = '#9fb0bb'
const BRONZE = '#bd8148'
const MEDALS = [GOLD, SILVER, BRONZE]

// A hex colour with an alpha, for the hairlines and the quiet fills.
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const TEXT = CHALK // everything meant to be read
const SOFT = CHALK_MUTED // the second line: facts, times, the footer note
const FAINT = alpha(CHALK, 0.14) // hairlines, mirroring --line-dark
const ACCENT = VOLT // the number the image is about
const LABEL = CYAN // mono labels, as on the dark panels

// The same three faces as the site (src/ui/fonts.css), with the system fallbacks behind them.
const DISPLAY = "'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif"
const SANS = "'IBM Plex Sans', 'Segoe UI', Roboto, system-ui, sans-serif"
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

// The canvas takes whatever face is loaded when it draws: ask for ours first. The first paint uses
// what is there; when the faces arrive the latest drawing of each canvas is painted again.
let fontsLoaded = false
const fontsReady = (() => {
  if (typeof document === 'undefined' || !document.fonts?.load) {
    fontsLoaded = true
    return Promise.resolve()
  }
  return Promise.all([
    document.fonts.load("700 76px 'Space Grotesk'"),
    document.fonts.load("600 32px 'IBM Plex Sans'"),
    document.fonts.load("400 32px 'IBM Plex Sans'"),
    document.fonts.load("600 26px 'IBM Plex Mono'"),
    document.fonts.load("400 26px 'IBM Plex Mono'"),
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

// The measurement grid, as --grid-dark in src/ui/patterns.css: a fine chalk mesh with every fourth
// line a little brighter. 54 image pixels is the site's 28 CSS px at this scale.
const GRID = 54
function grid(ctx, width, height) {
  ctx.save()
  ctx.lineWidth = 2
  for (const [step, a] of [[GRID, 0.05], [GRID * 4, 0.09]]) {
    ctx.strokeStyle = alpha(CHALK, a)
    ctx.beginPath()
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

// The site's contour tile (src/ui/patterns.css, --topo-dark): a peak seen from above as five
// concentric rings, with three long sweeps below it, in cyan at a tenth of its strength. Built on
// first use, so importing this file needs no canvas.
const CONTOUR_TILE = 560
const CONTOUR_PATHS = [
  'M280 90c86 0 156 66 156 148s-70 148-156 148-156-66-156-148S194 90 280 90Z',
  'M280 125c69 0 125 52 125 116s-56 116-125 116-125-52-125-116 56-116 125-116Z',
  'M283 160c53 0 96 39 96 85s-43 85-96 85-96-39-96-85 43-85 96-85Z',
  'M286 196c37 0 67 26 67 56s-30 56-67 56-67-26-67-56 30-56 67-56Z',
  'M289 232c21 0 38 14 38 30s-17 30-38 30-38-14-38-30 17-30 38-30Z',
  'M-30 470c120-40 200-120 330-150s180-60 290-40',
  'M-30 520c130-40 220-130 350-160s190-60 280-30',
  'M-30 570c140-40 240-140 370-170s200-55 270-20',
]
let contourPaths = null

function contours(ctx, width, height) {
  contourPaths ??= CONTOUR_PATHS.map((d) => new Path2D(d))
  const scale = width / CONTOUR_TILE
  ctx.save()
  ctx.strokeStyle = alpha(CYAN, 0.1)
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
  background.addColorStop(1, GRAPHITE)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  grid(ctx, width, height)
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

// The eyebrow as on the site: a volt tick, then the label in mono.
function eyebrow(ctx, text, x, y) {
  ctx.fillStyle = VOLT
  ctx.fillRect(x, y - 22, 12, 22)
  ctx.font = `600 26px ${MONO}`
  ctx.fillStyle = LABEL
  ctx.fillText(text.toUpperCase().split('').join(' '), x + 26, y)
}

// The OTRI mark from identity.json: a closed ring — the letter O — with a ridge inside it and a
// volt dot on the summit. Drawn at `size` pixels with its top-left at (x, y).
function mark(ctx, x, y, size) {
  const { box, ring, ridge, ridgeWidth, summit } = identity.mark
  const scale = size / box
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = TEXT
  ctx.lineWidth = ring.width
  ctx.beginPath()
  ctx.arc(ring.cx, ring.cy, ring.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = ridgeWidth
  ctx.stroke(new Path2D(ridge))
  ctx.fillStyle = VOLT
  ctx.beginPath()
  ctx.arc(summit.cx, summit.cy, summit.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// All four letters beside the mark, from the Space Grotesk Bold outlines in identity.json: the
// wordmark is never a stand-in for a letter of the mark, and it never waits for a font. It is set
// in the mark's own 48 box, so one size sets the whole lockup.
function wordmark(ctx, x, y, boxSize) {
  const [boxWidth, boxHeight] = identity.wordmark.box
  const scale = boxSize / boxHeight
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = TEXT
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
  // The lockup sits in the band under the rule, at the proportions in identity.json.
  const markSize = 56
  const gap = (identity.lockup.gap * markSize) / identity.lockup.markBox
  const top = y - 62
  mark(ctx, pad, top, markSize)
  const wordWidth = wordmark(ctx, pad + markSize + gap, top, markSize)
  const logoWidth = markSize + gap + wordWidth
  ctx.font = `500 25px ${SANS}`
  ctx.fillStyle = SOFT
  ctx.textAlign = 'right'
  // the note sits on the wordmark's own baseline, 41/48 of the way down the lockup box
  ctx.fillText(fit(ctx, text, width - pad * 2 - logoWidth - 40), width - pad, top + (identity.wordmark.baseline * markSize) / identity.mark.box)
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
    ctx.font = `700 76px ${DISPLAY}`
    ctx.fillStyle = TEXT
    for (const line of wrap(ctx, raceName, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 86
    }
    ctx.font = `400 32px ${SANS}`
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
      ctx.fillStyle = index < 3 ? MEDALS[index] : alpha(CHALK, 0.1)
      ctx.fill()
      ctx.font = `700 ${Math.round(radius * 0.95)}px ${DISPLAY}`
      ctx.fillStyle = index < 3 ? DARK_INK : TEXT
      ctx.textAlign = 'center'
      ctx.fillText(String(row.place), pad + radius, middle + radius * 0.33)
      ctx.textAlign = 'left'

      // score on the right, name and time between
      ctx.font = `700 ${scoreSize}px ${DISPLAY}`
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
        ctx.font = `600 ${nameSize}px ${SANS}`
        ctx.fillStyle = TEXT
        ctx.fillText(fit(ctx, row.name, textWidth - timeWidth), textX, middle + nameSize * 0.34)
      } else {
        ctx.font = `600 ${nameSize}px ${SANS}`
        ctx.fillStyle = TEXT
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
    ctx.font = `700 70px ${DISPLAY}`
    ctx.fillStyle = TEXT
    for (const line of wrap(ctx, courseName, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 80
    }
    ctx.font = `400 32px ${SANS}`
    ctx.fillStyle = SOFT
    ctx.fillText(fit(ctx, facts, inner), pad, y - 6)

    // the score, as large as the frame allows, centred in what is left
    const bottom = height - pad - 110
    const centre = y + (bottom - y) / 2
    ctx.textAlign = 'center'
    ctx.font = `700 ${format === 'square' ? 300 : 360}px ${DISPLAY}`
    ctx.fillStyle = ACCENT
    ctx.fillText(String(score), width / 2, centre + 70)
    ctx.font = `600 30px ${MONO}`
    ctx.fillStyle = LABEL
    ctx.fillText('O T R I   S C O R E', width / 2, centre + 140)
    ctx.font = `700 64px ${DISPLAY}`
    ctx.fillStyle = TEXT
    ctx.fillText(time, width / 2, centre - (format === 'square' ? 210 : 260))
    if (detail) {
      ctx.font = `400 32px ${SANS}`
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
    ctx.font = `700 76px ${DISPLAY}`
    ctx.fillStyle = TEXT
    for (const line of wrap(ctx, name, inner, 2)) {
      ctx.fillText(line, pad, y)
      y += 84
    }
    if (facts) {
      ctx.font = `400 32px ${SANS}`
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
    ctx.font = `700 ${size}px ${DISPLAY}`
    ctx.fillStyle = ACCENT
    ctx.fillText(index == null ? '—' : String(index), width / 2, centre + size * 0.3)
    ctx.font = `600 28px ${MONO}`
    ctx.fillStyle = LABEL
    ctx.fillText(indexLabel.toUpperCase().split('').join(' '), width / 2, centre + size * 0.3 + 62)
    ctx.textAlign = 'left'

    rows.forEach((row, position) => {
      const top = listTop + position * rowHeight
      ctx.fillStyle = FAINT
      ctx.fillRect(pad, top, inner, 2)
      ctx.font = `700 ${Math.round(rowHeight * 0.46)}px ${DISPLAY}`
      ctx.fillStyle = ACCENT
      ctx.textAlign = 'right'
      const score = row.score == null ? '' : String(row.score)
      ctx.fillText(score, width - pad, top + rowHeight * 0.64)
      const scoreWidth = ctx.measureText(score).width + 36
      ctx.textAlign = 'left'
      ctx.font = `600 ${Math.round(rowHeight * 0.33)}px ${SANS}`
      ctx.fillStyle = TEXT
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
