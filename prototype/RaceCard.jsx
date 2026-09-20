import './RaceCard.css'
import { ArrowUpRight, Mountain, TrendingUp } from 'lucide-react'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Flag from '../src/components/Flag'
import { ListingBadge } from './RaceListing'

export function DemoBadge({ className = '' }) {
  return (
    <span className={`prototype-race-card-demo-badge-span-1 ${className}`}>
      DEMO DATA
    </span>
  )
}

// Uphill-only course (the API's is_vertical). A label for finding races; it never enters a score.
export function VerticalBadge({ className = '' }) {
  return (
    <span className={`prototype-race-card-vertical-badge-span-2 ${className}`}>
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
      className="prototype-race-card-race-card-a-3 otri-group"
    >
      <div className="prototype-race-card-race-card-div-4">
        <p className="prototype-race-card-race-card-p-5">{race.event_date}</p>
        <span className="prototype-race-card-race-card-span-6">
          <ListingBadge status={race.listing_status} />
          {race.is_vertical && <VerticalBadge />}
          {race.is_demo && <DemoBadge />}
          <ArrowUpRight size={14} className="prototype-race-card-race-card-arrow-up-right-7" />
        </span>
      </div>
      <h3 className="prototype-race-card-race-card-h3-8 otri-fit">{race.event_name}</h3>
      <p className="prototype-race-card-race-card-p-9">
        <span>{race.course_name}</span>
        {(race.event_location || race.event_country) && (
          <span className="prototype-race-card-race-card-span-10">
            {race.event_country && <Flag code={race.event_country} showCode={false} />}
            {race.event_location ?? race.event_country}
          </span>
        )}
      </p>
      <div className="prototype-race-card-race-card-div-11">
        <span className="prototype-race-card-race-card-span-12">
          <TrendingUp size={12} className="prototype-race-card-race-card-trending-up-13" />
          {formatDistance(race.distance_km, units)}
        </span>
        <span className="prototype-race-card-race-card-span-12">
          <Mountain size={12} className="prototype-race-card-race-card-trending-up-13" />
          {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
        </span>
        {race.has_gpx && <span className="prototype-race-card-race-card-trending-up-13">VERIFIED COURSE</span>}
      </div>
      <div className="prototype-race-card-race-card-div-14">
        <span>{race.is_published === false ? (race.listing_status === 'upcoming' ? 'Upcoming' : 'Results to come') : `${race.finisher_count ?? 0} ${race.is_vertical ? 'finishers' : 'scored'}`}</span>
        <span className="prototype-race-card-race-card-span-15">{race.is_published === false ? 'Course and details →' : 'Leaderboard →'}</span>
      </div>
    </a>
  )
}
