import { useEffect, useState } from 'react'
import CourseMap from '../../../src/components/CourseMap'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
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
  submitRaceResults,
} from '../../apiClient'
import { Link, navigate } from '../router'
import { Button, Card, ChecklistRow, Field, Notice, Page, StatusChip, Stepper, formatDate, inputClass, raceStatus } from '../ui'

function raceSteps(raceId) {
  const base = `/races/${encodeURIComponent(raceId)}`
  return [
    { label: 'Race' },
    { label: 'Course', to: `${base}/course` },
    { label: 'Results', to: `${base}/results` },
    { label: 'Review', to: `${base}/review` },
  ]
}

function RaceShell({ race, step, children }) {
  return (
    <Page wide back={{ to: `/events/${encodeURIComponent(race.event_id)}`, label: race.event_name }} eyebrow={`${race.event_name} · ${formatDate(race.event_date)}`} title={race.course_name}>
      <div className="mt-4">
        <Stepper steps={raceSteps(race.race_id)} current={step} />
      </div>
      <div className="mt-6">{children}</div>
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
    <Page back={{ to: `/events/${encodeURIComponent(eventId)}`, label: 'Event' }} eyebrow="STEP 3 OF 5" title="Add a race" intro="One race per distance. Enter your official figures now; OTRI will measure the course from the GPX in the next step and show you how they compare.">
      <Card className="mt-6 max-w-[560px]">
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
            Scoring model: <span className="font-mono font-semibold text-[#0b1220]">{current ? current.name : 'current OTRI model'}</span>
            {current && <span className="font-mono"> · {current.version}</span>}
            <p className="mt-1">Scores depend only on the course and each finisher's own time — never on who else raced.</p>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-3">
            <Button type="submit" busy={busy} disabled={!form.course_name.trim() || !form.distance_km || form.elevation_gain_m === ''}>
              Save and add the course
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/events/${encodeURIComponent(eventId)}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </Page>
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
          ['Descent', `-${Math.round(features.elevation_loss_m)} m`, null, null],
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
    Promise.all([fetchRaceGpxFile(race.race_id), getRaceMeasurement(race.race_id)])
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
                <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">COURSE ON FILE</p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · measurement{' '}
                  {race.measurement_version ?? '—'}
                  {race.measurement_status === 'needs_review' ? ' · flagged for review' : ''}
                </p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(race.race_id)}/results`)}>Continue to results</Button>
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
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{race.has_gpx ? 'REPLACE THE COURSE' : 'UPLOAD THE COURSE'}</p>
          <p className="mt-1 text-sm text-slate-600">
            Upload the official route as a GPX. OTRI measures it — every 10 m, elevation from verified terrain data where available — and shows how it compares with the figures you entered before anything is saved.
          </p>
          <label htmlFor="course-file" className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm hover:border-blue-400 hover:bg-blue-50/40">
            <span className="text-slate-600">{file ? file.name : 'Drop or click to choose a .gpx file'}</span>
            <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Browse</span>
            <input id="course-file" type="file" accept=".gpx" onChange={chooseFile} className="hidden" />
          </label>
          {busy === 'analyzing' && (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /> Measuring the course… long courses take a few seconds.
            </p>
          )}
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        </Card>

        {analysis && (
          <Card>
            <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">MEASURED COURSE</p>
            <CourseMap gpxText={gpxText} measurement={analysis.measurement} className="mt-3" />
            <div className="mt-4">
              <CourseFacts measurement={analysis.measurement} features={analysis.features} entered={entered} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button busy={busy === 'attaching'} onClick={useCourse}>
                Use this course
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

const COLUMNS = [
  ['Ranking', 'required', 'finish rank, or DNF'],
  ['Time', 'finishers', 'HH:MM:SS; blank for DNF'],
  ['Family name', 'required', ''],
  ['First Name', 'required', ''],
  ['Gender', 'required', 'M / F'],
  ['Bib Number', 'recommended', ''],
  ['Nationality', 'optional', 'country code'],
  ['Birthdate', 'optional', 'only if you may share it'],
  ['City', 'optional', ''],
  ['Team', 'optional', ''],
]

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
    <div className="overflow-x-auto rounded-xl border border-slate-200">
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
              <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">{row.otri_score}</td>
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

  useEffect(() => {
    getRaceResults(raceId).then(setExisting).catch(() => setExisting([]))
  }, [raceId])

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
                <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">RESULTS ON FILE</p>
                <p className="mt-1 text-sm text-slate-600">{existing.length} finishers scored. Uploading a new file replaces them.</p>
              </div>
              <Button onClick={() => navigate(`/races/${encodeURIComponent(raceId)}/review`)}>Continue to review</Button>
            </div>
          </Card>
        )}

        <Card>
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{existing?.length ? 'REPLACE RESULTS' : 'UPLOAD RESULTS'}</p>
          <p className="mt-1 text-sm text-slate-600">
            One row per finisher, CSV or XLSX. OTRI validates the file first and tells you exactly what to fix; nothing is scored until it passes.
          </p>
          <button type="button" onClick={() => setShowGuide((v) => !v)} className="mt-2 text-xs font-semibold text-blue-600">
            {showGuide ? 'Hide' : 'Show'} the expected columns
          </button>
          {showGuide && (
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {COLUMNS.map(([name, need, note]) => (
                  <tr key={name} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-3 font-mono font-semibold text-[#0b1220]">{name}</td>
                    <td className="py-1 pr-3 text-slate-500">{need}</td>
                    <td className="py-1 text-slate-500">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <label htmlFor="results-file" className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm hover:border-blue-400 hover:bg-blue-50/40">
            <span className="text-slate-600">{file ? file.name : 'Drop or click to choose a .csv or .xlsx file'}</span>
            <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Browse</span>
            <input id="results-file" type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSubmission(null); setError(null) }} className="hidden" />
          </label>
          <div className="mt-4 flex items-center gap-3">
            <Button busy={busy} disabled={!file} onClick={submit}>
              Validate and score
            </Button>
            {file && <span className="text-xs text-slate-500">{file.name}</span>}
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
            <Notice kind="success" title={`${submission.scores.length} finisher${submission.scores.length === 1 ? '' : 's'} scored.`}>
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
              Continue to review
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
  const { race, error: loadError } = useRace(raceId)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRaceResults(raceId).then(setResults).catch(() => setResults([]))
  }, [raceId])

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
  const hasResults = results.length > 0
  const status = raceStatus(race, hasResults)
  const lowConfidence = results.filter((r) => r.confidence === 'Low').length
  const complete = race.has_gpx && hasResults

  return (
    <RaceShell race={race} step={3}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">PRE-FLIGHT CHECK</p>
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
              detail={hasResults ? `${results.length} finishers scored${lowConfidence ? ` · ${lowConfidence} at low confidence` : ''}` : 'No results uploaded.'}
              fixTo={`${base}/results`}
              fixLabel="Upload results"
            />
            <ChecklistRow ok label="Scoring model" detail={race.scoring_version} />
          </ul>
          <div className="mt-5">
            {complete ? (
              <Notice kind="success" title="This race is complete.">
                Every finisher has an OTRI score under {race.scoring_version}. A public race page you can link from your own site is the next thing being built; until then, results are available through the OTRI API.
              </Notice>
            ) : (
              <Notice kind="info">Finish the items marked above and this race is done.</Notice>
            )}
          </div>
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate(`/events/${encodeURIComponent(race.event_id)}`)}>
              Back to event
            </Button>
            <Button variant="danger" busy={busy} onClick={remove}>
              Delete race
            </Button>
          </div>
        </Card>
        <Card>
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">LEADERBOARD</p>
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
