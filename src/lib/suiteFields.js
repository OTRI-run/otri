// Field cleaning in the browser, the twin of api/suite_fields.py: what is typed is corrected as
// soon as the field is left, and the correction is shown beside it, so the organizer sees what
// will be stored before pressing anything. The server cleans again; this is the early warning.
import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(en)

const PARTICLES = new Set(['van', 'der', 'den', 'de', 'la', 'le', 'du', 'des', 'von', 'zu', 'da', 'di', 'del', 'della', 'dos', 'das', 'y', 'e', 'bin', 'binti', 'al', 'el'])

export function squeeze(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function titleWord(word, first) {
  if (!word) return word
  if (!first && PARTICLES.has(word.toLowerCase())) return word.toLowerCase()
  let out = word
    .toLowerCase()
    .split("'")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("'")
  const mc = /^(mc|mac|o')(.)(.*)$/i.exec(word)
  if (mc && word.length > mc[1].length + 1) out = mc[1].charAt(0).toUpperCase() + mc[1].slice(1).toLowerCase() + mc[2].toUpperCase() + mc[3].toLowerCase()
  return out
}

/** ALL CAPS or all lower-case names re-cased; a mixed-case name is somebody's own spelling. */
export function cleanName(value) {
  const raw = squeeze(value)
  if (!raw) return { value: '', note: null }
  const letters = raw.replace(/[^\p{L}]/gu, '')
  const allUpper = letters && letters === letters.toUpperCase()
  const allLower = letters && letters === letters.toLowerCase()
  if (!letters || (!allUpper && !allLower)) return { value: raw, note: null }
  const cased = raw
    .split(' ')
    .map((word, wi) =>
      word
        .split('-')
        .map((part, pi) => titleWord(part, wi === 0 && pi === 0))
        .join('-'),
    )
    .join(' ')
  return { value: cased, note: cased !== raw ? `Re-cased from “${raw}”` : null }
}

const GENDER_WORDS = {
  M: ['m', 'male', 'man', 'men', 'h', 'homme', 'hombre', 'männlich', 'maennlich', 'mann', 'herren', 'uomo', 'masculino', 'maschile', 'mannen', 'ชาย'],
  F: ['f', 'female', 'woman', 'women', 'w', 'femme', 'mujer', 'weiblich', 'frau', 'damen', 'donna', 'femenino', 'femminile', 'vrouw', 'vrouwen', 'หญิง'],
  X: ['x', 'd', 'divers', 'diverse', 'nb', 'non-binary', 'nonbinary', 'other', 'prefer not to say'],
}

export function cleanGender(value) {
  const raw = squeeze(value).toLowerCase()
  if (!raw) return { value: 'X', note: null }
  for (const [code, words] of Object.entries(GENDER_WORDS)) if (words.includes(raw)) return { value: code, note: raw.toUpperCase() === code ? null : `“${squeeze(value)}” read as ${code}` }
  return { value: 'X', note: `“${squeeze(value)}” is not a gender OTRI knows: stored as X` }
}

/** A four-digit year, also out of a full date; nothing from two digits or an implausible age. */
export function cleanBirthYear(value, today = new Date()) {
  const raw = squeeze(value)
  if (!raw) return { value: '', note: null }
  const match = /(?<!\d)(18\d{2}|19\d{2}|20\d{2})(?!\d)/.exec(raw)
  if (!match) return { value: '', note: `“${raw}” has no year in it` }
  const year = Number(match[1])
  const thisYear = today.getFullYear()
  if (year < thisYear - 110 || year > thisYear - 5) return { value: '', note: `${year} is not a plausible year of birth` }
  return { value: String(year), note: raw === String(year) ? null : `“${raw}” read as ${year}` }
}

/** ISO alpha-3 from a code, an alpha-2 or an English country name. */
export function cleanNationality(value) {
  const raw = squeeze(value).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim()
  if (!raw) return { value: '', note: null }
  const upper = raw.toUpperCase()
  if (upper.length === 3 && countries.alpha3ToAlpha2(upper)) return { value: upper, note: null }
  if (upper.length === 2 && countries.alpha2ToAlpha3(upper)) return { value: countries.alpha2ToAlpha3(upper), note: `“${raw}” → ${countries.alpha2ToAlpha3(upper)}` }
  const alpha2 = countries.getAlpha2Code(raw, 'en')
  if (alpha2) return { value: countries.alpha2ToAlpha3(alpha2), note: `“${raw}” → ${countries.alpha2ToAlpha3(alpha2)}` }
  return { value: raw.slice(0, 3).toUpperCase(), note: `“${raw}” is not a country OTRI knows; the server will leave it empty` }
}

/** Upper-case, no spaces, no leading zeros on a number: "007" and "7" are one bib. */
export function cleanBib(value) {
  const raw = String(value ?? '').replace(/\s+/g, '').toUpperCase().replace(/^#/, '')
  if (!raw) return { value: '', note: null }
  if (/^\d+$/.test(raw)) {
    const stripped = raw.replace(/^0+(?=\d)/, '')
    return { value: stripped, note: stripped !== raw ? `“${raw}” stored as ${stripped}` : null }
  }
  return { value: raw.slice(0, 12), note: null }
}

export function cleanEmail(value) {
  const raw = squeeze(value).toLowerCase()
  if (!raw) return { value: '', note: null }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return { value: raw, note: `“${raw}” does not look like an email address` }
  return { value: raw, note: null }
}

/** Minutes from "240", "4h", "4h30", "4:30", "90 min"; empty for nothing. */
export function cleanMinutes(value) {
  const raw = squeeze(value).toLowerCase()
  if (!raw) return { value: '', note: null }
  const match = /^(?:(\d{1,3})\s*[h:]\s*(\d{1,2})?\s*(?:m|min)?|(\d{1,4})\s*(?:m|min|minutes?)?)$/.exec(raw)
  if (!match) return { value: raw, note: `“${raw}” is not a time OTRI can read: minutes, or 4h30` }
  const minutes = match[1] != null ? Number(match[1]) * 60 + Number(match[2] || 0) : Number(match[3])
  return { value: String(minutes), note: raw === String(minutes) ? null : `“${raw}” read as ${minutes} minutes (${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')})` }
}

/** Kilometres from "18.5", "18,5", "18.5 km", "18500 m". */
export function cleanKm(value) {
  const original = squeeze(value)
  const raw = original.toLowerCase().replace(',', '.')
  if (!raw) return { value: '', note: null }
  const match = /^([\d.]+)\s*(km|k|m)?$/.exec(raw)
  if (!match) return { value: original, note: `“${original}” is not a distance OTRI can read` }
  let number = Number(match[1])
  if (match[2] === 'm') number /= 1000
  number = Math.round(number * 100) / 100
  return { value: String(number), note: original === String(number) ? null : `“${original}” read as ${number} km` }
}

export function cleanPhoneText(value) {
  return { value: squeeze(value), note: null }
}
