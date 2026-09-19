import { ArrowRight, ExternalLink } from 'lucide-react'
import { AddToCalendar, countdown } from './calendarLinks'

// A race its organizer has shown before it has results: say so, and send the runner to what they
// can do with it today, which is to try a target time on the course.

export function ListingBadge({ status, className = '' }) {
  if (status !== 'upcoming' && status !== 'awaiting_results') return null
  return (
    <span className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-slate-600 ${className}`}>
      {status === 'upcoming' ? 'UPCOMING' : 'AWAITING RESULTS'}
    </span>
  )
}

export default function RaceListing({ race }) {
  const upcoming = race.listing_status === 'upcoming'

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{upcoming ? 'UPCOMING · NO RESULTS YET' : 'NO RESULTS ON OTRI YET'}</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#0b1220]">{upcoming ? `Race day is ${countdown(race.event_date) ?? 'soon'}. Scores appear here afterwards.` : 'The organizer has not published the results yet.'}</h3>
      {upcoming && <AddToCalendar event={{ ...race, races: [race] }} className="mt-2" />}
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Scores come from the official results, which the race's organizer uploads and publishes.
        {race.has_gpx ? ' The course is already here, so you can see what a finish time would be worth.' : ''}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {race.has_gpx && (
          <a href={`#calculator?race=${encodeURIComponent(race.race_id)}`} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-blue-700">
            Try a target time on this course <ArrowRight size={15} />
          </a>
        )}
        {race.organizer_website && (
          <a href={race.organizer_website} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline">
            Organizer's website <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}
