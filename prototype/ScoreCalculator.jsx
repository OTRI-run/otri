import tool from './ToolPage.module.css'
import './ScoreCalculator.css'
import ScoreScale from '../src/components/ScoreScale'
import { exponentOf } from '../src/lib/scoreLevels'
import { fitFontSize } from '../src/lib/fitText'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, GitBranch, Link2, Mountain, RefreshCw, Search, Share2, Timer, Upload, Image as ImageIcon, Download } from 'lucide-react'
import CourseMap from '../src/components/LazyCourseMap'
import { analyzeGpx, fetchRaceGpxFile, fetchSharedGpxFile, getRace, listRaces, shareGpx, raceGpxDownloadUrl } from './apiClient'
import { ShareTarget } from './SharePanel'
import NextSteps from './NextSteps'
import ReportForm from './ReportForm'
import { modelLabel, modelShort } from '../src/lib/model'
import { RACE_NAMES } from '../src/lib/raceNames'
import WhatWeScore from '../src/components/WhatWeScore'
import useFileDrop from '../src/lib/useFileDrop'
import { scrollBehavior } from '../src/lib/comfort'
import { knownButNotHere, matchRank } from '../src/lib/suggest'
import { distanceUnit, formatDistance, formatElevation, formatPace as formatPaceUnits, formatRate, kmToUnit, useUnits } from '../src/lib/units'

// Published anchor tables, shown for context in the "why this score" breakdown. The actual
// score always comes from the API. Scores 0-544 are V0.1's real demo/test anchors in every
// table; what differs is the top of the scale and whether the 692 demo anchor is kept:
//   - V0.1-V0.3: 692 kept, 1000-anchor is V0.1's extrapolated 17.940
//   - V0.4-V0.5: 692 kept, 1000-anchor is the measured human ceiling 21.533
//   - V0.6+:     692 dropped
//   - V0.8:      one power law, no anchor table (docs/methodology/0.1.0/OTRI-MODEL-0.1.0.md section 6)
const ANCHOR_1000 = { score: 1000, q: 21.5331347785071 }

const METHODOLOGY_URL = 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md'

// Where the slider starts for a freshly chosen course: the finish time that scores this.
const DEFAULT_TARGET_SCORE = 500
const POWER_EXPONENT = 0.85 // V0.8: score = 1000 × (rate / ceiling rate)^0.85

// Absolute sanity bounds for a finish time (multi-day events exist; nothing runs 200 hours).
const ABS_MIN_SECONDS = 60
const ABS_MAX_SECONDS = 200 * 3600
// The slider spans the scores that make sense on a course: from a little beyond the human ceiling
// (the score is not capped at 1000, so a time faster than the ceiling is a number too) down to a
// slow finish, so a 10 km and a 100-mile course each get a range in proportion to their own best
// time instead of one fixed 10 min to 24 h.
const SLIDER_MIN_SCORE = 200
const SLIDER_MAX_SCORE = 1100

function clampSeconds(seconds) {
  return Math.min(ABS_MAX_SECONDS, Math.max(ABS_MIN_SECONDS, Math.round(seconds / 30) * 30))
}

function sliderRange(ceilingSeconds, targetSeconds) {
  if (!ceilingSeconds) {
    const max = Math.max(86400, targetSeconds || 0)
    return { min: Math.min(600, targetSeconds || 600), max, step: max > 86400 ? 300 : 30, known: false }
  }
  const slowest = ceilingSeconds / Math.pow(SLIDER_MIN_SCORE / 1000, 1 / POWER_EXPONENT)
  const fastest = ceilingSeconds / Math.pow(SLIDER_MAX_SCORE / 1000, 1 / POWER_EXPONENT)
  const span = slowest - fastest
  const step = span > 86400 ? 300 : span > 21600 ? 60 : span > 3600 ? 30 : 5
  const min = Math.floor(fastest / step) * step
  const max = Math.ceil(slowest / step) * step
  return { min: Math.min(min, targetSeconds || min), max: Math.max(max, targetSeconds || max), step, known: true }
}

// The finish time that would score `score` on the course an estimate was made for, from the
// ceiling time the API reports (score = 1000 x (ceiling time / time) ^ 0.85).
function timeForScore(estimate, score) {
  const best = estimate?.breakdown?.world_best_time_seconds
  if (!best) return null
  const fraction = Math.pow(score / 1000, 1 / POWER_EXPONENT)
  return best / fraction
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

const CONTAINER = "prototype-score-calculator-container-style-1"

function Eyebrow({ children, className = '' }) {
  return <p className={`prototype-score-calculator-eyebrow-p-2 ${className}`}>{children}</p>
}

function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`prototype-score-calculator-spinner-span-3 ${className}`}
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
      className="prototype-score-calculator-score-panel-div-4"
    >
      <div className="prototype-score-calculator-score-panel-div-5">
        <span>OTRI / SCORE</span>
        <span className="prototype-score-calculator-score-panel-span-6">
          <i className={`prototype-score-calculator-score-panel-i-7 ${scoring ? "prototype-score-calculator-score-panel-i-9" : "prototype-score-calculator-score-panel-i-10"} prototype-score-calculator-score-panel-i-8`} />
          {status}
        </span>
      </div>

      <div className="prototype-score-calculator-score-panel-div-11">
        {estimate ? (
          <>
            <small className="prototype-score-calculator-score-panel-small-12">YOUR PROJECTED SCORE</small>
            <strong
              className={`prototype-score-calculator-score-panel-strong-13 ${scoring ? "prototype-score-calculator-score-panel-strong-14" : ''}`}
            >
              {estimate.predicted_score}
            </strong>
            {pct != null ? (
              <>
                <span className={`prototype-score-calculator-score-panel-span-15 ${pct > 100 ? "prototype-score-calculator-score-panel-span-16" : "prototype-score-calculator-score-panel-span-17"}`}>
                  {pct}% of world-record speed for a course like this
                </span>
                {b?.world_best_time_seconds > 0 && (
                  <span className="prototype-score-calculator-score-panel-span-18">
                    {pct > 100
                      ? `A world-record-level run here would take about ${formatHms(Math.round(b.world_best_time_seconds))} and score 1000. Your target is faster than that, so it scores above 1000.`
                      : `A world-record-level run here would take about ${formatHms(Math.round(b.world_best_time_seconds))} and score 1000.`}
                  </span>
                )}
                {/* Where that stands, Beginner to World class (src/lib/scoreLevels.js). */}
                <ScoreScale
                  score={estimate.predicted_score}
                  share={b.fraction_of_ceiling}
                  exponent={exponentOf(estimate)}
                  targetSeconds={targetSeconds}
                  timeForScore={(score) => timeForScore(estimate, score)}
                />
              </>
            ) : (
              <span className="prototype-score-calculator-score-panel-span-19">{formatHms(targetSeconds)}</span>
            )}
            {scoring && (
              <span className="prototype-score-calculator-score-panel-span-20">
                <Spinner className="prototype-score-calculator-score-panel-spinner-21" /> UPDATING
              </span>
            )}
          </>
        ) : scoring ? (
          <>
            <Spinner className="prototype-score-calculator-score-panel-spinner-22" />
            <strong className="prototype-score-calculator-score-panel-strong-23">Calculating your score…</strong>
            <span className="prototype-score-calculator-score-panel-span-24">
              Every 50 m of the course is measured and costed. Long, hilly courses take a few seconds.
            </span>
          </>
        ) : (
          <>
            <small className="prototype-score-calculator-score-panel-small-12">WHY THIS SCORE?</small>
            <strong className="prototype-score-calculator-score-panel-strong-25">
              Pick a course.
            </strong>
            <span className="prototype-score-calculator-score-panel-span-24">Then set a finish time. The score updates live.</span>
          </>
        )}
      </div>

      <div>
        {rows.map(([Icon, title, desc]) => (
          <div key={title} className="prototype-score-calculator-score-panel-div-26">
            <Icon size={16} className="prototype-score-calculator-score-panel-icon-27" />
            <span className="prototype-score-calculator-score-panel-span-28">{title}</span>
            <small className="prototype-score-calculator-score-panel-small-29">{desc}</small>
          </div>
        ))}
      </div>
      <div className="prototype-score-calculator-score-panel-div-30">
        <b>OTRI INDEX</b>
        <span className="prototype-score-calculator-score-panel-span-31">COURSE + TIME + VERSION = SCORE</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- explanation
// Two audiences, one section. The plain-language story reads the API's own breakdown of the
// score — nothing is recomputed here — with the maths shown below the explanation.

function Stat({ label, value, mono = true }) {
  return (
    <div>
      <dt className="prototype-score-calculator-stat-dt-32">{label}</dt>
      <dd className={`prototype-score-calculator-stat-dd-33 ${mono ? "prototype-score-calculator-stat-dd-34" : ''}`}>{value}</dd>
    </div>
  )
}

// One quiet line, only when elevation was not verified against terrain data; silent otherwise.
function MeasurementTrust({ estimate }) {
  const has = (name) => (estimate.quality_flags ?? []).some((flag) => flag.startsWith(name))
  const notes = [
    has('elevation_not_dem_sourced') && 'Elevation for this course comes from your GPX file rather than verified terrain data, so the score can differ slightly between devices.',
    has('route_not_reproducible') && 'The track is recorded too sparsely to measure the route reliably: a denser file (a point at least every 30 m) gives a trustworthy score.',
    has('vertical_calibration_provisional') && 'This is an uphill-only course. Vertical races are scored with a steep-ground factor that rests on a single calibration race so far, so treat the score as provisional.',
    has('gradient_domain_exceeded') && 'Much of this course is steeper than the ground the model was calibrated on, so the score is less certain.',
  ].filter(Boolean)
  if (notes.length === 0) return null
  return (
    <div className="prototype-score-calculator-measurement-trust-div-35">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </div>
  )
}

function ExplanationStep({ n, title, children }) {
  return (
    <div className="prototype-score-calculator-explanation-step-div-36">
      <b className="prototype-score-calculator-explanation-step-b-37">{n}</b>
      <div className="prototype-score-calculator-explanation-step-div-38">
        <strong className="prototype-score-calculator-explanation-step-strong-39">{title}</strong>
        <div className="prototype-score-calculator-explanation-step-div-40">{children}</div>
      </div>
    </div>
  )
}

function ScoreExplanation({ estimate, features, targetSeconds }) {
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
    <section className="prototype-score-calculator-score-explanation-section-41">
      <div className={CONTAINER}>
        <div className="prototype-score-calculator-score-explanation-div-42">
          <Eyebrow>02 / WHY THIS SCORE</Eyebrow>
          <a href={METHODOLOGY_URL} className="prototype-score-calculator-score-explanation-a-43">
            Open methodology <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="prototype-score-calculator-score-explanation-div-44">
          <div className="prototype-score-calculator-explanation-step-div-38">
            <h2 className="prototype-score-calculator-score-explanation-h2-45">
              Open method.
              <br />
              <span className="prototype-score-calculator-score-explanation-span-46">Your number.</span>
            </h2>
            <p className="prototype-score-calculator-score-explanation-p-47">
              Two things go in: the course and your time. Not who else raced, not the weather, not your age. The course is
              converted into the flat road distance it costs to run, and your speed over that is compared with the fastest
              a human has ever sustained over the same amount of ground.
            </p>
            <p className="prototype-score-calculator-score-explanation-p-48">
              That yardstick already allows for distance: nobody holds their 5 km pace for 20 hours, so the best-ever rate
              falls as courses get longer. A long mountain race is never scored worse than a short one for being long.
            </p>
            <div className="prototype-score-calculator-score-explanation-div-49">
              <GitBranch size={16} className="prototype-score-calculator-score-explanation-git-branch-50" />
              same course + same time + same version <b className="prototype-score-calculator-score-explanation-git-branch-50">=</b> same score
            </div>
            <MeasurementTrust estimate={estimate} />
          </div>

          <div className="prototype-score-calculator-score-explanation-div-51">
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
                    <div className="prototype-score-calculator-score-explanation-div-52" aria-hidden="true">
                      <div className="prototype-score-calculator-score-explanation-div-53" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                    <p className="prototype-score-calculator-score-explanation-p-54">
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

        <section className="prototype-score-calculator-score-explanation-section-55 otri-group">
          <h3 className="prototype-score-calculator-score-explanation-h3-56">
            The maths
          </h3>
          <div className="prototype-score-calculator-score-explanation-div-57">
            {b && (
              <pre className="prototype-score-calculator-score-explanation-pre-58">
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

            <dl className="prototype-score-calculator-score-explanation-dl-59">
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
            </dl>

            <p className="prototype-score-calculator-score-explanation-p-60">
              One published curve, no anchor table: score = 1000 × (fraction of the human-ceiling rate)^0.85, with Q_1000
              = {ANCHOR_1000.q.toFixed(3)} demand-km/h at the reference course size. "demand-km" is a kilometre of flat
              road at Minetti's metabolic cost — the unit called "flat km" above.
            </p>

          </div>
        </section>

        <p className="prototype-score-calculator-score-explanation-p-61">Model-based projection · {estimate.disclaimer}</p>
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

function ShareBox({ courseLabel, courseFile, targetSeconds, shareId, onShared, imageOpen, onToggleImage }) {
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
    <div className="prototype-score-calculator-share-box-div-62">
      <div className="prototype-score-calculator-share-box-div-63">
        <button
          type="button"
          onClick={share}
          disabled={state === 'sharing'}
          className="prototype-score-calculator-share-box-button-64"
        >
          {state === 'sharing' ? (
            <>
              <span aria-hidden="true" className="prototype-score-calculator-share-box-span-65" /> Creating link…
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
        {onToggleImage && (
          <button
            type="button"
            onClick={onToggleImage}
            aria-expanded={imageOpen}
            className="prototype-score-calculator-share-box-button-66"
          >
            <ImageIcon size={16} className="prototype-score-calculator-score-explanation-git-branch-50" /> {imageOpen ? 'Hide image and post' : 'Image and post text'}
          </button>
        )}
        {url && canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="prototype-score-calculator-share-box-button-66"
          >
            Send… <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      {url ? (
        <div className="prototype-score-calculator-share-box-div-67">
          <Link2 size={14} className="prototype-score-calculator-share-box-link2-68" />
          <input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Share link" className="prototype-score-calculator-share-box-input-69" />
          <button type="button" onClick={() => copy(url)} className="prototype-score-calculator-share-box-button-70" aria-label="Copy link">
            <Copy size={16} />
          </button>
        </div>
      ) : null}
      <p className="prototype-score-calculator-share-box-p-71">
        {raceId
          ? 'The link opens this race with your target time. Change the time and the link updates.'
          : shareId
            ? 'Anyone with the link sees this course and your target time. Change the time and the link updates.'
            : 'Sharing stores your course file on OTRI so the link works for anyone; the target time travels in the link itself.'}
        {onToggleImage ? ' For Facebook, Instagram or WhatsApp, make an image with a post written for it.' : ''}
      </p>
      {error && <p className="prototype-score-calculator-share-box-p-72">{error}</p>}
    </div>
  )
}

// ----------------------------------------------------------------------------- course picker

// What to do when the race a runner is looking for has no course here.
function NoCourseHelp({ name, onClose }) {
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${name} GPX course`)}`
  const body = [
    'Hello,',
    `I would like to see ${name} on OTRI (https://otri.run), an open and free score for trail races. Runners can then work out what a finish time on your course is worth, and you can score and publish your results.`,
    'Listing the course takes a few minutes and needs no approval: https://otri.run/organizer/',
    'Thank you!',
  ].join('\n\n')
  const mail = `mailto:?subject=${encodeURIComponent(`${name} on OTRI`)}&body=${encodeURIComponent(body)}`
  const button = "prototype-score-calculator-no-course-help-style-73"
  return (
    <div className="prototype-score-calculator-no-course-help-div-74" role="status">
      <p className="prototype-score-calculator-stat-dd-33">No course for &ldquo;{name}&rdquo; here yet.</p>
      <p className="prototype-score-calculator-no-course-help-p-75">
        Most organizers put the route on their own website: look for Course, Route, Parcours, Strecke or a GPX download. Save the file and
        upload it here, and you get the score straight away.
      </p>
      <div className="prototype-score-calculator-no-course-help-div-76">
        <a href={search} target="_blank" rel="noreferrer" className={`${button} prototype-score-calculator-no-course-help-a-77`}>
          <Search size={13} /> Search the web for the GPX
        </a>
        <label htmlFor="calc-gpx-input" className={`${button} prototype-score-calculator-no-course-help-label-78`}>
          <Upload size={13} /> Upload a GPX
        </label>
      </div>
      <p className="prototype-score-calculator-no-course-help-p-79">
        Know the organizer? Listing a race on OTRI is free and needs no approval.{' '}
        <a href={mail} className="prototype-score-calculator-no-course-help-a-80">
          Write to them
        </a>
        {onClose && (
          <>
            {' · '}
            <button type="button" onClick={onClose} className="prototype-score-calculator-no-course-help-button-81">
              Close
            </button>
          </>
        )}
      </p>
    </div>
  )
}

function CoursePicker({ races, allRaces, racesLoading, racesError, query, onQuery, onChooseRace, onUpload, loadingCourse, loadError }) {
  const [source, setSource] = useState('race')
  const units = useUnits()
  const [missing, setMissing] = useState(null) // a well-known race the visitor picked that has no course here
  const known = useMemo(() => knownButNotHere(RACE_NAMES, query, (allRaces ?? races).map((race) => race.event_name)), [query, allRaces, races])
  const nothingFound = !racesLoading && !racesError && races.length === 0 && query.trim().length >= 2
  const [refused, setRefused] = useState(null)
  const { dragging, dropProps } = useFileDrop({
    accept: '.gpx',
    disabled: loadingCourse,
    onFiles: (files) => {
      setRefused(null)
      onUpload({ target: { files, value: '' } })
    },
    onReject: (message) => setRefused(`${message} Export the course as GPX and drop that.`),
  })
  return (
    <section className={tool.workbench} data-tool-page="calculator">
      <div className={CONTAINER}>
        <div className={tool.container}>
          <div className={tool.heading}>
            <p className={tool.eyebrow}>FOR RUNNERS / INDIVIDUAL PERFORMANCE</p>
            <h1 className="prototype-score-calculator-course-picker-h1-85">Calculate my score</h1>
            <p className="prototype-score-calculator-course-picker-p-86">Choose your course, then enter your finish time.</p>
            <ol aria-label="Calculation steps" className="prototype-score-calculator-course-picker-ol-87">
              <li aria-current="step" className="prototype-score-calculator-course-picker-li-88">1. Choose course</li>
              <li className="prototype-score-calculator-course-picker-li-89">2. Enter time</li>
            </ol>
          </div>
          <div role="group" aria-label="Course source" className={tool.switcher}>
            {[['race', 'Find a race'], ['upload', 'Upload my course']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={source === value} aria-controls={`course-source-${value}`} onClick={() => setSource(value)} className={`prototype-score-calculator-course-picker-button-91 ${source === value ? "prototype-score-calculator-course-picker-button-92" : "prototype-score-calculator-course-picker-button-93"}`}>{label}</button>
            ))}
          </div>
        <div className="prototype-score-calculator-course-picker-div-94">
          <div id="course-source-race" hidden={source !== 'race'} className={tool.panel}>
            <div className="prototype-score-calculator-course-picker-div-96">
              <Search size={16} className="prototype-score-calculator-score-explanation-git-branch-50" />
              <h3 className="prototype-score-calculator-course-picker-h3-97">Pick a race</h3>
            </div>
            <p className="prototype-score-calculator-course-picker-p-98">Search below and select your race.</p>
            <input
              type="text"
              value={query}
              onChange={(event) => {
                onQuery(event.target.value)
                setMissing(null)
              }}
              placeholder="Search by race name…"
              aria-label="Search races"
              autoComplete="off"
              className="prototype-score-calculator-course-picker-input-99"
            />
            {racesLoading && (
              <p className="prototype-score-calculator-course-picker-p-100">
                <Spinner /> Loading races…
              </p>
            )}
            {racesError && <p className="prototype-score-calculator-course-picker-p-101">{racesError}</p>}
            {!racesLoading && !racesError && races.length === 0 && query.trim().length < 2 && (
              <p className="prototype-score-calculator-course-picker-p-102">No races with a course yet. Upload a GPX to start.</p>
            )}
            <div className="prototype-score-calculator-course-picker-div-103">
              {races.map((race) => (
                <button
                  key={race.race_id}
                  onClick={() => onChooseRace(race)}
                  disabled={loadingCourse}
                  className="prototype-score-calculator-course-picker-button-104"
                >
                  <span className="prototype-score-calculator-explanation-step-div-38">
                    <span className="prototype-score-calculator-course-picker-span-105">
                      {race.event_name} · {race.course_name}
                    </span>
                    <span className="prototype-score-calculator-course-picker-span-106">
                      {race.calculator_only ? [race.event_location, race.event_country].filter(Boolean).join(', ') || 'course' : race.event_date} · {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
                    </span>
                  </span>
                  <ArrowUpRight size={14} className="prototype-score-calculator-course-picker-arrow-up-right-107" />
                </button>
              ))}
            </div>
            {known.length > 0 && !missing && (
              <div className="prototype-score-calculator-course-picker-div-94">
                <p className="prototype-score-calculator-course-picker-p-108">WELL-KNOWN RACES · NO COURSE HERE YET</p>
                <div className="prototype-score-calculator-course-picker-div-109">
                  {known.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setMissing(name)}
                      className="prototype-score-calculator-course-picker-button-110"
                    >
                      <span className="prototype-score-calculator-course-picker-span-111">{name}</span>
                      <span className="prototype-score-calculator-course-picker-span-112">HOW TO GET THE GPX</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {missing ? <NoCourseHelp name={missing} onClose={() => setMissing(null)} /> : nothingFound && known.length === 0 && <NoCourseHelp name={query.trim()} />}
          </div>

          <div id="course-source-upload" hidden={source !== 'upload'} className={tool.panel}>
            <div className="prototype-score-calculator-course-picker-div-96">
              <Upload size={16} className="prototype-score-calculator-score-explanation-git-branch-50" />
              <h3 className="prototype-score-calculator-course-picker-h3-97">Upload your course</h3>
            </div>
            <p className="prototype-score-calculator-course-picker-p-113">Choose a GPX route file from your watch or race organizer.</p>
            <label
              htmlFor="calc-gpx-input"
              {...dropProps}
              className={`prototype-score-calculator-course-picker-label-114 ${dragging ? "prototype-score-calculator-course-picker-label-115" : "prototype-score-calculator-course-picker-label-116"}`}
            >
              {loadingCourse ? (
                <>
                  <Spinner className="prototype-score-calculator-course-picker-spinner-117" />
                  <span className="prototype-score-calculator-stat-dd-33">Reading course…</span>
                  <span className="prototype-score-calculator-course-picker-span-118">This may take a few seconds.</span>
                </>
              ) : (
                <>
                  <Upload size={22} className="prototype-score-calculator-score-explanation-git-branch-50" />
                  <span className="prototype-score-calculator-stat-dd-33">Drop a .gpx file here, or browse</span>
                  <span className="prototype-score-calculator-course-picker-span-119">
                    Your file stays private unless you create a share link.
                  </span>
                  <span className="prototype-score-calculator-course-picker-span-120">
                    Choose file
                  </span>
                </>
              )}
              <input id="calc-gpx-input" type="file" accept=".gpx" onChange={onUpload} disabled={loadingCourse} className="prototype-score-calculator-course-picker-input-121" />
            </label>
          </div>
        </div>
        {loadingCourse && <p role="status" className="prototype-score-calculator-course-picker-p-122">Loading your course…</p>}
        {(refused || loadError) && <p className="prototype-score-calculator-course-picker-p-123" role="alert">{refused || loadError}</p>}
            <section className="prototype-score-calculator-course-picker-section-124 otri-group">
              <h3 className="prototype-score-calculator-stat-dd-33">
                <span className="prototype-score-calculator-score-explanation-git-branch-50">What is a GPX, and where do I get one?</span>
              </h3>
              <div className="prototype-score-calculator-course-picker-div-125">
                <p>
                  A GPX file is the route as a list of GPS points, the format every watch, phone app and route planner can export. It weighs
                  a megabyte or two and holds nothing about you unless you exported a recording with timestamps.
                </p>
                <p>
                  <span className="prototype-score-calculator-stat-dd-33">Before a race:</span> most organizers publish the course GPX on the race
                  website's course or route page weeks ahead, often per distance; look for "Download GPX", "Track" or "Trace", or check
                  the final participant email.{' '}
                  <span className="prototype-score-calculator-stat-dd-33">After a race:</span> export your own recording (Garmin Connect, Strava,
                  Coros, Suunto, Polar all have "Export GPX"); it will be slightly longer than the official course.
                </p>
                <p>
                  A file with a point at least every 30 m scores at High confidence; a heavily simplified file still scores, labelled Low.
                  Uploads are measured and forgotten unless you share the score.{' '}
                  <a href="https://github.com/OTRI-run/otri/blob/main/docs/WHAT-IS-A-GPX.md" target="_blank" rel="noreferrer" className="prototype-score-calculator-course-picker-a-126">
                    Full guide ↗
                  </a>
                </p>
              </div>
            </section>
        <WhatWeScore className="prototype-score-calculator-course-picker-what-we-score-127" />
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
    <section className="prototype-score-calculator-course-details-section-128">
      <div className={CONTAINER}>
        <div className="prototype-score-calculator-course-details-div-129">
          <div className="prototype-score-calculator-explanation-step-div-38">
            <Eyebrow>01 / COURSE</Eyebrow>
            <h2 className="prototype-score-calculator-course-details-h2-130 otri-fit" style={{ fontSize: fitFontSize(courseLabel.name, { min: 26, vw: 4, max: 44 }) }}>{courseLabel.name}</h2>
            <p className="prototype-score-calculator-course-details-p-131">
              {courseLabel.meta ? `${courseLabel.meta} · ` : ''}
              <span className={courseLabel.verified ? "prototype-score-calculator-course-picker-a-126" : "prototype-score-calculator-course-details-span-132"}>
                {courseLabel.verified ? 'Race course' : courseLabel.meta === 'Shared course' ? 'Shared course' : 'Your upload'}
              </span>
              {courseLabel.sourceUrl && (
                <>
                  {' · course file from '}
                  <a href={courseLabel.sourceUrl} target="_blank" rel="noreferrer" className="prototype-score-calculator-no-course-help-a-80">
                    {courseLabel.sourceUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="prototype-score-calculator-course-details-div-133">
            {/* A race's course can be taken along; the visitor's own upload they already have. */}
            {courseLabel.raceId && (
              <a
                href={raceGpxDownloadUrl(courseLabel.raceId)}
                title="The track and its elevations, nothing else from the original file"
                className="prototype-score-calculator-course-details-a-134"
              >
                <Download size={14} /> Download the GPX
              </a>
            )}
            <button
              onClick={onChangeCourse}
              className="prototype-score-calculator-course-details-button-135"
            >
              <RefreshCw size={14} /> Change course
            </button>
          </div>
        </div>

        <div className="prototype-score-calculator-course-details-div-136">
          {stats.map(([label, value], index) => (
            <div key={label} className={`prototype-score-calculator-course-details-div-137 ${index > 0 ? "prototype-score-calculator-course-details-div-138" : ''} ${index % 2 === 1 ? "prototype-score-calculator-course-details-div-139" : ''}`}>
              <small className="prototype-score-calculator-course-details-small-140">{label}</small>
              <b className="prototype-score-calculator-course-details-b-141">{value}</b>
            </div>
          ))}
        </div>

        {gpxText && (
          <div className="prototype-score-calculator-course-details-div-142">
            <CourseMap gpxText={gpxText} measurement={measurement} className="prototype-score-calculator-course-details-course-map-143" />
          </div>
        )}

        {courseLabel.meta === 'Shared course' && shareId && (
          <ReportForm kind="shared_course" subjectId={shareId} subjectLabel={courseLabel.name} prompt="Is this course file yours, or wrong?" />
        )}
        {tooSparse && (
          <p className="prototype-score-calculator-course-details-p-144">
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

// One part of a finish time (hours, minutes or seconds) as its own field: typed digits replace what
// is there, two digits move on to the next part, and the arrow keys step it. Far less fiddly than
// one text box that only accepts "4:30:00" typed exactly.
//
// Two traps, both of which turned a typed "20" into "02":
// - Moving the focus on after the second digit blurs this field, and the blur handler of that
//   render still held the half-typed "2" and committed it over the 20. The draft therefore lives
//   in a ref that is emptied before the focus moves; the state copy only redraws the field.
// - What was typed is taken from the keystroke (the input event's data), not from the text in the
//   box: with the caret inside "00", typing "2" makes "020".
function TimePart({ id, label, value, max, onCommit, nextId, wide = false }) {
  const [draft, setDraftState] = useState(null) // what is being typed, until it is committed
  const draftRef = useRef(null)
  const setDraft = (text) => {
    draftRef.current = text
    setDraftState(text)
  }
  const shown = draft ?? String(value).padStart(wide ? 1 : 2, '0')

  const limit = wide ? 3 : 2

  function commit(text, advance) {
    if (text !== '') onCommit(Math.min(max, Math.max(0, parseInt(text, 10) || 0))) // an emptied field keeps its value
    setDraft(null)
    if (advance && nextId) document.getElementById(nextId)?.focus()
  }

  function typed(digits) {
    const current = draftRef.current
    const base = current === null || current.length >= limit ? '' : current // the first digit starts afresh
    const next = (base + digits).slice(-limit)
    if (!wide && next.length >= limit) commit(next, true)
    else setDraft(next)
  }

  return (
    <label className="prototype-score-calculator-time-part-label-145">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        value={shown}
        onFocus={(event) => event.target.select()}
        onMouseUp={(event) => event.preventDefault() /* keep the selection the focus made */}
        onChange={(event) => {
          const native = event.nativeEvent
          if (native.inputType?.startsWith('delete')) return setDraft((draftRef.current ?? '').slice(0, -1))
          const digits = (native.data ?? event.target.value).replace(/\D/g, '')
          if (digits) typed(digits)
        }}
        onBlur={() => draftRef.current !== null && commit(draftRef.current, false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            commit(String(Math.min(max, Math.max(0, value + (event.key === 'ArrowUp' ? 1 : -1)))), false)
          } else if (event.key === 'Enter' || event.key === ':') {
            event.preventDefault()
            commit(shown, true)
          }
        }}
        className={`${wide ? "prototype-score-calculator-time-part-input-147" : "prototype-score-calculator-time-part-input-147"} prototype-score-calculator-time-part-input-146`}
        style={{ width: `${Math.max(shown.length, wide ? 1 : 2) + 0.35}ch` }}
      />
      <span className="prototype-score-calculator-time-part-span-148">{label}</span>
    </label>
  )
}

const NUDGES = [-300, -60, 60, 300]
const SCORE_JUMPS = [300, 400, 500, 600, 700, 800, 900, 1000]

function TargetTimeControls({ targetSeconds, onChange, distanceKm, analysisError, ceilingSeconds, score }) {
  const units = useUnits()
  const range = sliderRange(ceilingSeconds, targetSeconds)
  const hours = Math.floor(targetSeconds / 3600)
  const minutes = Math.floor((targetSeconds % 3600) / 60)
  const seconds = targetSeconds % 60
  const set = (h, m, s) => onChange(h * 3600 + m * 60 + s)
  // The time that scores `target` here, from the model's ceiling for this course.
  const timeFor = (target) => (ceilingSeconds ? Math.round(ceilingSeconds / Math.pow(target / 1000, 1 / POWER_EXPONENT)) : null)
  const chip = "prototype-score-calculator-target-time-controls-style-149"

  return (
    <div className="prototype-score-calculator-target-time-controls-div-150">
      <p className="prototype-score-calculator-target-time-controls-p-151">2 · Enter your finish time</p>
      <div className="prototype-score-calculator-target-time-controls-div-152">
        <div className="prototype-score-calculator-target-time-controls-div-153" role="group" aria-label="Target finish time">
          <TimePart id="calc-hours" label="HOURS" value={hours} max={199} wide onCommit={(h) => set(h, minutes, seconds)} nextId="calc-minutes" />
          <span className="prototype-score-calculator-target-time-controls-span-154">:</span>
          <TimePart id="calc-minutes" label="MIN" value={minutes} max={59} onCommit={(m) => set(hours, m, seconds)} nextId="calc-seconds" />
          <span className="prototype-score-calculator-target-time-controls-span-154">:</span>
          <TimePart id="calc-seconds" label="SEC" value={seconds} max={59} onCommit={(s) => set(hours, minutes, s)} />
        </div>
        <p className="prototype-score-calculator-target-time-controls-p-155">{formatPace(targetSeconds, distanceKm, units)}</p>
        <div className="prototype-score-calculator-target-time-controls-div-156">
          {NUDGES.map((delta) => (
            <button key={delta} type="button" onClick={() => onChange(targetSeconds + delta)} className={`${chip} prototype-score-calculator-target-time-controls-button-157`}>
              {delta > 0 ? '+' : '−'}{Math.abs(delta) / 60} min
            </button>
          ))}
        </div>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={targetSeconds}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Target finish time"
        className="prototype-score-calculator-target-time-controls-input-158"
      />
      <div className="prototype-score-calculator-target-time-controls-div-159">
        <span>{range.known ? `${formatHms(range.min)} · SCORE ${SLIDER_MAX_SCORE}` : formatHms(range.min)}{range.known && <span className="prototype-score-calculator-target-time-controls-span-160"> · 1000 = WORLD-RECORD LEVEL, {formatHms(ceilingSeconds)}</span>}</span>
        <span>{range.known ? `${formatHms(range.max)} · SCORE ${SLIDER_MIN_SCORE}` : formatHms(range.max)}</span>
      </div>
      {range.known && (
        <section className="prototype-score-calculator-target-time-controls-section-161">
          <h3 className="prototype-score-calculator-target-time-controls-h3-162">Find a time for a target score</h3>
          <div className="prototype-score-calculator-target-time-controls-div-163">
          {SCORE_JUMPS.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onChange(timeFor(target))}
              title={`${formatHms(timeFor(target))} scores ${target} on this course`}
              className={`${chip} ${score === target ? "prototype-score-calculator-target-time-controls-button-164" : "prototype-score-calculator-target-time-controls-button-157"}`}
            >
              {target}
            </button>
          ))}
          </div>
        </section>
      )}
      {analysisError && <p className="prototype-score-calculator-share-box-p-72">{analysisError}</p>}
    </div>
  )
}

// `embedded`: the calculator inside another website's page (prototype/embed/): no share links and no
// links into the rest of OTRI, which the host page does not have.
export default function ScoreCalculator({ embedded = false }) {
  const [shareImageOpen, setShareImageOpen] = useState(false)
  useEffect(() => {
    if (shareImageOpen) setTimeout(() => document.getElementById('calculator-share')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }), 50)
  }, [shareImageOpen])
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
    if (!query.trim()) return races
    return races
      .map((race) => [race, matchRank(`${race.event_name} ${race.course_name}`, query)])
      .filter(([, rank]) => rank >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([race]) => race)
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
      window.scrollTo({ top: 0, behavior: scrollBehavior() })
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoadingCourse(false)
    }
  }

  function raceLabel(race) {
    return { name: `${race.event_name} · ${race.course_name}`, meta: race.calculator_only ? [race.event_location, race.event_country].filter(Boolean).join(', ') : race.event_date, verified: true, raceId: race.race_id, sourceUrl: race.source_url ?? null }
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
    setShareImageOpen(false)
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
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }

  function updateTargetSeconds(seconds) {
    if (Number.isFinite(seconds)) setTargetSeconds(Math.min(ABS_MAX_SECONDS, Math.max(ABS_MIN_SECONDS, Math.round(seconds))))
  }

  const hasCourse = Boolean(courseFile && features)
  const shareUrl = courseLabel && (courseLabel.raceId || shareId) ? buildShareUrl({ raceId: courseLabel.raceId ?? null, shareId, name: courseLabel.name, seconds: targetSeconds }) : null

  // Before a course is chosen the picker is the first thing on the page, so a visitor starts at
  // once; with a course, the score comes first and the course's details follow it.
  const course = (
    <div id="calculator-course" className="prototype-score-calculator-score-calculator-div-165">
      {hasCourse ? (
        <CourseDetails gpxText={gpxText} measurement={measurement} features={features} courseLabel={courseLabel} onChangeCourse={startOver} shareId={shareId} />
      ) : (
        <CoursePicker
          races={filteredRaces}
          allRaces={races}
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
  )

  return (
    <>
      {!hasCourse && course}
      {hasCourse && (
      <section className="prototype-score-calculator-score-calculator-section-166">
        <div className={`${CONTAINER} prototype-score-calculator-score-calculator-div-167`}>
          <div className="prototype-score-calculator-explanation-step-div-38">
            <div className="prototype-score-calculator-score-calculator-div-168">
              OPEN TRAIL RUNNING INDEX <span className="prototype-score-calculator-score-panel-span-17">·</span> SCORE CALCULATOR
            </div>
                <h1 className="prototype-score-calculator-score-calculator-h1-169 otri-fit" style={{ fontSize: fitFontSize(courseLabel.name, { min: 30, vw: 5, max: 56 }) }}>
                  Your course:{' '}
                  <em className="prototype-score-calculator-score-calculator-em-170 otri-gradient-text">{courseLabel.name}</em>
                </h1>
                <p className="prototype-score-calculator-score-calculator-p-171">
                  Replace the suggested time with your own. Your score updates automatically.
                </p>
                <button type="button" onClick={startOver} className="prototype-score-calculator-score-calculator-button-172">Change course</button>
                <TargetTimeControls
                  targetSeconds={targetSeconds}
                  onChange={updateTargetSeconds}
                  distanceKm={features.distance_km}
                  analysisError={analysisError}
                  ceilingSeconds={estimate?.breakdown?.world_best_time_seconds}
                  score={estimate?.predicted_score}
                />
          </div>
          <ScorePanel estimate={estimate} scoring={scoring} targetSeconds={targetSeconds} features={features} courseLabel={courseLabel} />
        </div>
      </section>
      )}

      {!embedded && hasCourse && estimate && (
        <section className={`${CONTAINER} prototype-score-calculator-score-calculator-section-173`}>
          <h3 className="prototype-score-calculator-score-calculator-h3-174">Share my score</h3>
          <ShareBox courseLabel={courseLabel} courseFile={courseFile} targetSeconds={targetSeconds} shareId={shareId} onShared={setShareId} imageOpen={shareImageOpen} onToggleImage={estimate ? () => setShareImageOpen((open) => !open) : null} />
        </section>
      )}

      {!embedded && hasCourse && estimate && shareImageOpen && (
        <section id="calculator-share" className="prototype-score-calculator-score-calculator-section-175">
          <div className={CONTAINER}>
            <p className="prototype-score-calculator-score-calculator-p-176">SHARE YOUR TARGET</p>
            <h2 className="prototype-score-calculator-score-calculator-h2-177">An image and a post, ready for your feed</h2>
            <p className="prototype-score-calculator-score-calculator-p-178">
              Pick a format, change the words if you like, then download the image or send both to an app.
              {shareUrl ? ' The post carries your link, so friends open this course with your time and try their own.' : ' Press “Share this score” first if you want the post to carry a link to this course.'}
            </p>
            <ShareTarget courseName={courseLabel.name} distanceKm={features.distance_km} elevationGainM={features.elevation_gain_m} seconds={targetSeconds} score={estimate.predicted_score} fractionOfCeiling={estimate.breakdown?.fraction_of_ceiling} url={shareUrl} />
          </div>
        </section>
      )}

      {hasCourse && (
        <section className="prototype-score-calculator-score-calculator-section-179">
          <h3 className={`${CONTAINER} prototype-score-calculator-score-calculator-h3-180`}>Course map and details</h3>
          {course}
        </section>
      )}

      {hasCourse && estimate && (
        <section>
          <h3 className={`${CONTAINER} prototype-score-calculator-score-calculator-h3-180`}>How is my score calculated?</h3>
        <ScoreExplanation
          estimate={estimate}
          features={features}
          targetSeconds={targetSeconds}
        />
        </section>
      )}
    </>
  )
}
