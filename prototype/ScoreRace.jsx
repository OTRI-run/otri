import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, Download, Share2, FileSpreadsheet, Map as MapIcon, ShieldCheck, Timer, Trophy, XCircle } from 'lucide-react'
import { scoreRace } from './apiClient'
import { saveHandoff } from './publishHandoff'
import { ShareResults } from './SharePanel'
import RaceNameList, { RACE_NAME_LIST } from '../src/components/RaceNameList'
import CourseMap from '../src/components/CourseMap'
import Flag from '../src/components/Flag'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import { modelLabel } from '../src/lib/model'

// Score my race: a course and a results file in, the validated and scored result list out. No
// account (POST /score); the same validation and scoring as a published race, which is one click further.

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'
// The example race: a synthetic course and 100 made-up finishers (scripts/generate_example_race.py).
const EXAMPLE = {
  name: 'OTRI Example Trail 24K',
  course: { url: '../examples/otri-example-course.gpx', file: 'otri-example-course.gpx', type: 'application/gpx+xml' },
  results: { url: '../examples/otri-example-results.csv', file: 'otri-example-results.csv', type: 'text/csv' },
}
const EXAMPLE_ROWS_SHOWN = 8

async function fetchExample({ url, file, type }) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status}).`)
  const text = await response.text()
  return { text, file: new File([text], file, { type }) }
}
const ROWS_AT_ONCE = 100

function formatHms(totalSeconds) {
  if (totalSeconds == null) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${Math.floor(totalSeconds / 3600)}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`
}

// Why a score carries Low confidence, in words. The machine-readable flag stays in the API answer.
const FLAG_TEXT = {
  elevation_not_dem_sourced: 'The climb comes from the course file, not from verified terrain data, so the scores can shift slightly with a better file.',
  route_not_reproducible: 'The course file is too sparse or broken in places to measure the same way twice.',
  gradient_domain_exceeded: 'Much of this course is steeper than the ground the model was calibrated on.',
  course_below_validated_range: 'This course is shorter than the range the model has been validated on.',
  course_not_scored: 'Uphill-only courses are not scored yet: the list carries finish times only.',
}

const flagKey = (flag) => flag.split(':')[0].trim()

// A spreadsheet runs a cell that starts with = + - or @ as a formula; names come from a file.
function csvCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function scoresCsv(result) {
  const header = ['rank', 'bib_number', 'family_name', 'first_name', 'gender', 'nationality', 'finish_time', 'otri_score', 'confidence', 'status', 'scoring_version']
  const lines = result.scores.map((row) =>
    [row.rank, row.bib_number, row.family_name, row.first_name, row.gender, row.nationality, formatHms(row.finish_time_seconds), row.otri_score, row.confidence, row.status, row.scoring_version].map(csvCell).join(','),
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function FilePick({ icon: Icon, label, hint, accept, file, onFile, disabled }) {
  return (
    <label className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition ${file ? 'border-blue-300 bg-blue-50/50' : 'border-slate-300 bg-white hover:border-blue-300'} ${disabled ? 'opacity-60' : ''}`}>
      <Icon size={18} className="shrink-0 text-blue-600" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#0b1220]">{file ? file.name : label}</span>
        <span className="block text-xs text-slate-500">{file ? 'Choose another file' : hint}</span>
      </span>
      <input type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    </label>
  )
}

function Issues({ issues, kind }) {
  return (
    <ul className="mt-2 max-h-64 space-y-1.5 overflow-auto text-sm">
      {issues.map((issue, index) => (
        <li key={index} className={kind === 'error' ? 'text-red-700' : 'text-amber-800'}>
          {issue.row != null && <span className="font-mono text-xs">Row {issue.row}</span>}
          {issue.field && <span className="font-mono text-xs">{issue.row != null ? ' · ' : ''}{issue.field.replace(/_/g, ' ')}</span>}
          {issue.row != null || issue.field ? ': ' : ''}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tracking-[-.03em] text-[#0b1220]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{sub}</p>}
    </div>
  )
}

function Scored({ result, fileStem, gpxText, children }) {
  const units = useUnits()
  const [visible, setVisible] = useState(ROWS_AT_ONCE)
  const [sharing, setSharing] = useState(false)
  const { course, summary, scores } = result
  // The reasons in words; the full machine-readable list stays one click away.
  const flags = course.quality_flags ?? []
  const reasons = useMemo(() => [...new Set(flags.map(flagKey).filter((key) => FLAG_TEXT[key]).map((key) => FLAG_TEXT[key]))], [flags])
  const name = `${fileStem || 'otri'}-scored`

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[.08em] text-emerald-700">
            <CheckCircle2 size={13} /> VALID · {summary.finishers} FINISHER{summary.finishers === 1 ? '' : 'S'} SCORED
          </p>
          <h2 className="mt-1 truncate text-2xl font-bold tracking-[-.03em] text-[#0b1220]">{course.name ?? 'Your race'}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.finishers > 0 && (
            <button type="button" onClick={() => setSharing((open) => !open)} aria-expanded={sharing} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">
              <Share2 size={14} /> {sharing ? 'Close sharing' : 'Share the podium'}
            </button>
          )}
          <button type="button" onClick={() => download(`${name}.csv`, 'text/csv;charset=utf-8', scoresCsv(result))} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0b1220] px-4 text-xs font-semibold text-white">
            <Download size={14} /> Download CSV
          </button>
          <button type="button" onClick={() => download(`${name}.json`, 'application/json', JSON.stringify(result, null, 2))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-[#0b1220] hover:border-blue-300">
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {sharing && (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
          <p className="text-base font-bold tracking-[-.02em] text-[#0b1220]">An image and a post for your race's channels</p>
          <p className="mt-1 mb-4 text-sm text-slate-600">Pick who to show. The picture and the text follow, ready for Facebook, Instagram or WhatsApp.</p>
          <ShareResults raceName={course.name} distanceKm={course.distance_km} elevationGainM={course.elevation_gain_m} scores={scores} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="COURSE" value={`${formatDistance(course.distance_km, units)} · ${formatElevation(course.elevation_gain_m, units, { sign: '+' })}`} sub="measured from your course file" />
        <Tile label="CONFIDENCE" value={course.confidence ?? 'n/a'} sub={course.confidence === 'High' ? 'course verified against terrain data' : 'see the notes below'} />
        <Tile label="BEST · MEDIAN" value={summary.best_score != null ? `${summary.best_score} · ${summary.median_score}` : 'not scored'} sub={summary.non_finishers > 0 ? `${summary.non_finishers} did not finish` : 'every listed runner finished'} />
        <Tile label="MODEL" value={modelLabel(result.scoring_version)} sub={result.scoring_version} />
      </div>

      {gpxText && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <CourseMap gpxText={gpxText} measurement={result.measurement} className="p-3" />
        </div>
      )}

      {reasons.length > 0 && (
        <div className="mt-3 flex gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <ul className="min-w-0 space-y-1">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {flags.length > 0 && (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#0b1220]">{flags.length} quality flag{flags.length === 1 ? '' : 's'} from the course measurement and the model</summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-500">
            {flags.map((flag) => (
              <li key={flag} className="break-words">{flag}</li>
            ))}
          </ul>
        </details>
      )}
      {result.warnings.length > 0 && (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#0b1220]">{result.warnings.length} note{result.warnings.length === 1 ? '' : 's'} on the results file (nothing that blocks scoring)</summary>
          <Issues issues={result.warnings} kind="warning" />
        </details>
      )}

      {children}

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Runner</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Gender</th>
              <th className="px-3 py-2">Bib</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2 text-right">OTRI</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, visible).map((row, index) => (
              <tr key={`${index}-${row.rank}`} className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/50">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.rank}</td>
                <td className="px-3 py-2 font-medium text-[#0b1220]">{row.first_name} {row.family_name}</td>
                <td className="px-3 py-2">{row.nationality ? <Flag code={row.nationality} /> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.gender || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.bib_number ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{formatHms(row.finish_time_seconds) || '—'}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">{row.otri_score ?? <span className="font-normal text-slate-400">{row.status === 'finisher' ? 'not scored' : row.status}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {scores.length > visible && (
          <button type="button" onClick={() => setVisible((n) => n + 500)} className="w-full border-t border-slate-100 px-3 py-2.5 text-xs font-semibold text-blue-600 hover:bg-slate-50">
            Show more · {scores.length - visible} rows left (the download has them all)
          </button>
        )}
      </div>
    </section>
  )
}

// Nothing to hand? Try the whole thing on a made-up race: one press fills in the course and the
// results, and the rows can be looked at first, which is also the quickest way to see the format.
function ExampleRace({ onUse, busy, rowsOpen, onToggleRows }) {
  const [state, setState] = useState('idle') // idle | loading | failed

  async function use() {
    setState('loading')
    try {
      const [course, results] = await Promise.all([fetchExample(EXAMPLE.course), fetchExample(EXAMPLE.results)])
      onUse({ gpx: course.file, results: results.file, raceName: EXAMPLE.name })
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="mt-7 min-w-0 max-w-[620px] rounded-xl border border-slate-200 bg-white/80">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">NO FILES AT HAND?</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">Try it on a made-up race: a 24 km course and 100 finishers called John Doe and Max Mustermann, plus a few who did not finish.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={use} disabled={busy || state === 'loading'} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0b1220] px-3 text-xs font-semibold text-white disabled:opacity-60">
            {state === 'loading' ? 'Loading…' : 'Use the example race'}
          </button>
          <button type="button" onClick={onToggleRows} aria-expanded={rowsOpen} aria-controls="example-rows" className="text-xs font-semibold text-blue-600 hover:underline">
            {rowsOpen ? 'Hide' : 'Show'} rows
          </button>
          <a href={EXAMPLE.results.url} download={EXAMPLE.results.file} className="text-xs font-semibold text-blue-600 no-underline hover:underline">CSV</a>
          <a href={EXAMPLE.course.url} download={EXAMPLE.course.file} className="text-xs font-semibold text-blue-600 no-underline hover:underline">GPX</a>
        </div>
      </div>
      {state === 'failed' && <p className="border-t border-slate-200 px-4 py-2 text-xs text-red-600">The example files could not be loaded. Try again in a moment.</p>}
    </div>
  )
}

// The example results file, laid out as a spreadsheet would show it. Ten columns do not fit beside
// the form, so it takes the page's full width underneath.
function ExampleRows({ onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    fetchExample(EXAMPLE.results)
      .then(({ text }) => setRows(text.trim().split('\n').map((line) => line.split(','))))
      .catch(() => setRows([]))
  }, [])

  const header = rows?.[0] ?? []
  const body = rows?.slice(1) ?? []
  const shown = [...body.slice(0, EXAMPLE_ROWS_SHOWN), ...body.slice(-2)]
  return (
    <div id="example-rows" className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)] lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">THE EXAMPLE RESULTS FILE · {EXAMPLE.results.file}</p>
          <p className="mt-0.5 text-sm text-slate-600">A finisher needs a rank, a time, a name and a gender; DNF and DNS rows carry their status instead of a time. Any file laid out like this passes.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0b1220] hover:border-blue-300">Hide rows</button>
      </div>
      {rows === null ? (
        <p className="px-5 py-4 text-sm text-slate-500">Loading the rows…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-red-600">The example file could not be loaded. Try again in a moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[12px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-[.06em] text-slate-500">
                {header.map((cell) => (
                  <th key={cell} className="whitespace-nowrap px-4 py-2.5 font-semibold">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <Fragment key={index}>
                  {index === EXAMPLE_ROWS_SHOWN && (
                    <tr className="border-t border-slate-100 bg-white text-slate-400">
                      <td colSpan={header.length} className="px-4 py-2 text-center">… {body.length - shown.length} more rows …</td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-100 text-[#0b1220] odd:bg-white even:bg-slate-50/70">
                    {row.map((cell, column) => (
                      <td key={column} className="whitespace-nowrap px-4 py-2">{cell || <span className="text-slate-300">—</span>}</td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// The invitation after a race has been scored: keep it. The two files go to the organizer app
// through this browser (publishHandoff.js), so nothing is uploaded twice and nothing is sent
// anywhere until the organizer is signed in.
function PublishInvite({ result, files }) {
  const [state, setState] = useState('idle') // idle | saving | failed
  const finishers = result.summary.finishers

  async function publish() {
    setState('saving')
    try {
      await saveHandoff({ gpx: files.gpx, results: files.results, raceName: result.course.name ?? '', course: { distance_km: result.course.distance_km, elevation_gain_m: result.course.elevation_gain_m }, summary: result.summary })
      window.location.href = 'organizer/#/publish'
    } catch {
      setState('failed')
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1220] via-[#10204a] to-blue-700 p-6 text-white shadow-[0_18px_44px_rgba(15,23,42,.18)] sm:p-8">
      <div className="grid min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[.1em] text-blue-200">THE HARD PART IS DONE</p>
          <h2 className="mt-2 text-[clamp(24px,3.2vw,34px)] font-bold leading-[1.1] tracking-[-.04em]">
            Give {finishers === 1 ? 'your finisher' : `your ${finishers} finishers`} a page to find their score.
          </h2>
          <p className="mt-3 max-w-[620px] text-sm leading-6 text-blue-100">
            Publish this race on OTRI: the course and these results come with you, so there is nothing to upload again. It is free, there is no approval to wait for, and you can take it down whenever you like.
          </p>
          <ul className="mt-5 grid gap-x-6 gap-y-2 text-sm text-white sm:grid-cols-2">
            {[
              [Trophy, 'A public leaderboard with every score explained'],
              [MapIcon, 'Your course on a map, measured and verified'],
              [Timer, 'Runners try a target time for next year'],
              [Code2, 'The calculator on your own website, one line of HTML'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-cyan-300" /> {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 lg:w-[270px]">
          <button type="button" onClick={publish} disabled={state === 'saving'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#0b1220] shadow-lg transition hover:bg-blue-50 disabled:opacity-70">
            {state === 'saving' ? 'One moment…' : <>Publish this race <ArrowRight size={16} /></>}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-blue-200">Two minutes: an email address, the race date, done. Nothing is public until you press Publish.</p>
          {state === 'failed' && (
            <p className="mt-2 text-center text-xs text-amber-200">
              This browser would not keep the files. <a href="organizer/" className="font-semibold text-white underline">Create the account</a> and add the two files there.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default function ScoreRace() {
  const [gpx, setGpx] = useState(null)
  const [results, setResults] = useState(null)
  const [raceName, setRaceName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [scoredFiles, setScoredFiles] = useState(null) // the two files the result on screen came from
  const [rowsOpen, setRowsOpen] = useState(false)
  useEffect(() => {
    if (rowsOpen) setTimeout(() => document.getElementById('example-rows')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }, [rowsOpen])

  const missing = !gpx ? 'Choose the course file.' : !results ? 'Choose the results file.' : null

  function useExample(example) {
    setError(null)
    setResult(null)
    setGpx(example.gpx)
    setResults(example.results)
    setRaceName(example.raceName)
  }

  // The answer appears below the form: bring it into view instead of leaving the visitor at the top.
  useEffect(() => {
    if (result) document.getElementById('score-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  // #score?example=1 scores the example race straight away: a link that shows the result, not the form.
  useEffect(() => {
    if (!/[?&]example=1/.test(window.location.hash)) return
    Promise.all([fetchExample(EXAMPLE.course), fetchExample(EXAMPLE.results)])
      .then(([course, list]) => {
        const example = { gpx: course.file, results: list.file, raceName: EXAMPLE.name }
        useExample(example)
        return score(example)
      })
      .catch((err) => setError(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event) {
    event.preventDefault()
    return score({ gpx, results, raceName: raceName.trim() })
  }

  async function score({ gpx, results, raceName }) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await scoreRace({ results, gpx, raceName }))
      setScoredFiles({ gpx, results, gpxText: await gpx.text() })
    } catch (err) {
      setError(err.status === 429 ? 'That was a lot of scoring in one minute. Wait a minute and try again.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

  return (
    <>
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_78%_28%,rgba(37,99,235,.12),transparent_30%),linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} grid min-w-0 items-start gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-x-16 lg:gap-y-6 lg:py-16`}>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
              OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> SCORE MY RACE
            </div>
            <h1 className="mt-5 max-w-[640px] text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-.06em] text-[#0b1220]">
              Your results,
              <br />
              <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">scored in a minute.</em>
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-7 text-slate-600">
              Bring the course and the results file of any trail race. OTRI measures the course, checks the file, and gives every finisher a score you can explain: the same open model as every race here, with no account and no approval.
            </p>
            <ExampleRace onUse={useExample} busy={busy} rowsOpen={rowsOpen} onToggleRows={() => setRowsOpen((open) => !open)} />
          </div>

          <form onSubmit={submit} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,.07)] sm:p-6">
            <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">1 · THE COURSE</p>
            <div className="mt-2">
              <FilePick icon={MapIcon} label="Choose the course (GPX)" hint="The official track of the race, up to 20 MB" accept=".gpx,application/gpx+xml" file={gpx} onFile={setGpx} disabled={busy} />
              <p className="mt-2 text-xs text-slate-500">A score rests on where the climbing is, so it needs the track: a distance and a climb figure are not enough.</p>
            </div>

            <p className="mt-5 font-mono text-[9px] tracking-[.08em] text-slate-500">2 · THE RESULTS</p>
            <div className="mt-2">
              <FilePick icon={FileSpreadsheet} label="Choose the results (CSV or Excel)" hint="Rank, time, last name, first name, gender. Column names in several languages are recognised." accept=".csv,.xlsx,.xlsm,text/csv" file={results} onFile={setResults} disabled={busy} />
            </div>

            <label className="mt-5 block font-mono text-[9px] tracking-[.08em] text-slate-500">
              3 · RACE NAME (OPTIONAL)
              <input value={raceName} onChange={(e) => setRaceName(e.target.value)} maxLength={200} list={RACE_NAME_LIST} autoComplete="off" className={`${input} mt-2 font-sans tracking-normal`} placeholder="Doi Suthep Trail 30K" />
              <RaceNameList />
            </label>

            {error && (
              <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2.5 text-sm text-red-900">
                <XCircle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
            <button type="submit" disabled={busy || Boolean(missing)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,.2)] transition hover:from-blue-800 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Measuring the course and scoring…' : <>Validate and score <ArrowRight size={15} /></>}
            </button>
            {!busy && missing && <p className="mt-2 text-center text-xs text-slate-500">{missing}</p>}
          </form>
          <div className="min-w-0 lg:col-start-1">
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" /> Free and instant: no account, no approval, every score in about a minute.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" /> Publish with one click: a leaderboard page for your runners, and podium images with a post for your channels.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" /> A score depends on the course and the runner's own time, never on who else raced, so it compares across races.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" /> Where the model runs out of evidence it says so, per course, instead of guessing.</li>
            </ul>
            <p className="mt-6 text-xs text-slate-500">
              Timing company or developer? The same call is a public API: <a href="#api" className="font-semibold text-blue-600 no-underline hover:underline">POST /score</a>.
            </p>
          </div>
          {rowsOpen && <ExampleRows onClose={() => setRowsOpen(false)} />}
        </div>
      </section>

      <div id="score-result" className={`${CONTAINER} scroll-mt-20 pb-20`}>
        {result && !result.is_valid && (
          <section className="mt-8 rounded-2xl border border-red-100 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <XCircle size={16} /> The results file needs {result.errors.length} fix{result.errors.length === 1 ? '' : 'es'} before it can be scored.
            </p>
            <Issues issues={result.errors} kind="error" />
            {result.warnings.length > 0 && <Issues issues={result.warnings} kind="warning" />}
            <p className="mt-3 text-xs text-slate-500">Correct the file and score it again.</p>
          </section>
        )}
        {result?.is_valid && (
          <Scored result={result} gpxText={scoredFiles?.gpxText} fileStem={(result.course.name ?? results?.name ?? '').replace(/\.[a-z]+$/i, '').replace(/[^\w-]+/g, '-').toLowerCase()}>
            {result.summary.finishers > 0 && scoredFiles && <PublishInvite result={result} files={scoredFiles} />}
          </Scored>
        )}

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['Want a public race page?', 'Score the race here first, then press Publish this race: the course and the results come with you into a free organizer account. No approval, and you decide when it goes public.', 'organizer/', 'Or start with an account'],
            ['Put the calculator on your site', 'Runners try a target time on your course before race day. One line of HTML, no account, free.', '#api', 'Embed the calculator'],
            ['How is a score worked out?', 'Course demand from the measured track, against a published human ceiling. Every step is documented and versioned.', '#faq', 'Read the answers'],
          ].map(([title, text, href, cta]) => (
            <a key={title} href={href} className="group block rounded-2xl border border-slate-200 bg-white p-5 no-underline transition hover:border-blue-300">
              <p className="text-base font-bold tracking-[-.02em] text-[#0b1220]">{title}</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{text}</p>
              <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600">{cta} <ArrowRight size={13} className="transition group-hover:translate-x-0.5" /></p>
            </a>
          ))}
        </section>
      </div>
    </>
  )
}
