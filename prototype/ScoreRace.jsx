import './ScoreRace.css'
import RankBadge from '../src/components/RankBadge'
import ColumnsRead from '../src/components/ColumnsRead'
import WhatWeScore from '../src/components/WhatWeScore'
import useFileDrop from '../src/lib/useFileDrop'
import { revealElement } from '../src/lib/comfort'
import { Fragment, useEffect, useMemo, useState } from 'preact/compat'
import { Alert, ArrowRight, CheckCircle, Code, Download, FileSheet, MapIcon, Share, Timer, Trophy, XCircle } from '../src/ui/icons'
import { scoreRace } from './apiClient'
import { saveHandoff } from './publishHandoff'
import { ShareResults } from './SharePanel'
import RaceNameList, { RACE_NAME_LIST } from '../src/components/RaceNameList'
import CourseMap from '../src/components/LazyCourseMap'
import Flag from '../src/components/Flag'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import { modelLabel } from '../src/lib/model'

// Score my race: a course and a results file in, the validated and scored result list out. No
// account (POST /score); the same validation and scoring as a published race, which is one click further.

const CONTAINER = 'wrap'
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
  course_not_scored: 'A vertical race needs its course file to be scored: the list carries finish times only.',
  vertical_calibration_provisional: 'This is an uphill-only course. It is scored with a steep-ground factor of its own that rests on a single calibration race so far, so treat the scores as provisional.',
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

// One of the two files: a dropzone that shows the chosen file's name once there is one.
function FilePick({ icon: Icon, label, hint, accept, file, onFile, disabled }) {
  return (
    <label className={`dropzone score-race-drop ${file ? 'has-file' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <Icon size={26} />
      <span className="dropzone__title break">{file ? file.name : label}</span>
      <span className="dropzone__hint">{file ? 'Choose another file' : hint}</span>
      <input type="file" accept={accept} disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    </label>
  )
}

function Issues({ issues, kind }) {
  return (
    <ul className={`score-race-issues score-race-issues--${kind}`}>
      {issues.map((issue, index) => (
        <li key={index}>
          {issue.row != null && <span className="score-race-issues__where">Row {issue.row}</span>}
          {issue.field && <span className="score-race-issues__where">{issue.row != null ? ' · ' : ''}{issue.field.replace(/_/g, ' ')}</span>}
          {issue.row != null || issue.field ? ': ' : ''}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="card card--pad-sm stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value score-race-stat__value">{value}</span>
      {sub && <span className="tiny muted break">{sub}</span>}
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
    <section className="stack stack--loose">
      <div className="cluster cluster--between cluster--top">
        <div className="min0 stack stack--tight">
          <p>
            <span className="badge badge--mint badge--lg">
              <CheckCircle size={13} /> Valid · {summary.finishers} finisher{summary.finishers === 1 ? '' : 's'} scored
            </span>
          </p>
          <h2 className="otri-fit">{course.name ?? 'Your race'}</h2>
        </div>
        <div className="cluster cluster--tight">
          {summary.finishers > 0 && (
            <button type="button" onClick={() => setSharing((open) => !open)} aria-expanded={sharing} className="btn btn--secondary">
              <Share size={16} /> {sharing ? 'Close sharing' : 'Share the podium'}
            </button>
          )}
          <button type="button" onClick={() => download(`${name}.csv`, 'text/csv;charset=utf-8', scoresCsv(result))} className="btn btn--dark">
            <Download size={16} /> Download CSV
          </button>
          <button type="button" onClick={() => download(`${name}.json`, 'application/json', JSON.stringify(result, null, 2))} className="btn btn--ghost">
            <Download size={16} /> JSON
          </button>
        </div>
      </div>

      {sharing && (
        <div className="card card--pad-lg">
          <p className="h-3">An image and a post for your race's channels</p>
          <p className="small muted mt-1">Pick who to show. The picture and the text follow, ready for Facebook, Instagram or WhatsApp.</p>
          <div className="mt-5">
            <ShareResults raceName={course.name} distanceKm={course.distance_km} elevationGainM={course.elevation_gain_m} scores={scores} />
          </div>
        </div>
      )}

      <div className="grid grid--4 grid--tight">
        <Tile label="Course" value={`${formatDistance(course.distance_km, units)} · ${formatElevation(course.elevation_gain_m, units, { sign: '+' })}`} sub="measured from your course file" />
        <Tile label="Confidence" value={course.confidence ?? 'n/a'} sub={course.confidence === 'High' ? 'course verified against terrain data' : 'see the notes below'} />
        <Tile label="Best · median" value={summary.best_score != null ? `${summary.best_score} · ${summary.median_score}` : 'not scored'} sub={summary.non_finishers > 0 ? `${summary.non_finishers} did not finish` : 'every listed runner finished'} />
        <Tile label="Model" value={modelLabel(result.scoring_version)} sub={result.scoring_version} />
      </div>

      {gpxText && (
        <div className="card card--flush">
          <CourseMap gpxText={gpxText} measurement={result.measurement} className="card__body" />
        </div>
      )}

      {reasons.length > 0 && (
        <div className="notice notice--warning">
          <Alert size={18} />
          <ul className="notice__body score-race-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {flags.length > 0 && (
        <details className="details details--quiet">
          <summary>{flags.length} quality flag{flags.length === 1 ? '' : 's'} from the course measurement and the model</summary>
          <ul className="details__body score-race-flags">
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </details>
      )}
      {result.warnings.length > 0 && (
        <section className="notice notice--warning notice--plain">
          <div className="notice__body">
            <h3 className="notice__title">{result.warnings.length} note{result.warnings.length === 1 ? '' : 's'} on the results file (nothing that blocks scoring)</h3>
            <Issues issues={result.warnings} kind="warning" />
          </div>
        </section>
      )}
      <ColumnsRead columns={result.columns} ignored={result.ignored_columns} />

      {children}

      <div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Runner</th>
                <th>Country</th>
                <th>Gender</th>
                <th>Bib</th>
                <th className="num">Time</th>
                <th className="num right">OTRI</th>
              </tr>
            </thead>
            <tbody>
              {scores.slice(0, visible).map((row, index) => (
                <tr key={`${index}-${row.rank}`} className={row.status !== 'finisher' ? 'is-muted' : ''}>
                  <td className="num"><RankBadge rank={row.rank} /></td>
                  <td className="score-race-runner">{row.first_name} {row.family_name}</td>
                  <td>{row.nationality ? <Flag code={row.nationality} /> : <span className="muted">—</span>}</td>
                  <td className="mono">{row.gender || '—'}</td>
                  <td className="mono">{row.bib_number ?? '—'}</td>
                  <td className="num">{formatHms(row.finish_time_seconds) || '—'}</td>
                  <td className="right">{row.otri_score != null ? <span className="score">{row.otri_score}</span> : <span className="tiny muted mono">{row.status === 'finisher' ? 'not scored' : row.status}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scores.length > visible && (
          <div className="cluster cluster--center mt-4">
            <button type="button" onClick={() => setVisible((n) => n + 500)} className="btn btn--secondary">
              Show more · {scores.length - visible} rows left (the download has them all)
            </button>
          </div>
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

  // Sits in the form, under "Validate and score": the place someone looks when they have no files.
  return (
    <div className="score-race-example">
      <p className="eyebrow eyebrow--plain eyebrow--sm">Just trying it out?</p>
      <button
        type="button"
        onClick={use}
        disabled={busy || state === 'loading'}
        className="btn btn--secondary btn--sm mt-2"
      >
        {state === 'loading' ? 'Loading the example…' : 'Try with sample files'}
      </button>
      <section className="mt-3">
        <h3 className="h-4">Preview or download sample files</h3>
        <p className="small muted">Demo course · 100 sample finishers.{' '}
        <button type="button" onClick={onToggleRows} aria-expanded={rowsOpen} aria-controls="example-rows" className="link">
          {rowsOpen ? 'Hide' : 'Show'} rows
        </button>
        {' · '}
        <a href={EXAMPLE.results.url} download={EXAMPLE.results.file} className="link">CSV</a>
        {' · '}
        <a href={EXAMPLE.course.url} download={EXAMPLE.course.file} className="link">GPX</a>
        </p>
      </section>
      {state === 'failed' && <p className="field__error mt-2">The example files could not be loaded. Try again in a moment.</p>}
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
    <div id="example-rows" className="card card--flush mt-8">
      <div className="card__head">
        <div className="min0">
          <p className="eyebrow eyebrow--plain">The example results file · {EXAMPLE.results.file}</p>
          <p className="small muted mt-1">A finisher needs a rank, a time, a name and a gender; DNF and DNS rows carry their status instead of a time. Any file laid out like this passes.</p>
        </div>
        <button type="button" onClick={onClose} className="btn btn--ghost btn--sm">Hide rows</button>
      </div>
      {rows === null ? (
        <p className="loading card__body"><span className="spinner" /> Loading the rows…</p>
      ) : rows.length === 0 ? (
        <p className="card__body muted small">The example file could not be loaded. Try again in a moment.</p>
      ) : (
        <div className="score-race-rows">
          <table className="table table--tight table--flush">
            <thead>
              <tr>
                {header.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <Fragment key={index}>
                  {index === EXAMPLE_ROWS_SHOWN && (
                    <tr className="is-muted">
                      <td colSpan={header.length} className="center mono tiny">… {body.length - shown.length} more rows …</td>
                    </tr>
                  )}
                  <tr>
                    {row.map((cell, column) => (
                      <td key={column} className="mono nowrap">{cell || <span className="muted">—</span>}</td>
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
    <section className="card card--strong card--pad-lg topo--faint score-race-publish">
      <div className="grid grid--aside">
        <div className="stack">
          <p className="eyebrow">The hard part is done</p>
          <h2 className="h-1">
            Give every runner a page to find their score.
          </h2>
          <p className="muted">
            Publish this race on OTRI: the course and these results come with you, so there is nothing to upload again. It is free, there is no approval to wait for, and you can take it down whenever you like.
          </p>
          <ul className="score-race-publish__list">
            {[
              [Trophy, 'A public leaderboard with every score explained'],
              [MapIcon, 'Your course on a map, measured and verified'],
              [Timer, 'Runners try a target time for next year'],
              [Code, 'The calculator on your own website, one line of HTML'],
            ].map(([Icon, text]) => (
              <li key={text}>
                <span className="icon-box icon-box--quiet icon-box--sm"><Icon size={16} /></span> {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="stack score-race-publish__action">
          <button type="button" onClick={publish} disabled={state === 'saving'} className="btn btn--primary btn--lg score-race-publish__button">
            {state === 'saving' ? 'One moment…' : <>Publish this race <ArrowRight size={18} /></>}
          </button>
          <p className="small muted">Two minutes: an email address, the race date, done. Nothing is public until you press Publish.</p>
          {state === 'failed' && (
            <p className="field__error">
              This browser would not keep the files. <a href="organizer/" className="link">Create the account</a> and add the two files there.
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
    if (result) revealElement('score-result', { focus: true })
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
      revealElement('score-error', { block: 'center' })
    } finally {
      setBusy(false)
    }
  }

  // Both files can be dropped anywhere on the form, together or one at a time: the ending says
  // which is the course and which the results.
  const { dragging, dropProps } = useFileDrop({
    accept: '.gpx,.csv,.tsv,.txt,.xlsx,.xlsm',
    disabled: busy,
    onFiles: (files) => {
      setError(null)
      for (const file of files) (/\.gpx$/i.test(file.name) ? setGpx : setResults)(file)
    },
    onReject: setError,
  })

  const input = 'input'

  return (
    <>
      <section className="section topo" data-tool-page="score">
        <div className={CONTAINER}>
          <div className="section-head">
            <span className="waypoint waypoint--volt section-head__no">02</span>
            <div className="stack">
              <p className="eyebrow">For organizers / every finisher</p>
              <h1 className="display-2">Score all finishers</h1>
            </div>
            <div className="stack stack--tight">
              <p className="lead">Add your course and results. Get a score for every finisher.</p>
              <p className="facts"><span>Free · No account needed</span></p>
            </div>
          </div>

          <div className="grid grid--aside-narrow mt-10">
            <form onSubmit={submit} {...dropProps} className={`card card--pad-lg score-race-form ${dragging ? 'is-dragging' : ''}`}>
              {dragging && <p className="score-race-form__drop">Drop the course (.gpx) and the results (.csv, .xlsx) here, together or one at a time</p>}
              <div className="grid grid--2">
                <div className="stack stack--tight">
                  <p className="eyebrow eyebrow--plain">1 · Add the course</p>
                  <FilePick icon={MapIcon} label="Upload course" hint="GPX route file · Up to 20 MB" accept=".gpx,application/gpx+xml" file={gpx} onFile={setGpx} disabled={busy} />
                </div>
                <div className="stack stack--tight">
                  <p className="eyebrow eyebrow--plain">2 · Add the results</p>
                  <FilePick icon={FileSheet} label="Upload results" hint="CSV or Excel · Runner names and finish times" accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv" file={results} onFile={setResults} disabled={busy} />
                </div>
              </div>
              <div className="field mt-6">
                <label htmlFor="score-race-name" className="field__label">
                  Race name <span className="optional">(optional)</span>
                </label>
                <input id="score-race-name" value={raceName} onChange={(e) => setRaceName(e.target.value)} maxLength={200} list={RACE_NAME_LIST} autoComplete="off" className={input} placeholder="Doi Suthep Trail 30K" />
                <RaceNameList />
              </div>

              {error && (
                <div id="score-error" role="alert" className="notice notice--error mt-5">
                  <XCircle size={18} />
                  <div className="notice__body">{error}</div>
                </div>
              )}
              <div className="cluster mt-6">
                <button type="submit" disabled={busy || Boolean(missing)} aria-busy={busy || undefined} className="btn btn--primary btn--lg">
                  {busy && <span aria-hidden="true" className="spinner" />}
                  {busy ? 'Calculating scores…' : <>Calculate scores <ArrowRight size={18} /></>}
                </button>
                {!busy && missing && <p className="small muted">{missing}</p>}
              </div>
              <ExampleRace onUse={useExample} busy={busy} rowsOpen={rowsOpen} onToggleRows={() => setRowsOpen((open) => !open)} />
            </form>
            <aside className="stack">
              <section className="card">
                <h3 className="h-3">Need help with your files?</h3>
                <p className="small mt-3"><b>Course:</b> upload the route as a GPX file. Distance and elevation totals alone are not enough.</p>
                <p className="small mt-2"><b>Results:</b> upload your timing export or spreadsheet with runner names and finish times. CSV, TSV and Excel (.xlsx or .xlsm) are supported.</p>
                <p className="small muted mt-2">You can also drop both files onto the form. After scoring, download the scores or choose to publish a race page.</p>
              </section>
              <WhatWeScore />
            </aside>
          </div>
          {rowsOpen && <ExampleRows onClose={() => setRowsOpen(false)} />}
        </div>
      </section>

      <section className="section section--tight">
        <div id="score-result" className={`${CONTAINER} stack stack--loose`}>
          {result && !result.is_valid && (
            <section className="card card--pad-lg stack">
              <div className="notice notice--error">
                <XCircle size={18} />
                <p className="notice__body notice__title">The results file needs {result.errors.length} fix{result.errors.length === 1 ? '' : 'es'} before it can be scored.</p>
              </div>
              <Issues issues={result.errors} kind="error" />
              {result.warnings.length > 0 && <Issues issues={result.warnings} kind="warning" />}
              <ColumnsRead columns={result.columns} ignored={result.ignored_columns} />
              <p className="small muted">
                Correct the file and score it again. If OTRI picked the wrong column of your export, or did not recognise one,{' '}
                <a href="https://github.com/OTRI-run/otri/issues/new" className="link">tell us the column names</a> and
                we will add them.
              </p>
            </section>
          )}
          {result?.is_valid && (
            <Scored result={result} gpxText={scoredFiles?.gpxText} fileStem={(result.course.name ?? results?.name ?? '').replace(/\.[a-z]+$/i, '').replace(/[^\w-]+/g, '-').toLowerCase()}>
              {result.summary.finishers > 0 && scoredFiles && <PublishInvite result={result} files={scoredFiles} />}
            </Scored>
          )}

          <section className="score-race-more">
            <h3 className="h-3">Publishing, website tools and scoring help</h3>
            <div className="grid grid--3 mt-5">
              {[
                ['Want a public race page?', 'Score the race here first, then press Publish this race: the course and the results come with you into a free organizer account. No approval, and you decide when it goes public.', 'organizer/', 'Or start with an account'],
                ['Put the calculator on your site', 'Runners try a target time on your course before race day. One line of HTML, no account, free.', '#api', 'Embed the calculator'],
                ['How is a score worked out?', 'Course demand from the measured track, against a published human ceiling. Every step is documented and versioned.', '#faq', 'Read the answers'],
              ].map(([title, text, href, cta]) => (
                <a key={title} href={href} className="card card--link stack stack--tight">
                  <strong className="h-4">{title}</strong>
                  <span className="small muted">{text}</span>
                  <span className="link link--arrow small mt-1">{cta} <ArrowRight size={15} /></span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  )
}
