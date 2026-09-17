import { useEffect, useMemo, useRef, useState } from 'react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx, listRaces, fetchRaceGpxFile } from './apiClient'

// Published anchor tables, shown for context in the "why this score" breakdown. The actual
// score always comes from the API. Scores 0-544 are V0.1's real demo/test anchors in every
// table; what differs is the top of the scale and whether the 692 demo anchor is kept:
//   - V0.1-V0.3: 692 kept, 1000-anchor is V0.1's extrapolated 17.940
//   - V0.4-V0.5: 692 kept, 1000-anchor is the measured human ceiling 21.533
//   - V0.6+:     692 dropped (docs/methodology/v0.6/OTRI-SMOOTHED-UPPER-CURVE.md)
const ANCHOR_0 = { score: 0, q: 1.0 }
const ANCHOR_349 = { score: 349, q: 4.240362424138815 }
const ANCHOR_544 = { score: 544, q: 8.935158501440922 }
const ANCHOR_692 = { score: 692, q: 11.769395017793594 }
const ANCHOR_1000_LEGACY = { score: 1000, q: 17.93986234619293 }
const ANCHOR_1000 = { score: 1000, q: 21.5331347785071 }

function publishedAnchorsFor(scoringVersion) {
  if (scoringVersion.includes('smoothed-upper') || scoringVersion.includes('dem-gated')) {
    return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_1000]
  }
  if (scoringVersion.includes('endurance-referenced') || scoringVersion.includes('terrain-adjusted')) {
    return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_692, ANCHOR_1000]
  }
  return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_692, ANCHOR_1000_LEGACY]
}

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

function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 ${className}`}
    />
  )
}

// The score itself. Rendered as soon as a calculation is in flight — not only once a result
// exists — so a long course never shows an empty column while the API integrates 13,000 points.
function ScoreCard({ estimate, scoring, targetSeconds }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={scoring}
      className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 text-center"
    >
      <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">OTRI</p>
      {estimate ? (
        <>
          <p className={`mt-2 text-6xl font-bold tracking-[-.03em] text-blue-600 transition-opacity ${scoring ? 'opacity-40' : ''}`}>
            {estimate.predicted_score}
          </p>
          <p className="mt-2 font-mono text-sm text-slate-500">{formatHms(targetSeconds)}</p>
          {estimate.confidence && (
            <p
              className={`mt-2 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${
                estimate.confidence === 'High'
                  ? 'bg-emerald-50 text-emerald-700'
                  : estimate.confidence === 'Medium'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {estimate.confidence} confidence
            </p>
          )}
          {scoring && (
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Spinner /> Updating…
            </p>
          )}
        </>
      ) : (
        <div className="py-4">
          <Spinner className="h-8 w-8 border-4" />
          <p className="mt-3 text-sm font-semibold text-[#0b1220]">Calculating your score…</p>
          <p className="mt-1 text-xs text-slate-500">
            Every 50 m of the course is measured and costed. Longer and hillier courses take a few seconds.
          </p>
        </div>
      )}
    </div>
  )
}

// Plain-language numbers are shown to one decimal; the maths section keeps full precision.
function fmt1(value) {
  return Number(value).toFixed(1)
}

function Stat({ label, value, mono = true }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase text-slate-400">{label}</dt>
      <dd className={`font-semibold text-[#0b1220] ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

// Two audiences, one panel. The plain-language story on top reads the API's own breakdown of
// the score — nothing is recomputed here — and the maths lives behind a native <details>, so
// it costs nothing to ignore and needs no state.
// Why a score can or cannot be trusted: where the elevation came from, and whether the track was
// dense enough to measure the route. Both are decided by the API; this only renders them.
function MeasurementTrust({ estimate, measurement }) {
  const flags = estimate.quality_flags ?? []
  const reasons = flags.filter((flag) => flag.startsWith('elevation_not_dem_sourced') || flag.startsWith('route_not_reproducible'))
  const demSourced = measurement?.source?.dataset && measurement.source.dataset !== 'uploaded-gpx'
  const spacing = measurement?.median_edge_m
  if (!estimate.confidence) return null
  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${
        estimate.confidence === 'High' ? 'border-emerald-100 bg-emerald-50/60 text-emerald-800' : 'border-amber-100 bg-amber-50/60 text-amber-800'
      }`}
    >
      <p className="font-semibold">
        {estimate.confidence === 'High'
          ? 'Measured from a pinned terrain dataset on a dense track — the same route scores the same from any device.'
          : 'This score depends on how the course was recorded.'}
      </p>
      <ul className="mt-1 space-y-0.5">
        <li>
          Elevation: {demSourced ? `${measurement.source.dataset}${measurement.source.release ? ` (${measurement.source.release})` : ''}` : 'from your GPX file — not independently verified'}
        </li>
        {spacing != null && <li>Track density: one point every {spacing} m{spacing > 30 ? ' — too sparse; switchbacks get cut short' : ''}</li>}
        {reasons.map((flag) => (
          <li key={flag} className="break-words">{flag.replace(/^[a-z_]+: /, '')}</li>
        ))}
      </ul>
    </div>
  )
}

function ScoreExplanation({ estimate, features, targetSeconds, publishedAnchors, scaledVersion, measurement }) {
  const b = estimate.breakdown
  const pct = b?.fraction_of_ceiling != null ? Math.round(b.fraction_of_ceiling * 100) : null
  const terrainPct = b ? Math.round((b.terrain_factor - 1) * 1000) / 10 : 0
  const hasTerrain = terrainPct > 0
  const hours = targetSeconds / 3600

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">HOW YOUR SCORE IS CALCULATED</p>

      {b ? (
        <ol className="mt-3 space-y-3 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">1</span>
            <div>
              <p className="font-semibold text-[#0b1220]">How hard is the course?</p>
              <p>
                {fmt1(b.physical_distance_km)} km with +{Math.round(features.elevation_gain_m)} m of climbing. Counting
                every climb and descent, it's as hard as running <strong>{fmt1(b.course_demand_km)} km on flat road</strong>.
                {hasTerrain && (
                  <>
                    {' '}Sustained steep ground{b.altitude_excess_m > 0 ? ' and altitude' : ''} push that up
                    another <strong>{terrainPct}%</strong>, to <strong>{fmt1(b.adjusted_demand_km)} flat km</strong>.
                  </>
                )}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">2</span>
            <div>
              <p className="font-semibold text-[#0b1220]">How fast would you cover it?</p>
              <p>
                Finishing in {formatHms(targetSeconds)} means covering those {fmt1(b.adjusted_demand_km)} flat km in{' '}
                {hours.toFixed(2)} hours — <strong>{fmt1(b.performance_rate)} flat km per hour</strong>.
              </p>
            </div>
          </li>
          {b.reference_rate != null ? (
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">3</span>
              <div>
                <p className="font-semibold text-[#0b1220]">How close is that to the best ever?</p>
                <p>
                  The fastest anyone has ever covered a course this hard is about{' '}
                  <strong>{fmt1(b.reference_rate)} flat km per hour</strong> — a{' '}
                  <strong>{formatHms(b.world_best_time_seconds)}</strong> finish here. You'd be at{' '}
                  <strong>{pct}%</strong> of that, which scores <strong>{estimate.predicted_score}</strong>.
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                </div>
                <p className="mt-1 flex justify-between font-mono text-[9px] text-slate-400">
                  <span>0</span>
                  <span>1000 = world best</span>
                </p>
              </div>
            </li>
          ) : (
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">3</span>
              <div>
                <p className="font-semibold text-[#0b1220]">Turn that into a score</p>
                <p>That rate is looked up on a fixed, published curve, which gives <strong>{estimate.predicted_score}</strong>.</p>
              </div>
            </li>
          )}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          What the course demands ÷ how fast you covered it, mapped through a fixed, published curve.
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Only the course and your time go in — never who else raced. Sustainable pace naturally drops as races get
        longer, so the yardstick drops with it: a long mountain race is never scored worse than a short one just for
        being long.
      </p>

      <MeasurementTrust estimate={estimate} measurement={measurement} />

      <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer select-none px-4 py-2.5 font-mono text-[10px] uppercase tracking-[.08em] text-slate-500 hover:text-slate-700">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Show the maths
        </summary>
        <div className="border-t border-slate-200 px-4 py-4">
          {b && (
            <pre className="overflow-x-auto rounded-lg bg-[#0b1220] p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{`demand   = Σ segment_km × Minetti(grade)      = ${b.course_demand_km} demand-km
terrain  = 1 + 0.5951·steep + 0.07·alt/1000    = ${b.terrain_factor}   (steep ${(b.steep_distance_fraction * 100).toFixed(1)}%, alt +${Math.round(b.altitude_excess_m)} m)
D        = demand × terrain                    = ${b.adjusted_demand_km} demand-km
Q        = D / T_hours                         = ${b.performance_rate} demand-km/h`}
{b.reference_rate != null
  ? `
rate(D)  = world-best rate at D  (b = ${b.riegel_exponent})  = ${b.reference_rate} demand-km/h
factor   = rate(D_ref) / rate(D)               = ${b.reference_factor}
Q_lookup = Q × factor                          = ${b.lookup_rate} demand-km/h`
  : ''}
{`
score    = anchor_table(Q_lookup)              = ${estimate.otri_raw}  →  ${estimate.predicted_score}`}
            </pre>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Stat label="Physical distance" value={`${b?.physical_distance_km ?? features.distance_km} km`} />
            <Stat label="Course demand (gradient integral)" value={`${b?.course_demand_km ?? estimate.equivalent_distance_km} demand-km`} />
            {b && <Stat label="Terrain factor" value={`× ${b.terrain_factor}`} />}
            {b && <Stat label="Adjusted demand (scored)" value={`${b.adjusted_demand_km} demand-km`} />}
            <Stat label="Performance rate Q" value={`${estimate.performance_rate} demand-km/h`} />
            {b?.reference_rate != null && <Stat label="Human ceiling at this demand" value={`${b.reference_rate} demand-km/h`} />}
            {b?.fraction_of_ceiling != null && <Stat label="Fraction of ceiling" value={`${(b.fraction_of_ceiling * 100).toFixed(2)}%`} />}
            {b?.lookup_rate != null && <Stat label="Rate looked up in table" value={`${b.lookup_rate} demand-km/h`} />}
            <Stat label="Raw score (unrounded)" value={estimate.otri_raw} />
            <Stat label="Score version" value={estimate.scoring_version} />
          </dl>

          <p className="mt-4 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">
            Published anchor table{scaledVersion ? ' (Q_lookup → score, at the reference course size)' : ''}
          </p>
          <table className="mt-1 w-full text-left text-xs">
            <tbody>
              {publishedAnchors.map((anchor) => (
                <tr key={anchor.score}>
                  <td className="py-0.5 pr-4 font-mono">{anchor.score}</td>
                  <td className="py-0.5 font-mono">{anchor.q.toFixed(3)} demand-km/h</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-500">
            Piecewise power law between anchors; one exponent from 544 to 1000. "demand-km" is a kilometre of flat
            road at Minetti's metabolic cost — the unit called "flat km" above.
          </p>

          {estimate.quality_flags?.length > 0 && (
            <>
              <p className="mt-4 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Quality flags</p>
              <ul className="mt-1 space-y-1 text-[11px] text-slate-500">
                {estimate.quality_flags.map((flag) => (
                  <li key={flag} className="font-mono break-words">{flag}</li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-4 text-[11px] text-slate-500">
            Methodology: <code>docs/methodology/v0.7/OTRI-DEM-GATED-MEASUREMENT.md</code> (measurement & confidence),{' '}
            <code>v0.6/OTRI-SMOOTHED-UPPER-CURVE.md</code> (curve),{' '}
            <code>v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md</code> (terrain),{' '}
            <code>v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md</code> (human ceiling),{' '}
            <code>v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md</code> (course demand).
          </p>
        </div>
      </details>

      <p className="mt-3 text-xs text-slate-500">Model-based projection · {estimate.disclaimer}</p>
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
  const tooSparse = measurement?.quality_flags?.includes('sparse_geometry_median_over_30m')

  // Which curve produced this estimate: V0.4 scales by the endurance reference, V0.3 by the
  // Riegel exponent, and everything older looks the observed rate up directly.
  const scoringVersion = estimate?.scoring_version ?? ''
  const scaledVersion =
    scoringVersion.includes('endurance-referenced') ||
    scoringVersion.includes('terrain-adjusted') ||
    scoringVersion.includes('smoothed-upper') ||
    scoringVersion.includes('dem-gated') ||
    scoringVersion.includes('duration-scaled')
  const publishedAnchors = publishedAnchorsFor(scoringVersion)

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
            {tooSparse && (
              <p className="mt-3 text-sm text-amber-700">
                This track has a point only every {measurement.median_edge_m} m. Sparse recordings cut switchbacks short,
                so the course measures shorter and easier than it is. For a trustworthy score, upload a track recorded
                at least every 30 m (1–5 s on most watches).
              </p>
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

          {(estimate || scoring) && (
            <div className="space-y-4">
              <ScoreCard estimate={estimate} scoring={scoring} targetSeconds={targetSeconds} />
              {estimate && (
                <ScoreExplanation
                  estimate={estimate}
                  features={features}
                  targetSeconds={targetSeconds}
                  publishedAnchors={publishedAnchors}
                  scaledVersion={scaledVersion}
                  measurement={measurement}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

