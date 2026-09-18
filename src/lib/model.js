/**
 * The public name of the scoring model. Internally every curve and measurement change carries
 * its own build id (the API's scoring_version, e.g. '0.8.0-course-standard-power') so stored
 * scores replay exactly; publicly the model in use is simply "OTRI model 0.1.0". Older build ids
 * are shown as what they are: superseded development builds.
 */
export const CURRENT_MODEL = { version: '0.8.0-course-standard-power', label: 'OTRI model 0.1.0', short: '0.1.0' }

export function modelLabel(version) {
  if (!version) return CURRENT_MODEL.label
  if (version === CURRENT_MODEL.version) return CURRENT_MODEL.label
  return `superseded build ${version}`
}

export function modelShort(version) {
  return !version || version === CURRENT_MODEL.version ? CURRENT_MODEL.short : version
}
