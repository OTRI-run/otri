import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { submitReport } from './apiClient'
import CountrySelect from '../src/components/CountrySelect'

// A runner proposes a race for the calendar: facts only (no files, no results). It goes to the
// admins as a report carrying the facts as data, and appears on the site once one of them has
// checked it against the race's own website.

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const label = 'text-xs font-semibold text-[#0b1220]'
const emptyRace = () => ({ course_name: '', distance_km: '', elevation_gain_m: '' })

export default function SuggestRace({ onDone }) {
  const [form, setForm] = useState({ event_name: '', event_date: '', location: '', country: '', website: '', email: '' })
  const [races, setRaces] = useState([emptyRace()])
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const setRace = (index, key, value) => setRaces((current) => current.map((race, i) => (i === index ? { ...race, [key]: value } : race)))

  const filled = races.filter((race) => race.distance_km !== '')
  const ready = form.event_name.trim() && form.event_date && filled.length > 0 && filled.every((race) => Number(race.distance_km) > 0)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setState('sending')
    try {
      const listing = {
        event_name: form.event_name.trim(),
        event_date: form.event_date,
        location: form.location.trim() || null,
        country: form.country || null,
        website: form.website.trim() || null,
        races: filled.map((race) => ({
          course_name: race.course_name.trim() || `${Number(race.distance_km)}K`,
          distance_km: Number(race.distance_km),
          elevation_gain_m: Number(race.elevation_gain_m) || 0,
        })),
      }
      await submitReport({
        kind: 'suggestion',
        subject_id: 'race-calendar',
        subject_label: `${listing.event_name} · ${listing.event_date}`,
        message: `Suggested for the calendar: ${listing.event_name}, ${listing.event_date}${listing.location ? `, ${listing.location}` : ''}. Distances: ${listing.races.map((race) => `${race.course_name} ${race.distance_km} km +${race.elevation_gain_m} m`).join('; ')}.${listing.website ? ` ${listing.website}` : ''}`,
        reporter_email: form.email.trim() || null,
        page_url: window.location.href,
        listing,
      })
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-sm text-emerald-900">
        <span>Thanks. {form.event_name.trim()} will be on the calendar once we have checked it against the race's website.</span>
        <button type="button" onClick={onDone} className="text-xs font-semibold text-emerald-900 underline">Close</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs leading-5 text-slate-600">
        Only what the race itself publishes: name, date, place and distances. We check it against the official website and then list it. No course files or results here; those come from the organizer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className={label}>Race name, with the year</span>
          <input required maxLength={200} value={form.event_name} onChange={set('event_name')} placeholder="Doi Suthep Trail 2027" className={field} />
        </label>
        <label className="grid gap-1">
          <span className={label}>Date (first day)</span>
          <input required type="date" value={form.event_date} onChange={set('event_date')} className={field} />
        </label>
        <label className="grid gap-1">
          <span className={label}>Town or area</span>
          <input maxLength={200} value={form.location} onChange={set('location')} placeholder="Chiang Mai" className={field} />
        </label>
        <label className="grid gap-1">
          <span className={label}>Country</span>
          <CountrySelect value={form.country} onChange={(value) => setForm((current) => ({ ...current, country: value }))} className={field} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className={label}>Official website</span>
          <input type="url" maxLength={500} value={form.website} onChange={set('website')} placeholder="https://…" className={field} />
        </label>
      </div>

      <div className="grid gap-2">
        <span className={label}>Distances</span>
        {races.map((race, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <input maxLength={200} value={race.course_name} onChange={(e) => setRace(index, 'course_name', e.target.value)} placeholder="Name, e.g. 50K" aria-label={`Distance ${index + 1} name`} className={field} />
            <input type="number" min="0.1" step="0.1" value={race.distance_km} onChange={(e) => setRace(index, 'distance_km', e.target.value)} placeholder="km" aria-label={`Distance ${index + 1} in km`} className={field} />
            <input type="number" min="0" step="1" value={race.elevation_gain_m} onChange={(e) => setRace(index, 'elevation_gain_m', e.target.value)} placeholder="climb, m" aria-label={`Distance ${index + 1} climb in metres`} className={field} />
            <button type="button" onClick={() => setRaces((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [emptyRace()]))} aria-label={`Remove distance ${index + 1}`} className="text-slate-400 hover:text-red-600">
              <X size={15} />
            </button>
          </div>
        ))}
        {races.length < 12 && (
          <button type="button" onClick={() => setRaces((current) => [...current, emptyRace()])} className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Plus size={13} /> Another distance
          </button>
        )}
      </div>

      <label className="grid gap-1">
        <span className={label}>Your email (optional, only to tell you when it is listed)</span>
        <input type="email" maxLength={254} value={form.email} onChange={set('email')} placeholder="you@example.com" className={field} />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready || state === 'sending'} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {state === 'sending' ? 'Sending…' : 'Suggest this race'}
        </button>
        <button type="button" onClick={onDone} className="text-xs font-semibold text-slate-500 hover:text-[#0b1220]">Cancel</button>
      </div>
    </form>
  )
}
