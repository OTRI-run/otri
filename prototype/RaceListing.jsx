import { useState } from 'react'
import { Check, ExternalLink, Hand, Share2 } from 'lucide-react'
import { requestScores, submitReport } from './apiClient'
import { AddToCalendar, countdown } from './calendarLinks'

// A listed race has no results on OTRI yet: say so, let runners ask for scores (one per browser,
// counted by the API), hand them a message for the organizer, and let the organizer claim it.

const ASKED_KEY = 'otri.askedForScores'
const VISITOR_KEY = 'otri.visitorId'

function readAsked() {
  try {
    return JSON.parse(localStorage.getItem(ASKED_KEY) ?? '[]')
  } catch {
    return []
  }
}

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return null // private mode: the API still counts one per address
  }
}

export function ListingBadge({ status, className = '' }) {
  if (status !== 'upcoming' && status !== 'awaiting_results') return null
  return (
    <span className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-slate-600 ${className}`}>
      {status === 'upcoming' ? 'UPCOMING' : 'AWAITING RESULTS'}
    </span>
  )
}

export const requestCountLabel = (count) => (count === 1 ? '1 runner asked for scores' : `${count ?? 0} runners asked for scores`)

function ClaimForm({ race }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setState('sending')
    try {
      await submitReport({
        kind: 'claim',
        subject_id: race.race_id,
        subject_label: `${race.event_name} · ${race.course_name}`,
        message: `I organize this race and would like to manage it on OTRI. ${message.trim()}`.trim(),
        reporter_email: email,
        page_url: window.location.href,
      })
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">Thanks. We will check it and reply to {email}, usually within a few days.</p>
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">
        I organize this race →
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs leading-5 text-slate-600">
        Claiming moves this race into your organizer account, where you upload the official course and results. Use an address on the race's own domain if you can; it is how we check the claim.
      </p>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourrace.com" aria-label="Your email" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={2000} placeholder="Your role, and anything we should correct on this page (optional)" aria-label="Message" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === 'sending'} className="rounded-lg bg-[#0b1220] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
          {state === 'sending' ? 'Sending…' : 'Send claim'}
        </button>
        <a href="organizer/" className="text-xs font-semibold text-blue-600 no-underline hover:underline">Create an organizer account</a>
      </div>
    </form>
  )
}

export default function RaceListing({ race }) {
  const [count, setCount] = useState(race.request_count ?? 0)
  const [asked, setAsked] = useState(() => readAsked().includes(race.race_id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [shared, setShared] = useState(false)
  const upcoming = race.listing_status === 'upcoming'

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const response = await requestScores(race.race_id, visitorId())
      setCount(response.request_count)
      setAsked(true)
      try {
        localStorage.setItem(ASKED_KEY, JSON.stringify([...new Set([...readAsked(), race.race_id])]))
      } catch {
        // private mode: the button just comes back on the next visit; the API does not double count
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const text = `I'd like to see ${race.event_name} scored on OTRI, an open index for trail races. Organizers upload the official results and course for free, and every finisher gets a score that can be checked: ${window.location.href}`
    try {
      if (navigator.share) await navigator.share({ title: `${race.event_name} on OTRI`, text })
      else await navigator.clipboard.writeText(text)
      setShared(true)
    } catch {
      // the share sheet was dismissed
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{upcoming ? 'UPCOMING · NO RESULTS YET' : 'NO RESULTS ON OTRI YET'}</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#0b1220]">{upcoming ? `Race day is ${countdown(race.event_date) ?? 'soon'}. Scores appear here afterwards.` : 'This race has not been scored.'}</h3>
      {upcoming && <AddToCalendar event={{ ...race, races: [race] }} className="mt-2" />}
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        OTRI scores come from the official results, uploaded by the race's organizer. {race.is_claimed ? 'The organizer is on OTRI and has not published results yet.' : 'Nobody from this race has joined yet.'} If you{' '}
        {upcoming ? 'are running it' : 'ran it'}, say so: organizers hear about it, and the count is shown here.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={ask}
          disabled={asked || busy}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${asked ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:cursor-default`}
        >
          {asked ? <Check size={15} /> : <Hand size={15} />}
          {asked ? 'You asked for scores' : busy ? 'Counting…' : "I'd like scores"}
        </button>
        <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#0b1220] hover:border-slate-400">
          <Share2 size={15} /> {shared ? (navigator.share ? 'Shared' : 'Message copied') : 'Ask your organizer'}
        </button>
        <span className="font-mono text-[11px] text-slate-500" aria-live="polite">{requestCountLabel(count)}</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {race.official_url && (
        <a href={race.official_url} target="_blank" rel="noreferrer nofollow" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline">
          Official race website <ExternalLink size={12} />
        </a>
      )}
      {!race.is_claimed && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <ClaimForm race={race} />
        </div>
      )}
    </div>
  )
}
