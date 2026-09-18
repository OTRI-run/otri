import { useEffect, useState } from 'react'
import { ArrowUpRight, EyeOff, Map, ShieldCheck, Trash2, UserCheck } from 'lucide-react'
import CourseMap from '../../../src/components/CourseMap'
import {
  deleteAdminOrganizer,
  deleteEvent,
  deleteRace,
  deleteSharedCourse,
  fetchRaceGpxFile,
  getAdminOverview,
  getRaceMeasurement,
  listAdminEvents,
  listAdminOrganizers,
  listSharedCourses,
  unpublishRace,
  verifyAdminOrganizer,
} from '../../apiClient'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { Link } from '../router'
import { Button, Gradient, Notice, Page, StatusChip, formatDate, raceStatus } from '../ui'

const TABS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts'],
  ['events', 'Events & races'],
  ['shared', 'Shared courses'],
]

function fmtBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function when(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
      <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  )
}

function KeyValues({ title, icon: Icon, rows }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
      <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.08em] text-slate-500">
        {Icon && <Icon size={13} className="text-blue-600" />} {title}
      </p>
      <dl className="mt-3 divide-y divide-slate-100">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-2 text-xs">
            <dt className="text-slate-500">{k}</dt>
            <dd className={`break-words font-mono ${tone === 'bad' ? 'text-red-600' : tone === 'ok' ? 'text-emerald-700' : 'text-[#0b1220]'}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ------------------------------------------------------------------------------ Overview

function Overview({ session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getAdminOverview(session.token).then(setData).catch((err) => setError(err.message))
  }, [session.token])
  if (error) return <Notice kind="error">{error}</Notice>
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>
  const { stats, api, security, recent_signups: signups, recent_races: races } = data
  const yes = (v) => (v ? ['configured', 'ok'] : ['not configured', 'bad'])

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="ACCOUNTS" value={stats.organizers} sub={`${stats.verified} verified · ${stats.unverified} pending`} />
        <Tile label="EVENTS" value={stats.events} sub={`${stats.orphan_events} without owner`} />
        <Tile label="RACES" value={stats.races} sub={`${stats.published_races} published · ${stats.races_with_gpx} with course`} />
        <Tile label="RESULTS" value={stats.results} sub={`${stats.finishers} finishers`} />
        <Tile label="RUNNERS" value={stats.runners} sub="with any result" />
        <Tile label="SHARED COURSES" value={stats.shared_courses} sub={`${fmtBytes(stats.shared_bytes)} of ${stats.shared_budget_mb} MB`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <KeyValues
          title="API"
          icon={Map}
          rows={[
            ['Version', api.version],
            ['Started', when(api.started_at)],
            ['Scoring model (default)', api.scoring_version],
            ['Course measurement', api.measurement_version],
            ['Terrain model (DEM)', ...(api.dem_configured ? [`configured · ${api.dem_manifest}`, 'ok'] : ['not configured → every course scores Low confidence', 'bad'])],
            ['Measurement cache', `${api.measurement_cache_entries} entries (max ${api.measurement_cache_max})`],
            ['Python', api.python],
          ]}
        />
        <KeyValues
          title="SECURITY"
          icon={ShieldCheck}
          rows={[
            ['Passwords', 'bcrypt, never stored in plain text'],
            ['Sessions', `signed JWT · expire after ${security.token_ttl_hours} h`],
            ['Email verification', 'required before sign-in · links expire after 2 days'],
            ['Transactional email', ...yes(security.email_configured)],
            ['Email sender', security.email_from],
            ['Rate limits (per IP / min)', `register ${security.rate_limits.register} · login ${security.rate_limits.login} · reset ${security.rate_limits.password_reset} · share ${security.rate_limits.share}`],
            ['Allowed browser origins', security.allowed_origins.join(', ') || '—'],
            ['Admin accounts (env)', security.admin_emails.join(', ') || 'none'],
            ['Shared course limits', `${security.shared_course_max_mb} MB per file · ${stats.shared_budget_mb} MB total, oldest evicted`],
            ['Uploads', `${security.upload_max_mb} MB max · validated before anything is scored`],
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">RECENT SIGN-UPS</p>
          <ul className="mt-2 divide-y divide-slate-100 text-xs">
            {signups.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate font-mono text-[#0b1220]">{o.email}</span>
                <span className="shrink-0 text-slate-500">
                  {when(o.created_at)} · {o.email_verified ? 'verified' : <span className="text-amber-700">pending</span>}
                </span>
              </li>
            ))}
            {signups.length === 0 && <li className="py-2 text-slate-500">None yet.</li>}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
          <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">RECENT RACES</p>
          <ul className="mt-2 divide-y divide-slate-100 text-xs">
            {races.map((r) => (
              <li key={r.race_id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/races/${encodeURIComponent(r.race_id)}/review`} className="min-w-0 truncate no-underline hover:underline">
                  {r.event_name} · {r.course_name}
                </Link>
                <span className="shrink-0">
                  <StatusChip status={raceStatus(r, (r.finisher_count ?? 0) > 0)} />
                </span>
              </li>
            ))}
            {races.length === 0 && <li className="py-2 text-slate-500">None yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------ Accounts

function Accounts({ session }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const load = () => listAdminOrganizers(session.token).then(setRows).catch((err) => setError(err.message))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token])

  async function verify(o) {
    setBusyId(o.id)
    setError(null)
    try {
      await verifyAdminOrganizer(o.id, session.token)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }
  async function remove(o) {
    if (!window.confirm(`Delete the account ${o.email} together with its ${o.event_count} event(s), ${o.race_count} race(s) and their results? This cannot be undone.`)) return
    setBusyId(o.id)
    setError(null)
    try {
      await deleteAdminOrganizer(o.id, session.token)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) return <Notice kind="error">{error}</Notice>
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>
  return (
    <div>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Races</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-[#0b1220]">
                  {o.email}
                  {o.email === session.email && <span className="ml-2 text-slate-400">(you)</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {o.email_verified ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.06em] text-emerald-700">verified</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.06em] text-amber-700">pending</span>
                    )}
                    {o.is_admin && <span className="rounded-full bg-amber-500 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.06em] text-white">admin</span>}
                    {o.is_demo && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.06em] text-slate-600">demo</span>}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{when(o.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.event_count}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.race_count}</td>
                <td className="px-4 py-3">
                  <span className="flex justify-end gap-2">
                    {!o.email_verified && (
                      <Button variant="secondary" className="min-h-9 px-3 text-xs" busy={busyId === o.id} onClick={() => verify(o)}>
                        <UserCheck size={13} /> Verify
                      </Button>
                    )}
                    {o.email !== session.email && (
                      <Button variant="danger" className="min-h-9 px-3 text-xs" busy={busyId === o.id} onClick={() => remove(o)}>
                        <Trash2 size={13} /> Delete
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Admin rights come from the server's OTRI_ADMIN_EMAILS list and are applied at sign-in. Deleting an account removes everything it owns.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------------------ Events & races

function CoursePreview({ raceId, token }) {
  const [course, setCourse] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchRaceGpxFile(raceId, token), getRaceMeasurement(raceId, token).catch(() => null)])
      .then(async ([file, measurement]) => {
        const gpxText = await file.text()
        if (!cancelled) setCourse({ gpxText, measurement })
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [raceId, token])
  if (error) return <p className="mt-2 text-xs text-red-600">{error}</p>
  if (!course) return <p className="mt-2 text-xs text-slate-500">Loading course…</p>
  return <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="mt-3" />
}

function AdminRaceRow({ race, token, onChanged }) {
  const units = useUnits()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showCourse, setShowCourse] = useState(false)
  const status = raceStatus(race, (race.finisher_count ?? 0) > 0)

  async function run(action, message) {
    if (message && !window.confirm(message)) return
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-t border-slate-100 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0b1220]">{race.course_name}</p>
          <p className="font-mono text-[10px] text-slate-500">
            {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · {race.finisher_count ?? 0} scored ·{' '}
            {race.scoring_version}
            {race.has_gpx ? ` · ${race.measurement_version ?? 'course attached'}` : ' · no course file'}
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <Link to={`/races/${encodeURIComponent(race.race_id)}/review`} className="text-xs font-semibold text-blue-600 no-underline hover:underline">
            Open
          </Link>
          {race.has_gpx && (
            <button type="button" onClick={() => setShowCourse((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
              <Map size={12} /> {showCourse ? 'Hide course' : 'View course'}
            </button>
          )}
          {race.is_published && (
            <>
              <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline">
                Public page <ArrowUpRight size={12} />
              </a>
              <Button
                variant="secondary"
                busy={busy}
                className="min-h-9 px-3 text-xs"
                onClick={() => run(() => unpublishRace(race.race_id, token), `Unpublish "${race.event_name} · ${race.course_name}"?`)}
              >
                <EyeOff size={13} /> Unpublish
              </Button>
            </>
          )}
          <Button
            variant="danger"
            busy={busy}
            className="min-h-9 px-3 text-xs"
            onClick={() => run(() => deleteRace(race.race_id, token), `Delete the race "${race.event_name} · ${race.course_name}" and its ${race.finisher_count ?? 0} results? This cannot be undone.`)}
          >
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </div>
      {showCourse && <CoursePreview raceId={race.race_id} token={token} />}
    </li>
  )
}

function EventsAdmin({ session }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  useEffect(() => {
    listAdminEvents(session.token)
      .then(setEvents)
      .catch((err) => setError(err.message))
  }, [session.token, version])

  async function removeEvent(event) {
    if (!window.confirm(`Delete the event "${event.event_name}" with its ${event.race_count} race(s) and all results? This cannot be undone.`)) return
    setError(null)
    try {
      await deleteEvent(event.event_id, session.token)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !events) return <Notice kind="error">{error}</Notice>
  if (!events) return <p className="text-sm text-slate-500">Loading…</p>
  const raceCount = events.reduce((n, e) => n + e.race_count, 0)
  const publishedCount = events.reduce((n, e) => n + e.published_count, 0)
  return (
    <div>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">
        {events.length} EVENT{events.length === 1 ? '' : 'S'} · {raceCount} RACE{raceCount === 1 ? '' : 'S'} · {publishedCount} PUBLISHED
      </p>
      <div className="mt-4 grid gap-4">
        {events.map((event) => (
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
              <div className="flex items-center gap-3">
                <p className="font-mono text-[10px] text-slate-500">
                  {event.organizer_email ?? 'no owner'} · {event.published_count}/{event.race_count} published
                </p>
                <button type="button" onClick={() => removeEvent(event)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                  <Trash2 size={12} /> Delete event
                </button>
              </div>
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
    </div>
  )
}

// ------------------------------------------------------------------------------ Shared courses

function SharedCourses({ session }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const load = () => listSharedCourses(session.token).then(setRows).catch((err) => setError(err.message))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token])

  async function remove(row) {
    if (!window.confirm(`Delete the shared course "${row.name ?? row.share_id}"? Links to it stop working.`)) return
    setBusyId(row.share_id)
    setError(null)
    try {
      await deleteSharedCourse(row.share_id, session.token)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) return <Notice kind="error">{error}</Notice>
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>
  const total = rows.reduce((n, r) => n + (r.size_bytes ?? 0), 0)
  return (
    <div>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">
        {rows.length} SHARED COURSE{rows.length === 1 ? '' : 'S'} · {fmtBytes(total)} ON DISK (GZIP)
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Shared</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.share_id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-[#0b1220]">
                  {row.name ?? <span className="text-slate-400">untitled</span>}
                  <span className="block font-mono text-[10px] text-slate-400">{row.share_id}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.filename ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{when(row.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{fmtBytes(row.size_bytes)}</td>
                <td className="px-4 py-3">
                  <span className="flex justify-end gap-2">
                    <a href={`../#calculator?gpx=${encodeURIComponent(row.share_id)}${row.name ? `&name=${encodeURIComponent(row.name)}` : ''}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0b1220] no-underline hover:border-blue-300">
                      Open <ArrowUpRight size={12} />
                    </a>
                    <Button variant="danger" className="min-h-9 px-3 text-xs" busy={busyId === row.share_id} onClick={() => remove(row)}>
                      <Trash2 size={13} /> Delete
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  Nobody has shared a course yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------ page

export function AdminEvents({ session, tab = 'overview' }) {
  const [active, setActive] = useState(tab)
  return (
    <Page
      eyebrow="ADMIN"
      headline={
        <>
          Everything,
          <br />
          <Gradient>at a glance.</Gradient>
        </>
      }
      intro="Accounts, events, races, results, shared courses and the state of the API. Every destructive action asks first and cannot be undone."
    >
      <nav className="mt-8 flex flex-wrap gap-2 border-b border-slate-300">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-[#0b1220]'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-6">
        {active === 'overview' && <Overview session={session} />}
        {active === 'accounts' && <Accounts session={session} />}
        {active === 'events' && <EventsAdmin session={session} />}
        {active === 'shared' && <SharedCourses session={session} />}
      </div>
    </Page>
  )
}
