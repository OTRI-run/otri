import './Race.css'
import RankBadge from '../../../src/components/RankBadge'
import { useEffect, useState } from 'react'
import CourseMap from '../../../src/components/LazyCourseMap'
import ColumnsRead from '../../../src/components/ColumnsRead'
import { autoFocusOnDesktop, revealElement } from '../../../src/lib/comfort'
import { DISTANCE_NAME_LIST, DistanceNameList } from '../../../src/components/PlaceNameList'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { modelLabel, notScoredReason } from '../../../src/lib/model'
import {
  analyzeGpx,
  attachRaceGpx,
  createRace,
  deleteRace,
  fetchRaceGpxFile,
  getRace,
  getRaceMeasurement,
  getRaceResults,
  publishRace,
  setRaceListed,
  submitRaceResults,
  unpublishRace,
} from '../../apiClient'
import { Link, navigate } from '../router'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { Button, Card, ChecklistRow, Dropzone, Eyebrow, Field, Gradient, Notice, Page, StatusChip, Stepper, formatDate, inputClass, raceStatus } from '../ui'

function raceSteps(raceId) {
  const base = `/races/${encodeURIComponent(raceId)}`
  return [
    { label: 'Race' },
    { label: 'Course', to: `${base}/course` },
    { label: 'Results', to: `${base}/results` },
    { label: 'Review', to: `${base}/review` },
  ]
}

// Numbered as on the welcome page: 1 event, 2 race + course, 3 results, 4 review. The account is
// not a step: whoever reads these has one.
const STEP_EYEBROW = ['STEP 2 OF 4 · RACE', 'STEP 2 OF 4 · COURSE', 'STEP 3 OF 4 · RESULTS', 'STEP 4 OF 4 · REVIEW']

function RaceShell({ race, step, children }) {
  return (
    <Page
      back={{ to: `/events/${encodeURIComponent(race.event_id)}`, label: race.event_name }}
      eyebrow={`${STEP_EYEBROW[step]} · ${race.event_name.toUpperCase()} · ${formatDate(race.event_date).toUpperCase()}`}
      title={race.course_name}
    >
      <div className="prototype-organizer-pages-race-race-shell-div-1">
        <Stepper steps={raceSteps(race.race_id)} current={step} />
      </div>
      <div className="prototype-organizer-pages-race-race-shell-div-1">{children}</div>
    </Page>
  )
}

function useRace(raceId) {
  const [race, setRace] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    getRace(raceId)
      .then(setRace)
      .catch((err) => setError(err.message))
  }, [raceId, version])
  return { race, error, reload: () => setVersion((v) => v + 1) }
}

// ----------------------------------------------------------------------------- Step 1: race

export function NewRace({ session, eventId }) {
  const [form, setForm] = useState({ course_name: '', distance_km: '', elevation_gain_m: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const race = await createRace(
        eventId,
        { course_name: form.course_name.trim(), distance_km: Number(form.distance_km), elevation_gain_m: Number(form.elevation_gain_m) },
        session.token,
      )
      navigate(`/races/${encodeURIComponent(race.race_id)}/course`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      back={{ to: `/events/${encodeURIComponent(eventId)}`, label: 'Event' }}
      eyebrow="STEP 2 OF 4 · RACE"
      headline={
        <>
          Add a
          <br />
          <Gradient>race distance.</Gradient>
        </>
      }
      intro="One race per distance. Enter your official figures now; OTRI measures the course from the GPX in the next step and shows you how they compare."
      aside={
      <Card>
        <form onSubmit={submit} className="prototype-organizer-pages-race-new-race-form-2" noValidate>
          <Field label="Race name" htmlFor="rc-name" hint="How this distance is listed — “50K”, “100 mile”, “Vertical”.">
            <input id="rc-name" autoFocus={autoFocusOnDesktop} required value={form.course_name} onChange={(e) => setForm((f) => ({ ...f, course_name: e.target.value }))} list={DISTANCE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="50K" />
            <DistanceNameList />
          </Field>
          <div className="prototype-organizer-pages-race-new-race-div-3">
            <Field label="Official distance (km)" htmlFor="rc-dist">
              <input id="rc-dist" required type="number" min="0.1" step="0.1" value={form.distance_km} onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))} className={inputClass} placeholder="51.4" />
            </Field>
            <Field label="Official elevation gain (m)" htmlFor="rc-gain">
              <input id="rc-gain" required type="number" min="0" step="1" value={form.elevation_gain_m} onChange={(e) => setForm((f) => ({ ...f, elevation_gain_m: e.target.value }))} className={inputClass} placeholder="2800" />
            </Field>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="prototype-organizer-pages-race-new-race-div-4">
            <Button type="submit" busy={busy} disabled={!form.course_name.trim() || !form.distance_km || form.elevation_gain_m === ''}>
              Save and add the course <ArrowRight size={15} />
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/events/${encodeURIComponent(eventId)}`)}>
              Cancel
            </Button>
          </div>
          {!busy && (!form.course_name.trim() || !form.distance_km || form.elevation_gain_m === '') && (
            <p className="prototype-organizer-pages-race-new-race-p-5">Enter the name, official distance and climb to continue.</p>
          )}
        </form>
      </Card>
      }
    />
  )
}

// --------------------------------------------------------------------------- Step 2: course

function pct(a, b) {
  if (!b) return null
  return ((a - b) / b) * 100
}

function CourseFacts({ measurement, features, entered }) {
  const units = useUnits()
  const sparse = measurement?.quality_flags?.includes('sparse_geometry_median_over_30m')
  const dem = measurement?.source?.dataset && measurement.source.dataset !== 'uploaded-gpx'
  const dDist = pct(features.distance_km, entered.distance_km)
  const dGain = pct(features.elevation_gain_m, entered.elevation_gain_m)
  const big = (v) => v != null && Math.abs(v) >= 5
  return (
    <div className="prototype-organizer-pages-race-course-facts-div-6">
      <dl className="prototype-organizer-pages-race-course-facts-dl-7">
        {[
          ['Measured distance', formatDistance(features.distance_km, units), entered.distance_km ? `you entered ${formatDistance(entered.distance_km, units)}` : null, dDist],
          ['Measured climb', formatElevation(features.elevation_gain_m, units, { sign: '+' }), entered.elevation_gain_m ? `you entered ${formatElevation(entered.elevation_gain_m, units, { sign: '+' })}` : null, dGain],
          ['Descent', features.elevation_loss_m != null ? formatElevation(features.elevation_loss_m, units, { sign: '-' }) : '—', null, null],
          ['Elevation source', dem ? 'Terrain model' : 'Your GPX file', dem ? measurement.source.dataset : 'not independently verified', null],
        ].map(([label, value, sub, delta]) => (
          <div key={label} className="prototype-organizer-pages-race-course-facts-div-8">
            <dt className="prototype-organizer-pages-race-course-facts-dt-9">{label}</dt>
            <dd className="prototype-organizer-pages-race-course-facts-dd-10">{value}</dd>
            {sub && (
              <dd className={`prototype-organizer-pages-race-course-facts-dd-11 ${big(delta) ? "prototype-organizer-pages-race-course-facts-dd-12" : "prototype-organizer-pages-race-course-facts-dd-13"}`}>
                {sub}
                {delta != null ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(0)}%)` : ''}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {sparse && (
        <Notice kind="warning" title="This GPX is recorded too sparsely to measure the course reliably.">
          It has a point only every {measurement.median_edge_m} m, so switchbacks are cut short and the course measures shorter and easier than it is. Export the route with a point at least every 30 m (most planners and watches can) and upload that instead.
        </Notice>
      )}
      {!dem && (
        <Notice kind="info">
          Elevation came from your file rather than verified terrain data for this region, so the measurement can differ slightly between devices. The score is still valid; it is labelled accordingly.
        </Notice>
      )}
    </div>
  )
}

export function CourseStep({ session, raceId }) {
  const units = useUnits()
  const { race, error: loadError, reload } = useRace(raceId)
  const [file, setFile] = useState(null)
  const [gpxText, setGpxText] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [existing, setExisting] = useState(null) // { gpxText, measurement, features }
  const [busy, setBusy] = useState(null) // 'analyzing' | 'attaching' | null
  const [error, setError] = useState(null)

  // Show the course already on file, if any.
  useEffect(() => {
    if (!race?.has_gpx) return
    let cancelled = false
    Promise.all([fetchRaceGpxFile(race.race_id, session.token), getRaceMeasurement(race.race_id, session.token)])
      .then(async ([gpxFile, measurement]) => {
        const text = await gpxFile.text()
        if (!cancelled) setExisting({ gpxText: text, measurement, features: { distance_km: race.distance_km, elevation_gain_m: race.elevation_gain_m, elevation_loss_m: measurement?.profile ? null : null } })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [race?.has_gpx, race?.race_id])

  async function chooseFile(e) {
    const chosen = e.target.files?.[0]
    if (!chosen) return
    setError(null)
    setAnalysis(null)
    setFile(chosen)
    setBusy('analyzing')
    try {
      const [text, result] = await Promise.all([chosen.text(), analyzeGpx(chosen)])
      setGpxText(text)
      setAnalysis(result)
    } catch (err) {
      setError(err.message)
      setFile(null)
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function useCourse() {
    setError(null)
    setBusy('attaching')
    try {
      await attachRaceGpx(race.race_id, file, session.token)
      navigate(`/races/${encodeURIComponent(race.race_id)}/results`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (loadError) return <Page title="Race"><div className="prototype-organizer-pages-race-course-step-div-14"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race) return <Page title="Loading…" />

  const entered = { distance_km: race.distance_km, elevation_gain_m: race.elevation_gain_m }

  return (
    <RaceShell race={race} step={1}>
      <div className="prototype-organizer-pages-race-new-race-form-2">
        {race.has_gpx && !analysis && (
          <Card>
            <div className="prototype-organizer-pages-race-course-step-div-15">
              <div>
                <Eyebrow>COURSE ON FILE</Eyebrow>
                <p className="prototype-organizer-pages-race-course-step-p-16">
                  {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · measurement{' '}
                  {race.measurement_version ?? '—'}
                  {race.measurement_status === 'needs_review' ? ' · flagged for review' : ''}
                </p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(race.race_id)}/results`)}>
                Continue to results <ArrowRight size={15} />
              </Button>
            </div>
            {existing?.gpxText && <CourseMap gpxText={existing.gpxText} measurement={existing.measurement} className="prototype-organizer-pages-race-course-step-div-14" />}
            {existing?.measurement?.quality_flags?.includes('sparse_geometry_median_over_30m') && (
              <div className="prototype-organizer-pages-race-course-step-div-14">
                <Notice kind="warning" title="This course was recorded too sparsely.">
                  Upload a denser export below to replace it — the score's trust label depends on it.
                </Notice>
              </div>
            )}
          </Card>
        )}

        <Card>
          <Eyebrow>{race.has_gpx ? 'REPLACE THE COURSE' : 'UPLOAD THE COURSE'}</Eyebrow>
          <p className="prototype-organizer-pages-race-course-step-p-16">
            Upload the official route as a GPX. OTRI measures it — every 10 m, elevation from verified terrain data where available — and shows how it compares with the figures you entered before anything is saved.
          </p>
          <div className="prototype-organizer-pages-race-course-step-div-14">
            <Dropzone
              id="course-file"
              accept=".gpx"
              onChange={chooseFile}
              busy={busy === 'analyzing'}
              busyLabel="Measuring the course… long courses take a few seconds."
              label="Drop a .gpx file here, or browse"
              hint="A point at least every 30 m gives a trustworthy measurement. Nothing is saved until you confirm."
              fileName={file?.name}
            />
          </div>
          {error && <div className="prototype-organizer-pages-race-course-step-div-17"><Notice kind="error">{error}</Notice></div>}
        </Card>

        {analysis && (
          <Card>
            <Eyebrow>MEASURED COURSE</Eyebrow>
            <CourseMap gpxText={gpxText} measurement={analysis.measurement} className="prototype-organizer-pages-race-course-step-div-17" />
            <div className="prototype-organizer-pages-race-course-step-div-14">
              <CourseFacts measurement={analysis.measurement} features={analysis.features} entered={entered} />
            </div>
            <div className="prototype-organizer-pages-race-course-step-div-18">
              <Button busy={busy === 'attaching'} onClick={useCourse}>
                Use this course <ArrowRight size={15} />
              </Button>
              <Button variant="secondary" onClick={() => { setAnalysis(null); setFile(null) }}>
                Choose another file
              </Button>
              <p className="prototype-organizer-pages-race-new-race-p-5">Saving replaces the race's distance and climb with the measured values.</p>
            </div>
          </Card>
        )}
      </div>
    </RaceShell>
  )
}

// -------------------------------------------------------------------------- Step 3: results

// The layout timing companies already export. Column names are matched loosely: the last
// column lists the variants that are also recognised. Extra columns are ignored.
// What the upload reads. Only a finish time and a name are needed; everything else is read when the
// export has it (ingestion/normalize.py). Headers are matched in English, French, German, Spanish,
// Italian, Portuguese, Dutch and Thai; these are examples, not the whole list.
const COLUMNS = [
  ['Time', 'required', 'H:MM:SS, 12h34m56s, 1d 02:03:04 or a spreadsheet time cell; blank, DNF or Abandon for non-finishers', 'Finish time, Chip time, Net time, Temps, Zeit, Tiempo'],
  ['Name', 'required', 'two columns, or one: “WALMSLEY Jim”, “Walmsley, Jim”, “Jim Walmsley”', 'Last name + First name, Runner, Athlete, Nom + Prénom, Name'],
  ['Rank', 'recommended', 'finishing position, or DNF / DNS / DSQ; worked out from the times if missing', 'Ranking, Position, Place, Pos, Clt, Platz'],
  ['Gender', 'recommended', 'M / F / X, Male / Female, H / F; also read from a category such as SEH, V1F, M40-44', 'Sex, Sexe, Geschlecht, Category, Cat, AK'],
  ['Status', 'optional', 'Finisher, DNF, DNS, DSQ, Abandon; may replace the rank', 'Result status, Statut'],
  ['Bib', 'optional', 'as printed, letters allowed', 'Bib number, Race number, Dossard, Stnr'],
  ['Nationality', 'optional', 'FRA, FR, France or GER: stored as the 3-letter code', 'Country, Nat, Pays, Land'],
  ['Birthdate', 'optional', 'any date layout, or a year; only the year is kept', 'Date of birth, DOB, YOB, Jahrgang'],
  ['City / Team', 'optional', 'read, not stored', 'Town, Ville, Club, Verein'],
]

// The example file lives in public/examples/ (served at the site root) in both formats; the
// rows below mirror it so the page can show the layout before anyone downloads anything.
const EXAMPLE_FILES = {
  csv: '../../examples/otri-results-example.csv',
  xlsx: '../../examples/otri-results-example.xlsx',
}
const EXAMPLE_HEADER = ['Rank', 'Time', 'Last name', 'First name', 'Gender', 'Status', 'Bib', 'Nationality', 'Birthdate', 'City', 'Team']
const EXAMPLE_ROWS = [
  ['1', '4:12:33', 'Srisuk', 'Anong', 'F', 'Finisher', '101', 'THA', '1991-03-04', 'Chiang Mai', 'Trail Club'],
  ['2', '4:20:05', 'Wong', 'Daniel', 'M', 'Finisher', '102', 'SGP', '1987-08-03', 'Singapore', 'Mountain Crew'],
  ['3', '4:35:48', 'Keller', 'Nina', 'F', 'Finisher', 'F-103', 'DEU', '', 'Munich', ''],
  ['4', '5:01:10', 'Martin', 'Alex', 'M', 'Finisher', '104', 'USA', '1990-04-12', 'Boulder', ''],
  ['DNF', '', 'Tan', 'Michael', 'M', 'DNF', '105', 'MYS', '1988-11-02', 'Penang', ''],
  ['', '', 'Okafor', 'Chidi', 'M', 'DNS', '106', 'NGA', '', 'Lagos', ''],
]

function ExampleFile({ onUse, busy }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="prototype-organizer-pages-race-example-file-div-19">
      <div className="prototype-organizer-pages-race-example-file-div-20">
        <div>
          <p className="prototype-organizer-pages-race-example-file-p-21">EXAMPLE FILE</p>
          <p className="prototype-organizer-pages-race-example-file-p-22">Six rows: four finishers, a DNF, a DNS. Any file laid out like this passes.</p>
        </div>
        <div className="prototype-organizer-pages-race-example-file-div-23">
          <a href={EXAMPLE_FILES.csv} download="otri-results-example.csv" className="prototype-organizer-pages-race-example-file-a-24">
            Download CSV
          </a>
          <a href={EXAMPLE_FILES.xlsx} download="otri-results-example.xlsx" className="prototype-organizer-pages-race-example-file-a-24">
            Download XLSX
          </a>
          <Button type="button" variant="secondary" className="prototype-organizer-pages-race-example-file-button-25" busy={busy} onClick={onUse}>
            Use the example file
          </Button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="prototype-organizer-pages-race-example-file-button-26">
            {open ? 'Hide' : 'Show'} rows
          </button>
        </div>
      </div>
      {open && (
        <div className="prototype-organizer-pages-race-example-file-div-27">
          <table className="prototype-organizer-pages-race-example-file-table-28">
            <thead>
              <tr className="prototype-organizer-pages-race-example-file-tr-29">
                {EXAMPLE_HEADER.map((h) => (
                  <th key={h} className="prototype-organizer-pages-race-example-file-th-30">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ROWS.map((row, i) => (
                <tr key={i} className="prototype-organizer-pages-race-example-file-tr-31">
                  {row.map((cell, j) => (
                    <td key={j} className="prototype-organizer-pages-race-example-file-td-32">
                      {cell === '' ? <span className="prototype-organizer-pages-race-example-file-span-33">·</span> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const FIELD_LABELS = {
  finish_time: 'time',
  finish_time_seconds: 'time',
  bib_number: 'bib',
  family_name: 'last name',
  first_name: 'first name',
  birth_date: 'birth date',
  birth_year: 'birth year',
  nationality: 'nationality',
  gender: 'gender',
  rank: 'rank',
  status: 'status',
}

function humanise(text) {
  return String(text ?? '').replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (word) => FIELD_LABELS[word] ?? word.replace(/_/g, ' '))
}

function IssueList({ issues, kind }) {
  return (
    <ul className="prototype-organizer-pages-race-issue-list-ul-34">
      {issues.map((issue, index) => (
        <li key={index} className={kind === 'error' ? "prototype-organizer-pages-race-issue-list-li-35" : "prototype-organizer-pages-race-issue-list-li-36"}>
          {issue.row != null && <span className="prototype-organizer-pages-race-issue-list-span-37">Row {issue.row}</span>}
          {issue.field && <span className="prototype-organizer-pages-race-issue-list-span-37">{issue.row != null ? ' · ' : ''}{FIELD_LABELS[issue.field] ?? issue.field}</span>}
          {issue.row != null || issue.field ? ': ' : ''}
          {humanise(issue.message)}
        </li>
      ))}
    </ul>
  )
}

export function ScoresTable({ rows, limit, compact = false }) {
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <div className="prototype-organizer-pages-race-scores-table-div-38">
      <table className={`prototype-organizer-pages-race-scores-table-table-39 ${compact ? '' : "prototype-organizer-pages-race-scores-table-table-40"}`}>
        <thead>
          <tr className="prototype-organizer-pages-race-scores-table-tr-41">
            <th className="prototype-organizer-pages-race-scores-table-th-42">Rank</th>
            <th className="prototype-organizer-pages-race-scores-table-th-42">Runner</th>
            {!compact && <th className="prototype-organizer-pages-race-scores-table-th-42">Bib</th>}
            <th className="prototype-organizer-pages-race-scores-table-th-43">OTRI</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={`${row.rank}-${row.bib_number ?? row.family_name}`} className="prototype-organizer-pages-race-scores-table-tr-44">
              <td className="prototype-organizer-pages-race-scores-table-td-45"><RankBadge rank={row.rank} /></td>
              <td className="prototype-organizer-pages-race-scores-table-td-46">{row.first_name} {row.family_name}</td>
              {!compact && <td className="prototype-organizer-pages-race-scores-table-td-45">{row.bib_number ?? '—'}</td>}
              <td className="prototype-organizer-pages-race-scores-table-td-47">{row.otri_score ?? <span className="prototype-organizer-pages-race-scores-table-span-48">{row.status === 'finisher' ? 'not scored' : row.status}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="prototype-organizer-pages-race-scores-table-p-49">…and {rows.length - limit} more</p>}
    </div>
  )
}

export function ResultsStep({ session, raceId }) {
  const { race, error: loadError } = useRace(raceId)
  const [existing, setExisting] = useState(null)
  const [file, setFile] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [loadingExample, setLoadingExample] = useState(false)

  useEffect(() => {
    getRaceResults(raceId, session.token).then(setExisting).catch(() => setExisting([]))
  }, [raceId, session.token])

  // Loads the example CSV into the dropzone so the whole validate-and-score step can be tried.
  async function useExample() {
    setLoadingExample(true)
    setError(null)
    try {
      const response = await fetch(EXAMPLE_FILES.csv)
      if (!response.ok) throw new Error(`Could not load the example file (HTTP ${response.status}).`)
      const text = await response.text()
      setFile(new File([text], 'otri-results-example.csv', { type: 'text/csv' }))
      setSubmission(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingExample(false)
    }
  }

  async function submit() {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      setSubmission(await submitRaceResults(raceId, file, session.token))
      revealElement('results-outcome', { focus: true })
    } catch (err) {
      setError(err.message)
      revealElement('results-error')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <Page title="Race"><div className="prototype-organizer-pages-race-course-step-div-14"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race) return <Page title="Loading…" />

  return (
    <RaceShell race={race} step={2}>
      <div className="prototype-organizer-pages-race-new-race-form-2">
        {!race.has_gpx && (
          <Notice kind="warning" title="No course yet.">
            Results can be uploaded, but scores need the course. <Link to={`/races/${encodeURIComponent(raceId)}/course`} className="prototype-organizer-pages-race-results-step-link-50">Add the GPX first</Link> for the best result.
          </Notice>
        )}
        {existing?.length > 0 && !submission && (
          <Card>
            <div className="prototype-organizer-pages-race-course-step-div-15">
              <div>
                <Eyebrow>RESULTS ON FILE</Eyebrow>
                <p className="prototype-organizer-pages-race-course-step-p-16">{existing.length} finishers scored. Uploading a new file replaces them.</p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(raceId)}/review`)}>
                Continue to review <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <Eyebrow>{existing?.length ? 'REPLACE RESULTS' : 'UPLOAD RESULTS'}</Eyebrow>
          <p className="prototype-organizer-pages-race-course-step-p-16">
            Upload the export you already have: from your timing company, or the sheet you send to ITRA or UTMB.
            One file per race distance, CSV or Excel, one row per participant. It needs a finish time and a name;
            positions, gender, nationality and the rest are read where the file has them, under whatever the columns
            are called, and you are shown how it was read before anything counts.
          </p>
          <ExampleFile onUse={useExample} busy={loadingExample} />
          <div className="prototype-organizer-pages-race-course-step-div-17">
            <button type="button" onClick={() => setShowGuide((v) => !v)} className="prototype-organizer-pages-race-example-file-button-26">
              {showGuide ? 'Hide' : 'Show'} the accepted columns
            </button>
          </div>
          {showGuide && (
            <div className="prototype-organizer-pages-race-results-step-div-51">
              <table className="prototype-organizer-pages-race-results-step-table-52">
                <thead>
                  <tr className="prototype-organizer-pages-race-results-step-tr-53">
                    <th className="prototype-organizer-pages-race-scores-table-th-42">Column</th>
                    <th className="prototype-organizer-pages-race-scores-table-th-42">Needed</th>
                    <th className="prototype-organizer-pages-race-scores-table-th-42">Values</th>
                    <th className="prototype-organizer-pages-race-scores-table-th-42">Also accepted as</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map(([name, need, note, aliases]) => (
                    <tr key={name} className="prototype-organizer-pages-race-scores-table-tr-44">
                      <td className="prototype-organizer-pages-race-results-step-td-54">{name}</td>
                      <td className="prototype-organizer-pages-race-results-step-td-55">{need}</td>
                      <td className="prototype-organizer-pages-race-results-step-td-55">{note}</td>
                      <td className="prototype-organizer-pages-race-results-step-td-55">{aliases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="prototype-organizer-pages-race-results-step-p-56">
                Files that mix several distances are rejected with the distances found: each race distance has its own
                course, so each gets its own upload.
              </p>
            </div>
          )}
          <div className="prototype-organizer-pages-race-course-step-div-14">
            <Dropzone
              id="results-file"
              accept=".csv,.tsv,.txt,.xlsx,.xlsm"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSubmission(null); setError(null) }}
              label="Drop a .csv or .xlsx file here, or browse"
              hint="One row per finisher. The file is validated before anything is scored."
              fileName={file?.name}
            />
          </div>
          <div className="prototype-organizer-pages-race-results-step-div-57">
            <Button busy={busy} disabled={!file} onClick={submit}>
              Validate and score <ArrowRight size={15} />
            </Button>
            {!file && <span className="prototype-organizer-pages-race-new-race-p-5">Choose a file first.</span>}
          </div>
          {error && <div id="results-error" className="prototype-organizer-pages-race-results-step-div-58"><Notice kind="error">{error}</Notice></div>}
        </Card>

        <div id="results-outcome" className="prototype-organizer-pages-race-results-step-div-59" aria-live="polite">
        {submission && !submission.is_valid && (
          <Notice kind="error" title={`The file has ${submission.errors.length} error${submission.errors.length === 1 ? '' : 's'} — fix them and upload again.`}>
            <IssueList issues={submission.errors} kind="error" />
            <ColumnsRead columns={submission.columns} ignored={submission.ignored_columns} className="prototype-organizer-pages-race-course-step-div-17" />
          </Notice>
        )}
        {submission?.is_valid && (
          <Card>
            <Notice kind="success" title={`${submission.scores.filter((r) => r.status === 'finisher').length} finisher${submission.scores.filter((r) => r.status === 'finisher').length === 1 ? '' : 's'} scored${submission.scores.some((r) => r.status !== 'finisher') ? `, ${submission.scores.filter((r) => r.status !== 'finisher').length} did not finish` : ''}.`}>
              {submission.warnings.length > 0 ? `${submission.warnings.length} warning${submission.warnings.length === 1 ? '' : 's'} to review — none block submission.` : 'No warnings.'}
            </Notice>
            {submission.warnings.length > 0 && (
              <details className="prototype-organizer-pages-race-results-step-details-60">
                <summary className="prototype-organizer-pages-race-results-step-summary-61">Warnings</summary>
                <IssueList issues={submission.warnings} kind="warning" />
              </details>
            )}
            <div className="prototype-organizer-pages-race-course-step-div-14">
              <ColumnsRead columns={submission.columns} ignored={submission.ignored_columns} className="prototype-organizer-pages-race-results-step-columns-read-62" />
              <ScoresTable rows={submission.scores} limit={8} />
            </div>
            <Button className="prototype-organizer-pages-race-course-step-div-14" onClick={() => navigate(`/races/${encodeURIComponent(raceId)}/review`)}>
              Continue to review <ArrowRight size={15} />
            </Button>
          </Card>
        )}
        </div>
      </div>
    </RaceShell>
  )
}

// --------------------------------------------------------------------------- Step 4: review

export function ReviewStep({ session, raceId }) {
  const units = useUnits()
  const { race, error: loadError, reload } = useRace(raceId)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRaceResults(raceId, session.token).then(setResults).catch(() => setResults([]))
  }, [raceId, session.token])

  async function togglePublish(publish) {
    setPublishing(true)
    setError(null)
    try {
      if (publish) await publishRace(raceId, session.token)
      else await unpublishRace(raceId, session.token)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  // Listing shows the race (facts and course, never results) on the public page ahead of its results.
  async function toggleListed(listed) {
    setPublishing(true)
    setError(null)
    try {
      await setRaceListed(raceId, listed, session.token)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${race.course_name}" and its results? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteRace(raceId, session.token)
      navigate(`/events/${encodeURIComponent(race.event_id)}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (loadError) return <Page title="Race"><div className="prototype-organizer-pages-race-course-step-div-14"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race || results === null) return <Page title="Loading…" />

  const base = `/races/${encodeURIComponent(raceId)}`
  const finishers = results.filter((r) => r.status === 'finisher')
  const hasResults = results.length > 0
  const status = raceStatus(race, hasResults)
  const lowConfidence = results.filter((r) => r.confidence === 'Low').length
  const notScored = notScoredReason(results)
  const complete = race.has_gpx && hasResults

  return (
    <RaceShell race={race} step={3}>
      <div className="prototype-organizer-pages-race-review-step-div-63">
        <Card>
          <div className="prototype-organizer-pages-race-review-step-div-64">
            <Eyebrow>PRE-FLIGHT CHECK</Eyebrow>
            <StatusChip status={status} />
          </div>
          <ul className="prototype-organizer-pages-race-review-step-ul-65">
            <ChecklistRow ok label="Event" detail={`${race.event_name} · ${formatDate(race.event_date)}`} />
            <ChecklistRow ok label="Race" detail={`${race.course_name} · ${formatDistance(race.distance_km, units)} · ${formatElevation(race.elevation_gain_m, units, { sign: '+' })}`} />
            <ChecklistRow
              ok={race.has_gpx}
              label="Course"
              detail={race.has_gpx ? `Measured from GPX · ${race.measurement_version ?? ''}${race.measurement_status === 'needs_review' ? ' · flagged for review' : ''}` : 'No GPX uploaded — scores need the course.'}
              fixTo={`${base}/course`}
              fixLabel="Add course"
            />
            <ChecklistRow
              ok={hasResults}
              label="Results"
              detail={hasResults ? `${finishers.length} finishers ${notScored ? 'listed with their times' : 'scored'}${results.length > finishers.length ? ` · ${results.length - finishers.length} DNF/DSQ` : ''}${lowConfidence ? ` · ${lowConfidence} at Low confidence (no terrain model for this region; the score is unaffected)` : ''}${notScored ? ` · ${notScored}` : ''}` : 'No results uploaded.'}
              fixTo={`${base}/results`}
              fixLabel="Upload results"
            />
            <ChecklistRow ok label="Scoring model" detail={modelLabel(race.scoring_version)} />
            <ChecklistRow
              ok={race.is_published}
              label="Published"
              detail={race.is_published ? `On the public races page since ${formatDate(String(race.published_at).slice(0, 10))}.` : race.is_listed ? 'Listed on the public races page without results.' : 'Not on the public site yet.'}
            />
          </ul>
          <div className="prototype-organizer-pages-race-review-step-div-66">
            {race.is_published ? (
              <Notice kind="success" title="Published.">
                This race is on the public races page{race.has_gpx ? ' and its course is offered in the score calculator' : ''}.{' '}
                <a href={`../#races/${encodeURIComponent(raceId)}`} className="prototype-organizer-pages-race-results-step-link-50">
                  View the public page
                </a>
                . Unpublish at any time to take it down.
              </Notice>
            ) : complete ? (
              <Notice kind="success" title="Ready to publish.">
                Every finisher has an OTRI score under {modelLabel(race.scoring_version)}. Publishing puts the leaderboard on the public races page and the
                course in the calculator's race list.
              </Notice>
            ) : hasResults ? (
              <Notice kind="warning" title="Scored without a course file.">
                Results are scored from the official distance and climb only. You can publish, but adding the GPX first gives every
                finisher a measured, reproducible score.
              </Notice>
            ) : (
              <Notice kind="info">Finish the items marked above, then publish.</Notice>
            )}
            {!race.is_published && (
              <p className="prototype-organizer-pages-race-review-step-p-67">
                {race.is_listed ? (
                  <>
                    Listed: runners can find this race, see its course and ask for scores.{' '}
                    <a href={`../#races/${encodeURIComponent(raceId)}`} className="prototype-organizer-pages-race-review-step-a-68">View the listing</a>. Results stay private until you publish.
                  </>
                ) : (
                  'Race day still ahead, or results not ready? List the race now: runners can find it, see the course and try target times, and results stay private until you publish.'
                )}
              </p>
            )}
          </div>
          {error && <div className="prototype-organizer-pages-race-course-step-div-17"><Notice kind="error">{error}</Notice></div>}
          <div className="prototype-organizer-pages-race-review-step-div-69">
            {race.is_published ? (
              <Button variant="secondary" busy={publishing} onClick={() => togglePublish(false)}>
                <EyeOff size={15} /> Unpublish
              </Button>
            ) : (
              <Button busy={publishing} disabled={!hasResults} onClick={() => togglePublish(true)}>
                <Eye size={15} /> Publish results
              </Button>
            )}
            {!race.is_published && (
              <Button variant="secondary" busy={publishing} onClick={() => toggleListed(!race.is_listed)}>
                {race.is_listed ? <EyeOff size={15} /> : <Eye size={15} />} {race.is_listed ? 'Remove listing' : 'List without results'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(`/events/${encodeURIComponent(race.event_id)}`)}>
              Back to event
            </Button>
            <Button variant="danger" busy={busy} onClick={remove}>
              Delete race
            </Button>
          </div>
        </Card>
        <Card>
          <Eyebrow>LEADERBOARD</Eyebrow>
          {hasResults ? (
            <div className="prototype-organizer-pages-race-course-step-div-17">
              <ScoresTable rows={results} limit={12} compact />
            </div>
          ) : (
            <p className="prototype-organizer-pages-race-review-step-p-70">Appears once results are scored.</p>
          )}
        </Card>
      </div>
    </RaceShell>
  )
}
