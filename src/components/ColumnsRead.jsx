// How a results file was understood: which of its columns each field was read from, and which
// were left alone. Shown after every upload, valid or not, so an organizer sees at a glance whether
// OTRI picked the right columns of their export instead of having to trust it.

const LABELS = {
  rank: 'Position',
  finish_time: 'Finish time',
  family_name: 'Last name',
  first_name: 'First name',
  full_name: 'Name (split into first and last)',
  gender: 'Gender',
  category: 'Gender, from the category',
  status: 'Status',
  birthdate: 'Year of birth',
  birth_year: 'Year of birth',
  nationality: 'Nationality',
  bib_number: 'Bib',
  city: 'City',
  team: 'Team',
  race: 'Race (checked for mixed distances)',
}
const ORDER = Object.keys(LABELS)

export default function ColumnsRead({ columns, ignored = [], className = '' }) {
  const fields = ORDER.filter((field) => columns?.[field])
  if (fields.length === 0) return null
  // A category column is only worth a line when the gender came from it.
  const shown = fields.filter((field) => field !== 'category' || !columns.gender)
  return (
    <details className={`details ${className}`}>
      <summary>
        How your file was read <span className="muted" style={{ fontWeight: 400 }}>· {shown.length} column{shown.length === 1 ? '' : 's'} used{ignored.length ? `, ${ignored.length} left alone` : ''}</span>
      </summary>
      <div className="details__body"><dl className="kv kv--rows columns-read">
        {shown.map((field) => (
          <div key={field}>
            <dt>{LABELS[field]}</dt>
            <dd className="mono small truncate" title={columns[field]}>{columns[field]}</dd>
          </div>
        ))}
      </dl>
      {!columns.rank && <p className="tiny muted mt-3">No position column: positions were worked out from the finish times.</p>}
      {ignored.length > 0 && (
        <p className="tiny muted mt-3">
          Not used: <span className="mono">{ignored.join(' · ')}</span>
        </p>
      )}
    </div></details>
  )
}
