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
    <details className={`rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm ${className}`}>
      <summary className="cursor-pointer font-semibold text-[#0b1220]">
        How your file was read <span className="font-normal text-slate-500">· {shown.length} column{shown.length === 1 ? '' : 's'} used{ignored.length ? `, ${ignored.length} left alone` : ''}</span>
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        {shown.map((field) => (
          <div key={field} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5">
            <dt className="text-slate-500">{LABELS[field]}</dt>
            <dd className="min-w-0 truncate font-mono text-[12px] font-semibold text-[#0b1220]" title={columns[field]}>{columns[field]}</dd>
          </div>
        ))}
      </dl>
      {!columns.rank && <p className="mt-3 text-xs text-slate-500">No position column: positions were worked out from the finish times.</p>}
      {ignored.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Not used: <span className="font-mono">{ignored.join(' · ')}</span>
        </p>
      )}
    </details>
  )
}
