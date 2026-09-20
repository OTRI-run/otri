import tool from './ToolPage.module.css'
import './ScoreRace.css'
import RankBadge from '../src/components/RankBadge'
import ColumnsRead from '../src/components/ColumnsRead'
import WhatWeScore from '../src/components/WhatWeScore'
import useFileDrop from '../src/lib/useFileDrop'
import { revealElement } from '../src/lib/comfort'
import { Fragment, useEffect, useMemo, useState } from 'preact/compat'
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, Download, Share2, FileSpreadsheet, Map as MapIcon, Timer, Trophy, XCircle } from 'lucide-react'
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

const CONTAINER = "prototype-score-race-container-style-1"
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

function FilePick({ icon: Icon, label, hint, accept, file, onFile, disabled }) {
  return (
    <label className={`prototype-score-race-file-pick-label-2 ${file ? "prototype-score-race-file-pick-label-3" : "prototype-score-race-file-pick-label-4"} ${disabled ? "prototype-score-race-file-pick-label-5" : ''}`}>
      <Icon size={18} className="prototype-score-race-file-pick-icon-6" />
      <span className="prototype-score-race-file-pick-span-7">
        <span className="prototype-score-race-file-pick-span-8">{file ? file.name : label}</span>
        <span className="prototype-score-race-file-pick-span-9">{file ? 'Choose another file' : hint}</span>
      </span>
      <input type="file" accept={accept} className="prototype-score-race-file-pick-input-10" disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    </label>
  )
}

function Issues({ issues, kind }) {
  return (
    <ul className="prototype-score-race-issues-ul-11">
      {issues.map((issue, index) => (
        <li key={index} className={kind === 'error' ? "prototype-score-race-issues-li-12" : "prototype-score-race-issues-li-13"}>
          {issue.row != null && <span className="prototype-score-race-issues-span-14">Row {issue.row}</span>}
          {issue.field && <span className="prototype-score-race-issues-span-14">{issue.row != null ? ' · ' : ''}{issue.field.replace(/_/g, ' ')}</span>}
          {issue.row != null || issue.field ? ': ' : ''}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="prototype-score-race-tile-div-15">
      <p className="prototype-score-race-tile-p-16">{label}</p>
      <p className="prototype-score-race-tile-p-17">{value}</p>
      {sub && <p className="prototype-score-race-tile-p-18">{sub}</p>}
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
    <section className="prototype-score-race-scored-section-19">
      <div className="prototype-score-race-scored-div-20">
        <div className="prototype-score-race-file-pick-span-7">
          <p className="prototype-score-race-scored-p-21">
            <CheckCircle2 size={13} /> VALID · {summary.finishers} FINISHER{summary.finishers === 1 ? '' : 'S'} SCORED
          </p>
          <h2 className="prototype-score-race-scored-h2-22 otri-fit">{course.name ?? 'Your race'}</h2>
        </div>
        <div className="prototype-score-race-scored-div-23">
          {summary.finishers > 0 && (
            <button type="button" onClick={() => setSharing((open) => !open)} aria-expanded={sharing} className="prototype-score-race-scored-button-24">
              <Share2 size={14} /> {sharing ? 'Close sharing' : 'Share the podium'}
            </button>
          )}
          <button type="button" onClick={() => download(`${name}.csv`, 'text/csv;charset=utf-8', scoresCsv(result))} className="prototype-score-race-scored-button-25">
            <Download size={14} /> Download CSV
          </button>
          <button type="button" onClick={() => download(`${name}.json`, 'application/json', JSON.stringify(result, null, 2))} className="prototype-score-race-scored-button-26">
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {sharing && (
        <div className="prototype-score-race-scored-div-27">
          <p className="prototype-score-race-scored-p-28">An image and a post for your race's channels</p>
          <p className="prototype-score-race-scored-p-29">Pick who to show. The picture and the text follow, ready for Facebook, Instagram or WhatsApp.</p>
          <ShareResults raceName={course.name} distanceKm={course.distance_km} elevationGainM={course.elevation_gain_m} scores={scores} />
        </div>
      )}

      <div className="prototype-score-race-scored-div-30">
        <Tile label="COURSE" value={`${formatDistance(course.distance_km, units)} · ${formatElevation(course.elevation_gain_m, units, { sign: '+' })}`} sub="measured from your course file" />
        <Tile label="CONFIDENCE" value={course.confidence ?? 'n/a'} sub={course.confidence === 'High' ? 'course verified against terrain data' : 'see the notes below'} />
        <Tile label="BEST · MEDIAN" value={summary.best_score != null ? `${summary.best_score} · ${summary.median_score}` : 'not scored'} sub={summary.non_finishers > 0 ? `${summary.non_finishers} did not finish` : 'every listed runner finished'} />
        <Tile label="MODEL" value={modelLabel(result.scoring_version)} sub={result.scoring_version} />
      </div>

      {gpxText && (
        <div className="prototype-score-race-scored-div-31">
          <CourseMap gpxText={gpxText} measurement={result.measurement} className="prototype-score-race-scored-course-map-32" />
        </div>
      )}

      {reasons.length > 0 && (
        <div className="prototype-score-race-scored-div-33">
          <AlertTriangle size={16} className="prototype-score-race-scored-alert-triangle-34" />
          <ul className="prototype-score-race-scored-ul-35">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {flags.length > 0 && (
        <section className="prototype-score-race-scored-section-36">
          <h3 className="prototype-score-race-scored-h3-37">{flags.length} quality flag{flags.length === 1 ? '' : 's'} from the course measurement and the model</h3>
          <ul className="prototype-score-race-scored-ul-38">
            {flags.map((flag) => (
              <li key={flag} className="prototype-score-race-scored-li-39">{flag}</li>
            ))}
          </ul>
        </section>
      )}
      {result.warnings.length > 0 && (
        <section className="prototype-score-race-scored-section-36">
          <h3 className="prototype-score-race-scored-h3-37">{result.warnings.length} note{result.warnings.length === 1 ? '' : 's'} on the results file (nothing that blocks scoring)</h3>
          <Issues issues={result.warnings} kind="warning" />
        </section>
      )}
      <ColumnsRead columns={result.columns} ignored={result.ignored_columns} className="prototype-score-race-scored-columns-read-40" />

      {children}

      <div className="prototype-score-race-scored-div-41">
        <table className="prototype-score-race-scored-table-42">
          <thead>
            <tr className="prototype-score-race-scored-tr-43">
              <th className="prototype-score-race-scored-th-44">Rank</th>
              <th className="prototype-score-race-scored-th-44">Runner</th>
              <th className="prototype-score-race-scored-th-44">Country</th>
              <th className="prototype-score-race-scored-th-44">Gender</th>
              <th className="prototype-score-race-scored-th-44">Bib</th>
              <th className="prototype-score-race-scored-th-44">Time</th>
              <th className="prototype-score-race-scored-th-45">OTRI</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, visible).map((row, index) => (
              <tr key={`${index}-${row.rank}`} className="prototype-score-race-scored-tr-46">
                <td className="prototype-score-race-scored-td-47"><RankBadge rank={row.rank} /></td>
                <td className="prototype-score-race-scored-td-48">{row.first_name} {row.family_name}</td>
                <td className="prototype-score-race-scored-th-44">{row.nationality ? <Flag code={row.nationality} /> : <span className="prototype-score-race-scored-span-49">—</span>}</td>
                <td className="prototype-score-race-scored-td-47">{row.gender || '—'}</td>
                <td className="prototype-score-race-scored-td-47">{row.bib_number ?? '—'}</td>
                <td className="prototype-score-race-scored-td-50">{formatHms(row.finish_time_seconds) || '—'}</td>
                <td className="prototype-score-race-scored-td-51">{row.otri_score ?? <span className="prototype-score-race-scored-span-52">{row.status === 'finisher' ? 'not scored' : row.status}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {scores.length > visible && (
          <button type="button" onClick={() => setVisible((n) => n + 500)} className="prototype-score-race-scored-button-53">
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

  // Sits in the form, under "Validate and score": the place someone looks when they have no files.
  return (
    <div className="prototype-score-race-example-race-div-54">
      <p className="prototype-score-race-example-race-p-55">JUST TRYING IT OUT?</p>
      <button
        type="button"
        onClick={use}
        disabled={busy || state === 'loading'}
        className="prototype-score-race-example-race-button-56"
      >
        {state === 'loading' ? 'Loading the example…' : 'Try with sample files'}
      </button>
      <section className="prototype-score-race-example-race-section-57">
        <h3 className="prototype-score-race-example-race-h3-58">Preview or download sample files</h3>
        <p className="prototype-score-race-example-race-p-59">Demo course · 100 sample finishers.{' '}
        <button type="button" onClick={onToggleRows} aria-expanded={rowsOpen} aria-controls="example-rows" className="prototype-score-race-example-race-button-60">
          {rowsOpen ? 'Hide' : 'Show'} rows
        </button>
        {' · '}
        <a href={EXAMPLE.results.url} download={EXAMPLE.results.file} className="prototype-score-race-example-race-a-61">CSV</a>
        {' · '}
        <a href={EXAMPLE.course.url} download={EXAMPLE.course.file} className="prototype-score-race-example-race-a-61">GPX</a>
        </p>
      </section>
      {state === 'failed' && <p className="prototype-score-race-example-race-p-62">The example files could not be loaded. Try again in a moment.</p>}
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
    <div id="example-rows" className="prototype-score-race-example-rows-div-63">
      <div className="prototype-score-race-example-rows-div-64">
        <div className="prototype-score-race-file-pick-span-7">
          <p className="prototype-score-race-tile-p-16">THE EXAMPLE RESULTS FILE · {EXAMPLE.results.file}</p>
          <p className="prototype-score-race-example-rows-p-65">A finisher needs a rank, a time, a name and a gender; DNF and DNS rows carry their status instead of a time. Any file laid out like this passes.</p>
        </div>
        <button type="button" onClick={onClose} className="prototype-score-race-example-rows-button-66">Hide rows</button>
      </div>
      {rows === null ? (
        <p className="prototype-score-race-example-rows-p-67">Loading the rows…</p>
      ) : rows.length === 0 ? (
        <p className="prototype-score-race-example-rows-p-68">The example file could not be loaded. Try again in a moment.</p>
      ) : (
        <div className="prototype-score-race-example-rows-div-69">
          <table className="prototype-score-race-example-rows-table-70">
            <thead>
              <tr className="prototype-score-race-example-rows-tr-71">
                {header.map((cell) => (
                  <th key={cell} className="prototype-score-race-example-rows-th-72">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <Fragment key={index}>
                  {index === EXAMPLE_ROWS_SHOWN && (
                    <tr className="prototype-score-race-example-rows-tr-73">
                      <td colSpan={header.length} className="prototype-score-race-example-rows-td-74">… {body.length - shown.length} more rows …</td>
                    </tr>
                  )}
                  <tr className="prototype-score-race-example-rows-tr-75">
                    {row.map((cell, column) => (
                      <td key={column} className="prototype-score-race-example-rows-td-76">{cell || <span className="prototype-score-race-scored-span-49">—</span>}</td>
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
    <section className="prototype-score-race-publish-invite-section-77">
      <div className="prototype-score-race-publish-invite-div-78">
        <div className="prototype-score-race-file-pick-span-7">
          <p className="prototype-score-race-publish-invite-p-79">THE HARD PART IS DONE</p>
          <h2 className="prototype-score-race-publish-invite-h2-80">
            Give every runner a page to find their score.
          </h2>
          <p className="prototype-score-race-publish-invite-p-81">
            Publish this race on OTRI: the course and these results come with you, so there is nothing to upload again. It is free, there is no approval to wait for, and you can take it down whenever you like.
          </p>
          <ul className="prototype-score-race-publish-invite-ul-82">
            {[
              [Trophy, 'A public leaderboard with every score explained'],
              [MapIcon, 'Your course on a map, measured and verified'],
              [Timer, 'Runners try a target time for next year'],
              [Code2, 'The calculator on your own website, one line of HTML'],
            ].map(([Icon, text]) => (
              <li key={text} className="prototype-score-race-publish-invite-li-83">
                <Icon size={16} className="prototype-score-race-publish-invite-icon-84" /> {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="prototype-score-race-publish-invite-div-85">
          <button type="button" onClick={publish} disabled={state === 'saving'} className="prototype-score-race-publish-invite-button-86">
            {state === 'saving' ? 'One moment…' : <>Publish this race <ArrowRight size={16} /></>}
          </button>
          <p className="prototype-score-race-publish-invite-p-87">Two minutes: an email address, the race date, done. Nothing is public until you press Publish.</p>
          {state === 'failed' && (
            <p className="prototype-score-race-publish-invite-p-88">
              This browser would not keep the files. <a href="organizer/" className="prototype-score-race-publish-invite-a-89">Create the account</a> and add the two files there.
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

  const input = "prototype-score-race-score-race-style-90"

  return (
    <>
      <section className={tool.workbench} data-tool-page="score">
        <div className={CONTAINER}>
          <div className={tool.container}>
          <div className={tool.heading}>
            <p className={tool.eyebrow}>FOR ORGANIZERS / EVERY FINISHER</p>
            <h1 className="prototype-score-race-score-race-h1-95">Score all finishers</h1>
            <p className="prototype-score-race-score-race-p-96">Add your course and results. Get a score for every finisher.</p>
            <p className="prototype-score-race-score-race-p-97">Free · No account needed</p>
          </div>

          <form onSubmit={submit} {...dropProps} className={`${tool.form} ${dragging ? "prototype-score-race-score-race-form-99" : "prototype-score-race-score-race-form-100"}`}>
            {dragging && <p className="prototype-score-race-score-race-p-101">Drop the course (.gpx) and the results (.csv, .xlsx) here, together or one at a time</p>}
            <div className={tool.uploadPair}><div>
            <p className="prototype-score-race-score-race-p-102">1 · Add the course</p>
            <div className="prototype-score-race-example-race-p-59">
              <FilePick icon={MapIcon} label="Upload course" hint="GPX route file · Up to 20 MB" accept=".gpx,application/gpx+xml" file={gpx} onFile={setGpx} disabled={busy} />
            </div>

            </div><div>
            <p className="prototype-score-race-score-race-p-103">2 · Add the results</p>
            <div className="prototype-score-race-example-race-p-59">
              <FilePick icon={FileSpreadsheet} label="Upload results" hint="CSV or Excel · Runner names and finish times" accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv" file={results} onFile={setResults} disabled={busy} />
            </div>

            </div></div>
            <section className="prototype-score-race-score-race-section-104">
                          <label className="prototype-score-race-score-race-label-105">
              RACE NAME (OPTIONAL)
              <input value={raceName} onChange={(e) => setRaceName(e.target.value)} maxLength={200} list={RACE_NAME_LIST} autoComplete="off" className={`${input} prototype-score-race-score-race-input-106`} placeholder="Doi Suthep Trail 30K" />
              <RaceNameList />
            </label>
            </section>

            {error && (
              <div id="score-error" role="alert" className="prototype-score-race-score-race-div-107">
                <XCircle size={16} className="prototype-score-race-scored-alert-triangle-34" /> <span className="prototype-score-race-score-race-span-108">{error}</span>
              </div>
            )}
            <button type="submit" disabled={busy || Boolean(missing)} className="prototype-score-race-score-race-button-109">
              {busy ? 'Calculating scores…' : <>Calculate scores <ArrowRight size={15} /></>}
            </button>
            {!busy && missing && <p className="prototype-score-race-score-race-p-110">{missing}</p>}
            <ExampleRace onUse={useExample} busy={busy} rowsOpen={rowsOpen} onToggleRows={() => setRowsOpen((open) => !open)} />
          </form>
          <section className="prototype-score-race-score-race-section-111">
            <h3 className="prototype-score-race-score-race-h3-112">Need help with your files?</h3>
            <p className="prototype-score-race-score-race-p-113"><b>Course:</b> upload the route as a GPX file. Distance and elevation totals alone are not enough.</p>
            <p className="prototype-score-race-score-race-p-114"><b>Results:</b> upload your timing export or spreadsheet with runner names and finish times. CSV, TSV and Excel (.xlsx or .xlsm) are supported.</p>
            <p className="prototype-score-race-score-race-p-114">You can also drop both files onto the form. After scoring, download the scores or choose to publish a race page.</p>
          </section>
          <WhatWeScore className="prototype-score-race-example-race-p-59" />
          </div>
          {rowsOpen && <ExampleRows onClose={() => setRowsOpen(false)} />}
        </div>
      </section>

      <div id="score-result" className={`${CONTAINER} prototype-score-race-score-race-div-115`}>
        {result && !result.is_valid && (
          <section className="prototype-score-race-score-race-section-116">
            <p className="prototype-score-race-score-race-p-117">
              <XCircle size={16} /> The results file needs {result.errors.length} fix{result.errors.length === 1 ? '' : 'es'} before it can be scored.
            </p>
            <Issues issues={result.errors} kind="error" />
            {result.warnings.length > 0 && <Issues issues={result.warnings} kind="warning" />}
            <ColumnsRead columns={result.columns} ignored={result.ignored_columns} className="prototype-score-race-score-race-section-104" />
            <p className="prototype-score-race-score-race-p-97">
              Correct the file and score it again. If OTRI picked the wrong column of your export, or did not recognise one,{' '}
              <a href="https://github.com/OTRI-run/otri/issues/new" className="prototype-score-race-example-race-a-61">tell us the column names</a> and
              we will add them.
            </p>
          </section>
        )}
        {result?.is_valid && (
          <Scored result={result} gpxText={scoredFiles?.gpxText} fileStem={(result.course.name ?? results?.name ?? '').replace(/\.[a-z]+$/i, '').replace(/[^\w-]+/g, '-').toLowerCase()}>
            {result.summary.finishers > 0 && scoredFiles && <PublishInvite result={result} files={scoredFiles} />}
          </Scored>
        )}

        <section className="prototype-score-race-score-race-section-118">
          <h3 className="prototype-score-race-score-race-h3-119">Publishing, website tools and scoring help</h3>
        <section className="prototype-score-race-score-race-section-120">
          {[
            ['Want a public race page?', 'Score the race here first, then press Publish this race: the course and the results come with you into a free organizer account. No approval, and you decide when it goes public.', 'organizer/', 'Or start with an account'],
            ['Put the calculator on your site', 'Runners try a target time on your course before race day. One line of HTML, no account, free.', '#api', 'Embed the calculator'],
            ['How is a score worked out?', 'Course demand from the measured track, against a published human ceiling. Every step is documented and versioned.', '#faq', 'Read the answers'],
          ].map(([title, text, href, cta]) => (
            <a key={title} href={href} className="prototype-score-race-score-race-a-121 otri-group">
              <p className="prototype-score-race-scored-p-28">{title}</p>
              <p className="prototype-score-race-score-race-p-122">{text}</p>
              <p className="prototype-score-race-score-race-p-123">{cta} <ArrowRight size={13} className="prototype-score-race-score-race-arrow-right-124" /></p>
            </a>
          ))}
        </section>
        </section>
      </div>
    </>
  )
}
