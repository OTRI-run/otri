import { useState } from 'react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx } from './apiClient'

function parseHmsToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null
  const [hours, minutes, seconds] = parts
  return hours * 3600 + minutes * 60 + seconds
}

export default function GpxTester() {
  const [file, setFile] = useState(null)
  const [gpxText, setGpxText] = useState('')
  const [timeInput, setTimeInput] = useState('01:00:00')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleFileChange(event) {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setError(null)
    setGpxText(selected ? await selected.text() : '')
  }

  async function handleAnalyze() {
    if (!file) return
    const seconds = parseHmsToSeconds(timeInput)
    if (seconds === null) {
      setError('Enter a time as HH:MM:SS')
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResult(await analyzeGpx(file, seconds))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-10">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">GPX TESTER</p>
      <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">
        Upload a GPX, pick a time, see an illustrative score.
      </h2>
      <p className="mt-2 max-w-[620px] text-sm text-slate-500">
        This calls the live OTRI API (<code>POST /gpx/analyze</code>) to parse the course and estimate a score. The
        estimate is <strong>illustrative only</strong> — it compares your pace to an average across synthetic demo
        races, not a calibrated cross-race model.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input type="file" accept=".gpx" onChange={handleFileChange} className="text-sm" />
        <input
          type="text"
          value={timeInput}
          onChange={(event) => setTimeInput(event.target.value)}
          placeholder="HH:MM:SS"
          className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleAnalyze}
          disabled={!file || loading}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {gpxText && <CourseMap gpxText={gpxText} className="mt-5" />}

      {result && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">COURSE FEATURES</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Distance</dt>
                <dd>{result.features.distance_km} km</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Elevation gain</dt>
                <dd>+{result.features.elevation_gain_m} m</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Elevation loss</dt>
                <dd>-{result.features.elevation_loss_m} m</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Steep grade</dt>
                <dd>
                  +{(result.features.max_climb_grade * 100).toFixed(1)}% / -{(result.features.max_descent_grade * 100).toFixed(1)}%
                </dd>
              </div>
            </dl>
          </div>
          {result.estimate && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">ILLUSTRATIVE ESTIMATE</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">{result.estimate.illustrative_score}</p>
              <p className="mt-1 text-xs text-slate-500">
                {result.estimate.pace_seconds_per_km}s/km over {result.estimate.equivalent_distance_km} equivalent km
              </p>
              <p className="mt-2 text-[11px] text-slate-500">{result.estimate.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
