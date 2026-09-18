import { useEffect, useState } from 'react'
import { ArrowUpRight, EyeOff } from 'lucide-react'
import { listAdminEvents, unpublishRace } from '../../apiClient'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { Link } from '../router'
import { Button, Gradient, Notice, Page, StatusChip, formatDate, raceStatus } from '../ui'

function AdminRaceRow({ race, token, onChanged }) {
  const units = useUnits()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const status = raceStatus(race, (race.finisher_count ?? 0) > 0)

  async function takeDown() {
    if (!window.confirm(`Unpublish "${race.event_name} · ${race.course_name}"? It disappears from the public site until its organizer publishes it again.`)) return
    setBusy(true)
    setError(null)
    try {
      await unpublishRace(race.race_id, token)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#0b1220]">{race.course_name}</p>
        <p className="font-mono text-[10px] text-slate-500">
          {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} ·{' '}
          {race.finisher_count ?? 0} scored · {race.scoring_version}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusChip status={status} />
        <Link to={`/races/${encodeURIComponent(race.race_id)}/review`} className="text-xs font-semibold text-blue-600 no-underline hover:underline">
          Open
        </Link>
        {race.is_published && (
          <>
            <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline">
              Public page <ArrowUpRight size={12} />
            </a>
            <Button variant="danger" busy={busy} onClick={takeDown} className="min-h-9 px-3 text-xs">
              <EyeOff size={13} /> Unpublish
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

export function AdminEvents({ session }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    listAdminEvents(session.token)
      .then(setEvents)
      .catch((err) => setError(err.message))
  }, [session.token, version])

  const reload = () => setVersion((v) => v + 1)
  const raceCount = events?.reduce((n, e) => n + e.race_count, 0) ?? 0
  const publishedCount = events?.reduce((n, e) => n + e.published_count, 0) ?? 0

  return (
    <Page
      eyebrow="ADMIN"
      headline={
        <>
          Every event,
          <br />
          <Gradient>every organizer.</Gradient>
        </>
      }
      intro="Everything on the platform, who owns it, and what is public. Unpublishing takes a race off the public site immediately; it stays with its organizer, who can publish it again."
    >
      {events && (
        <p className="mt-8 font-mono text-[10px] tracking-[.08em] text-slate-500">
          {events.length} EVENT{events.length === 1 ? '' : 'S'} · {raceCount} RACE{raceCount === 1 ? '' : 'S'} · {publishedCount} PUBLISHED
        </p>
      )}
      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {events === null && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      <div className="mt-4 grid gap-4">
        {events?.map((event) => (
          <section key={event.event_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">{formatDate(event.event_date).toUpperCase()}</p>
                <h2 className="mt-1 text-lg font-bold tracking-[-.02em] text-[#0b1220]">
                  <Link to={`/events/${encodeURIComponent(event.event_id)}`} className="no-underline hover:underline">
                    {event.event_name}
                  </Link>
                </h2>
              </div>
              <p className="font-mono text-[10px] text-slate-500">
                {event.organizer_email ?? 'no owner'} · {event.published_count}/{event.race_count} published
              </p>
            </div>
            <ul className="mt-3">
              {event.races.map((race) => (
                <AdminRaceRow key={race.race_id} race={race} token={session.token} onChanged={reload} />
              ))}
              {event.races.length === 0 && <li className="border-t border-slate-100 py-3 text-xs text-slate-500">No races yet.</li>}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  )
}
