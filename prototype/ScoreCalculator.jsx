import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, GitBranch, Link2, Mountain, RefreshCw, Search, Share2, Timer, Upload } from 'lucide-react'
import CourseMap from '../src/components/CourseMap'
import { analyzeGpx, fetchRaceGpxFile, fetchSharedGpxFile, getRace, listRaces, shareGpx } from './apiClient'
import NextSteps from './NextSteps'
import ReportForm from './ReportForm'
import { modelLabel, modelShort } from '../src/lib/model'
import { distanceUnit, formatDistance, formatElevation, formatPace as formatPaceUnits, formatRate, kmToUnit, useUnits } from '../src/lib/units'

// Published anchor tables, shown for context in the "why this score" breakdown. The actual
// score always comes from the API. Scores 0-544 are V0.1's real demo/test anchors in every
// table; what differs is the top of the scale and whether the 692 demo anchor is kept:
//   - V0.1-V0.3: 692 kept, 1000-anchor is V0.1's extrapolated 17.940
//   - V0.4-V0.5: 692 kept, 1000-anchor is the measured human ceiling 21.533
//   - V0.6+:     692 dropped (docs/methodology/v0.6/OTRI-SMOOTHED-UPPER-CURVE.md)
//   - V0.8:      one power law, no anchor table (docs/methodology/v0.8/OTRI-POWER-CURVE.md)
const ANCHOR_0 = { score: 0, q: 1.0 }
const ANCHOR_349 = { score: 349, q: 4.240362424138815 }
const ANCHOR_544 = { score: 544, q: 8.935158501440922 }
const ANCHOR_692 = { score: 692, q: 11.769395017793594 }
const ANCHOR_1000_LEGACY = { score: 1000, q: 17.93986234619293 }
const ANCHOR_1000 = { score: 1000, q: 21.5331347785071 }

const METHODOLOGY_URL = 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/HOW-OTRI-SCORES.md'

function publishedAnchorsFor(scoringVersion) {
  if (scoringVersion.includes('-power')) return []
  if (scoringVersion.includes('smoothed-upper') || scoringVersion.includes('dem-gated')) {
    return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_1000]
  }
  if (scoringVersion.includes('endurance-referenced') || scoringVersion.includes('terrain-adjusted')) {
    return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_692, ANCHOR_1000]
  }
  return [ANCHOR_0, ANCHOR_349, ANCHOR_544, ANCHOR_692, ANCHOR_1000_LEGACY]
}

// Where the slider starts for a freshly chosen course: the finish time that scores this.
const DEFAULT_TARGET_SCORE = 500
const POWER_EXPONENT = 0.85 // V0.8: score = 1000 × (rate / ceiling rate)^0.85

// Absolute sanity bounds for a finish time (multi-day events exist; nothing runs 200 hours).
const ABS_MIN_SECONDS = 60
const ABS_MAX_SECONDS = 200 * 3600
// The slider spans the scores that make sense on a course: from the human ceiling (1000) down to
// a slow finish (SLIDER_MIN_SCORE), so a 10 km and a 100-mile course each get a range in
// proportion to their own best time instead of one fixed 10 min to 24 h.
const SLIDER_MIN_SCORE = 200

function clampSeconds(seconds) {
  return Math.min(ABS_MAX_SECONDS, Math.max(ABS_MIN_SECONDS, Math.round(seconds / 30) * 30))
}

function sliderRange(ceilingSeconds, targetSeconds) {
  if (!ceilingSeconds) {
    const max = Math.max(86400, targetSeconds || 0)
    return { min: Math.min(600, targetSeconds || 600), max, step: max > 86400 ? 300 : 30, known: false }
  }
  const slowest = ceilingSeconds / Math.pow(SLIDER_MIN_SCORE / 1000, 1 / POWER_EXPONENT)
  const span = slowest - ceilingSeconds
  const step = span > 86400 ? 300 : span > 21600 ? 60 : 30
  const min = Math.floor(ceilingSeconds / step) * step
  const max = Math.ceil(slowest / step) * step
  return { min: Math.min(min, targetSeconds || min), max: Math.max(max, targetSeconds || max), step, known: true }
}

// The finish time that would score `score` on the course an estimate was made for. Uses the
// ceiling time the API reports; only defined for the power curve, null otherwise.
function timeForScore(estimate, score) {
  const best = estimate?.breakdown?.world_best_time_seconds
  if (!best || !estimate.scoring_version?.includes('-power')) return null
  const fraction = Math.pow(score / 1000, 1 / POWER_EXPONENT)
  return best / fraction
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

// Pace/speed in the site-wide units (min/km, min/mi, km/h or mph).
function formatPace(totalSeconds, distanceKm, units) {
  return formatPaceUnits(totalSeconds, distanceKm, units)
}

// A distance in km shown as a number in the display unit, one decimal, without the unit.
function fmtDist(km, units) {
  return fmt1(kmToUnit(Number(km), units))
}

// Plain-language numbers are shown to one decimal; the maths section keeps full precision.
function fmt1(value) {
  return Number(value).toFixed(1)
}

function shortVersion(scoringVersion) {
  return `model ${modelShort(scoringVersion)}`
}

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

function Eyebrow({ children, className = '' }) {
  return <p className={`font-mono text-[10px] tracking-[.08em] text-slate-500 ${className}`}>{children}</p>
}

function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 ${className}`}
    />
  )
}

// ----------------------------------------------------------------------------- the score card
// The dark "index engine" panel from the landing page, now showing a live number. It is rendered
// in every state — empty, calculating, live — so the hero never jumps when a course arrives.

function ScorePanel({ estimate, scoring, targetSeconds, features, courseLabel }) {
  const units = useUnits()
  const b = estimate?.breakdown
  const pct = b?.fraction_of_ceiling != null ? Math.round(b.fraction_of_ceiling * 100) : null
  const status = scoring ? 'CALCULATING' : estimate ? 'LIVE' : courseLabel ? 'READY' : 'WAITING'

  const rows = estimate
    ? [
        [Mountain, 'COURSE', `${formatDistance(b?.physical_distance_km ?? features?.distance_km ?? 0, units)} · ${formatElevation(features?.elevation_gain_m ?? 0, units, { sign: '+' })}`],
        [Timer, 'YOUR TIME', `${formatHms(targetSeconds)} · ${formatPace(targetSeconds, features?.distance_km, units) ?? ''}`],
        [GitBranch, 'MODEL', `${shortVersion(estimate.scoring_version)} · versioned · reproducible`],
      ]
    : [
        [Mountain, 'COURSE', 'distance · elevation · steepness'],
        [Timer, 'YOUR TIME', 'a target, not a result'],
        [GitBranch, 'MODEL', 'versioned · reproducible'],
      ]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={scoring}
      className="min-w-0 overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#08111f_0%,#0b1730_58%,#123b85_100%)] p-4 text-white shadow-[0_24px_70px_rgba(11,18,32,.2)] sm:p-5"
    >
      <div className="flex items-center justify-between font-mono text-[8px] tracking-[.08em] text-slate-400">
        <span>OTRI / SCORE</span>
        <span className="flex items-center gap-1.5">
          <i className={`h-1.5 w-1.5 rounded-full ${scoring ? 'animate-pulse bg-cyan-300' : 'bg-blue-400'} shadow-[0_0_10px_rgba(96,165,250,.9)]`} />
          {status}
        </span>
      </div>

      <div className="border-b border-slate-700/70 py-8 text-center">
        {estimate ? (
          <>
            <small className="font-mono text-[8px] tracking-[.08em] text-blue-300">YOUR PROJECTED SCORE</small>
            <strong
              className={`mt-1 block bg-gradient-to-r from-white to-blue-200 bg-clip-text pb-1 text-[84px] font-bold leading-none tracking-[-.06em] text-transparent transition-opacity ${scoring ? 'opacity-40' : ''}`}
            >
              {estimate.predicted_score}
            </strong>
            {pct != null ? (
              <>
                <span className="mt-2 block font-mono text-[11px] text-slate-300">{pct}% of the world-best rate for this course</span>
                <div className="mx-auto mt-3 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-slate-700/70" aria-hidden="true">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                </div>
                <span className="mx-auto mt-1 flex w-full max-w-[260px] justify-between font-mono text-[8px] text-slate-500">
                  <span>0</span>
                  <span>1000 = WORLD BEST</span>
                </span>
              </>
            ) : (
              <span className="mt-2 block font-mono text-[11px] text-slate-300">{formatHms(targetSeconds)}</span>
            )}
            {scoring && (
              <span className="mt-3 flex items-center justify-center gap-2 font-mono text-[9px] tracking-[.08em] text-slate-400">
                <Spinner className="border-slate-600 border-t-white" /> UPDATING
              </span>
            )}
          </>
        ) : scoring ? (
          <>
            <Spinner className="h-8 w-8 border-4 border-slate-600 border-t-white" />
            <strong className="mt-4 block text-lg font-bold tracking-[-.03em]">Calculating your score…</strong>
            <span className="mt-1 block text-xs text-slate-400">
              Every 50 m of the course is measured and costed. Long, hilly courses take a few seconds.
            </span>
          </>
        ) : (
          <>
            <small className="font-mono text-[8px] tracking-[.08em] text-blue-300">WHY THIS SCORE?</small>
            <strong className="mt-2 block bg-gradient-to-r from-white to-blue-200 bg-clip-text pb-1 text-4xl font-bold leading-[1.25] tracking-[-.05em] text-transparent">
              Pick a course.
            </strong>
            <span className="mt-1 block text-xs text-slate-400">Then set a finish time. The score updates live.</span>
          </>
        )}
      </div>

      <div>
        {rows.map(([Icon, title, desc]) => (
          <div key={title} className="grid min-w-0 grid-cols-[22px_minmax(0,auto)_minmax(0,1fr)] items-center gap-2 border-b border-slate-700/70 py-4">
            <Icon size={16} className="text-blue-400" />
            <span className="text-xs font-semibold">{title}</span>
            <small className="truncate text-right font-mono text-[8px] text-slate-500">{desc}</small>
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-3 pt-4 font-mono text-[8px] tracking-[.08em]">
        <b>OTRI INDEX</b>
        <span className="text-right text-blue-300">COURSE + TIME + VERSION = SCORE</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- explanation
// Two audiences, one section. The plain-language story reads the API's own breakdown of the
// score — nothing is recomputed here — and the maths lives behind a native <details>.

function Stat({ label, value, mono = true }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase text-slate-400">{label}</dt>
      <dd className={`font-semibold text-[#0b1220] ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

// One quiet line, only when elevation was not verified against terrain data; silent otherwise.
function MeasurementTrust({ estimate }) {
  const unverified = (estimate.quality_flags ?? []).some((flag) => flag.startsWith('elevation_not_dem_sourced'))
  if (!unverified) return null
  return (
    <p className="mt-4 text-xs text-slate-500">
      Elevation for this course comes from your GPX file rather than verified terrain data, so the score can differ
      slightly between devices.
    </p>
  )
}

function ExplanationStep({ n, title, children }) {
  return (
    <div className="grid min-w-0 grid-cols-[30px_minmax(0,1fr)] gap-3 border-b border-slate-300 py-5">
      <b className="pt-0.5 font-mono text-[9px] text-slate-400">{n}</b>
      <div className="min-w-0">
        <strong className="text-[13px] text-[#0b1220]">{title}</strong>
        <div className="mt-1.5 text-sm leading-6 text-slate-600">{children}</div>
      </div>
    </div>
  )
}

function ScoreExplanation({ estimate, features, targetSeconds, publishedAnchors, scaledVersion }) {
  const units = useUnits()
  const du = distanceUnit(units)
  const b = estimate.breakdown
  const pct = b?.fraction_of_ceiling != null ? Math.round(b.fraction_of_ceiling * 100) : null
  const terrainPct = b ? Math.round((b.terrain_factor - 1) * 1000) / 10 : 0
  const hasTerrain = terrainPct > 0
  const steepPct = b ? Math.round(b.steep_distance_fraction * 100) : 0
  const isPower = estimate.scoring_version?.includes('-power')
  // Paces: on the ground (per physical km) and on flat road (per flat-equivalent km).
  const groundPace = b ? formatPace(targetSeconds, b.physical_distance_km, units) : null
  const flatPace = b ? formatPace(targetSeconds, b.adjusted_demand_km, units) : null
  const bestGroundPace = b?.world_best_time_seconds ? formatPace(b.world_best_time_seconds, b.physical_distance_km, units) : null
  const bestFlatPace = b?.world_best_time_seconds ? formatPace(b.world_best_time_seconds, b.adjusted_demand_km, units) : null

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className={CONTAINER}>
        <div className="flex items-center justify-between gap-4">
          <Eyebrow>02 / WHY THIS SCORE</Eyebrow>
          <a href={METHODOLOGY_URL} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 no-underline">
            Open methodology <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="mt-6 grid min-w-0 gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
          <div className="min-w-0">
            <h2 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
              Open method.
              <br />
              <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">Your number.</span>
            </h2>
            <p className="mt-5 max-w-[440px] text-sm leading-7 text-slate-500">
              Two things go in: the course and your time. Not who else raced, not the weather, not your age. The course is
              converted into the flat road distance it costs to run, and your speed over that is compared with the fastest
              a human has ever sustained over the same amount of ground.
            </p>
            <p className="mt-3 max-w-[440px] text-sm leading-7 text-slate-500">
              That yardstick already allows for distance: nobody holds their 5 km pace for 20 hours, so the best-ever rate
              falls as courses get longer. A long mountain race is never scored worse than a short one for being long.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[8px] text-slate-500">
              <GitBranch size={16} className="text-blue-600" />
              same course + same time + same version <b className="text-blue-600">=</b> same score
            </div>
            <MeasurementTrust estimate={estimate} />
          </div>

          <div className="min-w-0 border-t border-slate-400/70">
            {b ? (
              <>
                <ExplanationStep n="01" title="How hard is the course?">
                  <strong>{formatDistance(b.physical_distance_km, units)}</strong> with{' '}
                  <strong>{formatElevation(features.elevation_gain_m, units, { sign: '+' })}</strong> of climbing and{' '}
                  {formatElevation(features.elevation_loss_m, units)} of descent. Every 50 m is weighed by what its gradient costs to
                  run, so this course takes as much effort as <strong>{formatDistance(b.course_demand_km, units)} on flat road</strong>.
                  {hasTerrain ? (
                    <>
                      {' '}
                      {steepPct > 0 ? `${steepPct}% of it is steeper than 20%` : 'Part of it is high altitude'}
                      {steepPct > 0 && b.altitude_excess_m > 0 ? ', and it runs above 1,500 m' : ''}, which adds{' '}
                      <strong>{terrainPct}%</strong>: <strong>{fmtDist(b.adjusted_demand_km, units)} flat {du}</strong> in total.
                    </>
                  ) : (
                    ' No sustained steep ground or altitude, so that is the full demand.'
                  )}
                </ExplanationStep>
                <ExplanationStep n="02" title="How fast would you run it?">
                  <strong>{formatHms(targetSeconds)}</strong> is <strong>{groundPace}</strong> on the ground. Spread over{' '}
                  {fmtDist(b.adjusted_demand_km, units)} flat {du}, it is a flat-road {units.pace === 'speed' ? 'speed' : 'pace'} of{' '}
                  <strong>{flatPace}</strong>
                  {units.pace === 'speed' ? '' : <>, or <strong>{fmtDist(b.performance_rate, units)} flat {du} per hour</strong></>}. That
                  rate is what gets scored.
                </ExplanationStep>
                {b.reference_rate != null ? (
                  <ExplanationStep n="03" title="How does that compare with the best ever?">
                    The fastest anyone has ever sustained over a course this demanding is about{' '}
                    <strong>{fmtDist(b.reference_rate, units)} flat {du} per hour</strong>
                    {bestFlatPace && units.pace !== 'speed' ? ` (${bestFlatPace} on flat road)` : ''}. Here that would be a{' '}
                    <strong>{formatHms(b.world_best_time_seconds)}</strong> finish
                    {bestGroundPace ? `, ${bestGroundPace} on the ground` : ''}. Your rate is <strong>{pct}%</strong> of it.
                    {isPower ? (
                      <>
                        {' '}
                        Score = 1000 × {pct}%<sup>0.85</sup> = <strong>{estimate.predicted_score}</strong>.
                      </>
                    ) : (
                      <>
                        {' '}
                        On the published curve that scores <strong>{estimate.predicted_score}</strong>.
                      </>
                    )}
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-cyan-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                    <p className="mt-1 flex justify-between font-mono text-[9px] text-slate-400">
                      <span>0</span>
                      <span>{pct}% · score {estimate.predicted_score}</span>
                      <span>100% = 1000</span>
                    </p>
                  </ExplanationStep>
                ) : (
                  <ExplanationStep n="03" title="Turn that into a score">
                    That rate is looked up on a fixed, published curve, which gives <strong>{estimate.predicted_score}</strong>.
                  </ExplanationStep>
                )}
              </>
            ) : (
              <ExplanationStep n="01" title="Course demand ÷ your rate">
                What the course demands ÷ how fast you covered it, mapped through a fixed, published curve.
              </ExplanationStep>
            )}
          </div>
        </div>

        <details className="group mt-10 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
          <summary className="cursor-pointer select-none px-5 py-3.5 font-mono text-[10px] uppercase tracking-[.08em] text-slate-500 hover:text-slate-700">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Show the maths
          </summary>
          <div className="border-t border-slate-200 px-5 py-5">
            {b && (
              <pre className="overflow-x-auto rounded-xl bg-[#0b1220] p-4 font-mono text-[11px] leading-relaxed text-slate-100">
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
{estimate.scoring_version?.includes('-power')
  ? `
score    = 1000 × (Q_lookup / Q_1000)^0.85     = ${estimate.otri_raw}  →  ${estimate.predicted_score}`
  : `
score    = anchor_table(Q_lookup)              = ${estimate.otri_raw}  →  ${estimate.predicted_score}`}
              </pre>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
              <Stat label="Physical distance" value={`${b?.physical_distance_km ?? features.distance_km} km`} />
              <Stat label="Course demand (gradient integral)" value={`${b?.course_demand_km ?? estimate.equivalent_distance_km} demand-km`} />
              {b && <Stat label="Terrain factor" value={`× ${b.terrain_factor}`} />}
              {b && <Stat label="Adjusted demand (scored)" value={`${b.adjusted_demand_km} demand-km`} />}
              <Stat label="Performance rate Q" value={`${estimate.performance_rate} demand-km/h`} />
              {b?.reference_rate != null && <Stat label="Human ceiling at this demand" value={`${b.reference_rate} demand-km/h`} />}
              {b?.fraction_of_ceiling != null && <Stat label="Fraction of ceiling" value={`${(b.fraction_of_ceiling * 100).toFixed(2)}%`} />}
              {b?.lookup_rate != null && <Stat label="Rate looked up in table" value={`${b.lookup_rate} demand-km/h`} />}
              <Stat label="Raw score (unrounded)" value={estimate.otri_raw} />
              <Stat label="Model" value={modelLabel(estimate.scoring_version)} />
              <Stat label="Build id" value={estimate.scoring_version} />
            </dl>

            {publishedAnchors.length > 0 ? (
              <>
                <p className="mt-5 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">
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
              </>
            ) : (
              <p className="mt-5 text-[11px] text-slate-500">
                One published curve, no anchor table: score = 1000 × (fraction of the human-ceiling rate)^0.85, with Q_1000
                = {ANCHOR_1000.q.toFixed(3)} demand-km/h at the reference course size. "demand-km" is a kilometre of flat
                road at Minetti's metabolic cost — the unit called "flat km" above.
              </p>
            )}

            {estimate.quality_flags?.length > 0 && (
              <>
                <p className="mt-5 font-mono text-[9px] uppercase tracking-[.06em] text-slate-400">Quality flags</p>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-500">
                  {estimate.quality_flags.map((flag) => (
                    <li key={flag} className="break-words font-mono">{flag}</li>
                  ))}
                </ul>
              </>
            )}

            <p className="mt-5 text-[11px] text-slate-500">
              Methodology: <code>docs/methodology/v0.8/OTRI-POWER-CURVE.md</code> (curve),{' '}
              <code>v0.7/OTRI-DEM-GATED-MEASUREMENT.md</code> (measurement & confidence),{' '}
              <code>v0.6/OTRI-SMOOTHED-UPPER-CURVE.md</code> (curve), <code>v0.5/OTRI-TERRAIN-ADJUSTED-DEMAND.md</code>{' '}
              (terrain), <code>v0.4/OTRI-ENDURANCE-REFERENCED-CURVE.md</code> (human ceiling),{' '}
              <code>v0.1/OTRI-SCORING-SYSTEM-V0-CODE-SPEC.md</code> (course demand).
            </p>
          </div>
        </details>

        <p className="mt-4 text-xs text-slate-500">Model-based projection · {estimate.disclaimer}</p>
        <NextSteps
          items={[
            ['See how others scored', 'Leaderboards for races scored under the same model.', 'Browse scored races', '#races'],
            ['Organize a race?', 'Upload official results and the course file; every finisher gets a score like this one.', 'For organizers', 'organizer/'],
            ['Question the model', 'Every constant, where it comes from, and what it does not know.', 'How a score is made', METHODOLOGY_URL],
          ]}
        />
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------- share links
// #calculator?race=<race_id>&t=<seconds>          a verified race
// #calculator?gpx=<share_id>&name=<name>&t=<sec>  an uploaded course the user chose to share

function readCalculatorQuery() {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (!hash.startsWith('#calculator') || q < 0) return null
  const params = new URLSearchParams(hash.slice(q + 1))
  const t = Number(params.get('t'))
  return {
    race: params.get('race'),
    gpx: params.get('gpx'),
    name: params.get('name'),
    seconds: Number.isFinite(t) && t > 0 ? Math.min(ABS_MAX_SECONDS, Math.max(ABS_MIN_SECONDS, Math.round(t))) : null,
  }
}

function buildShareHash({ raceId, shareId, name, seconds }) {
  const params = new URLSearchParams()
  if (raceId) params.set('race', raceId)
  else if (shareId) {
    params.set('gpx', shareId)
    if (name) params.set('name', name)
  }
  params.set('t', String(Math.round(seconds)))
  return `#calculator?${params.toString()}`
}

function buildShareUrl(args) {
  return `${window.location.origin}${window.location.pathname}${buildShareHash(args)}`
}

function ShareBox({ courseLabel, courseFile, targetSeconds, shareId, onShared }) {
  const [state, setState] = useState('idle') // idle | sharing | ready | copied
  const [error, setError] = useState(null)
  const raceId = courseLabel.raceId ?? null
  const linkReady = Boolean(raceId || shareId)
  const url = linkReady ? buildShareUrl({ raceId, shareId, name: courseLabel.name, seconds: targetSeconds }) : null
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy(link) {
    try {
      await navigator.clipboard.writeText(link)
      setState('copied')
      setTimeout(() => setState('ready'), 2500)
    } catch {
      setState('ready')
    }
  }

  async function share() {
    setError(null)
    try {
      let id = shareId
      if (!raceId && !id) {
        setState('sharing')
        const result = await shareGpx(courseFile, courseLabel.name)
        id = result.share_id
        onShared(id)
      }
      await copy(buildShareUrl({ raceId, shareId: id, name: courseLabel.name, seconds: targetSeconds }))
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'My OTRI score', text: `${courseLabel.name} in ${formatHms(targetSeconds)}`, url })
    } catch {
      // The user closed the share sheet.
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={share}
          disabled={state === 'sharing'}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-5 text-[14px] font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,.25)] transition hover:from-blue-800 hover:to-blue-600 disabled:opacity-60"
        >
          {state === 'sharing' ? (
            <>
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Creating link…
            </>
          ) : state === 'copied' ? (
            <>
              <Check size={16} /> Link copied
            </>
          ) : (
            <>
              <Share2 size={16} /> Share this score
            </>
          )}
        </button>
        {url && canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-[#0b1220] hover:border-blue-300"
          >
            Send… <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      {url ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Link2 size={14} className="shrink-0 text-blue-600" />
          <input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Share link" className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-slate-600 outline-none" />
          <button type="button" onClick={() => copy(url)} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline" aria-label="Copy link">
            <Copy size={14} />
          </button>
        </div>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {raceId
          ? 'The link opens this race with your target time. Change the time and the link updates.'
          : shareId
            ? 'Anyone with the link sees this course and your target time. Change the time and the link updates.'
            : 'Sharing stores your course file on OTRI so the link works for anyone; the target time travels in the link itself.'}
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ----------------------------------------------------------------------------- course picker

function CoursePicker({ races, racesLoading, racesError, query, onQuery, onChooseRace, onUpload, loadingCourse, loadError }) {
  const units = useUnits()
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className={CONTAINER}>
        <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
          <div className="font-mono text-xs text-blue-600">01</div>
          <div className="min-w-0">
            <Eyebrow className="mb-3">COURSE</Eyebrow>
            <h2 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
              Start with
              <br />
              <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">the course.</span>
            </h2>
          </div>
          <div className="min-w-0">
            <p className="text-sm leading-7 text-slate-500">
              Pick a race whose course has already been verified, or upload your own GPX. Either way the track is measured
              on the server: distance along the ellipsoid, elevation from terrain data where it is installed.
            </p>
            <details className="group mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              <summary className="cursor-pointer list-none font-semibold text-[#0b1220]">
                <span className="text-blue-600">What is a GPX, and where do I get one?</span>
              </summary>
              <div className="mt-2 grid gap-2 leading-6">
                <p>
                  A GPX file is the route as a list of GPS points, the format every watch, phone app and route planner can export. It weighs
                  a megabyte or two and holds nothing about you unless you exported a recording with timestamps.
                </p>
                <p>
                  <span className="font-semibold text-[#0b1220]">Before a race:</span> most organizers publish the course GPX on the race
                  website's course or route page weeks ahead, often per distance; look for "Download GPX", "Track" or "Trace", or check
                  the final participant email.{' '}
                  <span className="font-semibold text-[#0b1220]">After a race:</span> export your own recording (Garmin Connect, Strava,
                  Coros, Suunto, Polar all have "Export GPX"); it will be slightly longer than the official course.
                </p>
                <p>
                  A file with a point at least every 30 m scores at High confidence; a heavily simplified file still scores, labelled Low.
                  Uploads are measured and forgotten unless you share the score.{' '}
                  <a href="https://github.com/OTRI-run/otri/blob/main/docs/WHAT-IS-A-GPX.md" target="_blank" rel="noreferrer" className="font-semibold text-blue-600">
                    Full guide ↗
                  </a>
                </p>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)] sm:p-6">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-blue-600" />
              <h3 className="text-base font-bold tracking-[-.02em] text-[#0b1220]">Search a verified race</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Courses submitted by organizers and measured by OTRI.</p>
            <input
              type="text"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Race or course name…"
              aria-label="Search races"
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {racesLoading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Spinner /> Loading races…
              </p>
            )}
            {racesError && <p className="mt-3 text-xs text-red-600">{racesError}</p>}
            {!racesLoading && !racesError && races.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">No races with a verified course match that search yet.</p>
            )}
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {races.map((race) => (
                <button
                  key={race.race_id}
                  onClick={() => onChooseRace(race)}
                  disabled={loadingCourse}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#0b1220]">
                      {race.event_name} · {race.course_name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                      {race.event_date} · {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[8px] tracking-[.08em] text-blue-600">VERIFIED</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)] sm:p-6">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-blue-600" />
              <h3 className="text-base font-bold tracking-[-.02em] text-[#0b1220]">Upload a GPX</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Any course, from your watch or the organizer's website.</p>
            <label
              htmlFor="calc-gpx-input"
              className="mt-4 flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm transition hover:border-blue-400 hover:bg-blue-50/40"
            >
              {loadingCourse ? (
                <>
                  <Spinner className="h-8 w-8 border-4" />
                  <span className="font-semibold text-[#0b1220]">Reading course…</span>
                  <span className="text-xs text-slate-500">Measuring the track on the server.</span>
                </>
              ) : (
                <>
                  <Upload size={22} className="text-blue-600" />
                  <span className="font-semibold text-[#0b1220]">Drop a .gpx file here, or browse</span>
                  <span className="max-w-[320px] text-xs text-slate-500">
                    The file is analysed for this calculation and not stored unless you create a share link. Dense
                    recordings (a point at least every 30 m) give a trustworthy result.
                  </span>
                  <span className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,.2)]">
                    Choose file
                  </span>
                </>
              )}
              <input id="calc-gpx-input" type="file" accept=".gpx" onChange={onUpload} disabled={loadingCourse} className="hidden" />
            </label>
            {loadError && <p className="mt-3 text-xs text-red-600">{loadError}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------- loaded course

function CourseDetails({ gpxText, measurement, features, courseLabel, onChangeCourse, shareId }) {
  const units = useUnits()
  const tooSparse = measurement?.quality_flags?.includes('sparse_geometry_median_over_30m')
  const stats = [
    ['DISTANCE', formatDistance(features.distance_km, units)],
    ['CLIMB', formatElevation(features.elevation_gain_m, units, { sign: '+' })],
    ['DESCENT', formatElevation(features.elevation_loss_m, units, { sign: '-' })],
    [
      'STEEPEST 50 M',
      features.max_climb_grade == null ? 'n/a' : `+${(features.max_climb_grade * 100).toFixed(0)}% / -${(features.max_descent_grade * 100).toFixed(0)}%`,
    ],
  ]

  return (
    <section className="bg-white py-14 sm:py-20">
      <div className={CONTAINER}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>01 / COURSE</Eyebrow>
            <h2 className="mt-3 text-[clamp(28px,4vw,44px)] font-bold leading-[1] tracking-[-.05em] text-[#0b1220]">{courseLabel.name}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {courseLabel.meta ? `${courseLabel.meta} · ` : ''}
              <span className={courseLabel.verified ? 'font-semibold text-blue-600' : 'font-semibold text-amber-600'}>
                {courseLabel.verified ? 'Verified course' : courseLabel.meta === 'Shared course' ? 'Shared course' : 'Your upload'}
              </span>
            </p>
          </div>
          <button
            onClick={onChangeCourse}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-[#0b1220] hover:border-blue-300"
          >
            <RefreshCw size={14} /> Change course
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 border-y border-slate-200 sm:grid-cols-4">
          {stats.map(([label, value], index) => (
            <div key={label} className={`min-w-0 px-2 py-5 sm:px-5 ${index > 0 ? 'sm:border-l sm:border-slate-200' : ''} ${index % 2 === 1 ? 'border-l border-slate-200 sm:border-l' : ''}`}>
              <small className="font-mono text-[9px] tracking-[.08em] text-blue-600">{label}</small>
              <b className="mt-2 block text-2xl font-bold tracking-[-.05em] text-[#0b1220] sm:text-3xl">{value}</b>
            </div>
          ))}
        </div>

        {gpxText && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
            <CourseMap gpxText={gpxText} measurement={measurement} className="p-3" />
          </div>
        )}

        {courseLabel.meta === 'Shared course' && shareId && (
          <ReportForm kind="shared_course" subjectId={shareId} subjectLabel={courseLabel.name} prompt="Is this course file yours, or wrong?" />
        )}
        {tooSparse && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This track has a point only every {measurement.median_edge_m} m. Sparse recordings cut switchbacks short, so
            the course measures shorter and easier than it is. For a trustworthy score, upload a track recorded at
            least every 30 m (1–5 s on most watches).
          </p>
        )}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------- hero

function TargetTimeControls({ targetSeconds, timeInput, onSlider, onInput, distanceKm, analysisError, ceilingSeconds }) {
  const units = useUnits()
  const range = sliderRange(ceilingSeconds, targetSeconds)
  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)] backdrop-blur">
      <label htmlFor="calc-time-input" className="font-mono text-[9px] tracking-[.08em] text-blue-600">
        YOUR TARGET FINISH TIME
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="font-mono text-[44px] font-bold leading-none tracking-[-.04em] text-[#0b1220]">{formatHms(targetSeconds)}</p>
        <input
          id="calc-time-input"
          type="text"
          value={timeInput}
          onChange={(event) => onInput(event.target.value)}
          placeholder="HH:MM:SS"
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-center font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <p className="font-mono text-xs text-slate-400">{formatPace(targetSeconds, distanceKm, units)}</p>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={targetSeconds}
        onChange={(event) => onSlider(Number(event.target.value))}
        aria-label="Target finish time"
        className="mt-4 w-full accent-blue-600"
      />
      <div className="mt-1 flex justify-between font-mono text-[8px] tracking-[.08em] text-slate-400">
        <span>{range.known ? `${formatHms(range.min)} · SCORE 1000 · BEST HUMAN` : formatHms(range.min)}</span>
        <span>{range.known ? `${formatHms(range.max)} · SCORE ${SLIDER_MIN_SCORE}` : formatHms(range.max)}</span>
      </div>
      {range.known && (
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          The slider runs from the fastest a human has ever covered a course this hard (1000) to a slow finish ({SLIDER_MIN_SCORE}). Type a
          time to go outside it.
        </p>
      )}
      {analysisError && <p className="mt-2 text-xs text-red-600">{analysisError}</p>}
    </div>
  )
}

export default function ScoreCalculator() {
  const [query, setQuery] = useState('')
  const [races, setRaces] = useState([])
  const [racesLoading, setRacesLoading] = useState(true)
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

  const [shareId, setShareId] = useState(null)
  const analysisRunId = useRef(0)
  const loadedLinkRef = useRef(null)

  // A share link in the URL (#calculator?race=… or ?gpx=…) opens that course and time.
  const [linkHash, setLinkHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setLinkHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const linked = useMemo(() => readCalculatorQuery(), [linkHash])

  useEffect(() => {
    let cancelled = false
    listRaces()
      .then((all) => {
        if (!cancelled) setRaces(all.filter((race) => race.has_gpx))
      })
      .catch((err) => {
        if (!cancelled) setRacesError(err.message)
      })
      .finally(() => {
        if (!cancelled) setRacesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredRaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return races
    return races.filter((race) => `${race.event_name} ${race.course_name}`.toLowerCase().includes(q))
  }, [races, query])

  // Recompute the real score shortly after the target time settles (typing or dragging the
  // slider) — debounced so scrubbing the slider doesn't fire an API call per pixel, but no
  // "Analyse" button to click: the result is always live for whatever time is currently set.
  useEffect(() => {
    if (!courseFile || targetSeconds <= 0) return undefined
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
  }, [targetSeconds, courseFile])

  async function loadCourse(loader, label, initialSeconds = null) {
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
      // Default target time: the time that scores DEFAULT_TARGET_SCORE on this course (a share
      // link carries its own time). Found from the model's ceiling for this course, so it needs
      // one scored estimate first; a 6 min/km guess stands in if that is unavailable.
      const guess = analysis.features?.distance_km ? Math.round((analysis.features.distance_km * 360) / 30) * 30 : 17700
      let suggested = initialSeconds ?? null
      if (suggested == null) {
        try {
          const scored = await analyzeGpx(file, clampSeconds(guess))
          suggested = timeForScore(scored.estimate, DEFAULT_TARGET_SCORE)
        } catch {
          suggested = null
        }
      }
      const clamped = clampSeconds(suggested ?? guess)
      setTargetSeconds(clamped)
      setTimeInput(formatHms(clamped))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoadingCourse(false)
    }
  }

  function raceLabel(race) {
    return { name: `${race.event_name} · ${race.course_name}`, meta: race.event_date, verified: true, raceId: race.race_id }
  }

  function chooseExistingRace(race) {
    setShareId(null)
    loadCourse(() => fetchRaceGpxFile(race.race_id), raceLabel(race))
  }

  useEffect(() => {
    if (!linked || (!linked.race && !linked.gpx)) return
    const key = linked.race ? `race:${linked.race}` : `gpx:${linked.gpx}`
    if (loadedLinkRef.current === key) return
    loadedLinkRef.current = key
    if (linked.race) {
      getRace(linked.race)
        .then((race) => loadCourse(() => fetchRaceGpxFile(race.race_id), raceLabel(race), linked.seconds))
        .catch((err) => setLoadError(err.message))
    } else {
      setShareId(linked.gpx)
      loadCourse(
        () => fetchSharedGpxFile(linked.gpx, linked.name),
        { name: linked.name || 'Shared course', meta: 'Shared course', verified: false },
        linked.seconds,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  // Keep the address bar in sync once the course has an id, so the URL is always shareable.
  useEffect(() => {
    const raceId = courseLabel?.raceId
    if (!courseFile || (!raceId && !shareId)) return
    const hash = buildShareHash({ raceId, shareId, name: courseLabel.name, seconds: targetSeconds })
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
  }, [courseFile, courseLabel, shareId, targetSeconds])

  function handleUpload(event) {
    const selected = event.target.files?.[0]
    if (!selected) return
    loadCourse(() => Promise.resolve(selected), { name: selected.name.replace(/\.gpx$/i, ''), meta: 'Uploaded GPX', verified: false })
    event.target.value = ''
  }

  function startOver() {
    analysisRunId.current += 1
    loadedLinkRef.current = null
    setShareId(null)
    if (window.location.hash.startsWith('#calculator?')) window.history.replaceState(null, '', '#calculator')
    setCourseFile(null)
    setGpxText('')
    setCourseLabel(null)
    setFeatures(null)
    setMeasurement(null)
    setEstimate(null)
    setScoring(false)
    setAnalysisError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateTargetSeconds(seconds) {
    setTargetSeconds(seconds)
    setTimeInput(formatHms(seconds))
  }

  function updateTimeInput(value) {
    setTimeInput(value)
    const seconds = parseHmsToSeconds(value)
    if (seconds !== null && seconds > 0) {
      setTargetSeconds(Math.min(ABS_MAX_SECONDS, Math.max(ABS_MIN_SECONDS, seconds)))
    }
  }

  // Which curve produced this estimate: V0.4+ scale by the endurance reference, V0.3 by the
  // Riegel exponent, and everything older looks the observed rate up directly.
  const scoringVersion = estimate?.scoring_version ?? ''
  const scaledVersion =
    scoringVersion.includes('endurance-referenced') ||
    scoringVersion.includes('terrain-adjusted') ||
    scoringVersion.includes('smoothed-upper') ||
    scoringVersion.includes('dem-gated') ||
    scoringVersion.includes('-power') ||
    scoringVersion.includes('duration-scaled')
  const publishedAnchors = publishedAnchorsFor(scoringVersion)
  const hasCourse = Boolean(courseFile && features)

  return (
    <>
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_78%_28%,rgba(37,99,235,.12),transparent_30%),linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} grid min-w-0 items-center gap-12 py-14 sm:py-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-20`}>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
              OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> SCORE CALCULATOR
            </div>
            {hasCourse ? (
              <>
                <h1 className="mt-5 max-w-[760px] text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-.06em] text-[#0b1220]">
                  Your score on
                  <br />
                  <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">{courseLabel.name}</em>
                </h1>
                <p className="mt-4 max-w-[620px] text-[15px] leading-7 text-slate-500">
                  The slider starts at the time that scores {DEFAULT_TARGET_SCORE} here. Drag to your target finish time; the score
                  is calculated by the same code that scores official results.
                </p>
                <TargetTimeControls
                  targetSeconds={targetSeconds}
                  timeInput={timeInput}
                  onSlider={updateTargetSeconds}
                  onInput={updateTimeInput}
                  distanceKm={features.distance_km}
                  analysisError={analysisError}
                  ceilingSeconds={estimate?.breakdown?.world_best_time_seconds}
                />
                <ShareBox courseLabel={courseLabel} courseFile={courseFile} targetSeconds={targetSeconds} shareId={shareId} onShared={setShareId} />
              </>
            ) : (
              <>
                <h1 className="mt-5 max-w-[760px] text-[clamp(40px,6.5vw,76px)] font-bold leading-[1.06] tracking-[-.065em] text-[#0b1220]">
                  Know your score
                  <br />
                  <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">before you race.</em>
                </h1>
                <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-slate-500 sm:text-[17px]">
                  Choose a course and a target finish time. OTRI measures the course, works out how hard it is, and tells
                  you how close that time would be to the best a human has ever run over that much ground.
                </p>
                <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white no-underline shadow-[0_10px_28px_rgba(37,99,235,.2)] hover:from-blue-800 hover:to-blue-600"
                    href="#calculator-course"
                  >
                    Choose a course <Mountain size={15} />
                  </a>
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300"
                    href={METHODOLOGY_URL}
                  >
                    How it's calculated <ArrowUpRight size={15} />
                  </a>
                </div>
                <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[8px] tracking-[.08em] text-slate-500 sm:text-[9px]">
                  <span className="text-blue-600">COURSE</span>
                  <span>+ TIME</span>
                  <span>+ VERSION</span>
                  <span>= SCORE</span>
                </div>
                <p className="mt-5 text-sm text-slate-500">
                  Just want to look around?{' '}
                  <a href="#races" className="font-semibold text-blue-600 no-underline hover:underline">
                    Browse scored races →
                  </a>
                </p>
              </>
            )}
          </div>
          <ScorePanel estimate={estimate} scoring={scoring} targetSeconds={targetSeconds} features={features} courseLabel={courseLabel} />
        </div>
      </section>

      <div id="calculator-course" className="scroll-mt-[68px]">
        {hasCourse ? (
          <CourseDetails gpxText={gpxText} measurement={measurement} features={features} courseLabel={courseLabel} onChangeCourse={startOver} shareId={shareId} />
        ) : (
          <CoursePicker
            races={filteredRaces}
            racesLoading={racesLoading}
            racesError={racesError}
            query={query}
            onQuery={setQuery}
            onChooseRace={chooseExistingRace}
            onUpload={handleUpload}
            loadingCourse={loadingCourse}
            loadError={loadError}
          />
        )}
      </div>

      {hasCourse && estimate && (
        <ScoreExplanation
          estimate={estimate}
          features={features}
          targetSeconds={targetSeconds}
          publishedAnchors={publishedAnchors}
          scaledVersion={scaledVersion}
        />
      )}
    </>
  )
}
