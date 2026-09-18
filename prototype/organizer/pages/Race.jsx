import { useEffect, useState } from 'react'
import CourseMap from '../../../src/components/CourseMap'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { modelLabel } from '../../../src/lib/model'
import {
  analyzeGpx,
  attachRaceGpx,
  createRace,
  deleteRace,
  fetchRaceGpxFile,
  getRace,
  getRaceMeasurement,
  getRaceResults,
  listScoringModels,
  publishRace,
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

const STEP_EYEBROW = ['STEP 3 OF 5 · RACE', 'STEP 4 OF 5 · COURSE', 'STEP 5 OF 5 · RESULTS', 'REVIEW']

function RaceShell({ race, step, children }) {
  return (
    <Page
      back={{ to: `/events/${encodeURIComponent(race.event_id)}`, label: race.event_name }}
      eyebrow={`${STEP_EYEBROW[step]} · ${race.event_name.toUpperCase()} · ${formatDate(race.event_date).toUpperCase()}`}
      title={race.course_name}
    >
      <div className="mt-8">
        <Stepper steps={raceSteps(race.race_id)} current={step} />
      </div>
      <div className="mt-8">{children}</div>
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
  const [models, setModels] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    listScoringModels().then(setModels).catch(() => setModels([]))
  }, [])
  const current = models[0]

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
      eyebrow="STEP 3 OF 5 · RACE"
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
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Race name" htmlFor="rc-name" hint="How this distance is listed — “50K”, “100 mile”, “Vertical”.">
            <input id="rc-name" required value={form.course_name} onChange={(e) => setForm((f) => ({ ...f, course_name: e.target.value }))} className={inputClass} placeholder="50K" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Official distance (km)" htmlFor="rc-dist">
              <input id="rc-dist" required type="number" min="0.1" step="0.1" value={form.distance_km} onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))} className={inputClass} placeholder="51.4" />
            </Field>
            <Field label="Official elevation gain (m)" htmlFor="rc-gain">
              <input id="rc-gain" required type="number" min="0" step="1" value={form.elevation_gain_m} onChange={(e) => setForm((f) => ({ ...f, elevation_gain_m: e.target.value }))} className={inputClass} placeholder="2800" />
            </Field>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Scoring model: <span className="font-mono font-semibold text-[#0b1220]">{modelLabel(current?.version)}</span>
            <p className="mt-1">Scores depend only on the course and each finisher's own time — never on who else raced.</p>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" busy={busy} disabled={!form.course_name.trim() || !form.distance_km || form.elevation_gain_m === ''}>
              Save and add the course <ArrowRight size={15} />
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/events/${encodeURIComponent(eventId)}`)}>
              Cancel
            </Button>
          </div>
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
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Measured distance', formatDistance(features.distance_km, units), entered.distance_km ? `you entered ${formatDistance(entered.distance_km, units)}` : null, dDist],
          ['Measured climb', formatElevation(features.elevation_gain_m, units, { sign: '+' }), entered.elevation_gain_m ? `you entered ${formatElevation(entered.elevation_gain_m, units, { sign: '+' })}` : null, dGain],
          ['Descent', features.elevation_loss_m != null ? formatElevation(features.elevation_loss_m, units, { sign: '-' }) : '—', null, null],
          ['Elevation source', dem ? 'Terrain model' : 'Your GPX file', dem ? measurement.source.dataset : 'not independently verified', null],
        ].map(([label, value, sub, delta]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-[#0b1220]">{value}</dd>
            {sub && (
              <dd className={`text-[11px] ${big(delta) ? 'text-amber-700' : 'text-slate-500'}`}>
                {sub}
                {delta != null ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(0)}%)` : ''}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {(big(dDist) || big(dGain)) && (
        <Notice kind="warning" title="Your official figures differ from the measured course by more than 5%.">
          That is common — organizer totals often come from a different device or a rounded course. OTRI scores from the measured course; check the map matches your route before continuing.
        </Notice>
      )}
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

  if (loadError) return <Page title="Race"><div className="mt-4"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race) return <Page title="Loading…" />

  const entered = { distance_km: race.distance_km, elevation_gain_m: race.elevation_gain_m }

  return (
    <RaceShell race={race} step={1}>
      <div className="grid gap-4">
        {race.has_gpx && !analysis && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Eyebrow>COURSE ON FILE</Eyebrow>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · measurement{' '}
                  {race.measurement_version ?? '—'}
                  {race.measurement_status === 'needs_review' ? ' · flagged for review' : ''}
                </p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(race.race_id)}/results`)}>
                Continue to results <ArrowRight size={15} />
              </Button>
            </div>
            {existing?.gpxText && <CourseMap gpxText={existing.gpxText} measurement={existing.measurement} className="mt-4" />}
            {existing?.measurement?.quality_flags?.includes('sparse_geometry_median_over_30m') && (
              <div className="mt-4">
                <Notice kind="warning" title="This course was recorded too sparsely.">
                  Upload a denser export below to replace it — the score's trust label depends on it.
                </Notice>
              </div>
            )}
          </Card>
        )}

        <Card>
          <Eyebrow>{race.has_gpx ? 'REPLACE THE COURSE' : 'UPLOAD THE COURSE'}</Eyebrow>
          <p className="mt-1 text-sm text-slate-600">
            Upload the official route as a GPX. OTRI measures it — every 10 m, elevation from verified terrain data where available — and shows how it compares with the figures you entered before anything is saved.
          </p>
          <div className="mt-4">
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
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        </Card>

        {analysis && (
          <Card>
            <Eyebrow>MEASURED COURSE</Eyebrow>
            <CourseMap gpxText={gpxText} measurement={analysis.measurement} className="mt-3" />
            <div className="mt-4">
              <CourseFacts measurement={analysis.measurement} features={analysis.features} entered={entered} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button busy={busy === 'attaching'} onClick={useCourse}>
                Use this course <ArrowRight size={15} />
              </Button>
              <Button variant="secondary" onClick={() => { setAnalysis(null); setFile(null) }}>
                Choose another file
              </Button>
              <p className="text-xs text-slate-500">Saving replaces the race's distance and climb with the measured values.</p>
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
const COLUMNS = [
  ['Rank', 'required', 'finishing position, or DNF / DNS / DSQ', 'Ranking, Position, Place, Overall'],
  ['Time', 'finishers', 'H:MM:SS; blank for non-finishers', 'Finish time, Net time, Chip time, Official time'],
  ['Last name', 'required', '', 'Family name, Surname, Lastname'],
  ['First name', 'required', '', 'Firstname, Given name'],
  ['Gender', 'required', 'M / F / X, or Male / Female', 'Sex'],
  ['Status', 'optional', 'Finisher, DNF, DNS, DSQ; may replace the rank', 'Result status'],
  ['Bib', 'recommended', 'as printed, letters allowed', 'Bib number, Race number, Start number'],
  ['Nationality', 'optional', '3-letter country code', 'Country, Nat'],
  ['Birthdate', 'optional', 'YYYY-MM-DD; only if you may share it', 'Date of birth, DOB, YOB'],
  ['City', 'optional', '', 'Town'],
  ['Team', 'optional', '', 'Club'],
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
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">EXAMPLE FILE</p>
          <p className="mt-0.5 text-xs text-slate-600">Six rows: four finishers, a DNF, a DNS. Any file laid out like this passes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={EXAMPLE_FILES.csv} download="otri-results-example.csv" className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0b1220] no-underline hover:border-blue-300">
            Download CSV
          </a>
          <a href={EXAMPLE_FILES.xlsx} download="otri-results-example.xlsx" className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0b1220] no-underline hover:border-blue-300">
            Download XLSX
          </a>
          <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" busy={busy} onClick={onUse}>
            Use the example file
          </Button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-blue-600">
            {open ? 'Hide' : 'Show'} rows
          </button>
        </div>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[820px] text-left font-mono text-[11px]">
            <thead>
              <tr className="bg-white text-[9px] uppercase tracking-[.06em] text-slate-500">
                {EXAMPLE_HEADER.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ROWS.map((row, i) => (
                <tr key={i} className="border-t border-slate-100 text-[#0b1220]">
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-1.5">
                      {cell === '' ? <span className="text-slate-300">·</span> : cell}
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

function IssueList({ issues, kind }) {
  return (
    <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
      {issues.map((issue, index) => (
        <li key={index} className={kind === 'error' ? 'text-red-700' : 'text-amber-800'}>
          {issue.row != null ? <span className="font-mono">row {issue.row}</span> : null}
          {issue.field ? <span className="font-mono"> · {issue.field}</span> : null}
          {issue.row != null || issue.field ? ' — ' : ''}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

export function ScoresTable({ rows, limit, compact = false }) {
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className={`w-full text-left text-sm ${compact ? '' : 'min-w-[480px]'}`}>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">Runner</th>
            {!compact && <th className="px-3 py-2">Bib</th>}
            <th className="px-3 py-2 text-right">OTRI</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={`${row.rank}-${row.bib_number ?? row.family_name}`} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.rank}</td>
              <td className="px-3 py-2 font-medium text-[#0b1220]">{row.first_name} {row.family_name}</td>
              {!compact && <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.bib_number ?? '—'}</td>}
              <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">{row.otri_score ?? <span className="font-normal text-slate-400">{row.status}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="px-3 py-2 text-xs text-slate-500">…and {rows.length - limit} more</p>}
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
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <Page title="Race"><div className="mt-4"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race) return <Page title="Loading…" />

  return (
    <RaceShell race={race} step={2}>
      <div className="grid gap-4">
        {!race.has_gpx && (
          <Notice kind="warning" title="No course yet.">
            Results can be uploaded, but scores need the course. <Link to={`/races/${encodeURIComponent(raceId)}/course`} className="font-semibold underline">Add the GPX first</Link> for the best result.
          </Notice>
        )}
        {existing?.length > 0 && !submission && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Eyebrow>RESULTS ON FILE</Eyebrow>
                <p className="mt-1 text-sm text-slate-600">{existing.length} finishers scored. Uploading a new file replaces them.</p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(raceId)}/review`)}>
                Continue to review <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <Eyebrow>{existing?.length ? 'REPLACE RESULTS' : 'UPLOAD RESULTS'}</Eyebrow>
          <p className="mt-1 text-sm text-slate-600">
            One file per race distance, CSV or XLSX, one row per participant: the layout your timing company already
            exports. Column names are matched loosely and extra columns are ignored. OTRI validates the file first and
            tells you exactly what to fix; nothing is scored until it passes.
          </p>
          <ExampleFile onUse={useExample} busy={loadingExample} />
          <div className="mt-3">
            <button type="button" onClick={() => setShowGuide((v) => !v)} className="text-xs font-semibold text-blue-600">
              {showGuide ? 'Hide' : 'Show'} the accepted columns
            </button>
          </div>
          {showGuide && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[9px] uppercase tracking-[.06em] text-slate-500">
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">Needed</th>
                    <th className="px-3 py-2">Values</th>
                    <th className="px-3 py-2">Also accepted as</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map(([name, need, note, aliases]) => (
                    <tr key={name} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-1.5 font-mono font-semibold text-[#0b1220]">{name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{need}</td>
                      <td className="px-3 py-1.5 text-slate-500">{note}</td>
                      <td className="px-3 py-1.5 text-slate-500">{aliases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[11px] text-slate-500">
                Files that mix several distances are rejected with the distances found: each race distance has its own
                course, so each gets its own upload.
              </p>
            </div>
          )}
          <div className="mt-4">
            <Dropzone
              id="results-file"
              accept=".csv,.xlsx"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSubmission(null); setError(null) }}
              label="Drop a .csv or .xlsx file here, or browse"
              hint="One row per finisher. The file is validated before anything is scored."
              fileName={file?.name}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button busy={busy} disabled={!file} onClick={submit}>
              Validate and score <ArrowRight size={15} />
            </Button>
          </div>
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        </Card>

        {submission && !submission.is_valid && (
          <Notice kind="error" title={`The file has ${submission.errors.length} error${submission.errors.length === 1 ? '' : 's'} — fix them and upload again.`}>
            <IssueList issues={submission.errors} kind="error" />
          </Notice>
        )}
        {submission?.is_valid && (
          <Card>
            <Notice kind="success" title={`${submission.scores.filter((r) => r.status === 'finisher').length} finisher${submission.scores.filter((r) => r.status === 'finisher').length === 1 ? '' : 's'} scored${submission.scores.some((r) => r.status !== 'finisher') ? `, ${submission.scores.filter((r) => r.status !== 'finisher').length} did not finish` : ''}.`}>
              {submission.warnings.length > 0 ? `${submission.warnings.length} warning${submission.warnings.length === 1 ? '' : 's'} to review — none block submission.` : 'No warnings.'}
            </Notice>
            {submission.warnings.length > 0 && (
              <details className="mt-3 rounded-lg bg-amber-50/60 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-amber-800">Warnings</summary>
                <IssueList issues={submission.warnings} kind="warning" />
              </details>
            )}
            <div className="mt-4">
              <ScoresTable rows={submission.scores} limit={8} />
            </div>
            <Button className="mt-4" onClick={() => navigate(`/races/${encodeURIComponent(raceId)}/review`)}>
              Continue to review <ArrowRight size={15} />
            </Button>
          </Card>
        )}
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

  if (loadError) return <Page title="Race"><div className="mt-4"><Notice kind="error">{loadError}</Notice></div></Page>
  if (!race || results === null) return <Page title="Loading…" />

  const base = `/races/${encodeURIComponent(raceId)}`
  const finishers = results.filter((r) => r.status === 'finisher')
  const hasResults = results.length > 0
  const status = raceStatus(race, hasResults)
  const lowConfidence = results.filter((r) => r.confidence === 'Low').length
  const complete = race.has_gpx && hasResults

  return (
    <RaceShell race={race} step={3}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>PRE-FLIGHT CHECK</Eyebrow>
            <StatusChip status={status} />
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
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
              detail={hasResults ? `${finishers.length} finishers scored${results.length > finishers.length ? ` · ${results.length - finishers.length} DNF/DSQ` : ''}${lowConfidence ? ` · ${lowConfidence} at low confidence` : ''}` : 'No results uploaded.'}
              fixTo={`${base}/results`}
              fixLabel="Upload results"
            />
            <ChecklistRow ok label="Scoring model" detail={modelLabel(race.scoring_version)} />
            <ChecklistRow
              ok={race.is_published}
              label="Published"
              detail={race.is_published ? `On the public races page since ${formatDate(String(race.published_at).slice(0, 10))}.` : 'Not on the public site yet.'}
            />
          </ul>
          <div className="mt-5">
            {race.is_published ? (
              <Notice kind="success" title="Published.">
                This race is on the public races page{race.has_gpx ? ' and its course is offered in the score calculator' : ''}.{' '}
                <a href={`../#races/${encodeURIComponent(raceId)}`} className="font-semibold underline">
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
          </div>
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
          <div className="mt-5 flex flex-wrap gap-3">
            {race.is_published ? (
              <Button variant="secondary" busy={publishing} onClick={() => togglePublish(false)}>
                <EyeOff size={15} /> Unpublish
              </Button>
            ) : (
              <Button busy={publishing} disabled={!hasResults} onClick={() => togglePublish(true)}>
                <Eye size={15} /> Publish results
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
            <div className="mt-3">
              <ScoresTable rows={results} limit={12} compact />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Appears once results are scored.</p>
          )}
        </Card>
      </div>
    </RaceShell>
  )
}
