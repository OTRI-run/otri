import { CalendarPlus, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from './apiClient'

// Dates, grouping and add-to-calendar links shared by the calendar view and a race's own page.

const DAY_MS = 86_400_000
export const parseDay = (iso) => new Date(`${iso}T00:00:00`)

export function countdown(iso, now = new Date()) {
  const days = Math.round((parseDay(iso) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS)
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 70) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30.4)} months`
}

const compact = (iso) => iso.replaceAll('-', '')
function nextDay(iso) {
  const day = parseDay(iso)
  day.setDate(day.getDate() + 1)
  return `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`
}

export function icsUrl(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return `${API_BASE_URL}/calendar.ics${query ? `?${query}` : ''}`
}

export function googleCalendarUrl(event) {
  const page = `${window.location.origin}${window.location.pathname}#races/${encodeURIComponent(event.races[0].race_id)}`
  const details = [...event.races.map((race) => `${race.course_name}: ${race.distance_km} km, +${Math.round(race.elevation_gain_m)} m`), '', `Course, target times and scores: ${page}`].join('\n')
  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.event_name,
    dates: `${compact(event.event_date)}/${nextDay(event.event_date)}`,
    details,
    location: [event.event_location, event.event_country].filter(Boolean).join(', '),
  })
  return `https://calendar.google.com/calendar/render?${query}`
}

/** Races of one event, as the calendar and the add-to-calendar links want them. */
export function groupByEvent(races) {
  const events = new Map()
  for (const race of races) {
    if (!events.has(race.event_id)) events.set(race.event_id, { ...race, races: [] })
    events.get(race.event_id).races.push(race)
  }
  for (const event of events.values()) event.races.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
  return [...events.values()]
}

export function AddToCalendar({ event, className = '' }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold ${className}`}>
      <a href={icsUrl({ event: event.event_id })} className="inline-flex items-center gap-1 text-blue-600 no-underline hover:underline">
        <CalendarPlus size={13} /> Add to calendar
      </a>
      <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-500 no-underline hover:text-blue-600">
        Google <ExternalLink size={11} />
      </a>
    </span>
  )
}
