import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import RankBadge, { podiumRowClass } from './RankBadge'
import Flag from './Flag'

// One results table, shared by the public "Score my race" page and the organizer's pre-publish
// review: every finisher and non-finisher, filtered by gender, sorted by any column, and shown a
// page at a time. The rows are whatever POST /score or GET /races/{id}/results returns
// (RunnerScoreOut): rank, first_name, family_name, gender, nationality, bib_number,
// finish_time_seconds, otri_score, status.

const PAGE_SIZES = [25, 50, 100, 250]

function formatHms(totalSeconds) {
  if (totalSeconds == null) return ''
  const s = Math.max(0, Math.round(totalSeconds))
  const pad = (n) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

// A rank is a finishing position (a number) or a code (DNF / DSQ / DNS). Numbers sort ahead of
// codes, so finishers come first however the file listed them.
function rankValue(rank) {
  const n = Number(rank)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

// The five sortable columns. Each returns a comparable value; missing values sort last whichever
// way the column points, so a click never buries every unscored or timeless row at the top.
const SORTERS = {
  rank: (row) => rankValue(row.rank),
  runner: (row) => `${row.family_name ?? ''} ${row.first_name ?? ''}`.trim().toLowerCase(),
  gender: (row) => row.gender || '￿',
  time: (row) => (row.finish_time_seconds == null ? Number.POSITIVE_INFINITY : row.finish_time_seconds),
  score: (row) => (row.otri_score == null ? Number.NEGATIVE_INFINITY : row.otri_score),
}

function compare(a, b, key, direction) {
  const va = SORTERS[key](a)
  const vb = SORTERS[key](b)
  let order
  if (typeof va === 'string' || typeof vb === 'string') order = String(va).localeCompare(String(vb))
  else order = va < vb ? -1 : va > vb ? 1 : 0
  return direction === 'asc' ? order : -order
}

function SortHeader({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.06em] ${active ? 'text-[#0b1220]' : 'text-slate-500 hover:text-[#0b1220]'}`}
      >
        {label}
        {active && (sort.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  )
}

export default function ResultsTable({ rows, initialPageSize = PAGE_SIZES[0] }) {
  const [gender, setGender] = useState('all')
  const [perPage, setPerPage] = useState(initialPageSize)
  const [sort, setSort] = useState({ key: 'rank', direction: 'asc' })
  const [visible, setVisible] = useState(initialPageSize)

  // A new file, a gender filter, a change of page size or a re-sort all start the page window over.
  useEffect(() => setVisible(perPage), [rows, gender, perPage, sort])

  const genders = useMemo(() => new Set((rows ?? []).map((r) => r.gender).filter(Boolean)), [rows])
  const showGender = genders.has('M') || genders.has('F') || genders.size > 1

  const filtered = useMemo(() => {
    const kept = (rows ?? []).filter((r) => gender === 'all' || r.gender === gender)
    return [...kept].sort((a, b) => compare(a, b, sort.key, sort.direction))
  }, [rows, gender, sort])

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'score' ? 'desc' : 'asc' },
    )
  }

  const genderTabs = [
    ['all', 'All'],
    ['F', 'Women'],
    ['M', 'Men'],
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {showGender ? (
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            {genderTabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                aria-pressed={gender === value}
                className={`px-3 py-2 text-xs font-semibold ${gender === value ? 'bg-[#0b1220] text-white' : 'text-slate-500 hover:text-[#0b1220]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[.06em] text-slate-400">{filtered.length} row{filtered.length === 1 ? '' : 's'}</p>
          {filtered.length > PAGE_SIZES[0] && (
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              Per page
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="min-h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <SortHeader label="Rank" sortKey="rank" sort={sort} onSort={toggleSort} />
              <SortHeader label="Runner" sortKey="runner" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">Country</th>
              <SortHeader label="Gender" sortKey="gender" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">Bib</th>
              <SortHeader label="Time" sortKey="time" sort={sort} onSort={toggleSort} />
              <SortHeader label="OTRI" sortKey="score" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((row, index) => (
              <tr key={`${row.runner_id ?? row.bib_number ?? index}-${row.rank}-${index}`} className={`border-b border-slate-100 last:border-b-0 ${podiumRowClass(row.rank) || 'odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/50'}`}>
                <td className="px-3 py-2 font-mono text-xs text-slate-500"><RankBadge rank={row.rank} /></td>
                <td className="px-3 py-2 font-medium text-[#0b1220]">{row.first_name} {row.family_name}</td>
                <td className="px-3 py-2">{row.nationality ? <Flag code={row.nationality} /> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.gender || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.bib_number ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{formatHms(row.finish_time_seconds) || '—'}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">
                  {row.otri_score ?? <span className="font-normal text-slate-400">{row.status === 'finisher' ? 'not scored' : row.status}</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">No rows for this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-slate-500">Showing {Math.min(visible, filtered.length)} of {filtered.length}</p>
          {filtered.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((n) => n + perPage)}
              className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#0b1220] hover:border-blue-300"
            >
              Show {Math.min(perPage, filtered.length - visible)} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
