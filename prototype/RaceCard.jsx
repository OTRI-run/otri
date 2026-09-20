import './RaceCard.css'
import { ArrowUpRight, Mountain, Track } from '../src/ui/icons'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Flag from '../src/components/Flag'
import { ListingBadge } from './RaceListing'

export function DemoBadge({ className = '' }) {
  return <span className={`badge badge--ochre ${className}`}>Demo data</span>
}

// Uphill-only course (the API's is_vertical). A label for finding races; it never enters a score.
export function VerticalBadge({ className = '' }) {
  return <span className={`badge badge--sky ${className}`}>Vertical</span>
}

// A published race from the API, as a real link so it can be opened in a new tab. The strip
// along the top is the course drawn as a tiny profile: a flat race and a mountain race look
// different before a word is read.
export default function RaceCard({ race }) {
  const units = useUnits()
  const scored = race.is_published !== false
  return (
    <a href={`#races/${encodeURIComponent(race.race_id)}`} className="card card--link race-card">
      <ProfileStrip distanceKm={race.distance_km} gainM={race.elevation_gain_m} vertical={race.is_vertical} />
      <div className="cluster cluster--between cluster--top">
        <p className="card__meta">{race.event_date}</p>
        <span className="cluster cluster--tight">
          <ListingBadge status={race.listing_status} />
          {race.is_vertical && <VerticalBadge />}
          {race.is_demo && <DemoBadge />}
          <ArrowUpRight size={16} className="card__arrow" />
        </span>
      </div>
      <h3 className="card__title otri-fit mt-2">{race.event_name}</h3>
      <p className="small muted mt-1 cluster cluster--tight">
        <span>{race.course_name}</span>
        {(race.event_location || race.event_country) && (
          <span className="cluster cluster--tight">
            {race.event_country && <Flag code={race.event_country} showCode={false} />}
            {race.event_location ?? race.event_country}
          </span>
        )}
      </p>
      <div className="race-card__facts mt-4">
        <span><Track size={14} className="icon--moss" /> {formatDistance(race.distance_km, units)}</span>
        <span><Mountain size={14} className="icon--moss" /> {formatElevation(race.elevation_gain_m, units, { sign: '+' })}</span>
        {race.has_gpx && <span className="badge badge--moss">Measured course</span>}
      </div>
      <div className="race-card__foot mt-4">
        <span className="num">{scored ? `${race.finisher_count ?? 0} ${race.is_vertical ? 'finishers' : 'scored'}` : race.listing_status === 'upcoming' ? 'Upcoming' : 'Results to come'}</span>
        <span className="small muted">{scored ? 'Leaderboard' : 'Course and details'} →</span>
      </div>
    </a>
  )
}

// A schematic profile from the two figures a listing has (distance and climb): the steeper the
// race, the taller the hills. Decorative; the real profile is on the race page.
function ProfileStrip({ distanceKm, gainM, vertical }) {
  const ratio = distanceKm > 0 ? Math.min(1, (gainM ?? 0) / distanceKm / 90) : 0 // 90 m/km and above is as steep as the strip draws
  const h = 6 + ratio * 22
  const points = vertical
    ? `0,30 12,${30 - h * 0.3} 30,${30 - h * 0.55} 55,${30 - h * 0.8} 80,${30 - h * 0.9} 100,${30 - h}`
    : `0,30 8,${30 - h * 0.35} 20,${30 - h * 0.7} 30,${30 - h * 0.4} 42,${30 - h} 55,${30 - h * 0.55} 66,${30 - h * 0.85} 80,${30 - h * 0.3} 92,${30 - h * 0.5} 100,30`
  return (
    <svg className="race-card__profile" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,30 ${points} 100,30`} fill="var(--moss-pale)" />
      <polyline points={points} fill="none" stroke="var(--moss)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
