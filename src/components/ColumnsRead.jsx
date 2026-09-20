import './ColumnsRead.css'
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
    <details className={`src-components-columns-read-columns-read-details-1 ${className}`}>
      <summary className="src-components-columns-read-columns-read-summary-2">
        How your file was read <span className="src-components-columns-read-columns-read-span-3">· {shown.length} column{shown.length === 1 ? '' : 's'} used{ignored.length ? `, ${ignored.length} left alone` : ''}</span>
      </summary>
      <dl className="src-components-columns-read-columns-read-dl-4">
        {shown.map((field) => (
          <div key={field} className="src-components-columns-read-columns-read-div-5">
            <dt className="src-components-columns-read-columns-read-dt-6">{LABELS[field]}</dt>
            <dd className="src-components-columns-read-columns-read-dd-7" title={columns[field]}>{columns[field]}</dd>
          </div>
        ))}
      </dl>
      {!columns.rank && <p className="src-components-columns-read-columns-read-p-8">No position column: positions were worked out from the finish times.</p>}
      {ignored.length > 0 && (
        <p className="src-components-columns-read-columns-read-p-9">
          Not used: <span className="src-components-columns-read-columns-read-span-10">{ignored.join(' · ')}</span>
        </p>
      )}
    </details>
  )
}
