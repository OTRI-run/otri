import { useState } from 'react'
import { Check, Files, X } from 'lucide-react'
import { attachRaceGpx } from '../apiClient'
import { guessRace } from './matchCourseFile'
import { Button } from './ui'

// Admin: attach many course files in one go. Each file is matched to a race by its name (a guess
// the admin can change), sent one at a time through the same endpoint as a single upload — the
// server measures every course, and one at a time is what a small droplet can take — and a race
// nobody owns still needs its permission note (DATA_POLICY.md).

const raceLabel = (race) => `${race.event_name} · ${race.course_name} · ${String(race.event_date ?? '').slice(0, 4)}`

export default function BulkCourses({ races, token, onChanged }) {
  const [rows, setRows] = useState([]) // { id, file, raceId, permission, state: 'ready' | 'sending' | 'done' | 'failed', message }
  const [defaultPermission, setDefaultPermission] = useState('')
  const [running, setRunning] = useState(false)
  const byId = Object.fromEntries(races.map((race) => [race.race_id, race]))
  const update = (id, patch) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  function choose(event) {
    const files = [...(event.target.files ?? [])].filter((file) => /\.gpx$/i.test(file.name))
    event.target.value = ''
    setRows((current) => {
      const taken = new Set(current.map((row) => row.raceId).filter(Boolean))
      const added = files.map((file, i) => {
        const guess = guessRace(file.name, races.filter((race) => !taken.has(race.race_id)))
        if (guess) taken.add(guess.race_id)
        return { id: `${Date.now()}-${i}-${file.name}`, file, raceId: guess?.race_id ?? '', permission: '', state: 'ready', message: null }
      })
      return [...current.filter((row) => row.state !== 'done'), ...added]
    })
  }

  const permissionFor = (row) => (row.permission || defaultPermission).trim()
  function problem(row) {
    const race = byId[row.raceId]
    if (!race) return 'choose the race'
    if (rows.some((other) => other.id !== row.id && other.raceId === row.raceId && other.state !== 'done')) return 'two files for the same race'
    if (!race.is_claimed && !permissionFor(row)) return 'needs a permission note'
    if (row.file.size > 20_000_000) return 'over 20 MB'
    return null
  }
  const sendable = rows.filter((row) => row.state !== 'done' && !problem(row))

  async function run() {
    setRunning(true)
    for (const row of sendable) {
      update(row.id, { state: 'sending', message: null })
      try {
        const race = byId[row.raceId]
        await attachRaceGpx(row.raceId, row.file, token, race.is_claimed ? undefined : permissionFor(row))
        update(row.id, { state: 'done', label: raceLabel(race) })
      } catch (err) {
        update(row.id, { state: 'failed', message: err.message })
      }
    }
    setRunning(false)
    onChanged()
  }

  const done = rows.filter((row) => row.state === 'done').length
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">COURSE FILES · {races.length} RACE{races.length === 1 ? '' : 'S'} WITHOUT ONE</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Choose many .gpx files at once. Each is matched to a race by its file name (event name plus distance works best, e.g. <span className="font-mono">doi-inthanon-trail-50k.gpx</span>); check the match before sending. Only files OTRI may show: an open licence, or the organizer's yes.
          </p>
        </div>
        <label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0b1220] ${running ? 'opacity-60' : ''}`}>
          <Files size={13} /> Choose GPX files
          <input type="file" accept=".gpx" multiple className="sr-only" onChange={choose} disabled={running} />
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <input
            value={defaultPermission}
            onChange={(event) => setDefaultPermission(event.target.value)}
            maxLength={500}
            disabled={running}
            placeholder="Permission for every file without its own note, e.g. “Email from the organizer, 2026-09-18” or “CC BY 4.0, https://…”"
            aria-label="Default course permission"
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
          />
          <ul className="mt-2">
            {rows.map((row) => {
              const issue = row.state === 'done' ? null : problem(row)
              const race = byId[row.raceId]
              return (
                <li key={row.id} className="grid gap-2 border-t border-slate-100 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
                  <span className="min-w-0 truncate font-mono text-slate-600" title={row.file.name}>{row.file.name}</span>
                  {row.state === 'done' ? (
                    <span className="min-w-0 truncate text-[#0b1220]">{row.label}</span>
                  ) : (
                    <select
                      value={row.raceId}
                      onChange={(event) => update(row.id, { raceId: event.target.value, state: 'ready', message: null })}
                      disabled={running}
                      aria-label={`Race for ${row.file.name}`}
                      className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                    >
                      <option value="">Choose the race…</option>
                      {races.map((option) => (
                        <option key={option.race_id} value={option.race_id}>{raceLabel(option)}</option>
                      ))}
                    </select>
                  )}
                  {row.state === 'done' ? (
                    <span />
                  ) : race && !race.is_claimed ? (
                    <input
                      value={row.permission}
                      onChange={(event) => update(row.id, { permission: event.target.value })}
                      maxLength={500}
                      disabled={running || row.state === 'done'}
                      placeholder={defaultPermission ? 'uses the note above' : 'permission note'}
                      aria-label={`Permission for ${row.file.name}`}
                      className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                    />
                  ) : (
                    <span className="text-slate-400">{race ? 'owned race: no note needed' : ''}</span>
                  )}
                  <span className="flex items-center justify-end gap-2 font-mono text-[10px]">
                    {row.state === 'done' && <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={12} /> measured</span>}
                    {row.state === 'sending' && <span className="text-blue-600">measuring…</span>}
                    {row.state === 'failed' && <span className="text-red-600" title={row.message}>failed</span>}
                    {row.state === 'ready' && issue && <span className="text-amber-700">{issue}</span>}
                    {row.state === 'ready' && !issue && <span className="text-slate-500">ready</span>}
                    {!running && row.state !== 'done' && (
                      <button type="button" onClick={() => setRows((current) => current.filter((other) => other.id !== row.id))} aria-label={`Remove ${row.file.name}`} className="text-slate-400 hover:text-red-600">
                        <X size={13} />
                      </button>
                    )}
                  </span>
                  {row.state === 'failed' && <p className="text-red-600 sm:col-span-4">{row.message}</p>}
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button busy={running} disabled={sendable.length === 0} className="min-h-9 px-3 text-xs" onClick={run}>
              {running ? 'Measuring courses…' : `Attach ${sendable.length} course${sendable.length === 1 ? '' : 's'}`}
            </Button>
            <span className="font-mono text-[10px] text-slate-500">
              {done > 0 ? `${done} attached · ` : ''}one at a time; long courses take a few seconds each
            </span>
          </div>
        </>
      )}
    </div>
  )
}
