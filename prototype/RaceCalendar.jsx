import { useEffect, useMemo, useState } from 'react'
import { Rss } from 'lucide-react'
import { formatDistance, useUnits } from '../src/lib/units'
import Flag from '../src/components/Flag'
import { VerticalBadge } from './RaceCard'
import { AddToCalendar, countdown, groupByEvent, icsUrl, parseDay } from './calendarLinks'

const EVENTS_AT_ONCE = 120

// The races page as a calendar: upcoming events by month, one row per event with its distances,
// each addable to the runner's own calendar, and the whole (filtered) calendar subscribable.

function EventRow({ event }) {
  const units = useUnits()
  const day = parseDay(event.event_date)
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-4 border-t border-slate-100 py-4 first:border-0 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-center">
      <div className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[.08em] text-blue-600">{day.toLocaleDateString('en', { weekday: 'short' })}</p>
        <p className="text-xl font-bold leading-none tracking-[-.04em] text-[#0b1220]">{day.getDate()}</p>
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <a href={`#races/${encodeURIComponent(event.races[0].race_id)}`} className="text-base font-bold tracking-[-.02em] text-[#0b1220] no-underline hover:underline">
            {event.event_name}
          </a>
          {event.races.some((race) => race.is_vertical) && <VerticalBadge />}
          <span className="font-mono text-[10px] text-slate-500">{countdown(event.event_date)}</span>
        </p>
        {(event.event_location || event.event_country) && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {event.event_country && <Flag code={event.event_country} showCode={false} />}
            {[event.event_location, event.event_country].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="mt-2 flex flex-wrap gap-1.5">
          {event.races.map((race) => (
            <a
              key={race.race_id}
              href={`#races/${encodeURIComponent(race.race_id)}`}
              title={`${race.course_name}${race.has_gpx ? ' · course on OTRI: try a target time' : ''}`}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] no-underline hover:border-blue-400 hover:text-blue-700 ${race.has_gpx ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
            >
              {race.course_name} · {formatDistance(race.distance_km, units)}
            </a>
          ))}
        </p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-1 sm:flex-col sm:items-end">
        <AddToCalendar event={event} />
      </div>
    </li>
  )
}

export default function RaceCalendar({ races, country, filtered }) {
  const months = useMemo(() => {
    const events = groupByEvent(races.filter((race) => race.event_date && countdown(race.event_date) !== null)).sort((a, b) => a.event_date.localeCompare(b.event_date) || a.event_name.localeCompare(b.event_name))
    const byMonth = new Map()
    for (const event of events) {
      const key = event.event_date.slice(0, 7)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(event)
    }
    return [...byMonth.entries()]
  }, [races])
  // A full calendar is thousands of events: draw the nearest months (about EVENTS_AT_ONCE events)
  // and the rest on request. The filters above narrow it further.
  const [extraMonths, setExtraMonths] = useState(0)
  useEffect(() => setExtraMonths(0), [races])
  let firstMonths = 0
  for (let total = 0; firstMonths < months.length && total < EVENTS_AT_ONCE; firstMonths += 1) total += months[firstMonths][1].length
  const shownMonths = months.slice(0, firstMonths + extraMonths)
  const hiddenEvents = months.slice(shownMonths.length).reduce((n, [, events]) => n + events.length, 0)
  const feed = icsUrl({ country: country !== 'all' ? country : null })

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <p className="min-w-0 text-xs leading-5 text-slate-600">
          Upcoming races listed by their organizers{country !== 'all' ? ' in this country' : ''}. Blue distances have their course on OTRI: open one and try a target time before race day.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <a href={feed.replace(/^https?:/, 'webcal:')} title={`Subscribe in your calendar app. The address is ${feed}`} className="inline-flex items-center gap-1 text-blue-600 no-underline hover:underline">
            <Rss size={13} /> Subscribe to this calendar
          </a>
          <a href="organizer/" className="rounded-lg bg-[#0b1220] px-3 py-2 text-white no-underline">
            List your race
          </a>
        </div>
      </div>

      {months.length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {filtered ? 'No upcoming race matches these filters.' : 'No upcoming races are listed yet.'} Races appear here when their organizer lists them; OTRI keeps no catalogue of its own.
        </div>
      )}
      {shownMonths.map(([month, events]) => (
        <section key={month} className="mt-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[.1em] text-slate-500">
            {parseDay(`${month}-01`).toLocaleDateString('en', { month: 'long', year: 'numeric' })} · {events.length} event{events.length === 1 ? '' : 's'}
          </h2>
          <ul className="mt-2 rounded-2xl border border-slate-200 bg-white px-5 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
            {events.map((event) => (
              <EventRow key={event.event_id} event={event} />
            ))}
          </ul>
        </section>
      ))}
      {hiddenEvents > 0 && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setExtraMonths((n) => n + 3)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0b1220] hover:border-blue-300">
            Show later months · {hiddenEvents} more event{hiddenEvents === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  )
}
