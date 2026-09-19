import { ArrowUpRight, Mountain, TrendingUp } from 'lucide-react'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Flag from '../src/components/Flag'
import { ListingBadge } from './RaceListing'

export function DemoBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-amber-700 ${className}`}>
      DEMO DATA
    </span>
  )
}

// Uphill-only course (the API's is_vertical). A label for finding races; it never enters a score.
export function VerticalBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-blue-700 ${className}`}>
      VERTICAL
    </span>
  )
}

// A published race from the API, as a real link so it can be opened in a new tab.
export default function RaceCard({ race }) {
  const units = useUnits()
  return (
    <a
      href={`#races/${encodeURIComponent(race.race_id)}`}
      className="group block min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300 hover:shadow-[0_14px_34px_rgba(37,99,235,.12)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[10px] tracking-[.08em] text-blue-600">{race.event_date}</p>
        <span className="flex shrink-0 items-center gap-2">
          <ListingBadge status={race.listing_status} />
          {race.is_vertical && <VerticalBadge />}
          {race.is_demo && <DemoBadge />}
          <ArrowUpRight size={14} className="text-slate-300 transition group-hover:text-blue-600" />
        </span>
      </div>
      <h3 className="otri-fit mt-2 text-xl font-bold leading-6 tracking-[-.03em] text-[#0b1220]">{race.event_name}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{race.course_name}</span>
        {(race.event_location || race.event_country) && (
          <span className="flex items-center gap-1.5">
            {race.event_country && <Flag code={race.event_country} showCode={false} />}
            {race.event_location ?? race.event_country}
          </span>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <TrendingUp size={12} className="text-blue-600" />
          {formatDistance(race.distance_km, units)}
        </span>
        <span className="flex items-center gap-1">
          <Mountain size={12} className="text-blue-600" />
          {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
        </span>
        {race.has_gpx && <span className="text-blue-600">VERIFIED COURSE</span>}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-blue-600">
        <span>{race.is_published === false ? (race.listing_status === 'upcoming' ? 'Upcoming' : 'Results to come') : `${race.finisher_count ?? 0} ${race.is_vertical ? 'finishers' : 'scored'}`}</span>
        <span className="text-slate-400 transition group-hover:text-blue-600">{race.is_published === false ? 'Course and details →' : 'Leaderboard →'}</span>
      </div>
    </a>
  )
}
