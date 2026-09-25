/**
 * The public names of the scoring models. The API names the build on every score
 * (scoring_version); publicly the current one is "OTRI model 0.1.1". Scores under 0.1.0 can still
 * be reproduced, so its name is kept here too.
 */
export const CURRENT_MODEL = { version: '0.11.0-course-standard-model-0.1.1', label: 'OTRI model 0.1.1', short: '0.1.1' }
export const EARLIER_MODELS = {
  '0.10.0-course-standard-vertical': { label: 'OTRI model 0.1.0', short: '0.1.0' },
}

export function modelLabel(version) {
  if (!version || version === CURRENT_MODEL.version) return CURRENT_MODEL.label
  return EARLIER_MODELS[version]?.label ?? `OTRI model build ${version}`
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
  if (!version || version === CURRENT_MODEL.version) return CURRENT_MODEL.short
  return EARLIER_MODELS[version]?.short ?? version
}
