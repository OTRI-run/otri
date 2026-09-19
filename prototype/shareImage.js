// Share images, drawn in the browser on a <canvas>: a race's top finishers for the organizer, a
// target time for the runner. Nothing is uploaded to make them; the PNG exists only where it is
// drawn, which keeps "Score my race" true to "nothing is kept".

export const FORMATS = {
  post: { label: 'Post 4:5', width: 1080, height: 1350, hint: 'Facebook and Instagram feed' },
  square: { label: 'Square 1:1', width: 1080, height: 1080, hint: 'Works everywhere' },
  story: { label: 'Story 9:16', width: 1080, height: 1920, hint: 'Stories, Reels, WhatsApp status' },
}

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
const INK = '#ffffff'
const SOFT = 'rgba(255,255,255,.72)'
const FAINT = 'rgba(255,255,255,.16)'
const ACCENT = '#67e8f9'
const MEDALS = ['#fbbf24', '#cbd5e1', '#d6a06c']

function setup(canvas, format) {
  const { width, height } = FORMATS[format] ?? FORMATS.post
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#0b1220')
  background.addColorStop(0.55, '#10204a')
  background.addColorStop(1, '#1d4ed8')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  // a soft light in the corner, as on the site's hero
  const glow = ctx.createRadialGradient(width * 0.85, height * 0.12, 0, width * 0.85, height * 0.12, width * 0.7)
  glow.addColorStop(0, 'rgba(56,189,248,.28)')
  glow.addColorStop(1, 'rgba(56,189,248,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
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

function eyebrow(ctx, text, x, y) {
  ctx.font = `600 26px ${MONO}`
  ctx.fillStyle = ACCENT
  ctx.fillText(text.toUpperCase().split('').join(' '), x, y)
}

function footer(ctx, { width, height, pad }, text) {
  const y = height - pad
  ctx.strokeStyle = FAINT
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, y - 66)
  ctx.lineTo(width - pad, y - 66)
  ctx.stroke()
  // the mark: a ring with a ridge line, then the word
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(pad + 24, y - 14, 21, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pad + 9, y - 6)
  ctx.lineTo(pad + 19, y - 15)
  ctx.lineTo(pad + 25, y - 10)
  ctx.lineTo(pad + 33, y - 20)
  ctx.lineTo(pad + 40, y - 13)
  ctx.stroke()
  ctx.font = `800 40px ${SANS}`
  ctx.fillStyle = INK
  ctx.fillText('OTRI', pad + 62, y)
  ctx.font = `500 25px ${SANS}`
  ctx.fillStyle = SOFT
  ctx.textAlign = 'right'
  ctx.fillText(fit(ctx, text, width - pad * 2 - 190), width - pad, y - 4)
  ctx.textAlign = 'left'
}

/** A race's top finishers. `rows`: [{ place, name, time, score }], already cut to the number wanted. */
export function drawLeaderboard(canvas, { format = 'post', raceName, facts, heading, rows, note }) {
  const frame = setup(canvas, format)
  const { ctx, width, height, pad } = frame
  const inner = width - pad * 2
  let y = pad + (format === 'story' ? 120 : 20)

  eyebrow(ctx, heading, pad, y)
  y += 78
  ctx.font = `800 76px ${SANS}`
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
  const rowHeight = Math.min(150, (bottom - y) / rows.length)
  // Ten rows on a square leave no room for two lines each: name and time then share one line.
  const compact = rowHeight < 88
  const nameSize = compact ? Math.max(24, Math.min(34, rowHeight * 0.5)) : Math.max(30, Math.min(46, rowHeight * 0.34))
  const scoreSize = compact ? Math.max(28, Math.min(44, rowHeight * 0.62)) : Math.max(40, Math.min(68, rowHeight * 0.5))
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
    const radius = Math.min(34, rowHeight * (compact ? 0.4 : 0.3))
    ctx.beginPath()
    ctx.arc(pad + radius, middle, radius, 0, Math.PI * 2)
    ctx.fillStyle = index < 3 ? MEDALS[index] : 'rgba(255,255,255,.12)'
    ctx.fill()
    ctx.font = `800 ${Math.round(radius * 0.95)}px ${SANS}`
    ctx.fillStyle = index < 3 ? '#0b1220' : INK
    ctx.textAlign = 'center'
    ctx.fillText(String(row.place), pad + radius, middle + radius * 0.33)
    ctx.textAlign = 'left'

    // score on the right, name and time between
    ctx.font = `800 ${scoreSize}px ${SANS}`
    ctx.fillStyle = ACCENT
    ctx.textAlign = 'right'
    const scoreText = row.score == null ? '' : String(row.score)
    ctx.fillText(scoreText, width - pad, middle + scoreSize * 0.34)
    const scoreWidth = scoreText ? ctx.measureText(scoreText).width + 36 : 0
    ctx.textAlign = 'left'

    const textX = pad + radius * 2 + 30
    const textWidth = width - pad - scoreWidth - textX
    if (compact) {
      ctx.font = `500 ${Math.round(nameSize * 0.8)}px ${MONO}`
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
      ctx.font = `500 ${Math.round(nameSize * 0.68)}px ${MONO}`
      ctx.fillStyle = SOFT
      ctx.fillText(row.time, textX, middle + nameSize * 0.86)
    }
  })

  footer(ctx, frame, note)
}

/** One runner's target (or result) on one course. */
export function drawScoreCard(canvas, { format = 'post', heading, courseName, facts, time, score, detail, note }) {
  const frame = setup(canvas, format)
  const { ctx, width, height, pad } = frame
  const inner = width - pad * 2
  let y = pad + (format === 'story' ? 160 : 20)

  eyebrow(ctx, heading, pad, y)
  y += 78
  ctx.font = `800 70px ${SANS}`
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
  ctx.font = `800 ${format === 'square' ? 300 : 360}px ${SANS}`
  const number = ctx.createLinearGradient(pad, 0, width - pad, 0)
  number.addColorStop(0, '#ffffff')
  number.addColorStop(1, ACCENT)
  ctx.fillStyle = number
  ctx.fillText(String(score), width / 2, centre + 70)
  ctx.font = `600 30px ${MONO}`
  ctx.fillStyle = ACCENT
  ctx.fillText('O T R I   S C O R E', width / 2, centre + 140)
  ctx.font = `700 64px ${SANS}`
  ctx.fillStyle = INK
  ctx.fillText(time, width / 2, centre - (format === 'square' ? 210 : 260))
  if (detail) {
    ctx.font = `500 32px ${SANS}`
    ctx.fillStyle = SOFT
    ctx.fillText(fit(ctx, detail, inner), width / 2, centre + 210)
  }
  ctx.textAlign = 'left'

  footer(ctx, frame, note)
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not draw the image'))), 'image/png'))
}
