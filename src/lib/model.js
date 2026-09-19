/**
 * The public name of the scoring model. The API names the build on every score
 * (scoring_version, '0.10.0-course-standard-vertical'); publicly it is "OTRI model 0.1.0". A
 * future model gets its own label here.
 */
export const CURRENT_MODEL = { version: '0.10.0-course-standard-vertical', label: 'OTRI model 0.1.0', short: '0.1.0' }

export function modelLabel(version) {
  if (!version || version === CURRENT_MODEL.version) return CURRENT_MODEL.label
  return `OTRI model build ${version}`
}

/**
 * Why a race's finishers carry no score (the API's course_not_scored flag: a vertical race entered
 * without its course file), as a sentence to show; null when the race is scored.
 */
export function notScoredReason(rows) {
  const flag = (rows ?? []).find((row) => row.status === 'finisher' && row.otri_score == null)?.quality_flags?.find((f) => f.startsWith('course_not_scored: '))
  if (!flag) return null
  const text = flag.slice('course_not_scored: '.length)
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}

export function modelShort(version) {
  return !version || version === CURRENT_MODEL.version ? CURRENT_MODEL.short : version
}
