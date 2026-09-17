import { useEffect, useMemo, useRef, useState } from 'react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx, listRaces, fetchRaceGpxFile } from './apiClient'

// Real computation stages of scoring/course_demand.py + scoring/estimator.py — deliberately not
// "pacing"/"fatigue" stages, since this model never simulates either (see the V0.1 spec's
// explicit exclusions). The checklist only advances to "done" once the real API call resolves.
const STAGES = [
  { label: 'READING COURSE', items: ['Distance', 'Elevation', 'Terrain'] },
  { label: 'CALCULATING DEMAND', items: ['Segment gradient cost', 'Course demand'] },
  { label: 'SCORING', items: ['Performance rate', 'Score transformation'] },
]

// Published V0.1 anchor table (docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md section 13) —
// shown for context only in the technical explain layer. The actual score always comes from the API.
const PUBLISHED_ANCHORS = [
  { score: 0, q: 1.0 },
  { score: 349, q: 4.240362424138815 },
  { score: 544, q: 8.935158501440922 },
  { score: 692, q: 11.769395017793594 },
  { score: 1000, q: 17.93986234619293 },
]

const EXPLORE_OFFSETS_MIN = [-15, -10, -5, 0, 5, 10, 15]

function parseHmsToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null
  const [hours, minutes, seconds] = parts
  return hours * 3600 + minutes * 60 + seconds
}

function formatHms(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatPace(totalSeconds, distanceKm) {
  if (!distanceKm) return null
  const paceSeconds = totalSeconds / distanceKm
  const m = Math.floor(paceSeconds / 60)
  const s = Math.round(paceSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')} / km`
}

const STEP_ORDER = ['source', 'confirm', 'target', 'analyzing', 'result']
const STEP_LABELS = { source: 'Course', confirm: 'Confirm', target: 'Target time', analyzing: 'Analysing', result: 'Result' }

function StepProgress({ step }) {
  const visibleSteps = STEP_ORDER.filter((s) => s !== 'analyzing')
  const currentIndex = STEP_ORDER.indexOf(step === 'analyzing' ? 'target' : step)
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-[.06em] text-slate-400">
      {visibleSteps.map((s, i) => (
        <span key={s} className={`flex items-center gap-2 ${STEP_ORDER.indexOf(s) <= currentIndex ? 'text-blue-600' : ''}`}>
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[8px] ${
              STEP_ORDER.indexOf(s) <= currentIndex ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
            }`}
          >
            {i + 1}
          </span>
          {STEP_LABELS[s].toUpperCase()}
          {i < visibleSteps.length - 1 && <span className="mx-1 text-slate-300">—</span>}
        </span>
      ))}
    </div>
  )
}

function ContextBar({ courseLabel }) {
  if (!courseLabel) return null
  return (
    <p className="mt-2 text-xs text-slate-500">
      Course: <span className="font-semibold text-[#0b1220]">{courseLabel.name}</span>
      {courseLabel.meta ? ` · ${courseLabel.meta}` : ''}
      {' · '}
      <span className={courseLabel.verified ? 'text-blue-600' : 'text-amber-600'}>
        {courseLabel.verified ? 'Verified course' : 'User supplied'}
      </span>
    </p>
  )
}

export default function ScoreCalculator() {
  const [step, setStep] = useState('source')
  const [sourceMode, setSourceMode] = useState(null)
  const [query, setQuery] = useState('')
  const [races, setRaces] = useState([])
  const [racesFetched, setRacesFetched] = useState(false)
  const [racesLoading, setRacesLoading] = useState(false)
  const [racesError, setRacesError] = useState(null)

  const [courseFile, setCourseFile] = useState(null)
  const [gpxText, setGpxText] = useState('')
  const [courseLabel, setCourseLabel] = useState(null)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [features, setFeatures] = useState(null)
  const [measurement, setMeasurement] = useState(null)

  const [timeInput, setTimeInput] = useState('04:55:00')
  const [targetError, setTargetError] = useState(null)
  const [visibleStage, setVisibleStage] = useState(0)
  const [estimate, setEstimate] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)

  const [showExplain, setShowExplain] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [exploreRows, setExploreRows] = useState(null)
  const [exploreLoading, setExploreLoading] = useState(false)

  const analysisRunId = useRef(0)

  useEffect(() => {
    if (sourceMode !== 'search' || racesFetched || racesLoading) return
    setRacesLoading(true)
    setRacesError(null)
    listRaces()
      .then((all) => setRaces(all.filter((race) => race.has_gpx)))
      .catch((err) => setRacesError(err.message))
      .finally(() => {
        setRacesLoading(false)
        setRacesFetched(true)
      })
  }, [sourceMode, racesFetched, racesLoading])

  const filteredRaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return races
    return races.filter((race) => `${race.event_name} ${race.course_name}`.toLowerCase().includes(q))
  }, [races, query])

  async function loadCourse(loader, label) {
    setLoadError(null)
    setLoadingCourse(true)
    try {
      const file = await loader()
      const text = await file.text()
      const analysis = await analyzeGpx(file)
      setCourseFile(file)
      setGpxText(text)
      setFeatures(analysis.features)
      setMeasurement(analysis.measurement)
      setCourseLabel(label)
      setStep('confirm')
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoadingCourse(false)
    }
  }

  function chooseExistingRace(race) {
    loadCourse(() => fetchRaceGpxFile(race.race_id), {
      name: `${race.event_name} · ${race.course_name}`,
      meta: race.event_date,
      verified: true,
    })
  }

  function handleUpload(event) {
    const selected = event.target.files?.[0]
    if (!selected) return
    loadCourse(() => Promise.resolve(selected), { name: selected.name, meta: 'Uploaded GPX', verified: false })
  }

  function startOver() {
    setStep('source')
    setSourceMode(null)
    setCourseFile(null)
    setGpxText('')
    setCourseLabel(null)
    setFeatures(null)
    setMeasurement(null)
    setEstimate(null)
    setExploreRows(null)
    setShowExplain(false)
    setShowTechnical(false)
  }

  function startAnalysis() {
    const seconds = parseHmsToSeconds(timeInput)
    if (seconds === null || seconds <= 0) {
      setTargetError('Enter your target finish time as HH:MM:SS')
      return
    }
    setTargetError(null)
    setAnalysisError(null)
    setEstimate(null)
    setExploreRows(null)
    setShowExplain(false)
    setShowTechnical(false)
    setStep('analyzing')
    setVisibleStage(0)

    const runId = ++analysisRunId.current
    const ticker = setInterval(() => {
      setVisibleStage((current) => (current < STAGES.length - 1 ? current + 1 : current))
    }, 380)

    analyzeGpx(courseFile, seconds)
      .then((response) => {
        if (analysisRunId.current !== runId) return
        clearInterval(ticker)
        setVisibleStage(STAGES.length - 1)
        setFeatures(response.features)
        setMeasurement(response.measurement)
        setEstimate(response.estimate)
        setTimeout(() => {
          if (analysisRunId.current === runId) setStep('result')
        }, 300)
      })
      .catch((err) => {
        if (analysisRunId.current !== runId) return
        clearInterval(ticker)
        setAnalysisError(err.message)
        setStep('target')
      })
  }

  async function exploreNearbyTimes() {
    const seconds = parseHmsToSeconds(timeInput)
    if (seconds === null || !courseFile) return
    setExploreLoading(true)
    setExploreRows(null)
    try {
      const rows = []
      for (const offsetMin of EXPLORE_OFFSETS_MIN) {
        const candidateSeconds = seconds + offsetMin * 60
        if (candidateSeconds <= 0) continue
        // eslint-disable-next-line no-await-in-loop
        const response = await analyzeGpx(courseFile, candidateSeconds)
        rows.push({ seconds: candidateSeconds, isCurrent: offsetMin === 0, score: response.estimate.predicted_score })
      }
      setExploreRows(rows)
    } catch (err) {
      setAnalysisError(err.message)
    } finally {
      setExploreLoading(false)
    }
  }

  const anomalyFlags = ['implausible_local_elevation_change', 'conflicting_duplicate_elevations', 'sustained_grade_outside_scoring_domain']
  const hasAnomaly = measurement?.quality_flags?.some((flag) => anomalyFlags.includes(flag))

  return (
    <section className="mt-10">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">CALCULATE SCORE</p>
      <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">
        Know your OTRI score before you race.
      </h2>
      <p className="mt-2 max-w-[680px] text-sm text-slate-500">
        Choose a course, enter a target finish time, and see the score the real OTRI model would give that
        performance. Course + time + scoring version determine the score — nothing about who else is racing.
      </p>

      <StepProgress step={step} />
      <ContextBar courseLabel={courseLabel} />

      {step === 'source' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">STEP 1 — HOW DO YOU WANT TO GET THE COURSE?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={() => setSourceMode('search')}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${sourceMode === 'search' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:border-blue-300'}`}
            >
              Search existing race
            </button>
            <button
              onClick={() => setSourceMode('upload')}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${sourceMode === 'upload' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:border-blue-300'}`}
            >
              Upload GPX
            </button>
          </div>

          {sourceMode === 'search' && (
            <div className="mt-4">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by race or course name…"
                className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {racesLoading && <p className="mt-3 text-xs text-slate-500">Loading races…</p>}
              {racesError && <p className="mt-3 text-xs text-red-600">{racesError}</p>}
              {!racesLoading && !racesError && filteredRaces.length === 0 && (
                <p className="mt-3 text-xs text-slate-500">No races with a verified course match that search yet.</p>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {filteredRaces.map((race) => (
                  <button
                    key={race.race_id}
                    onClick={() => chooseExistingRace(race)}
                    disabled={loadingCourse}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-[#0b1220]">{race.event_name} · {race.course_name}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {race.event_date} · {race.distance_km} km · +{race.elevation_gain_m} m · Verified course
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sourceMode === 'upload' && (
            <div className="mt-4">
              <label
                htmlFor="calc-gpx-input"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm hover:border-blue-400 hover:bg-blue-50/40"
              >
                <span className="text-slate-600">
                  Drop or click to choose a .gpx file. We'll analyse the track and build a temporary course model for
                  your calculation.
                </span>
                <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Browse</span>
                <input id="calc-gpx-input" type="file" accept=".gpx" onChange={handleUpload} className="hidden" />
              </label>
              {loadingCourse && <p className="mt-3 text-xs text-slate-500">Reading course…</p>}
            </div>
          )}

          {loadError && <p className="mt-3 text-xs text-red-600">{loadError}</p>}
        </div>
      )}

      {step === 'confirm' && features && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">STEP 2 — CONFIRM YOUR COURSE</p>
          {gpxText && <CourseMap gpxText={gpxText} measurement={measurement} className="mt-3" />}
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Distance', `${features.distance_km} km`],
              ['Elevation gain', `+${features.elevation_gain_m} m`],
              ['Elevation loss', `-${features.elevation_loss_m} m`],
              [
                'Steepest 50 m grade',
                features.max_climb_grade == null ? 'Unavailable (short track)' : `+${(features.max_climb_grade * 100).toFixed(1)}% / -${(features.max_descent_grade * 100).toFixed(1)}%`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#0b1220]">{value}</dd>
              </div>
            ))}
          </dl>
          {hasAnomaly && (
            <p className="mt-3 text-sm text-amber-700">Elevation anomalies detected. Review the course profile before trusting this estimate.</p>
          )}
          <div className="mt-4 flex gap-3">
            <button onClick={startOver} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">
              Back
            </button>
            <button onClick={() => setStep('target')} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'target' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">STEP 3 — YOUR TARGET</p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500">Target finish time</label>
              <input
                type="text"
                value={timeInput}
                onChange={(event) => setTimeInput(event.target.value)}
                placeholder="HH:MM:SS"
                className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg"
              />
              {features && parseHmsToSeconds(timeInput) && (
                <p className="mt-1 font-mono text-xs text-slate-400">{formatPace(parseHmsToSeconds(timeInput), features.distance_km)}</p>
              )}
            </div>
            <button onClick={startAnalysis} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
              Analyse performance
            </button>
          </div>
          {targetError && <p className="mt-3 text-xs text-red-600">{targetError}</p>}
          {analysisError && <p className="mt-3 text-xs text-red-600">{analysisError}</p>}
          <button onClick={() => setStep('confirm')} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-700">
            ← Back to course
          </button>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {gpxText && <CourseMap gpxText={gpxText} measurement={measurement} className="mb-5" />}
          <div className="space-y-4">
            {STAGES.map((stage, i) => (
              <div key={stage.label}>
                <p className={`font-mono text-[10px] tracking-[.08em] ${i <= visibleStage ? 'text-blue-600' : 'text-slate-300'}`}>{stage.label}</p>
                <ul className="mt-1 flex flex-wrap gap-3 text-xs">
                  {stage.items.map((item) => (
                    <li key={item} className={i <= visibleStage ? 'text-[#0b1220]' : 'text-slate-300'}>
                      {i <= visibleStage ? '✓' : '·'} {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'result' && estimate && (
        <div className="mt-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 text-center">
              <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">OTRI</p>
              <p className="mt-2 text-6xl font-bold tracking-[-.03em] text-blue-600">{estimate.predicted_score}</p>
              <p className="mt-2 font-mono text-sm text-slate-500">{formatHms(parseHmsToSeconds(timeInput))}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Course</dt>
                  <dd className="font-semibold text-[#0b1220]">{features.distance_km} km / +{features.elevation_gain_m} m</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Score version</dt>
                  <dd className="font-mono text-xs font-semibold text-[#0b1220]">{estimate.scoring_version}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Evidence</dt>
                  <dd className="text-slate-600">Model-based projection · {estimate.disclaimer}</dd>
                </div>
              </dl>
              {estimate.quality_flags?.length > 0 && (
                <p className="mt-3 text-xs text-amber-700">Quality flags: {estimate.quality_flags.join(', ')}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => setShowExplain((v) => !v)} className="text-xs font-semibold text-blue-600">
                  {showExplain ? 'Hide' : 'Why this score?'}
                </button>
                <button onClick={() => setStep('target')} className="text-xs font-semibold text-slate-500">
                  Try a different time
                </button>
                <button onClick={startOver} className="text-xs font-semibold text-slate-500">
                  Start over
                </button>
              </div>
            </div>
          </div>

          {showExplain && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">WHY THIS SCORE</p>
              <p className="mt-2 text-sm text-slate-600">
                Your score comes from two things: what the <strong>course</strong> demands (distance and gradient,
                integrated segment by segment), and how fast you covered that demand (your{' '}
                <strong>performance</strong>). OTRI converts that ratio into one 0–1000 score using a fixed, published
                curve — never anyone else's result.
              </p>
              <button onClick={() => setShowTechnical((v) => !v)} className="mt-3 text-xs font-semibold text-blue-600">
                {showTechnical ? 'Hide technical calculation' : 'View technical calculation'}
              </button>
              {showTechnical && (
                <div className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <dt className="font-mono text-[9px] uppercase text-slate-400">Course demand</dt>
                      <dd className="font-semibold text-[#0b1220]">{estimate.equivalent_distance_km} demand-km</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase text-slate-400">Performance rate</dt>
                      <dd className="font-semibold text-[#0b1220]">{estimate.performance_rate} demand-km/h</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase text-slate-400">Raw score</dt>
                      <dd className="font-semibold text-[#0b1220]">{estimate.otri_raw}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase text-slate-400">Model</dt>
                      <dd className="font-mono font-semibold text-[#0b1220]">{estimate.scoring_version}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Published V0.1 curve anchors</p>
                  <table className="mt-1 w-full max-w-xs text-left">
                    <tbody>
                      {PUBLISHED_ANCHORS.map((anchor) => (
                        <tr key={anchor.score}>
                          <td className="py-0.5 pr-4 font-mono">{anchor.score}</td>
                          <td className="py-0.5 font-mono">{anchor.q.toFixed(3)} demand-km/h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">EXPLORE OTHER TIMES</p>
            {!exploreRows && (
              <button
                onClick={exploreNearbyTimes}
                disabled={exploreLoading}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-blue-300 disabled:opacity-50"
              >
                {exploreLoading ? 'Calculating…' : 'Show nearby finish times'}
              </button>
            )}
            {exploreRows && (
              <table className="mt-3 w-full max-w-sm text-left text-sm">
                <tbody>
                  {exploreRows.map((row) => (
                    <tr key={row.seconds} className={row.isCurrent ? 'font-bold text-blue-600' : 'text-slate-600'}>
                      <td className="py-1 font-mono">{formatHms(row.seconds)}</td>
                      <td className="py-1 pl-4">→</td>
                      <td className="py-1 pl-4 font-mono">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
