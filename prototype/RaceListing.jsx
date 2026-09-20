import { ArrowRight, External } from '../src/ui/icons'

// A race its organizer has shown before it has results: say so, and send the runner to what they
// can do with it today, which is to try a target time on the course.

const DAY_MS = 24 * 60 * 60 * 1000

// "in 12 days": how far off race day is, or null once it has passed.
function countdown(iso, now = new Date()) {
  const days = Math.round((new Date(`${iso}T00:00:00`) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS)
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 70) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30.4)} months`
}

export function ListingBadge({ status, className = '' }) {
  if (status !== 'upcoming' && status !== 'awaiting_results') return null
  return <span className={`badge ${className}`}>{status === 'upcoming' ? 'Upcoming' : 'Awaiting results'}</span>
}

export default function RaceListing({ race }) {
  const upcoming = race.listing_status === 'upcoming'

  return (
    <div className="card card--pad-lg topo--faint mt-6 stack">
      <p className="eyebrow">{upcoming ? 'Upcoming · no results yet' : 'No results on OTRI yet'}</p>
      <h3 className="h-2">{upcoming ? `Race day is ${countdown(race.event_date) ?? 'soon'}. Scores appear here afterwards.` : 'The organizer has not published the results yet.'}</h3>
      <p className="muted measure">
        Scores come from the official results, which the race's organizer uploads and publishes.
        {race.has_gpx ? ' The course is already here, so you can see what a finish time would be worth.' : ''}
      </p>
      <div className="cluster cluster--loose mt-2">
        {race.has_gpx && (
          <a href={`#calculator?race=${encodeURIComponent(race.race_id)}`} className="btn btn--primary">
            Try a target time on this course <ArrowRight size={16} />
          </a>
        )}
        {race.organizer_website && (
          <a href={race.organizer_website} target="_blank" rel="noreferrer nofollow" className="link link--arrow link--up small">
            Organizer's website <External size={14} />
          </a>
        )}
      </div>
    </div>
  )
}
