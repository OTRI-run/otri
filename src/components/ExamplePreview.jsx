import { ArrowRight } from 'lucide-react'
import example from '../data/example-preview.json'
import Flag from './Flag'
import RankBadge, { podiumRowClass } from './RankBadge'

// A real product result on the homepage: the built-in synthetic example race, as the live API
// scored it (src/data/example-preview.json, produced by the API itself). Every figure here is read
// from that file and formatted; nothing is typed in by hand, so the card can never drift from
// what the tool actually returns. The race is invented and the card says so on a pill.

export const EXAMPLE = example

const km = (value, digits = 1) => `${Number(value).toFixed(digits)} km`
const metres = (value) => `${Math.round(value)} m`

/** "24.0 km · +927 m · High confidence · measured from the course file", from the course block. */
export function courseLine(course = example.course) {
  return `${km(course.distance_km)} · +${metres(course.elevation_gain_m)} · ${course.confidence} confidence · measured from the course file`
}

/** The three lines of the winner's calculation, written out from the explanation block. */
export function explanationLines(explanation = example.explanation) {
  const { course_demand_km, terrain_factor, adjusted_demand_km, performance_rate, reference_rate, exponent, row } = explanation
  return [
    ['Course demand', `${course_demand_km.toFixed(1)} flat-equivalent km × terrain factor ${terrain_factor.toFixed(3)} = ${adjusted_demand_km.toFixed(1)} km`],
    ['Rate', `${adjusted_demand_km.toFixed(1)} km ÷ ${row.time} = ${performance_rate.toFixed(2)} km/h against a ceiling of ${reference_rate.toFixed(2)} km/h`],
    ['Score', `1000 × (${performance_rate.toFixed(2)} ÷ ${reference_rate.toFixed(2)})^${exponent} = ${row.score}`],
  ]
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'

export function SyntheticPill({ className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[.1em] text-amber-800 ${className}`}>
      SYNTHETIC EXAMPLE
    </span>
  )
}

// ---------------------------------------------------------------------------- elevation profile

const PROFILE_W = 320
const PROFILE_H = 88
const PAD = { top: 8, bottom: 4, side: 2 }

/**
 * The course's elevation profile as a static drawing: the same shape and blue as the profile under
 * the course map (CourseMap.jsx), without its axes and hover. The drawing stretches to the card's
 * width; the stroke does not scale with it.
 */
export function ExampleProfile({ profile = example.profile, course = example.course, className = '' }) {
  const points = profile.filter(([d, e]) => Number.isFinite(d) && Number.isFinite(e))
  const maxD = points[points.length - 1][0]
  const minE = Math.min(...points.map((p) => p[1]))
  const maxE = Math.max(...points.map((p) => p[1]))
  const chartH = PROFILE_H - PAD.top - PAD.bottom
  const toX = (d) => PAD.side + (d / maxD) * (PROFILE_W - PAD.side * 2)
  const toY = (e) => PAD.top + (1 - (e - minE) / (maxE - minE || 1)) * chartH
  const line = points.map(([d, e]) => `${toX(d).toFixed(1)},${toY(e).toFixed(1)}`).join(' ')
  const area = `${toX(0).toFixed(1)},${PROFILE_H} ${line} ${toX(maxD).toFixed(1)},${PROFILE_H}`
  const peak = points.reduce((best, p) => (p[1] > best[1] ? p : best), points[0])
  const label = `Elevation profile of the example course: ${km(course.distance_km)}, from ${metres(course.min_elevation_m)} to ${metres(course.max_elevation_m)}, ${metres(course.elevation_gain_m)} of climb.`

  return (
    <figure className={`min-w-0 ${className}`}>
      <svg
        viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`}
        preserveAspectRatio="none"
        className="block h-[88px] w-full"
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <defs>
          <linearGradient id="otri-example-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b82f6" stopOpacity=".35" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity=".03" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#otri-example-fill)" />
        <polyline points={line} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={PAD.side} x2={PROFILE_W - PAD.side} y1={PROFILE_H - 0.5} y2={PROFILE_H - 0.5} stroke="#cbd5e1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={toX(peak[0])} cy={toY(peak[1])} r="3" fill="#ffffff" stroke="#1d4ed8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-slate-500">
        <span>0 km · {metres(points[0][1])}</span>
        <span>high point {metres(peak[1])}</span>
        <span>{km(maxD)}</span>
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------- explanation

/**
 * The winner's score, worked out in three lines, with the confidence note beneath. Used inside the
 * preview card and on its own in the "Every score explains itself" section of the home page.
 */
export function ExampleExplanation({ className = '', showRunner = true }) {
  const { explanation, course, model_label, scoring_version } = example
  const { row, steep_distance_fraction } = explanation
  const lines = explanationLines(explanation)
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
      {showRunner && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[13px] font-semibold text-[#0b1220]">
            Why {row.first_name} {row.family_name} scores <span className="font-mono text-blue-700">{row.score}</span>
          </p>
          <span className="font-mono text-[11px] text-slate-500">
            {row.time} · rank {row.rank}
          </span>
        </div>
      )}
      <dl className={`grid gap-y-2 ${showRunner ? 'mt-3' : ''}`}>
        {lines.map(([term, detail]) => (
          <div key={term} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[112px_minmax(0,1fr)]">
            <dt className="font-mono text-[11px] uppercase tracking-[.08em] text-slate-500">{term}</dt>
            <dd className="font-mono text-[12px] leading-5 text-[#0b1220] [overflow-wrap:anywhere]">{detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------- the card

/** The example race as a card; its link opens the example in the scoring page of this app. */
export default function ExamplePreview({ className = '' }) {
  const { course, rows, summary, label } = example
  return (
    <article className={`relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(11,18,32,.12)] ${className}`} aria-label="Example race result">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          {/* Not a heading: the card sits under an h1 on one page and beside an h2 on another. */}
          <p className="text-[15px] font-bold tracking-[-.02em] text-[#0b1220]">{course.name}</p>
          <p className="font-mono text-[11px] leading-5 text-slate-500 [overflow-wrap:anywhere]">{courseLine(course)}</p>
        </div>
        <SyntheticPill />
      </div>

      <div className="px-4 pt-3">
        <ExampleProfile />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-[13px]">
          <caption className="sr-only">Top five finishers of the example race with their OTRI scores</caption>
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              <th scope="col" className="px-3 py-1.5 font-medium">Rank</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Runner</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Time</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">OTRI</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 3).map((row) => (
              <tr key={row.rank} className={`border-b border-slate-100 last:border-b-0 ${podiumRowClass(row.rank) || 'odd:bg-white even:bg-slate-50/70'}`}>
                <td className="px-3 py-1.5 font-mono text-[12px] text-slate-500">
                  <RankBadge rank={row.rank} />
                </td>
                <td className="px-2 py-1.5 font-medium text-[#0b1220]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Flag code={row.nationality} showCode={false} />
                    <span className="truncate">
                      {row.first_name} {row.family_name}
                    </span>
                    <span className="sr-only">{row.nationality}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[12px] tabular-nums text-slate-600">{row.time}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[13px] font-bold tabular-nums text-blue-600">{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 pt-3">
        <p className="font-mono text-[11px] text-slate-500">
          {summary.finishers} finishers · {summary.non_finishers} did not finish · best {summary.best_score} · median {summary.median_score}
        </p>
        <ExampleExplanation className="mt-3" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <p className="min-w-0 max-w-[36ch] text-[11px] leading-4 text-slate-500">{label}</p>
        <a href="#score?example=1" className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg text-[13px] font-semibold text-blue-700 no-underline hover:underline ${focusRing}`}>
          Open this example <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </article>
  )
}
