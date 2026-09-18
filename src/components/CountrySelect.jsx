import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(en)

// Every country by its English name, valued as the ISO 3166-1 alpha-3 code the API and the
// result files use. Organizers pick a name; nobody has to know that Thailand is "THA".
const OPTIONS = Object.entries(countries.getNames('en', { select: 'official' }))
  .map(([alpha2, name]) => ({ code: countries.alpha2ToAlpha3(alpha2), name }))
  .filter((option) => option.code)
  .sort((a, b) => a.name.localeCompare(b.name))

/** English name for an ISO alpha-3 code, or the code itself when unknown. */
export function countryName(code) {
  if (!code) return ''
  const alpha2 = countries.alpha3ToAlpha2(String(code).toUpperCase())
  return (alpha2 && countries.getName(alpha2, 'en', { select: 'official' })) || code
}

export default function CountrySelect({ id, value, onChange, className = '', placeholder = 'Choose a country' }) {
  return (
    <select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {option.name}
        </option>
      ))}
    </select>
  )
}
