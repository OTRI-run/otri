import { useState } from 'react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx } from './apiClient'

function parseHmsToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null
  const [hours, minutes, seconds] = parts
  return hours * 3600 + minutes * 60 + seconds
}

function formatSecondsToHms(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

const timeInputClass = 'w-28 rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-sm'

export default function GpxTester() {
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [gpxText, setGpxText] = useState('')
  const [timeInput, setTimeInput] = useState('01:00:00')
  const [winnerTimeInput, setWinnerTimeInput] = useState('')
  const [winnerTimeTouched, setWinnerTimeTouched] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleFileChange(event) {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    setFileName(selected?.name ?? '')
    setResult(null)
    setError(null)
    setWinnerTimeInput('')
    setWinnerTimeTouched(false)
    setGpxText(selected ? await selected.text() : '')
  }

  async function runAnalysis({ winnerOverrideSeconds } = {}) {
    if (!file) return
    const seconds = parseHmsToSeconds(timeInput)
    if (seconds === null) {
      setError('Enter your target finish time as HH:MM:SS')
      return
    }
    let winnerSeconds = winnerOverrideSeconds
    if (winnerSeconds === undefined && winnerTimeTouched) {
      winnerSeconds = parseHmsToSeconds(winnerTimeInput)
      if (winnerSeconds === null) {
        setError('Enter the assumed winning time as HH:MM:SS')
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const analysis = await analyzeGpx(file, seconds, winnerSeconds ?? undefined)
      setResult(analysis)
      if (analysis.estimate && !winnerTimeTouched) {
        setWinnerTimeInput(formatSecondsToHms(analysis.estimate.winner_finish_time_seconds))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleWinnerTimeChange(event) {
    setWinnerTimeInput(event.target.value)
    setWinnerTimeTouched(true)
  }

  const estimate = result?.estimate
  const exactMatchGuaranteed = winnerTimeTouched && winnerTimeInput.trim() !== ''

  return (
    <section className="mt-10">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">GPX SCORE PREDICTOR</p>
      <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">
        Get your predicted OTRI score before you even race.
      </h2>
      <p className="mt-2 max-w-[680px] text-sm text-slate-500">
        Uses the same distance-plus-elevation formula as the real post-race scorer (100 m of climb ≈ 1 extra km,
        the standard trail-running rule of thumb). The only unknown before a race is how fast the winner will go —
        set your own assumption below and this becomes an <em>exact</em> preview of your real OTRI score, not just a
        rough guess.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">STEP 1 — COURSE</p>
        <label
          htmlFor="gpx-file-input"
          className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm hover:border-blue-400 hover:bg-blue-50/40"
        >
          <span className="text-slate-600">
            {fileName ? (
              <>
                <span className="font-semibold text-[#0b1220]">{fileName}</span> — click to choose a different file
              </>
            ) : (
              'Click to choose a .gpx file from your GPS watch or route planner'
            )}
          </span>
          <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Browse</span>
          <input id="gpx-file-input" type="file" accept=".gpx" onChange={handleFileChange} className="hidden" />
        </label>

        {gpxText && <CourseMap gpxText={gpxText} className="mt-4" />}

        {result && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Distance', `${result.features.distance_km} km`],
              ['Elevation gain', `+${result.features.elevation_gain_m} m`],
              ['Elevation loss', `-${result.features.elevation_loss_m} m`],
              [
                'Steep grade',
                `+${(result.features.max_climb_grade * 100).toFixed(1)}% / -${(result.features.max_descent_grade * 100).toFixed(1)}%`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#0b1220]">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className={`mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${!file ? 'opacity-50' : ''}`}>
        <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">STEP 2 — YOUR TARGET TIME</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Your finish time</label>
            <input
              type="text"
              value={timeInput}
              onChange={(event) => setTimeInput(event.target.value)}
              placeholder="HH:MM:SS"
              disabled={!file}
              className={`${timeInputClass} mt-1`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">
              Assumed winning time <span className="font-normal text-slate-400">(edit if you know better)</span>
            </label>
            <input
              type="text"
              value={winnerTimeInput}
              onChange={handleWinnerTimeChange}
              placeholder={result ? 'auto-filled after calculating' : 'HH:MM:SS'}
              disabled={!file}
              className={`${timeInputClass} mt-1`}
            />
          </div>
          <button
            onClick={() => runAnalysis()}
            disabled={!file || loading}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Calculating…' : result ? 'Recalculate' : 'Calculate my score'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {estimate && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 text-center">
            <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">PREDICTED OTRI SCORE</p>
            <p className="mt-2 text-5xl font-bold tracking-[-.03em] text-blue-600">{estimate.illustrative_score}</p>
            <p className="mt-2 text-xs text-slate-500">
              {estimate.pace_seconds_per_km}s/km over {estimate.equivalent_distance_km} equivalent km
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="font-mono text-[9px] tracking-[.08em] text-slate-400">HOW THIS WAS CALCULATED</p>
            <p className="mt-2 text-sm text-slate-600">
              Assumes the winner finishes in <strong>{formatSecondsToHms(estimate.winner_finish_time_seconds)}</strong>{' '}
              — <code>score = 1000 × (winner's pace ÷ your pace)</code>, the exact formula used once real results are
              submitted.
            </p>
            {exactMatchGuaranteed ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                If the real winner finishes in {formatSecondsToHms(estimate.winner_finish_time_seconds)} and you run{' '}
                {formatSecondsToHms(parseHmsToSeconds(timeInput) ?? 0)}, your real OTRI score will be exactly{' '}
                {estimate.illustrative_score}.
              </p>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This uses a generic cross-race average winning pace as a placeholder. Set your own "assumed winning
                time" above for a much more accurate — potentially exact — preview.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
