import './Admin.css'
import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, Check, Eye, EyeOff, Flag as FlagIcon, HardDrive, Map, Server, ShieldCheck, Trash2, UserCheck } from 'lucide-react'
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
import { Button, Gradient, Notice, Page, StatusChip, formatDate, raceStatus } from '../ui'

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

function Tile({ label, value, sub }) {
  return (
    <div className="prototype-organizer-pages-admin-tile-div-1">
      <p className="prototype-organizer-pages-admin-tile-p-2">{label}</p>
      <p className="prototype-organizer-pages-admin-tile-p-3">{value}</p>
      {sub && <p className="prototype-organizer-pages-admin-tile-p-4">{sub}</p>}
    </div>
  )
}

function KeyValues({ title, icon: Icon, rows }) {
  return (
    <section className="prototype-organizer-pages-admin-key-values-section-5">
      <p className="prototype-organizer-pages-admin-key-values-p-6">
        {Icon && <Icon size={13} className="prototype-organizer-pages-admin-key-values-icon-7" />} {title}
      </p>
      <dl className="prototype-organizer-pages-admin-key-values-dl-8">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="prototype-organizer-pages-admin-key-values-div-9">
            <dt className="prototype-organizer-pages-admin-key-values-dt-10">{k}</dt>
            <dd className={`prototype-organizer-pages-admin-key-values-dd-11 ${tone === 'bad' ? "prototype-organizer-pages-admin-key-values-dd-12" : tone === 'ok' ? "prototype-organizer-pages-admin-key-values-dd-13" : "prototype-organizer-pages-admin-key-values-dd-14"}`}>{v}</dd>
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
  if (!data) return <p className="prototype-organizer-pages-admin-overview-p-15">Loading…</p>
  const { stats, api, security, recent_signups: signups, recent_races: races } = data
  const yes = (v) => (v ? ['configured', 'ok'] : ['not configured', 'bad'])

  return (
    <div className="prototype-organizer-pages-admin-overview-div-16">
      <div className="prototype-organizer-pages-admin-overview-div-17">
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

      <div className="prototype-organizer-pages-admin-overview-div-18">
        <KeyValues
          title="API"
          icon={Map}
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

      <section className="prototype-organizer-pages-admin-overview-section-19">
        <p className="prototype-organizer-pages-admin-overview-p-20">
          <ShieldCheck size={13} /> WHO IS ADMIN
        </p>
        <ul className="prototype-organizer-pages-admin-overview-ul-21">
          {(data.admin_accounts ?? []).map((email) => (
            <li key={email} className="prototype-organizer-pages-admin-overview-li-22">
              {email}
            </li>
          ))}
          {(data.admin_accounts ?? []).length === 0 && <li className="prototype-organizer-pages-admin-overview-li-23">Nobody has signed in as admin yet.</li>}
        </ul>
        <p className="prototype-organizer-pages-admin-overview-p-24">
          Granted by the server's OTRI_ADMIN_EMAILS at sign-in ({(security.admin_emails ?? []).join(', ') || 'empty'}). Remove an email there and restart to revoke.
        </p>
      </section>

      <div className="prototype-organizer-pages-admin-overview-div-18">
        <section className="prototype-organizer-pages-admin-key-values-section-5">
          <p className="prototype-organizer-pages-admin-tile-p-2">RECENT SIGN-UPS</p>
          <ul className="prototype-organizer-pages-admin-overview-ul-25">
            {signups.map((o) => (
              <li key={o.id} className="prototype-organizer-pages-admin-overview-li-26">
                <span className="prototype-organizer-pages-admin-overview-span-27">{o.email}</span>
                <span className="prototype-organizer-pages-admin-overview-span-28">
                  {when(o.created_at)} · {o.email_verified ? 'verified' : <span className="prototype-organizer-pages-admin-overview-span-29">pending</span>}
                </span>
              </li>
            ))}
            {signups.length === 0 && <li className="prototype-organizer-pages-admin-overview-li-30">None yet.</li>}
          </ul>
        </section>
        <section className="prototype-organizer-pages-admin-key-values-section-5">
          <p className="prototype-organizer-pages-admin-tile-p-2">RECENT RACES</p>
          <ul className="prototype-organizer-pages-admin-overview-ul-25">
            {races.map((r) => (
              <li key={r.race_id} className="prototype-organizer-pages-admin-overview-li-26">
                <Link to={`/races/${encodeURIComponent(r.race_id)}/review`} className="prototype-organizer-pages-admin-overview-link-31">
                  {r.event_name} · {r.course_name}
                </Link>
                <span className="prototype-organizer-pages-admin-overview-span-32">
                  <StatusChip status={raceStatus(r, (r.finisher_count ?? 0) > 0)} />
                </span>
              </li>
            ))}
            {races.length === 0 && <li className="prototype-organizer-pages-admin-overview-li-30">None yet.</li>}
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
        className="prototype-organizer-pages-admin-report-card-button-33"
        onClick={() => run(async () => { await deleteAdminRunner(report.subject_id, token); await resolveAdminReport(report.id, 'runner profile and results deleted', token) }, `Delete the runner "${report.subject_label ?? report.subject_id}" and every result attached to them? This cannot be undone.`)}
      >
        <Trash2 size={13} /> Delete runner data
      </Button>
    ),
    race: (
      <>
        <Button variant="secondary" busy={busy} className="prototype-organizer-pages-admin-report-card-button-33" onClick={() => run(async () => { await unpublishRace(report.subject_id, token); await resolveAdminReport(report.id, 'race unpublished', token) }, `Unpublish "${report.subject_label ?? report.subject_id}"?`)}>
          <EyeOff size={13} /> Unpublish race
        </Button>
        <Button variant="danger" busy={busy} className="prototype-organizer-pages-admin-report-card-button-33" onClick={() => run(async () => { await deleteRace(report.subject_id, token); await resolveAdminReport(report.id, 'race deleted', token) }, `Delete the race "${report.subject_label ?? report.subject_id}" and its results? This cannot be undone.`)}>
          <Trash2 size={13} /> Delete race
        </Button>
      </>
    ),
    shared_course: (
      <Button variant="danger" busy={busy} className="prototype-organizer-pages-admin-report-card-button-33" onClick={() => run(async () => { await deleteSharedCourse(report.subject_id, token); await resolveAdminReport(report.id, 'shared course deleted', token) }, `Delete the shared course "${report.subject_label ?? report.subject_id}"? Links to it stop working.`)}>
        <Trash2 size={13} /> Delete shared course
      </Button>
    ),
  }

  return (
    <li className={`prototype-organizer-pages-admin-report-card-li-34 ${open ? "prototype-organizer-pages-admin-report-card-li-35" : "prototype-organizer-pages-admin-report-card-li-36"}`}>
      <div className="prototype-organizer-pages-admin-report-card-div-37">
        <div className="prototype-organizer-pages-admin-report-card-div-38">
          <p className="prototype-organizer-pages-admin-report-card-p-39">
            <span className="prototype-organizer-pages-admin-report-card-span-40">{KIND_LABEL[report.kind] ?? report.kind}</span>
            {report.reason && <span className="prototype-organizer-pages-admin-report-card-span-41">{REASON_LABEL[report.reason] ?? report.reason}</span>}
            <span className="prototype-organizer-pages-admin-report-card-span-42">{when(report.created_at)}</span>
            {!open && <span className="prototype-organizer-pages-admin-report-card-span-43">resolved {when(report.resolved_at)} by {report.resolved_by}{report.resolution ? ` · ${report.resolution}` : ''}</span>}
          </p>
          <p className="prototype-organizer-pages-admin-report-card-p-44">
            <a href={subjectLink(report)} className="prototype-organizer-pages-admin-report-card-a-45">
              {report.subject_label ?? report.subject_id} <ArrowUpRight size={12} className="prototype-organizer-pages-admin-report-card-arrow-up-right-46" />
            </a>
            <span className="prototype-organizer-pages-admin-report-card-span-47">{report.subject_id}</span>
          </p>
          <p className="prototype-organizer-pages-admin-report-card-p-48">{report.message}</p>
          <p className="prototype-organizer-pages-admin-report-card-p-49">
            {report.reporter_email ? (
              <a href={`mailto:${report.reporter_email}?subject=${encodeURIComponent(`Your OTRI report about ${report.subject_label ?? report.subject_id}`)}`} className="prototype-organizer-pages-admin-report-card-a-50">
                {report.reporter_email}
              </a>
            ) : (
              'no email left'
            )}
          </p>
          {error && <p className="prototype-organizer-pages-admin-report-card-p-51">{error}</p>}
        </div>
        {open && (
          <div className="prototype-organizer-pages-admin-report-card-div-52">
            <div className="prototype-organizer-pages-admin-report-card-div-53">{subjectActions[report.kind] ?? null}</div>
            <div className="prototype-organizer-pages-admin-report-card-div-54">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" className="prototype-organizer-pages-admin-report-card-input-55" />
              <Button variant="secondary" busy={busy} className="prototype-organizer-pages-admin-report-card-button-33" onClick={() => resolve(note || null)}>
                <Check size={13} /> Mark resolved
              </Button>
            </div>
          </div>
        )}
        {!open && (
          <button type="button" onClick={() => run(() => deleteAdminReport(report.id, token), 'Delete this resolved report?')} className="prototype-organizer-pages-admin-report-card-button-56">
            Delete
          </button>
        )}
      </div>
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
  if (!rows) return <p className="prototype-organizer-pages-admin-overview-p-15">Loading…</p>
  return (
    <div>
      <div className="prototype-organizer-pages-admin-reports-div-57">
        <p className="prototype-organizer-pages-admin-reports-p-58">
          <FlagIcon size={13} className="prototype-organizer-pages-admin-key-values-icon-7" /> {rows.length} {showAll ? 'REPORT' : 'OPEN REPORT'}{rows.length === 1 ? '' : 'S'}
        </p>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="prototype-organizer-pages-admin-reports-button-59">
          {showAll ? 'Show open only' : 'Show resolved too'}
        </button>
      </div>
      <ul className="prototype-organizer-pages-admin-reports-ul-60">
        {rows.map((report) => (
          <ReportCard key={report.id} report={report} token={session.token} onChanged={reload} />
        ))}
        {rows.length === 0 && <li className="prototype-organizer-pages-admin-reports-li-61">Nothing reported. The public pages have a "Report a problem" form under every runner profile, leaderboard and shared course.</li>}
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
  if (!rows) return <p className="prototype-organizer-pages-admin-overview-p-15">Loading…</p>
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
      <div className="prototype-organizer-pages-admin-accounts-div-62">
        <span>
          <span className="prototype-organizer-pages-admin-accounts-span-63">{subscribers}</span> verified {subscribers === 1 ? 'account' : 'accounts'} agreed to receive OTRI news. Only those may get marketing email; the export is the audience for a Resend broadcast.
        </span>
        <Button variant="secondary" className="prototype-organizer-pages-admin-report-card-button-33" onClick={exportNewsletter} disabled={subscribers === 0}>
          Download newsletter list (CSV)
        </Button>
      </div>
      {error && (
        <div className="prototype-organizer-pages-admin-accounts-div-64">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="prototype-organizer-pages-admin-accounts-div-65">
        <table className="prototype-organizer-pages-admin-accounts-table-66">
          <thead>
            <tr className="prototype-organizer-pages-admin-accounts-tr-67">
              <th className="prototype-organizer-pages-admin-accounts-th-68">Email</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Who</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Status</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Created</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Events</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Races</th>
              <th className="prototype-organizer-pages-admin-accounts-th-69">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="prototype-organizer-pages-admin-accounts-tr-70">
                <td className="prototype-organizer-pages-admin-accounts-td-71">
                  {o.email}
                  {o.email === session.email && <span className="prototype-organizer-pages-admin-accounts-span-72">(you)</span>}
                </td>
                <td className="prototype-organizer-pages-admin-accounts-td-73">
                  {o.display_name || o.organization ? (
                    <>
                      <span className="prototype-organizer-pages-admin-accounts-span-63">{o.display_name ?? '—'}</span>
                      {o.organization && <span className="prototype-organizer-pages-admin-accounts-span-74">{o.organization}</span>}
                    </>
                  ) : (
                    <span className="prototype-organizer-pages-admin-accounts-span-75">no profile yet</span>
                  )}
                </td>
                <td className="prototype-organizer-pages-admin-accounts-th-68">
                  <span className="prototype-organizer-pages-admin-accounts-span-76">
                    {o.two_factor_method && <span className="prototype-organizer-pages-admin-accounts-span-77">2FA</span>}
                    {o.marketing_opt_in && <span className="prototype-organizer-pages-admin-accounts-span-78">news</span>}
                    {o.email_verified ? (
                      <span className="prototype-organizer-pages-admin-accounts-span-79">verified</span>
                    ) : (
                      <span className="prototype-organizer-pages-admin-accounts-span-80">pending</span>
                    )}
                    {o.is_admin && <span className="prototype-organizer-pages-admin-accounts-span-81">admin</span>}
                    {o.is_demo && <span className="prototype-organizer-pages-admin-report-card-span-41">demo</span>}
                  </span>
                </td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{when(o.created_at)}</td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{o.event_count}</td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{o.race_count}</td>
                <td className="prototype-organizer-pages-admin-accounts-th-68">
                  <span className="prototype-organizer-pages-admin-accounts-span-83">
                    {!o.email_verified && (
                      <Button variant="secondary" className="prototype-organizer-pages-admin-report-card-button-33" busy={busyId === o.id} onClick={() => verify(o)}>
                        <UserCheck size={13} /> Verify
                      </Button>
                    )}
                    {o.email !== session.email && (
                      <Button variant="danger" className="prototype-organizer-pages-admin-report-card-button-33" busy={busyId === o.id} onClick={() => remove(o)}>
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
      <p className="prototype-organizer-pages-admin-accounts-p-84">
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
  if (error) return <p className="prototype-organizer-pages-admin-course-preview-p-85">{error}</p>
  if (!course) return <p className="prototype-organizer-pages-admin-course-preview-p-86">Loading course…</p>
  return <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="prototype-organizer-pages-admin-course-preview-course-map-87" />
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
    <li className="prototype-organizer-pages-admin-admin-race-row-li-88">
      <div className="prototype-organizer-pages-admin-reports-div-57">
        <div className="prototype-organizer-pages-admin-report-card-div-38">
          <p className="prototype-organizer-pages-admin-admin-race-row-p-89">{race.course_name}</p>
          <p className="prototype-organizer-pages-admin-report-card-span-42">
            {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })} · {race.finisher_count ?? 0} scored ·{' '}
            {modelLabel(race.scoring_version)}
            {race.has_gpx ? ` · ${race.measurement_version ?? 'course attached'}` : ' · no course file'}
            {race.is_listed ? ' · listed' : ''}
          </p>
          {error && <p className="prototype-organizer-pages-admin-report-card-p-51">{error}</p>}
        </div>
        <div className="prototype-organizer-pages-admin-admin-race-row-div-90">
          <StatusChip status={status} />
          <Link to={`/races/${encodeURIComponent(race.race_id)}/review`} className="prototype-organizer-pages-admin-admin-race-row-link-91">
            Open
          </Link>
          {race.has_gpx && (
            <button type="button" onClick={() => setShowCourse((v) => !v)} className="prototype-organizer-pages-admin-admin-race-row-button-92">
              <Map size={12} /> {showCourse ? 'Hide course' : 'View course'}
            </button>
          )}
          {!race.is_published && (
            <Button variant="secondary" busy={busy} className="prototype-organizer-pages-admin-report-card-button-33" onClick={() => run(() => setRaceListed(race.race_id, !race.is_listed, token))}>
              {race.is_listed ? <EyeOff size={13} /> : <Eye size={13} />} {race.is_listed ? 'Unlist' : 'List publicly'}
            </Button>
          )}
          {race.is_listed && !race.is_published && (
            <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="prototype-organizer-pages-admin-admin-race-row-a-93">
              Public page <ArrowUpRight size={12} />
            </a>
          )}
          {race.is_published && (
            <>
              <a href={`../#races/${encodeURIComponent(race.race_id)}`} className="prototype-organizer-pages-admin-admin-race-row-a-93">
                Public page <ArrowUpRight size={12} />
              </a>
              <Button
                variant="secondary"
                busy={busy}
                className="prototype-organizer-pages-admin-report-card-button-33"
                onClick={() => run(() => unpublishRace(race.race_id, token), `Unpublish "${race.event_name} · ${race.course_name}"?`)}
              >
                <EyeOff size={13} /> Unpublish
              </Button>
            </>
          )}
          <Button
            variant="danger"
            busy={busy}
            className="prototype-organizer-pages-admin-report-card-button-33"
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
  if (!events) return <p className="prototype-organizer-pages-admin-overview-p-15">Loading…</p>
  const raceCount = events.reduce((n, e) => n + e.race_count, 0)
  // Thousands of events once listings are imported: search, and draw a screenful at a time.
  const needle = query.trim().toLowerCase()
  const matching = needle ? events.filter((e) => `${e.event_name} ${e.location ?? ''} ${e.country ?? ''} ${e.organizer_email ?? ''} ${e.event_date}`.toLowerCase().includes(needle)) : events
  const shownEvents = matching.slice(0, visible)
  const publishedCount = events.reduce((n, e) => n + e.published_count, 0)
  return (
    <div>
      {error && (
        <div className="prototype-organizer-pages-admin-accounts-div-64">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <p className="prototype-organizer-pages-admin-events-admin-p-94">
        {events.length} EVENT{events.length === 1 ? '' : 'S'} · {raceCount} RACE{raceCount === 1 ? '' : 'S'} · {publishedCount} PUBLISHED
      </p>
      <div className="prototype-organizer-pages-admin-events-admin-div-95">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisible(EVENTS_PER_PAGE) }}
          placeholder="Find an event: name, place, country, owner or date"
          aria-label="Find an event"
          className="prototype-organizer-pages-admin-events-admin-input-96"
        />
        <p className="prototype-organizer-pages-admin-report-card-span-42">
          {shownEvents.length} OF {matching.length} SHOWN
        </p>
      </div>
      <div className="prototype-organizer-pages-admin-events-admin-div-97">
        {shownEvents.map((event) => (
          <section key={event.event_id} className="prototype-organizer-pages-admin-key-values-section-5">
            <div className="prototype-organizer-pages-admin-events-admin-div-98">
              <div className="prototype-organizer-pages-admin-report-card-div-38">
                <p className="prototype-organizer-pages-admin-events-admin-p-99">{formatDate(event.event_date).toUpperCase()}</p>
                <h2 className="prototype-organizer-pages-admin-events-admin-h2-100">
                  <Link to={`/events/${encodeURIComponent(event.event_id)}`} className="prototype-organizer-pages-admin-report-card-a-45">
                    {event.event_name}
                  </Link>
                </h2>
              </div>
              <div className="prototype-organizer-pages-admin-events-admin-div-101">
                <p className="prototype-organizer-pages-admin-report-card-span-42">
                  {event.organizer_email ?? 'no owner'} · {event.published_count}/{event.race_count} published
                </p>
                <button type="button" onClick={() => removeEvent(event)} className="prototype-organizer-pages-admin-events-admin-button-102">
                  <Trash2 size={12} /> Delete event
                </button>
              </div>
            </div>
            <ul className="prototype-organizer-pages-admin-course-preview-course-map-87">
              {event.races.map((race) => (
                <AdminRaceRow key={race.race_id} race={race} token={session.token} onChanged={reload} />
              ))}
              {event.races.length === 0 && <li className="prototype-organizer-pages-admin-events-admin-li-103">No races yet.</li>}
            </ul>
          </section>
        ))}
      </div>
      {matching.length > shownEvents.length && (
        <div className="prototype-organizer-pages-admin-events-admin-div-104">
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
  if (!rows) return <p className="prototype-organizer-pages-admin-overview-p-15">Loading…</p>
  const total = rows.reduce((n, r) => n + (r.size_bytes ?? 0), 0)
  return (
    <div>
      {error && (
        <div className="prototype-organizer-pages-admin-accounts-div-64">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <p className="prototype-organizer-pages-admin-events-admin-p-94">
        {rows.length} SHARED COURSE{rows.length === 1 ? '' : 'S'} · {fmtBytes(total)} ON DISK (GZIP)
      </p>
      <div className="prototype-organizer-pages-admin-shared-courses-div-105">
        <table className="prototype-organizer-pages-admin-shared-courses-table-106">
          <thead>
            <tr className="prototype-organizer-pages-admin-accounts-tr-67">
              <th className="prototype-organizer-pages-admin-accounts-th-68">Name</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">File</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Shared</th>
              <th className="prototype-organizer-pages-admin-accounts-th-68">Size</th>
              <th className="prototype-organizer-pages-admin-accounts-th-69">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.share_id} className="prototype-organizer-pages-admin-accounts-tr-70">
                <td className="prototype-organizer-pages-admin-shared-courses-td-107">
                  {row.name ?? <span className="prototype-organizer-pages-admin-accounts-span-75">untitled</span>}
                  <span className="prototype-organizer-pages-admin-shared-courses-span-108">{row.share_id}</span>
                </td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{row.filename ?? '—'}</td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{when(row.created_at)}</td>
                <td className="prototype-organizer-pages-admin-accounts-td-82">{fmtBytes(row.size_bytes)}</td>
                <td className="prototype-organizer-pages-admin-accounts-th-68">
                  <span className="prototype-organizer-pages-admin-accounts-span-83">
                    <a href={`../#calculator?gpx=${encodeURIComponent(row.share_id)}${row.name ? `&name=${encodeURIComponent(row.name)}` : ''}`} className="prototype-organizer-pages-admin-shared-courses-a-109">
                      Open <ArrowUpRight size={12} />
                    </a>
                    <Button variant="danger" className="prototype-organizer-pages-admin-report-card-button-33" busy={busyId === row.share_id} onClick={() => remove(row)}>
                      <Trash2 size={13} /> Delete
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="prototype-organizer-pages-admin-shared-courses-td-110">
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

function Bar({ value, max, tone = 'blue' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = pct > 90 ? "otri-state-9" : pct > 75 ? "otri-state-10" : tone === 'blue' ? "otri-state-11" : "otri-state-12"
  return (
    <div className="prototype-organizer-pages-admin-bar-div-111" aria-hidden="true">
      <div className={`prototype-organizer-pages-admin-bar-div-112 ${color}`} style={{ width: `${pct}%` }} />
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
    <p className="prototype-organizer-pages-admin-overview-li-23">
      {what} not available on this host{reason ? ` (${reason})` : ''}.
    </p>
  )
}

function ServerTab({ session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getAdminServer(session.token).then(setData).catch((err) => setError(err.message))
  }, [session.token])
  if (error) return <Notice kind="error">{error}</Notice>
  if (!data) return <p className="prototype-organizer-pages-admin-overview-p-15">Reading the server…</p>
  const { host, storage, services, watchdog, backups, firewall, fail2ban, api_usage: usage, tls } = data
  const memUsed = host.memory_total != null && host.memory_available != null ? host.memory_total - host.memory_available : null
  const maxHour = usage?.per_hour ? Math.max(1, ...usage.per_hour) : 1
  const panel = "prototype-organizer-pages-admin-key-values-section-5"
  const label = "prototype-organizer-pages-admin-tile-p-2"

  return (
    <div className="prototype-organizer-pages-admin-overview-div-16">
      <p className="prototype-organizer-pages-admin-events-admin-p-94">
        {host.hostname?.toUpperCase()} · SNAPSHOT {when(data.generated_at)} · REFRESHED EVERY 30 S
      </p>

      <div className="prototype-organizer-pages-admin-server-tab-div-113">
        <div className={panel}>
          <p className={label}>CPU</p>
          <p className="prototype-organizer-pages-admin-tile-p-3">{host.cpu_percent != null ? `${host.cpu_percent}%` : '—'}</p>
          <p className="prototype-organizer-pages-admin-tile-p-4">
            {host.cpu_count ?? '?'} core{host.cpu_count === 1 ? '' : 's'} · load {host.load_1 ?? '—'} / {host.load_5 ?? '—'} / {host.load_15 ?? '—'}
          </p>
          {host.cpu_percent != null && <Bar value={host.cpu_percent} max={100} />}
        </div>
        <div className={panel}>
          <p className={label}>MEMORY</p>
          <p className="prototype-organizer-pages-admin-tile-p-3">{memUsed != null ? fmtBytes(memUsed) : '—'}</p>
          <p className="prototype-organizer-pages-admin-tile-p-4">of {fmtBytes(host.memory_total)} · swap {fmtBytes(host.swap_total)}</p>
          {memUsed != null && <Bar value={memUsed} max={host.memory_total} />}
        </div>
        <div className={panel}>
          <p className={label}>DISK</p>
          <p className="prototype-organizer-pages-admin-tile-p-3">{fmtBytes(storage.disk_used)}</p>
          <p className="prototype-organizer-pages-admin-tile-p-4">of {fmtBytes(storage.disk_total)} · {fmtBytes(storage.disk_free)} free</p>
          {storage.disk_total && <Bar value={storage.disk_used} max={storage.disk_total} />}
        </div>
        <div className={panel}>
          <p className={label}>UPTIME</p>
          <p className="prototype-organizer-pages-admin-tile-p-3">{uptime(host.uptime_seconds)}</p>
          <p className="prototype-organizer-pages-admin-tile-p-4">
            TLS {tls?.available ? `${tls.days_left} days left` : 'not checked'}
          </p>
        </div>
      </div>

      <div className="prototype-organizer-pages-admin-overview-div-18">
        <section className={panel}>
          <p className={`${label} prototype-organizer-pages-admin-report-card-div-54`}>
            <Activity size={13} className="prototype-organizer-pages-admin-key-values-icon-7" /> API USAGE · LAST {usage?.hours ?? 24} H
          </p>
          {usage?.available ? (
            <>
              <div className="prototype-organizer-pages-admin-server-tab-div-114">
                <div>
                  <p className={label}>REQUESTS</p>
                  <p className="prototype-organizer-pages-admin-server-tab-p-115">{usage.total.toLocaleString()}</p>
                </div>
                <div>
                  <p className={label}>CLIENTS</p>
                  <p className="prototype-organizer-pages-admin-server-tab-p-115">{usage.unique_ips}</p>
                </div>
                <div>
                  <p className={label}>5XX ERRORS</p>
                  <p className={`prototype-organizer-pages-admin-server-tab-p-116 ${usage.errors_5xx ? "prototype-organizer-pages-admin-key-values-dd-12" : "prototype-organizer-pages-admin-key-values-dd-14"}`}>{usage.errors_5xx}</p>
                </div>
              </div>
              <div className="prototype-organizer-pages-admin-server-tab-div-117" aria-label="Requests per hour">
                {usage.per_hour.map((n, i) => (
                  <div key={i} title={`${n} requests`} className="prototype-organizer-pages-admin-server-tab-div-118" style={{ height: `${Math.max(2, (n / maxHour) * 100)}%` }} />
                ))}
              </div>
              <p className="prototype-organizer-pages-admin-server-tab-p-119">
                <span>{usage.hours} h ago</span>
                <span>now</span>
              </p>
              <p className="prototype-organizer-pages-admin-server-tab-p-120">
                {Object.entries(usage.by_status)
                  .sort()
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ') || 'no requests'}
              </p>
              <div className="prototype-organizer-pages-admin-server-tab-div-121">
                <div>
                  <p className={label}>TOP ENDPOINTS</p>
                  <ul className="prototype-organizer-pages-admin-server-tab-ul-122">
                    {usage.top_paths.map((row) => (
                      <li key={row.path} className="prototype-organizer-pages-admin-server-tab-li-123">
                        <span className="prototype-organizer-pages-admin-server-tab-span-124">{row.path}</span>
                        <span className="prototype-organizer-pages-admin-key-values-dt-10">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={label}>TOP CLIENTS</p>
                  <ul className="prototype-organizer-pages-admin-server-tab-ul-122">
                    {usage.top_ips.map((row) => (
                      <li key={row.ip} className="prototype-organizer-pages-admin-server-tab-li-123">
                        <span className="prototype-organizer-pages-admin-key-values-dd-14">{row.ip}</span>
                        <span className="prototype-organizer-pages-admin-key-values-dt-10">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="prototype-organizer-pages-admin-server-tab-div-125">
              <Unavailable what="Request log" reason={usage?.reason} />
            </div>
          )}
        </section>

        <div className="prototype-organizer-pages-admin-server-tab-div-126">
          <section className={panel}>
            <p className={`${label} prototype-organizer-pages-admin-report-card-div-54`}>
              <ShieldCheck size={13} className="prototype-organizer-pages-admin-key-values-icon-7" /> FIREWALL & FAIL2BAN
            </p>
            {firewall?.available ? (
              <p className="prototype-organizer-pages-admin-server-tab-p-127">
                ufw <span className={firewall.active ? "prototype-organizer-pages-admin-server-tab-span-128" : "prototype-organizer-pages-admin-server-tab-span-129"}>{firewall.active ? 'active' : 'inactive'}</span>
                {firewall.rules?.length ? <span className="prototype-organizer-pages-admin-key-values-dt-10"> · {firewall.rules.length} rules</span> : null}
              </p>
            ) : (
              <div className="prototype-organizer-pages-admin-server-tab-div-125">
                <Unavailable what="Firewall status" />
              </div>
            )}
            {fail2ban?.available ? (
              <ul className="prototype-organizer-pages-admin-server-tab-ul-130">
                {fail2ban.jails.map((jail) => (
                  <li key={jail.name} className="prototype-organizer-pages-admin-server-tab-li-131">
                    <p className="prototype-organizer-pages-admin-server-tab-p-132">
                      <span className="prototype-organizer-pages-admin-server-tab-span-133">jail {jail.name}</span>
                      <span className="prototype-organizer-pages-admin-server-tab-span-134">
                        {jail.currently_banned} banned now · {jail.total_banned} total · {jail.total_failed} failed attempts
                      </span>
                    </p>
                    {jail.banned_ips.length > 0 && (
                      <p className="prototype-organizer-pages-admin-report-card-p-49">{jail.banned_ips.slice(0, 12).join(' · ')}{jail.banned_ips.length > 12 ? ' …' : ''}</p>
                    )}
                  </li>
                ))}
                {fail2ban.jails.length === 0 && <li className="prototype-organizer-pages-admin-server-tab-li-135">fail2ban is running with no jails.</li>}
              </ul>
            ) : (
              <div className="prototype-organizer-pages-admin-server-tab-div-125">
                <Unavailable what="fail2ban" reason={fail2ban?.reason} />
              </div>
            )}
          </section>

          <section className={panel}>
            <p className={`${label} prototype-organizer-pages-admin-report-card-div-54`}>
              <Server size={13} className="prototype-organizer-pages-admin-key-values-icon-7" /> SERVICES
            </p>
            {services?.available ? (
              <ul className="prototype-organizer-pages-admin-server-tab-ul-136">
                {Object.entries(services.units).map(([unit, state]) => (
                  <li key={unit} className="prototype-organizer-pages-admin-report-card-div-54">
                    <i className={`prototype-organizer-pages-admin-server-tab-i-137 ${state === 'active' ? "prototype-organizer-pages-admin-server-tab-i-138" : "prototype-organizer-pages-admin-server-tab-i-139"}`} />
                    {unit} <span className="prototype-organizer-pages-admin-accounts-span-75">{state}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="prototype-organizer-pages-admin-server-tab-div-125">
                <Unavailable what="Service status" />
              </div>
            )}
            {/* Both report by email or not at all: a missing email looks the same as one that never ran. */}
            <ul className="prototype-organizer-pages-admin-server-tab-ul-140">
              <li className="prototype-organizer-pages-admin-report-card-div-54">
                <i className={`prototype-organizer-pages-admin-server-tab-i-141 ${watchdog?.active && watchdog.last_result === 'success' ? "prototype-organizer-pages-admin-server-tab-i-138" : watchdog?.available ? "prototype-organizer-pages-admin-server-tab-i-139" : "prototype-organizer-pages-admin-server-tab-i-142"}`} />
                watchdog{' '}
                <span className="prototype-organizer-pages-admin-accounts-span-75">
                  {!watchdog?.available
                    ? 'unknown here'
                    : !watchdog.active
                      ? 'not running: install it with scripts/deploy/08-install-watchdog.sh'
                      : `last check ${watchdog.last_check ?? 'not yet'}${watchdog.last_result && watchdog.last_result !== 'success' ? ` (${watchdog.last_result})` : ''}`}
                </span>
              </li>
              <li className="prototype-organizer-pages-admin-report-card-div-54">
                <i className={`prototype-organizer-pages-admin-server-tab-i-141 ${backups?.ok ? "prototype-organizer-pages-admin-server-tab-i-138" : backups?.available ? "prototype-organizer-pages-admin-server-tab-i-139" : "prototype-organizer-pages-admin-server-tab-i-142"}`} />
                database backup{' '}
                <span className="prototype-organizer-pages-admin-accounts-span-75">
                  {!backups?.available
                    ? 'unknown here'
                    : !backups.newest
                      ? 'none yet: see scripts/deploy/04-backup-db.sh'
                      : `${backups.age_hours < 1 ? 'under an hour' : `${Math.round(backups.age_hours)} h`} old, ${fmtBytes(backups.bytes)}, ${backups.count} kept${backups.ok ? '' : ': the nightly run is failing, look at ~/otri-backup.log'}`}
                </span>
              </li>
            </ul>
          </section>

          <section className={panel}>
            <p className={`${label} prototype-organizer-pages-admin-report-card-div-54`}>
              <HardDrive size={13} className="prototype-organizer-pages-admin-key-values-icon-7" /> STORAGE
            </p>
            <ul className="prototype-organizer-pages-admin-server-tab-ul-143">
              <li className="prototype-organizer-pages-admin-server-tab-li-144">
                <span>database</span>
                <span className="prototype-organizer-pages-admin-key-values-dt-10">{fmtBytes(storage.database_bytes)}</span>
              </li>
              {Object.entries(storage.dirs ?? {}).map(([name, info]) => (
                <li key={name} className="prototype-organizer-pages-admin-server-tab-li-145">
                  <span className="prototype-organizer-pages-admin-server-tab-span-146" title={info.path ?? ''}>
                    {name.replace('_', ' ')}
                  </span>
                  <span className="prototype-organizer-pages-admin-overview-span-28">{info.bytes == null ? '—' : fmtBytes(info.bytes)}</span>
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
      <nav className="prototype-organizer-pages-admin-admin-events-nav-147">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`prototype-organizer-pages-admin-admin-events-button-148 ${active === id ? "prototype-organizer-pages-admin-admin-events-button-149" : "prototype-organizer-pages-admin-admin-events-button-150"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="prototype-organizer-pages-admin-admin-events-div-151">
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
