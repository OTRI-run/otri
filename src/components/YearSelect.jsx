// The edition a course file is from, picked from a list rather than typed: next year first, for
// the course that is about to be run, then back through the years OTRI could plausibly hold a
// file for. A blank choice is allowed where the year is optional.
const FIRST_YEAR = 1990

export default function YearSelect({ id, value, onChange, className = '', allowBlank = true, blankLabel = 'Not sure' }) {
  const latest = new Date().getFullYear() + 1
  const years = []
  for (let year = latest; year >= FIRST_YEAR; year -= 1) years.push(String(year))
  return (
    <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={className}>
      {allowBlank && <option value="">{blankLabel}</option>}
      {years.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  )
}
