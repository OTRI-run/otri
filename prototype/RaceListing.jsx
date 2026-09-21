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
    <span className={`inline-flex items-center rounded-full border border-rule bg-slate-50 px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-muted ${className}`}>
      {status === 'upcoming' ? 'UPCOMING' : 'AWAITING RESULTS'}
    </span>
  )
}

export default function RaceListing({ race }) {
  const upcoming = race.listing_status === 'upcoming'

  return (
    <div className="mt-6 rounded-[3px] border border-rule bg-white p-6 ">
      <p className="font-mono text-[10px] tracking-[.08em] text-muted">{upcoming ? 'UPCOMING · NO RESULTS YET' : 'NO RESULTS ON OTRI YET'}</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-ink">{upcoming ? `Race day is ${countdown(race.event_date) ?? 'soon'}. Scores appear here afterwards.` : 'The organizer has not published the results yet.'}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Scores come from the official results, which the race's organizer uploads and publishes.
        {race.has_gpx ? ' The course is already here, so you can see what a finish time would be worth.' : ''}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {race.has_gpx && (
          <a href={`#calculator?race=${encodeURIComponent(race.race_id)}`} className="inline-flex items-center gap-2 rounded-[3px] bg-accent px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-accent">
            Try a target time on this course <ArrowRight size={15} />
          </a>
        )}
        {race.organizer_website && (
          <a href={race.organizer_website} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline hover:underline">
            Organizer's website <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}
