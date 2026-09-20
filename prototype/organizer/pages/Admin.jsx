import './Admin.css'
import { useEffect, useState } from 'preact/compat'
import { Activity, ArrowUpRight, Check, Eye, EyeOff, Flag as FlagIcon, HardDrive, MapIcon, Server, ShieldCheck, Trash, UserCheck } from '../../../src/ui/icons'
import CourseMap from '../../../src/components/LazyCourseMap'
import {
  setRaceListed,
  deleteAdminOrganizer,
  deleteAdminReport,
  deleteAdminRunner,
  deleteEvent,
  deleteRace,
  deleteSharedCourse,
  fetchRaceGpxFile,
  getAdminOverview,
  getAdminServer,
  getRaceMeasurement,
  listAdminEvents,
  listAdminOrganizers,
  listAdminReports,
  listSharedCourses,
  resolveAdminReport,
  unpublishRace,
  verifyAdminOrganizer,
} from '../../apiClient'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { modelLabel } from '../../../src/lib/model'
import { fetchNewsletterCsv } from '../../apiClient'
import { Link } from '../router'
import CalculatorCourses from './CalculatorCourses'
import { Button, EmptyState, Gradient, Notice, Page, StatusChip, formatDate, raceStatus } from '../ui'

const TABS = [
  ['overview', 'Overview'],
  ['reports', 'Reports'],
  ['accounts', 'Accounts'],
  ['events', 'Events & races'],
  ['calculator', 'Calculator courses'],
  ['shared', 'Shared courses'],
  ['server', 'Server'],
]

// The terrain tiles on disk. With fetching on demand the list grows by itself, so it shows a count
// and the first few codes, not hundreds of them.
function terrainCoverage(api) {
  const tiles = api.dem_tiles ?? []
  const fetch = api.dem_fetch
  const codes = tiles.length > 8 ? `${tiles.slice(0, 8).join(' ')} +${tiles.length - 8} more` : tiles.join(' ')
  const count = `${tiles.length} tile${tiles.length === 1 ? '' : 's'}`
  if (fetch?.autofetch) {
    const used = `${fetch.fetched_mb} of ${fetch.budget_mb} MB fetched`
    return [tiles.length ? `${count} · ${codes} · new regions are fetched when a course needs them · ${used}` : `no tiles yet · fetched when a course needs them · budget ${fetch.budget_mb} MB`, 'ok']
  }
  return tiles.length ? [`${count} · ${codes} · courses outside score Low`, 'ok'] : ['no tiles installed → set OTRI_DEM_AUTOFETCH=1 or run scripts/deploy/06-install-dem.sh', 'bad']
}

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

const TONE_CLASS = { ok: 'admin-tone-ok', bad: 'admin-tone-bad' }

function Loading({ children = 'Loading…' }) {
  return (
    <p className="loading">
      <span className="spinner" /> {children}
    </p>
  )
}

/** The small mono heading of an admin card, with an optional icon. */
function CardLabel({ icon: Icon, children }) {
  return (
    <p className="eyebrow eyebrow--plain admin-card__label">
      {Icon && <Icon size={14} className="icon--moss" />} {children}
    </p>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="card card--pad-sm stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="tiny muted mono admin-stat__sub">{sub}</span>}
    </div>
  )
}

function KeyValues({ title, icon: Icon, rows }) {
  return (
    <section className="card">
      <CardLabel icon={Icon}>{title}</CardLabel>
      <dl className="kv kv--rows admin-kv mt-3">
        {rows.map(([k, v, tone]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={TONE_CLASS[tone] ?? ''}>{v}</dd>
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
  if (!data) return <Loading />
  const { stats, api, security, recent_signups: signups, recent_races: races } = data
  const yes = (v) => (v ? ['configured', 'ok'] : ['not configured', 'bad'])

  return (
    <div className="stack stack--loose">
      <div className="admin-tiles">
        <Tile label="ACCOUNTS" value={stats.organizers} sub={`${stats.verified} verified · ${stats.unverified} pending · ${stats.newsletter ?? 0} on the newsletter`} />
        <Tile label="EVENTS" value={stats.events} sub={`${stats.orphan_events} without owner`} />
        <Tile label="RACES" value={stats.races} sub={`${stats.published_races} published · ${stats.races_with_gpx} with course`} />
        <Tile label="RESULTS" value={stats.results} sub={`${stats.finishers} finishers`} />
        <Tile label="RUNNERS" value={stats.runners} sub="with any result" />
        <Tile label="SHARED COURSES" value={stats.shared_courses} sub={`${fmtBytes(stats.shared_bytes)} of ${stats.shared_budget_mb} MB`} />
      </div>
      {stats.open_reports > 0 && (
        <Notice kind="warning" title={`${stats.open_reports} open report${stats.open_reports === 1 ? '' : 's'} from the public site.`}>
          Corrections and removal requests wait in the Reports tab.
        </Notice>
      )}

      <div className="grid grid--2">
        <KeyValues
          title="API"
          icon={MapIcon}
          rows={[
            ['Version', api.version],
            ['Started', when(api.started_at)],
            ['Scoring model (default)', `${modelLabel(api.scoring_version)} · build ${api.scoring_version}`],
            ['Course measurement', api.measurement_version],
            ['Terrain model (DEM)', ...(api.dem_configured || api.dem_fetch?.autofetch ? [`configured · ${api.dem_manifest}${api.dem_fetch?.autofetch ? ' · tiles on demand' : ''}`, 'ok'] : ['not configured → every course scores Low confidence', 'bad'])],
            ['Terrain coverage', ...terrainCoverage(api)],
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
            ['Rate-limit store', security.rate_limits.backend ?? 'in-process'],
            ['Account lockout', security.lockout ? `${security.lockout.failures} wrong passwords in ${security.lockout.window_minutes} min → locked ${security.lockout.minutes} min` : 'off'],
            ['Session revocation', security.session_revocation ?? '—'],
            ['Email (24 h)', `${stats.emails_24h ?? 0} sent · ${stats.email_failures_24h ?? 0} failed`, (stats.email_failures_24h ?? 0) > 0 ? 'bad' : 'ok'],
            ['Error monitoring', ...yes(security.error_monitoring)],
          ]}
        />
      </div>

      <section className="card card--outline admin-admins">
        <CardLabel icon={ShieldCheck}>WHO IS ADMIN</CardLabel>
        <ul className="admin-rows mono small mt-3">
          {(data.admin_accounts ?? []).map((email) => (
            <li key={email}>{email}</li>
          ))}
          {(data.admin_accounts ?? []).length === 0 && <li className="muted">Nobody has signed in as admin yet.</li>}
        </ul>
        <p className="tiny muted mt-3">
          Granted by the server's OTRI_ADMIN_EMAILS at sign-in ({(security.admin_emails ?? []).join(', ') || 'empty'}). Remove an email there and restart to revoke.
        </p>
      </section>

      <div className="grid grid--2">
        <section className="card">
          <CardLabel>RECENT SIGN-UPS</CardLabel>
          <ul className="admin-rows small mt-3">
            {signups.map((o) => (
              <li key={o.id}>
                <span className="truncate">{o.email}</span>
                <span className="tiny muted mono nowrap">
                  {when(o.created_at)} · {o.email_verified ? 'verified' : <span className="admin-tone-warn">pending</span>}
                </span>
              </li>
            ))}
            {signups.length === 0 && <li className="muted">None yet.</li>}
          </ul>
        </section>
        <section className="card">
          <CardLabel>RECENT RACES</CardLabel>
          <ul className="admin-rows small mt-3">
            {races.map((r) => (
              <li key={r.race_id}>
                <Link to={`/races/${encodeURIComponent(r.race_id)}/review`} className="link link--quiet truncate">
                  {r.event_name} · {r.course_name}
                </Link>
                <span className="nowrap">
                  <StatusChip status={raceStatus(r, (r.finisher_count ?? 0) > 0)} />
                </span>
              </li>
            ))}
            {races.length === 0 && <li className="muted">None yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------ Reports

const KIND_LABEL = { runner: 'Runner', race: 'Race', shared_course: 'Shared course', other: 'Other' }
const REASON_LABEL = { not_me: 'not me / merged', wrong_result: 'wrong result', remove_my_data: 'remove my data', wrong_course: 'wrong course', other: 'other' }

function subjectLink(report) {
  if (report.kind === 'runner') return `../#runners/${encodeURIComponent(report.subject_id)}`
  if (report.kind === 'race') return `../#races/${encodeURIComponent(report.subject_id)}`
  if (report.kind === 'shared_course') return `../#calculator?gpx=${encodeURIComponent(report.subject_id)}`
  return ownPage(report.page_url) ?? '../#home'
}

// A report comes from anyone, and so does the address it claims to be about: only a page of this
// site becomes a link here. The API keeps nothing else either; this is the second lock.
function ownPage(url) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === window.location.origin ? parsed.href : null
  } catch {
    return null
  }
}

function ReportCard({ report, token, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')
  const open = report.status === 'open'

  async function run(action, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return
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
  const resolve = (resolution) => run(() => resolveAdminReport(report.id, resolution, token))
  const subjectActions = {
    runner: (
      <Button
        variant="danger"
        busy={busy}
        className="btn--sm"
        onClick={() => run(async () => { await deleteAdminRunner(report.subject_id, token); await resolveAdminReport(report.id, 'runner profile and results deleted', token) }, `Delete the runner "${report.subject_label ?? report.subject_id}" and every result attached to them? This cannot be undone.`)}
      >
        <Trash size={14} /> Delete runner data
      </Button>
    ),
    race: (
      <>
        <Button variant="secondary" busy={busy} className="btn--sm" onClick={() => run(async () => { await unpublishRace(report.subject_id, token); await resolveAdminReport(report.id, 'race unpublished', token) }, `Unpublish "${report.subject_label ?? report.subject_id}"?`)}>
          <EyeOff size={14} /> Unpublish race
        </Button>
        <Button variant="danger" busy={busy} className="btn--sm" onClick={() => run(async () => { await deleteRace(report.subject_id, token); await resolveAdminReport(report.id, 'race deleted', token) }, `Delete the race "${report.subject_label ?? report.subject_id}" and its results? This cannot be undone.`)}>
          <Trash size={14} /> Delete race
        </Button>
      </>
    ),
    shared_course: (
      <Button variant="danger" busy={busy} className="btn--sm" onClick={() => run(async () => { await deleteSharedCourse(report.subject_id, token); await resolveAdminReport(report.id, 'shared course deleted', token) }, `Delete the shared course "${report.subject_label ?? report.subject_id}"? Links to it stop working.`)}>
        <Trash size={14} /> Delete shared course
      </Button>
    ),
  }

  return (
    <li className={`card admin-report ${open ? 'admin-report--open' : 'admin-report--resolved'}`}>
      <div className="admin-report__body">
        <p className="cluster cluster--tight">
          <span className={`badge ${open ? 'badge--ochre' : ''}`}>{KIND_LABEL[report.kind] ?? report.kind}</span>
          {report.reason && <span className="badge">{REASON_LABEL[report.reason] ?? report.reason}</span>}
          <span className="tiny muted mono">{when(report.created_at)}</span>
          {!open && <span className="tiny muted">resolved {when(report.resolved_at)} by {report.resolved_by}{report.resolution ? ` · ${report.resolution}` : ''}</span>}
        </p>
        <p className="cluster cluster--tight cluster--baseline mt-2">
          <a href={subjectLink(report)} className="link link--arrow admin-report__subject">
            {report.subject_label ?? report.subject_id} <ArrowUpRight size={14} />
          </a>
          <span className="tiny muted mono break">{report.subject_id}</span>
        </p>
        <p className="small admin-report__message mt-2">{report.message}</p>
        <p className="tiny mt-2">
          {report.reporter_email ? (
            <a href={`mailto:${report.reporter_email}?subject=${encodeURIComponent(`Your OTRI report about ${report.subject_label ?? report.subject_id}`)}`} className="link">
              {report.reporter_email}
            </a>
          ) : (
            <span className="muted">no email left</span>
          )}
        </p>
        {error && <p className="admin-error mt-2">{error}</p>}
      </div>
      {open && (
        <div className="admin-report__actions">
          <div className="cluster cluster--tight">{subjectActions[report.kind] ?? null}</div>
          <div className="cluster cluster--tight">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" className="input input--sm admin-report__note" />
            <Button variant="secondary" busy={busy} className="btn--sm" onClick={() => resolve(note || null)}>
              <Check size={14} /> Mark resolved
            </Button>
          </div>
        </div>
      )}
      {!open && (
        <div className="admin-report__actions">
          <button type="button" onClick={() => run(() => deleteAdminReport(report.id, token), 'Delete this resolved report?')} className="btn btn--danger btn--sm">
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

function Reports({ session }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    listAdminReports(session.token, showAll ? 'all' : 'open')
      .then(setRows)
      .catch((err) => setError(err.message))
  }, [session.token, showAll, version])
  const reload = () => setVersion((v) => v + 1)
  if (error && !rows) return <Notice kind="error">{error}</Notice>
  if (!rows) return <Loading />
  return (
    <div>
      <div className="toolbar">
        <p className="eyebrow eyebrow--plain grow">
          <FlagIcon size={14} className="icon--moss" /> {rows.length} {showAll ? 'REPORT' : 'OPEN REPORT'}{rows.length === 1 ? '' : 'S'}
        </p>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="chip" aria-pressed={showAll}>
          {showAll ? 'Show open only' : 'Show resolved too'}
        </button>
      </div>
      <ul className="stack mt-4">
        {rows.map((report) => (
          <ReportCard key={report.id} report={report} token={session.token} onChanged={reload} />
        ))}
        {rows.length === 0 && (
          <li>
            <EmptyState title="Nothing reported.">The public pages have a "Report a problem" form under every runner profile, leaderboard and shared course.</EmptyState>
          </li>
        )}
      </ul>
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
  if (!rows) return <Loading />
  async function exportNewsletter() {
    setError(null)
    try {
      const blob = await fetchNewsletterCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'otri-newsletter.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  const subscribers = rows.filter((o) => o.marketing_opt_in && o.email_verified && !o.is_demo).length
  return (
    <div>
      <div className="toolbar card card--pad-sm card--gravel">
        <p className="small grow">
          <b className="num admin-inline-count">{subscribers}</b> verified {subscribers === 1 ? 'account' : 'accounts'} agreed to receive OTRI news. Only those may get marketing email; the export is the audience for a Resend broadcast.
        </p>
        <Button variant="secondary" className="btn--sm" onClick={exportNewsletter} disabled={subscribers === 0}>
          Download newsletter list (CSV)
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="table-wrap mt-4">
        <table className="table table--tight admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Who</th>
              <th>Status</th>
              <th>Created</th>
              <th className="num right">Events</th>
              <th className="num right">Races</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="break">
                  {o.email}
                  {o.email === session.email && <span className="tiny muted"> (you)</span>}
                </td>
                <td>
                  {o.display_name || o.organization ? (
                    <>
                      <span className="admin-table__strong">{o.display_name ?? '—'}</span>
                      {o.organization && <span className="tiny muted block">{o.organization}</span>}
                    </>
                  ) : (
                    <span className="muted">no profile yet</span>
                  )}
                </td>
                <td>
                  <span className="cluster cluster--tight admin-table__badges">
                    {o.two_factor_method && <span className="badge">2FA</span>}
                    {o.marketing_opt_in && <span className="badge badge--sky">news</span>}
                    {o.email_verified ? (
                      <span className="badge badge--moss">verified</span>
                    ) : (
                      <span className="badge badge--ochre">pending</span>
                    )}
                    {o.is_admin && <span className="badge badge--solid">admin</span>}
                    {o.is_demo && <span className="badge badge--blaze">demo</span>}
                  </span>
                </td>
                <td className="num nowrap">{when(o.created_at)}</td>
                <td className="num right">{o.event_count}</td>
                <td className="num right">{o.race_count}</td>
                <td className="right">
                  <span className="admin-actions">
                    {!o.email_verified && (
                      <Button variant="secondary" className="btn--sm" busy={busyId === o.id} onClick={() => verify(o)}>
                        <UserCheck size={14} /> Verify
                      </Button>
                    )}
                    {o.email !== session.email && (
                      <Button variant="danger" className="btn--sm" busy={busyId === o.id} onClick={() => remove(o)}>
                        <Trash size={14} /> Delete
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted mt-3">
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
  if (error) return <p className="admin-error mt-2">{error}</p>
  if (!course) return <p className="loading mt-2"><span className="spinner" /> Loading course…</p>
  return <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="admin-race__map" />
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
    <li className="admin-race">
      <div className="admin-race__row">
        <div className="min0">
          <p className="admin-race__name">{race.course_name}</p>
          <p className="tiny muted mono">
            {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · {race.finisher_count ?? 0} scored ·{' '}
            {modelLabel(race.scoring_version)}
            {race.has_gpx ? ` · ${race.measurement_version ?? 'course attached'}` : ' · no course file'}
            {race.is_listed ? ' · listed' : ''}
          </p>
          {error && <p className="admin-error mt-2">{error}</p>}
        </div>
        <div className="admin-actions">
          <StatusChip status={status} />
          <Link to={`/races/${encodeURIComponent(race.race_id)}/review`} className="btn btn--ghost btn--sm">
            Open
          </Link>
          {race.has_gpx && (
            <button type="button" onClick={() => setShowCourse((v) => !v)} className="btn btn--ghost btn--sm">
              <MapIcon size={14} /> {showCourse ? 'Hide course' : 'View course'}
            </button>
          )}
          {!race.is_published && (
            <Button variant="secondary" busy={busy} className="btn--sm" onClick={() => run(() => setRaceListed(race.race_id, !race.is_listed, token))}>
              {race.is_listed ? <EyeOff size={14} /> : <Eye size={14} />} {race.is_listed ? 'Unlist' : 'List publicly'}
            </Button>
          )}
          {race.is_listed && !race.is_published && (
            <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="btn btn--ghost btn--sm">
              Public page <ArrowUpRight size={14} />
            </a>
          )}
          {race.is_published && (
            <>
              <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="btn btn--ghost btn--sm">
                Public page <ArrowUpRight size={14} />
              </a>
              <Button
                variant="secondary"
                busy={busy}
                className="btn--sm"
                onClick={() => run(() => unpublishRace(race.race_id, token), `Unpublish "${race.event_name} · ${race.course_name}"?`)}
              >
                <EyeOff size={14} /> Unpublish
              </Button>
            </>
          )}
          <Button
            variant="danger"
            busy={busy}
            className="btn--sm"
            onClick={() => run(() => deleteRace(race.race_id, token), `Delete the race "${race.event_name} · ${race.course_name}" and its ${race.finisher_count ?? 0} results? This cannot be undone.`)}
          >
            <Trash size={14} /> Delete
          </Button>
        </div>
      </div>
      {showCourse && <CoursePreview raceId={race.race_id} token={token} />}
    </li>
  )
}

// Listings: races shown publicly before anyone has uploaded results (docs/product/open-scoring-tool.md).
const EVENTS_PER_PAGE = 40

function EventsAdmin({ session }) {
  const [events, setEvents] = useState(null)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(EVENTS_PER_PAGE)
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
  if (!events) return <Loading />
  const raceCount = events.reduce((n, e) => n + e.race_count, 0)
  // Thousands of events once listings are imported: search, and draw a screenful at a time.
  const needle = query.trim().toLowerCase()
  const matching = needle ? events.filter((e) => `${e.event_name} ${e.location ?? ''} ${e.country ?? ''} ${e.organizer_email ?? ''} ${e.event_date}`.toLowerCase().includes(needle)) : events
  const shownEvents = matching.slice(0, visible)
  const publishedCount = events.reduce((n, e) => n + e.published_count, 0)
  return (
    <div>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="admin-stats">
        <div className="stat">
          <span className="stat__value">{events.length}</span>
          <span className="stat__label">EVENT{events.length === 1 ? '' : 'S'}</span>
        </div>
        <div className="stat">
          <span className="stat__value">{raceCount}</span>
          <span className="stat__label">RACE{raceCount === 1 ? '' : 'S'}</span>
        </div>
        <div className="stat">
          <span className="stat__value">{publishedCount}</span>
          <span className="stat__label">PUBLISHED</span>
        </div>
      </div>
      <div className="toolbar mt-4">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisible(EVENTS_PER_PAGE) }}
          placeholder="Find an event: name, place, country, owner or date"
          aria-label="Find an event"
          className="input input--sm grow"
        />
        <p className="tiny muted mono nowrap">
          {shownEvents.length} OF {matching.length} SHOWN
        </p>
      </div>
      <div className="stack mt-4">
        {shownEvents.map((event) => (
          <section key={event.event_id} className="card card--flush admin-event">
            <div className="card__head">
              <div className="min0">
                <p className="card__meta">{formatDate(event.event_date).toUpperCase()}</p>
                <h2 className="card__title mt-1">
                  <Link to={`/events/${encodeURIComponent(event.event_id)}`} className="link link--quiet">
                    {event.event_name}
                  </Link>
                </h2>
              </div>
              <div className="cluster cluster--tight">
                <p className="tiny muted mono">
                  {event.organizer_email ?? 'no owner'} · {event.published_count}/{event.race_count} published
                </p>
                <button type="button" onClick={() => removeEvent(event)} className="btn btn--danger btn--sm">
                  <Trash size={14} /> Delete event
                </button>
              </div>
            </div>
            <ul className="admin-races">
              {event.races.map((race) => (
                <AdminRaceRow key={race.race_id} race={race} token={session.token} onChanged={reload} />
              ))}
              {event.races.length === 0 && <li className="admin-race small muted">No races yet.</li>}
            </ul>
          </section>
        ))}
      </div>
      {matching.length > shownEvents.length && (
        <div className="center mt-6">
          <Button variant="secondary" onClick={() => setVisible((n) => n + EVENTS_PER_PAGE)}>
            Show {Math.min(EVENTS_PER_PAGE, matching.length - shownEvents.length)} more
          </Button>
        </div>
      )}
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
  if (!rows) return <Loading />
  const total = rows.reduce((n, r) => n + (r.size_bytes ?? 0), 0)
  return (
    <div>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="admin-stats">
        <div className="stat">
          <span className="stat__value">{rows.length}</span>
          <span className="stat__label">SHARED COURSE{rows.length === 1 ? '' : 'S'}</span>
        </div>
        <div className="stat">
          <span className="stat__value">{fmtBytes(total)}</span>
          <span className="stat__label">ON DISK (GZIP)</span>
        </div>
      </div>
      <div className="table-wrap mt-4">
        <table className="table table--tight admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>File</th>
              <th>Shared</th>
              <th className="num right">Size</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.share_id}>
                <td>
                  <span className="admin-table__strong">{row.name ?? <span className="muted">untitled</span>}</span>
                  <span className="tiny muted mono block break">{row.share_id}</span>
                </td>
                <td className="num break">{row.filename ?? '—'}</td>
                <td className="num nowrap">{when(row.created_at)}</td>
                <td className="num right">{fmtBytes(row.size_bytes)}</td>
                <td className="right">
                  <span className="admin-actions">
                    <a href={`../#calculator?gpx=${encodeURIComponent(row.share_id)}${row.name ? `&name=${encodeURIComponent(row.name)}` : ''}`} className="btn btn--ghost btn--sm">
                      Open <ArrowUpRight size={14} />
                    </a>
                    <Button variant="danger" className="btn--sm" busy={busyId === row.share_id} onClick={() => remove(row)}>
                      <Trash size={14} /> Delete
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="table__empty">
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

// ------------------------------------------------------------------------------ Server

// A gauge under a figure: moss while there is room, ochre past three quarters, berry past nine tenths.
function Bar({ value, max, tone = 'blue' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = pct > 90 ? 'admin-meter--bad' : pct > 75 ? 'admin-meter--warn' : tone === 'blue' ? '' : 'admin-meter--alt'
  return (
    <div className={`meter meter--thin admin-meter ${color}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

function uptime(seconds) {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d ? `${d}d ${h}h` : `${h}h ${m}m`
}

function Unavailable({ what, reason }) {
  return (
    <p className="small muted">
      {what} not available on this host{reason ? ` (${reason})` : ''}.
    </p>
  )
}

function Gauge({ label, value, sub, children }) {
  return (
    <div className="card card--pad-sm stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      <span className="tiny muted mono admin-stat__sub">{sub}</span>
      {children}
    </div>
  )
}

function ServerTab({ session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getAdminServer(session.token).then(setData).catch((err) => setError(err.message))
  }, [session.token])
  if (error) return <Notice kind="error">{error}</Notice>
  if (!data) return <Loading>Reading the server…</Loading>
  const { host, storage, services, watchdog, backups, firewall, fail2ban, api_usage: usage, tls } = data
  const memUsed = host.memory_total != null && host.memory_available != null ? host.memory_total - host.memory_available : null
  const maxHour = usage?.per_hour ? Math.max(1, ...usage.per_hour) : 1

  return (
    <div className="stack stack--loose">
      <p className="tiny muted mono">
        {host.hostname?.toUpperCase()} · SNAPSHOT {when(data.generated_at)} · REFRESHED EVERY 30 S
      </p>

      <div className="admin-gauges">
        <Gauge label="CPU" value={host.cpu_percent != null ? `${host.cpu_percent}%` : '—'} sub={<>{host.cpu_count ?? '?'} core{host.cpu_count === 1 ? '' : 's'} · load {host.load_1 ?? '—'} / {host.load_5 ?? '—'} / {host.load_15 ?? '—'}</>}>
          {host.cpu_percent != null && <Bar value={host.cpu_percent} max={100} />}
        </Gauge>
        <Gauge label="MEMORY" value={memUsed != null ? fmtBytes(memUsed) : '—'} sub={<>of {fmtBytes(host.memory_total)} · swap {fmtBytes(host.swap_total)}</>}>
          {memUsed != null && <Bar value={memUsed} max={host.memory_total} />}
        </Gauge>
        <Gauge label="DISK" value={fmtBytes(storage.disk_used)} sub={<>of {fmtBytes(storage.disk_total)} · {fmtBytes(storage.disk_free)} free</>}>
          {storage.disk_total && <Bar value={storage.disk_used} max={storage.disk_total} />}
        </Gauge>
        <Gauge label="UPTIME" value={uptime(host.uptime_seconds)} sub={<>TLS {tls?.available ? `${tls.days_left} days left` : 'not checked'}</>} />
      </div>

      <div className="grid grid--2">
        <section className="card">
          <CardLabel icon={Activity}>API USAGE · LAST {usage?.hours ?? 24} H</CardLabel>
          {usage?.available ? (
            <>
              <div className="grid grid--3 grid--tight mt-3">
                <div className="stat">
                  <span className="stat__label">REQUESTS</span>
                  <span className="stat__value">{usage.total.toLocaleString()}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">CLIENTS</span>
                  <span className="stat__value">{usage.unique_ips}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">5XX ERRORS</span>
                  <span className={`stat__value ${usage.errors_5xx ? 'admin-tone-bad' : ''}`}>{usage.errors_5xx}</span>
                </div>
              </div>
              <div className="admin-chart mt-4" aria-label="Requests per hour">
                {usage.per_hour.map((n, i) => (
                  <div key={i} title={`${n} requests`} className="admin-chart__bar" style={{ height: `${Math.max(2, (n / maxHour) * 100)}%` }} />
                ))}
              </div>
              <p className="admin-chart__axis tiny muted mono mt-1">
                <span>{usage.hours} h ago</span>
                <span>now</span>
              </p>
              <p className="tiny muted mono mt-3">
                {Object.entries(usage.by_status)
                  .sort()
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ') || 'no requests'}
              </p>
              <div className="grid grid--2 grid--tight mt-4">
                <div>
                  <p className="eyebrow eyebrow--plain eyebrow--sm">TOP ENDPOINTS</p>
                  <ul className="admin-rows admin-rows--dense mono tiny mt-1">
                    {usage.top_paths.map((row) => (
                      <li key={row.path}>
                        <span className="truncate">{row.path}</span>
                        <span className="muted">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow eyebrow--plain eyebrow--sm">TOP CLIENTS</p>
                  <ul className="admin-rows admin-rows--dense mono tiny mt-1">
                    {usage.top_ips.map((row) => (
                      <li key={row.ip}>
                        <span>{row.ip}</span>
                        <span className="muted">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-2">
              <Unavailable what="Request log" reason={usage?.reason} />
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <CardLabel icon={ShieldCheck}>FIREWALL & FAIL2BAN</CardLabel>
            {firewall?.available ? (
              <p className="cluster cluster--tight small mt-3">
                ufw <span className={`badge ${firewall.active ? 'badge--moss' : 'badge--berry'}`}>{firewall.active ? 'active' : 'inactive'}</span>
                {firewall.rules?.length ? <span className="tiny muted mono"> · {firewall.rules.length} rules</span> : null}
              </p>
            ) : (
              <div className="mt-2">
                <Unavailable what="Firewall status" />
              </div>
            )}
            {fail2ban?.available ? (
              <ul className="admin-list mt-3">
                {fail2ban.jails.map((jail) => (
                  <li key={jail.name}>
                    <p className="cluster cluster--tight cluster--between small">
                      <span className="mono admin-table__strong">jail {jail.name}</span>
                      <span className="tiny muted mono">
                        {jail.currently_banned} banned now · {jail.total_banned} total · {jail.total_failed} failed attempts
                      </span>
                    </p>
                    {jail.banned_ips.length > 0 && (
                      <p className="tiny muted mono break mt-1">{jail.banned_ips.slice(0, 12).join(' · ')}{jail.banned_ips.length > 12 ? ' …' : ''}</p>
                    )}
                  </li>
                ))}
                {fail2ban.jails.length === 0 && <li className="small muted">fail2ban is running with no jails.</li>}
              </ul>
            ) : (
              <div className="mt-2">
                <Unavailable what="fail2ban" reason={fail2ban?.reason} />
              </div>
            )}
          </section>

          <section className="card">
            <CardLabel icon={Server}>SERVICES</CardLabel>
            {services?.available ? (
              <ul className="admin-services mono small mt-3">
                {Object.entries(services.units).map(([unit, state]) => (
                  <li key={unit}>
                    <i className={`admin-dot ${state === 'active' ? 'admin-dot--ok' : 'admin-dot--bad'}`} />
                    {unit} <span className="muted">{state}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2">
                <Unavailable what="Service status" />
              </div>
            )}
            {/* Both report by email or not at all: a missing email looks the same as one that never ran. */}
            <ul className="admin-services mono small mt-3 admin-services--line">
              <li>
                <i className={`admin-dot ${watchdog?.active && watchdog.last_result === 'success' ? 'admin-dot--ok' : watchdog?.available ? 'admin-dot--bad' : 'admin-dot--unknown'}`} />
                watchdog{' '}
                <span className="muted">
                  {!watchdog?.available
                    ? 'unknown here'
                    : !watchdog.active
                      ? 'not running: install it with scripts/deploy/08-install-watchdog.sh'
                      : `last check ${watchdog.last_check ?? 'not yet'}${watchdog.last_result && watchdog.last_result !== 'success' ? ` (${watchdog.last_result})` : ''}`}
                </span>
              </li>
              <li>
                <i className={`admin-dot ${backups?.ok ? 'admin-dot--ok' : backups?.available ? 'admin-dot--bad' : 'admin-dot--unknown'}`} />
                database backup{' '}
                <span className="muted">
                  {!backups?.available
                    ? 'unknown here'
                    : !backups.newest
                      ? 'none yet: see scripts/deploy/04-backup-db.sh'
                      : `${backups.age_hours < 1 ? 'under an hour' : `${Math.round(backups.age_hours)} h`} old, ${fmtBytes(backups.bytes)}, ${backups.count} kept${backups.ok ? '' : ': the nightly run is failing, look at ~/otri-backup.log'}`}
                </span>
              </li>
            </ul>
          </section>

          <section className="card">
            <CardLabel icon={HardDrive}>STORAGE</CardLabel>
            <ul className="admin-rows small mt-3">
              <li>
                <span>database</span>
                <span className="mono muted">{fmtBytes(storage.database_bytes)}</span>
              </li>
              {Object.entries(storage.dirs ?? {}).map(([name, info]) => (
                <li key={name}>
                  <span className="truncate" title={info.path ?? ''}>
                    {name.replace('_', ' ')}
                  </span>
                  <span className="mono muted">{info.bytes == null ? '—' : fmtBytes(info.bytes)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
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
      <nav className="tabs mt-8">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`tabs__tab ${active === id ? 'is-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-6">
        {active === 'overview' && <Overview session={session} />}
        {active === 'reports' && <Reports session={session} />}
        {active === 'accounts' && <Accounts session={session} />}
        {active === 'events' && <EventsAdmin session={session} />}
        {active === 'calculator' && <CalculatorCourses session={session} />}
        {active === 'shared' && <SharedCourses session={session} />}
        {active === 'server' && <ServerTab session={session} />}
      </div>
    </Page>
  )
}
