import { useEffect, useMemo, useRef, useState } from 'react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx, listRaces, fetchRaceGpxFile } from './apiClient'

// Published V0.1 anchor table (docs/methodology/v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md section 13) —
// shown for context in the "why this score" breakdown. The actual score always comes from the API.
const PUBLISHED_ANCHORS = [
  { score: 0, q: 1.0 },
  { score: 349, q: 4.240362424138815 },
  { score: 544, q: 8.935158501440922 },
  { score: 692, q: 11.769395017793594 },
  { score: 1000, q: 17.93986234619293 },
]

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

  const [targetSeconds, setTargetSeconds] = useState(17700)
  const [timeInput, setTimeInput] = useState(formatHms(17700))

  const [estimate, setEstimate] = useState(null)
  const [scoring, setScoring] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

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

  // Recompute the real score shortly after the target time settles (typing or dragging the
  // slider) — debounced so scrubbing the slider doesn't fire an API call per pixel, but no
  // "Analyse" button to click: the result is always live for whatever time is currently set.
  useEffect(() => {
    if (step !== 'target' || !courseFile || targetSeconds <= 0) return undefined
    const runId = ++analysisRunId.current
    const timer = setTimeout(() => {
      setScoring(true)
      setAnalysisError(null)
      analyzeGpx(courseFile, targetSeconds)
        .then((response) => {
          if (analysisRunId.current !== runId) return
          setEstimate(response.estimate)
          setFeatures(response.features)
          setMeasurement(response.measurement)
        })
        .catch((err) => {
          if (analysisRunId.current !== runId) return
          setAnalysisError(err.message)
        })
        .finally(() => {
          if (analysisRunId.current === runId) setScoring(false)
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [targetSeconds, courseFile, step])

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
      setEstimate(null)
      // Default target time: a 6 min/km pace on this course, clamped to the slider's range.
      const suggested = analysis.features?.distance_km ? Math.round((analysis.features.distance_km * 360) / 30) * 30 : 17700
      const clamped = Math.min(86400, Math.max(600, suggested))
      setTargetSeconds(clamped)
      setTimeInput(formatHms(clamped))
      setStep('target')
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
  }

  function updateTargetSeconds(seconds) {
    setTargetSeconds(seconds)
    setTimeInput(formatHms(seconds))
  }

  function updateTimeInput(value) {
    setTimeInput(value)
    const seconds = parseHmsToSeconds(value)
    if (seconds !== null && seconds > 0) {
      setTargetSeconds(Math.min(86400, seconds))
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
        Choose a course, then drag to your target finish time — the real OTRI score updates live. Course + time +
        scoring version determine the score — nothing about who else is racing.
      </p>

      <ContextBar courseLabel={courseLabel} />

      {step === 'source' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">HOW DO YOU WANT TO GET THE COURSE?</p>
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

      {step === 'target' && features && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {gpxText && <CourseMap gpxText={gpxText} measurement={measurement} className="mt-1" />}
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

            <div className="mt-5 border-t border-slate-100 pt-4">
              <label className="font-mono text-[9px] tracking-[.08em] text-slate-400">YOUR TARGET FINISH TIME</label>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <p className="font-mono text-4xl font-bold tracking-[-.02em] text-[#0b1220]">{formatHms(targetSeconds)}</p>
                <input
                  type="text"
                  value={timeInput}
                  onChange={(event) => updateTimeInput(event.target.value)}
                  placeholder="HH:MM:SS"
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-center font-mono text-sm"
                />
                <p className="font-mono text-xs text-slate-400">{formatPace(targetSeconds, features.distance_km)}</p>
              </div>
              <input
                type="range"
                min={600}
                max={86400}
                step={30}
                value={targetSeconds}
                onChange={(event) => updateTargetSeconds(Number(event.target.value))}
                className="mt-3 w-full accent-blue-600"
              />
              {analysisError && <p className="mt-2 text-xs text-red-600">{analysisError}</p>}
            </div>

            <button onClick={startOver} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">
              Change course
            </button>
          </div>

          {estimate && (
            <div className="space-y-4">
              <div className={`rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 text-center transition-opacity ${scoring ? 'opacity-60' : ''}`}>
                <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">OTRI</p>
                <p className="mt-2 text-6xl font-bold tracking-[-.03em] text-blue-600">{estimate.predicted_score}</p>
                <p className="mt-2 font-mono text-sm text-slate-500">{formatHms(targetSeconds)}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">WHY THIS SCORE</p>
                <p className="mt-2 text-sm text-slate-600">
                  What the <strong>course</strong> demands (distance and gradient, integrated segment by segment) ÷ how
                  fast you covered that demand (your <strong>performance</strong>) → mapped through a fixed, published
                  curve. Never anyone else's result.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="font-mono text-[9px] uppercase text-slate-400">Physical distance</dt>
                    <dd className="font-semibold text-[#0b1220]">{features.distance_km} km</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase text-slate-400">Flat-equivalent distance (course demand)</dt>
                    <dd className="font-semibold text-[#0b1220]">{estimate.equivalent_distance_km} demand-km</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase text-slate-400">Performance rate</dt>
                    <dd className="font-semibold text-[#0b1220]">{estimate.performance_rate} demand-km/h</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase text-slate-400">Raw score (unrounded)</dt>
                    <dd className="font-semibold text-[#0b1220]">{estimate.otri_raw}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-mono text-[9px] uppercase text-slate-400">Score version</dt>
                    <dd className="font-mono font-semibold text-[#0b1220]">{estimate.scoring_version}</dd>
                  </div>
                </dl>
                {estimate.scoring_version?.includes('duration-scaled') && (
                  <p className="mt-3 text-xs text-slate-500">
                    This course's demand is duration-scaled (Riegel exponent, see{' '}
                    <code>docs/methodology/v0.3/OTRI-DURATION-SCALED-CURVE.md</code>) before being looked up in the
                    table below, since sustainable performance rate naturally drops on much longer/harder courses.
                  </p>
                )}
                <p className="mt-3 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">
                  Published reference-course curve anchors{estimate.scoring_version?.includes('duration-scaled') ? ' (before duration-scaling)' : ''}
                </p>
                <table className="mt-1 w-full text-left text-xs">
                  <tbody>
                    {PUBLISHED_ANCHORS.map((anchor) => (
                      <tr key={anchor.score}>
                        <td className="py-0.5 pr-4 font-mono">{anchor.score}</td>
                        <td className="py-0.5 font-mono">{anchor.q.toFixed(3)} demand-km/h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">Model-based projection · {estimate.disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

