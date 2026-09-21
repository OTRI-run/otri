// How steep a course is, stretch by stretch: the one palette and the one set of classes used by the
// route on the map, the elevation profile and the figures under it, so the three always agree.
//
// The classes follow how trail race profiles are usually drawn (green, yellow, orange, red for
// climbs), with descents in blues so a glance tells up from down. "Steep" starts at 20 %, the grade
// from which OTRI's terrain factor counts a stretch as steep ground (scoring/terrain.py).

export const STEEP_GRADE = 0.2

export const GRADE_CLASSES = [
  { id: 'down-steep', label: 'Steep descent', range: '−20 % and steeper', color: '#1e3a8a', test: (g) => g <= -STEEP_GRADE },
  { id: 'down', label: 'Descent', range: '−20 to −8 %', color: '#3b82f6', test: (g) => g <= -0.08 },
  { id: 'down-gentle', label: 'Gentle descent', range: '−8 to −3 %', color: '#7dd3fc', test: (g) => g <= -0.03 },
  { id: 'flat', label: 'Flat', range: '−3 to 3 %', color: '#4ade80', test: (g) => g < 0.03 },
  { id: 'up-gentle', label: 'Gentle climb', range: '3 to 8 %', color: '#facc15', test: (g) => g < 0.08 },
  { id: 'up', label: 'Climb', range: '8 to 20 %', color: '#f97316', test: (g) => g < STEEP_GRADE },
  { id: 'up-steep', label: 'Steep climb', range: '20 % and steeper', color: '#dc2626', test: () => true },
]

export function gradeClass(grade) {
  return GRADE_CLASSES.find((entry) => entry.test(grade))
}

// Index of the first value >= target in a non-decreasing array.
function lowerBound(values, target) {
  let lo = 0
  let hi = values.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function elevationAt(profile, distances, km) {
  const i = lowerBound(distances, km)
  if (i === 0) return profile[0].elevation
  const a = profile[i - 1]
  const b = profile[i]
  const span = b.distanceKm - a.distanceKm
  const t = span > 0 ? Math.min(1, Math.max(0, (km - a.distanceKm) / span)) : 0
  return a.elevation + (b.elevation - a.elevation) * t
}

/**
 * The course cut into stretches of one steepness class.
 *
 * `profile`: [{ distanceKm, elevation }] (elevation in metres). The grade of each `stepKm` slice is
 * taken over a window around it (`windowKm`), so GPS jitter between two neighbouring points does not
 * paint a flat path red. Returns [{ fromKm, toKm, grade, cls }] with neighbours of the same class
 * merged, or [] when there is no elevation to work with.
 */
export function steepnessStretches(profile, { stepKm = null, windowKm = 0.1 } = {}) {
  const points = (profile ?? []).filter((point) => point.elevation != null && Number.isFinite(point.distanceKm))
  if (points.length < 2) return []
  const distances = points.map((point) => point.distanceKm)
  const total = distances[distances.length - 1]
  if (!(total > 0)) return []
  // About 400 slices on any course: fine enough for a map line, light enough for a 100-miler.
  const step = stepKm ?? Math.min(0.25, Math.max(0.02, total / 400))
  const half = Math.max(windowKm, step) / 2
  const stretches = []
  for (let from = 0; from < total - 1e-9; from += step) {
    const to = Math.min(total, from + step)
    const a = Math.max(0, (from + to) / 2 - half)
    const b = Math.min(total, (from + to) / 2 + half)
    const run = (b - a) * 1000
    const grade = run > 0 ? (elevationAt(points, distances, b) - elevationAt(points, distances, a)) / run : 0
    const cls = gradeClass(grade)
    const last = stretches[stretches.length - 1]
    if (last && last.cls === cls) {
      last.grade = (last.grade * (last.toKm - last.fromKm) + grade * (to - from)) / (to - last.fromKm)
      last.toKm = to
    } else {
      stretches.push({ fromKm: from, toKm: to, grade, cls })
    }
  }
  return stretches
}

/** What the stretches add up to: the share of the distance in each class, and the longest climb. */
export function steepnessSummary(stretches) {
  const total = stretches.length ? stretches[stretches.length - 1].toKm : 0
  if (!(total > 0)) return null
  const share = Object.fromEntries(GRADE_CLASSES.map((entry) => [entry.id, 0]))
  for (const stretch of stretches) share[stretch.cls.id] += (stretch.toKm - stretch.fromKm) / total
  return {
    totalKm: total,
    share,
    steepShare: share['up-steep'] + share['down-steep'],
    climbShare: share['up-gentle'] + share.up + share['up-steep'],
    descentShare: share['down-gentle'] + share.down + share['down-steep'],
  }
}

/**
 * A MapLibre `line-gradient` expression colouring a line by these stretches. The line's source needs
 * `lineMetrics: true`. Each boundary gets two stops a hair apart, so classes meet in a crisp edge
 * instead of blending into colours that mean nothing.
 */
export function lineGradientExpression(stretches, fallback = '#2563eb') {
  const total = stretches.length ? stretches[stretches.length - 1].toKm : 0
  if (!(total > 0)) return fallback
  const stops = []
  let previous = -1
  const push = (at, color) => {
    const value = Math.min(1, Math.max(previous + 1e-6, at))
    stops.push(value, color)
    previous = value
  }
  stretches.forEach((stretch, index) => {
    push(index === 0 ? 0 : stretch.fromKm / total + 1e-5, stretch.cls.color)
    push(stretch.toKm / total, stretch.cls.color)
  })
  return ['interpolate', ['linear'], ['line-progress'], ...stops]
}
