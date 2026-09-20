import './RaceListing.css'
import { ArrowRight, ExternalLink } from 'lucide-react'

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
  return (
    <span className={`prototype-race-listing-listing-badge-span-1 ${className}`}>
      {status === 'upcoming' ? 'UPCOMING' : 'AWAITING RESULTS'}
    </span>
  )
}

export default function RaceListing({ race }) {
  const upcoming = race.listing_status === 'upcoming'

  return (
    <div className="prototype-race-listing-race-listing-div-2">
      <p className="prototype-race-listing-race-listing-p-3">{upcoming ? 'UPCOMING · NO RESULTS YET' : 'NO RESULTS ON OTRI YET'}</p>
      <h3 className="prototype-race-listing-race-listing-h3-4">{upcoming ? `Race day is ${countdown(race.event_date) ?? 'soon'}. Scores appear here afterwards.` : 'The organizer has not published the results yet.'}</h3>
      <p className="prototype-race-listing-race-listing-p-5">
        Scores come from the official results, which the race's organizer uploads and publishes.
        {race.has_gpx ? ' The course is already here, so you can see what a finish time would be worth.' : ''}
      </p>
      <div className="prototype-race-listing-race-listing-div-6">
        {race.has_gpx && (
          <a href={`#calculator?race=${encodeURIComponent(race.race_id)}`} className="prototype-race-listing-race-listing-a-7">
            Try a target time on this course <ArrowRight size={15} />
          </a>
        )}
        {race.organizer_website && (
          <a href={race.organizer_website} target="_blank" rel="noreferrer nofollow" className="prototype-race-listing-race-listing-a-8">
            Organizer's website <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}
