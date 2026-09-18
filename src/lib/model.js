/**
 * The public name of the scoring model. Internally every curve, measurement and confidence change
 * carries its own build id (the API's scoring_version, e.g. '0.9.0-course-standard-domain-gated')
 * so stored scores replay exactly; publicly the model in use is simply "OTRI model 0.1.0". Older
 * build ids are shown by their build id.
 */
export const CURRENT_MODEL = { version: '0.9.0-course-standard-domain-gated', label: 'OTRI model 0.1.0', short: '0.1.0' }

// Builds that give every course and time the same score as the current one, so carry its name:
// 0.9.0 changed only when a score is marked Low confidence (OEP-002).
const SAME_SCORE_BUILDS = new Set([CURRENT_MODEL.version, '0.8.0-course-standard-power'])

export function modelLabel(version) {
  if (!version || SAME_SCORE_BUILDS.has(version)) return CURRENT_MODEL.label
  return `OTRI model build ${version}`
}

/**
 * Why a race's finishers carry no score (the API's course_not_scored flag: an uphill-only course
 * the model does not score yet), as a sentence to show; null when the race is scored.
 */
export function notScoredReason(rows) {
  const flag = (rows ?? []).find((row) => row.status === 'finisher' && row.otri_score == null)?.quality_flags?.find((f) => f.startsWith('course_not_scored: '))
  if (!flag) return null
  const text = flag.slice('course_not_scored: '.length)
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}

export function modelShort(version) {
  return !version || SAME_SCORE_BUILDS.has(version) ? CURRENT_MODEL.short : version
}
