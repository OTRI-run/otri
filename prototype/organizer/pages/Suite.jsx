// The race suite for organizers: plan the course, take the field, print bibs, run the day, hand the
// times to scoring. Admin preview: main.jsx shows these pages to admins only for now.
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Download,
  Flag,
  Globe,
  KeyRound,
  MapPin,
  Play,
  Plug,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users,
} from 'lucide-react'
import {
  addSuiteCheckpoint,
  addSuiteParticipant,
  addSuitePassing,
  assignSuiteBibs,
  deleteSuiteCheckpoint,
  deleteSuiteParticipant,
  fetchSuitePassingsCsv,
  fetchSuiteResultsCsv,
  finishSuiteRace,
  getRacePluginLog,
  getSuiteAudit,
  getSuiteBoard,
  getSuiteProfile,
  getSuiteRace,
  getSuiteReadiness,
  importSuiteParticipants,
  listRacePlugins,
  listSuiteCheckpoints,
  listSuiteParticipants,
  listSuitePlugins,
  listSuiteRaces,
  reopenSuiteRace,
  reorderSuiteCheckpoints,
  resetSuiteRace,
  rotateStationKey,
  setRacePlugin,
  startSuiteRace,
  submitSuiteResults,
  suggestSuiteCheckpoints,
  updateSuiteCheckpoint,
  updateSuiteParticipant,
  updateSuiteSettings,
} from '../../apiClient'
import { Link, navigate, useRoute } from '../router'
import { Button, Card, ChecklistRow, EmptyState, Eyebrow, Field, Gradient, Notice, Page, formatDate, inputClass } from '../ui'
import { clock, hms } from './Station'
import { ProfileChart, cutoffClock } from './Public'
import { cleanBib, cleanBirthYear, cleanEmail, cleanKm, cleanMinutes, cleanName, cleanNationality } from '../../../src/lib/suiteFields'

const TABS = [
  ['overview', 'Overview'],
  ['plan', 'Course plan'],
  ['field', 'Runners & bibs'],
  ['day', 'Race day'],
  ['plugins', 'Plugins'],
  ['results', 'Results'],
]

// What a check needs from the organizer, by weight.
const LEVEL = {
  blocker: { label: 'Must fix', cls: 'text-red-700', dot: 'bg-red-500', Icon: AlertCircle },
  warning: { label: 'Look at', cls: 'text-amber-700', dot: 'bg-amber-500', Icon: AlertTriangle },
  info: { label: 'Note', cls: 'text-slate-500', dot: 'bg-slate-400', Icon: AlertCircle },
}

function worstFor(readiness, tab) {
  const open = (readiness?.checks ?? []).filter((c) => !c.ok && c.tab === tab)
  if (open.some((c) => c.level === 'blocker')) return 'blocker'
  if (open.some((c) => c.level === 'warning')) return 'warning'
  return null
}

/** A form value that is cleaned when the field is left, with the correction said beside it. */
function useCleaned(setForm) {
  const [notes, setNotes] = useState({})
  const clean = (key, cleaner) => (event) => {
    const { value, note } = cleaner(event.target.value)
    setForm((f) => ({ ...f, [key]: value }))
    setNotes((n) => ({ ...n, [key]: note }))
  }
  const reset = () => setNotes({})
  return [notes, clean, reset]
}

function Corrected({ note }) {
  return note ? <span className="text-amber-700">{note}</span> : undefined
}

const KIND_LABEL = { start: 'Start', checkpoint: 'Checkpoint', aid: 'Aid station', finish: 'Finish' }
const STATUS_LABEL = { planning: 'Planning', live: 'Live', finished: 'Finished' }
const P_STATUS = { registered: 'Registered', dns: 'DNS', started: 'On course', finished: 'Finished', dnf: 'DNF', dsq: 'DSQ' }
const P_STATUS_CLASS = {
  registered: 'bg-slate-100 text-slate-600',
  dns: 'bg-slate-100 text-slate-500',
  started: 'bg-blue-50 text-blue-700',
  finished: 'bg-emerald-50 text-emerald-700',
  dnf: 'bg-amber-50 text-amber-700',
  dsq: 'bg-red-50 text-red-700',
}

/** A link into this app, absolute: what goes in a QR code or is copied for a volunteer. */
function appUrl(hashPath) {
  return `${window.location.origin}${window.location.pathname}#${hashPath}`
}

function minutesLabel(minutes) {
  if (minutes == null) return '—'
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function Chip({ children, className = '' }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${className}`}>{children}</span>
}

function RaceStatusChip({ status }) {
  const cls = status === 'live' ? 'bg-emerald-600 text-white' : status === 'finished' ? 'bg-[#0b1220] text-white' : 'bg-slate-100 text-slate-600'
  return <Chip className={cls}>{STATUS_LABEL[status] ?? status}</Chip>
}

function useAsync(loader, deps) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const reload = useCallback(() => loader().then(setData).catch((err) => setError(err.message)), deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload()
  }, [reload])
  return [data, error, reload, setData]
}

function CopyButton({ text, label = 'Copy link' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'Copied' : label}
    </button>
  )
}

function QrImage({ text, size = 160, className = '' }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(null))
  }, [text, size])
  return src ? <img src={src} width={size} height={size} alt="" className={className} /> : <span style={{ width: size, height: size }} className="inline-block bg-slate-100" />
}

// ------------------------------------------------------------------------------------------ home

export function SuiteHome() {
  const [races, error] = useAsync(listSuiteRaces, [])
  return (
    <Page
      eyebrow="RACE SUITE · ADMIN PREVIEW"
      headline={
        <>
          Run the whole
          <br />
          <Gradient>race day.</Gradient>
        </>
      }
      intro="Plan the checkpoints and aid stations, take the entry list, print bibs with a QR code, scan runners through every station on any phone, and hand the finish times to scoring. Free, and every part optional."
    >
      {error && (
        <div className="mt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>YOUR RACES</Eyebrow>
          <p className="mt-1 text-sm text-slate-500">
            The suite works on a race you already have. <Link to="/events" className="font-semibold text-blue-600">Create the event and its race</Link> first if it is not here.
          </p>
        </div>
      </div>
      {races?.length === 0 && (
        <div className="mt-5">
          <EmptyState title="No races yet" action={<Button onClick={() => navigate('/events/new')}>Create an event <ArrowRight size={15} /></Button>}>
            Add an event with a race distance under Your events; it appears here.
          </EmptyState>
        </div>
      )}
      {races?.length > 0 && (
        <div className="mt-5 grid gap-3">
          {races.map((race) => (
            <Link key={race.race_id} to={`/suite/${encodeURIComponent(race.race_id)}`} className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300">
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">
                  {race.event_name.toUpperCase()} · {formatDate(race.event_date).toUpperCase()}
                </p>
                <p className="mt-1 text-lg font-bold tracking-[-.02em] text-[#0b1220]">{race.course_name}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Users size={12} /> {race.participants}</span>
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> {race.checkpoints}</span>
                <RaceStatusChip status={race.status} />
                <span className="inline-flex items-center gap-1 font-semibold text-blue-600 transition group-hover:gap-2">Open <ArrowRight size={13} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  )
}

// ------------------------------------------------------------------------------------------ race

export function SuiteRace({ raceId }) {
  const route = useRoute()
  const tab = TABS.some(([key]) => key === route.query.tab) ? route.query.tab : 'overview'
  const [race, error, reloadRace] = useAsync(() => getSuiteRace(raceId), [raceId])
  const [readiness, , reloadReadiness] = useAsync(() => getSuiteReadiness(raceId).catch(() => null), [raceId, tab])
  const base = `/suite/${encodeURIComponent(raceId)}`
  const reload = () => {
    reloadRace()
    reloadReadiness()
  }

  if (error && !race) {
    return (
      <Page back={{ to: '/suite', label: 'Race suite' }} title="Race">
        <div className="mt-4"><Notice kind="error">{error}</Notice></div>
      </Page>
    )
  }
  if (!race) return <Page back={{ to: '/suite', label: 'Race suite' }} title="Loading…" />

  return (
    <Page back={{ to: '/suite', label: 'Race suite' }} eyebrow={`RACE SUITE · ${race.event_name.toUpperCase()} · ${formatDate(race.event_date).toUpperCase()}`} title={race.course_name}>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <RaceStatusChip status={race.status} />
        {race.started_at && <span>Gun {clock(race.started_at)}</span>}
        <span>{race.participants} runner{race.participants === 1 ? '' : 's'}</span>
        <span>{race.checkpoints} checkpoint{race.checkpoints === 1 ? '' : 's'}</span>
        <Link to={`/races/${encodeURIComponent(raceId)}/course`} className="font-semibold text-blue-600">Race page setup →</Link>
      </div>
      <nav className="mt-8 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Suite sections">
        {TABS.map(([key, label], index) => {
          const worst = worstFor(readiness, key)
          return (
            <Link key={key} to={`${base}?tab=${key}`} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] no-underline ${tab === key ? 'border-blue-600 font-bold text-[#0b1220]' : 'border-transparent font-medium text-slate-500 hover:text-[#0b1220]'}`} aria-current={tab === key ? 'page' : undefined}>
              <span className="font-mono text-[10px] text-slate-400">{index + 1}</span>
              {label}
              {worst && <i className={`h-1.5 w-1.5 rounded-full ${LEVEL[worst].dot}`} title={LEVEL[worst].label} />}
            </Link>
          )
        })}
      </nav>
      {readiness && readiness.blockers > 0 && tab !== 'overview' && (
        <p className="mt-3 text-xs text-red-700">
          {readiness.blockers} thing{readiness.blockers === 1 ? '' : 's'} must be fixed before the gun. <Link to={`${base}?tab=overview`} className="font-semibold underline">See the checklist</Link>
        </p>
      )}
      <div className="mt-8">
        {tab === 'overview' && <Overview race={race} readiness={readiness} reload={reload} />}
        {tab === 'field' && <FieldTab race={race} reloadRace={reload} />}
        {tab === 'plan' && <PlanTab race={race} reloadRace={reload} />}
        {tab === 'day' && <DayTab race={race} reloadRace={reload} />}
        {tab === 'plugins' && <PluginsTab race={race} />}
        {tab === 'results' && <ResultsTab race={race} />}
      </div>
    </Page>
  )
}

// -------------------------------------------------------------------------------------- overview

function ReadinessList({ readiness, base }) {
  if (!readiness) return <p className="mt-3 text-sm text-slate-500">Checking…</p>
  const checks = readiness.checks
  const open = checks.filter((c) => !c.ok)
  const done = checks.filter((c) => c.ok)
  return (
    <>
      <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[.06em] ${readiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        <ShieldCheck size={11} /> {readiness.ready ? (readiness.warnings ? `READY · ${readiness.warnings} TO LOOK AT` : 'READY FOR THE GUN') : `${readiness.blockers} MUST FIX`}
      </p>
      <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
        {[...open, ...done].map((c) => {
          const level = LEVEL[c.level] ?? LEVEL.info
          return (
            <li key={c.key} className="flex items-start gap-3 py-3">
              {c.ok ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <level.Icon size={16} className={`mt-0.5 shrink-0 ${level.cls}`} aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0b1220]">
                  <span className="sr-only">{c.ok ? 'Done: ' : `${level.label}: `}</span>
                  {c.label}
                  {!c.ok && <span className={`ml-2 font-mono text-[9px] uppercase tracking-[.08em] ${level.cls}`}>{level.label}</span>}
                </p>
                {c.detail && <p className="text-xs text-slate-500">{c.detail}</p>}
              </div>
              {!c.ok && c.tab && <Link to={`${base}?tab=${c.tab}`} className="text-xs font-semibold text-blue-600 no-underline hover:underline">Fix →</Link>}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Overview({ race, readiness, reload }) {
  const raceId = race.race_id
  const [form, setForm] = useState(race.settings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const base = `/suite/${encodeURIComponent(raceId)}`

  async function save(event) {
    event.preventDefault()
    setError(null)
    try {
      await updateSuiteSettings(raceId, { ...form, organizer_phone: form.organizer_phone || null, bib_note: form.bib_note || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
      <div>
        <Eyebrow as="h2">READY FOR RACE DAY?</Eyebrow>
        <ReadinessList readiness={readiness} base={base} />
        <div className="mt-8 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-5 text-sm leading-6 text-slate-700">
          <p className="font-bold text-[#0b1220]">How a race runs in the suite</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Plan the checkpoints: where they are, what they serve, the cut-off at each. Let the course suggest them.</li>
            <li>Paste the entry list, check the preview, assign bib numbers, print the bibs. Each bib carries a QR code.</li>
            <li>Give each checkpoint its station link (or QR). Any phone opens it, no account needed; it keeps working without signal.</li>
            <li>Press Start when the field goes. Stations scan bibs or type numbers; the board shows who is where and who is overdue.</li>
            <li>Finish the race, check the list, send it to OTRI scoring. Publish the race page when you are ready.</li>
          </ol>
        </div>
      </div>
      <Card>
        <Eyebrow as="h2">SETTINGS</Eyebrow>
        <form onSubmit={save} className="mt-4 grid gap-4">
          <Field label="Timing" hint="Gun: every time counts from the start signal. Net: from the runner's own start-line scan when there is one.">
            <select value={form.timing} onChange={(e) => setForm((f) => ({ ...f, timing: e.target.value }))} className={inputClass}>
              <option value="gun">Gun time</option>
              <option value="net">Net time (start-line scan)</option>
            </select>
          </Field>
          <Field label="Organizer phone" hint="Printed on every bib: whom to call if a runner is found alone." htmlFor="st-phone">
            <input id="st-phone" value={form.organizer_phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, organizer_phone: e.target.value }))} className={inputClass} placeholder="+66 81 234 5678" />
          </Field>
          <Field label="Line on the bib" hint="Optional, e.g. the emergency number or a sponsor line." htmlFor="st-note">
            <input id="st-note" value={form.bib_note ?? ''} onChange={(e) => setForm((f) => ({ ...f, bib_note: e.target.value }))} className={inputClass} maxLength={120} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.bib_show_name} onChange={(e) => setForm((f) => ({ ...f, bib_show_name: e.target.checked }))} /> Print the runner's first name on the bib
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Laps" hint="1 for point to point or one loop." htmlFor="st-laps">
              <input id="st-laps" inputMode="numeric" value={form.laps ?? 1} onChange={(e) => setForm((f) => ({ ...f, laps: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))} className={inputClass} />
            </Field>
            <Field label="Planned start" hint="Prints cut-offs as clock times." htmlFor="st-start">
              <input id="st-start" type="time" value={form.planned_start ?? ''} onChange={(e) => setForm((f) => ({ ...f, planned_start: e.target.value || null }))} className={inputClass} />
            </Field>
            <Field label="Bib colour" hint="The band on the bib." htmlFor="st-accent">
              <input id="st-accent" type="color" value={form.bib_accent ?? '#0b1220'} onChange={(e) => setForm((f) => ({ ...f, bib_accent: e.target.value }))} className={`${inputClass} h-11 p-1`} />
            </Field>
          </div>

          <div className="mt-2 border-t border-slate-200 pt-4">
            <Eyebrow as="h3" className="flex items-center gap-1.5"><Globe size={11} /> PUBLIC PAGES</Eyebrow>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.live_public} onChange={(e) => setForm((f) => ({ ...f, live_public: e.target.checked }))} /> Live page for spectators
            </label>
            {race.settings.live_public && (
              <p className="mt-1 flex flex-wrap items-center gap-3 pl-6 text-xs text-slate-500">
                <a href={appUrl(`/live/${race.race_id}`)} target="_blank" rel="noreferrer" className="font-semibold text-blue-600">Open live page ↗</a>
                <CopyButton text={appUrl(`/live/${race.race_id}`)} />
              </p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.registration_open} onChange={(e) => setForm((f) => ({ ...f, registration_open: e.target.checked }))} /> Registration open
            </label>
            {race.settings.registration_open && (
              <p className="mt-1 flex flex-wrap items-center gap-3 pl-6 text-xs text-slate-500">
                <a href={appUrl(`/register/${race.race_id}`)} target="_blank" rel="noreferrer" className="font-semibold text-blue-600">Open registration page ↗</a>
                <CopyButton text={appUrl(`/register/${race.race_id}`)} />
              </p>
            )}
            {form.registration_open && (
              <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Places" hint="Empty for no limit." htmlFor="st-limit">
                    <input id="st-limit" inputMode="numeric" value={form.registration_limit ?? ''} onChange={(e) => setForm((f) => ({ ...f, registration_limit: e.target.value ? Number(e.target.value) : null }))} className={inputClass} placeholder="200" />
                  </Field>
                  <Field label="Fee" hint="As text; empty for a free race." htmlFor="st-fee">
                    <input id="st-fee" value={form.fee_text ?? ''} onChange={(e) => setForm((f) => ({ ...f, fee_text: e.target.value || null }))} className={inputClass} placeholder="500 THB" />
                  </Field>
                </div>
                <Field label="Payment link" hint="Your own Stripe payment link, PayPal.me or PromptPay page. A Stripe link gets the runner's reference attached, so your dashboard shows who paid." htmlFor="st-pay">
                  <input id="st-pay" type="url" value={form.payment_url ?? ''} onChange={(e) => setForm((f) => ({ ...f, payment_url: e.target.value || null }))} className={inputClass} placeholder="https://buy.stripe.com/…" />
                </Field>
                <Field label="Payment instructions" hint="Bank transfer details, or when to pay in cash. Shown after registering, with the runner's reference." htmlFor="st-payi">
                  <textarea id="st-payi" rows={2} value={form.payment_instructions ?? ''} onChange={(e) => setForm((f) => ({ ...f, payment_instructions: e.target.value || null }))} className={inputClass} />
                </Field>
                <Field label="Note on the form" hint="Rules, what is included, mandatory kit." htmlFor="st-note2">
                  <textarea id="st-note2" rows={2} value={form.registration_note ?? ''} onChange={(e) => setForm((f) => ({ ...f, registration_note: e.target.value || null }))} className={inputClass} />
                </Field>
                <div className="flex flex-wrap gap-4 text-xs">
                  {[['ask_club', 'Ask for club'], ['ask_birth_year', 'Ask for year of birth'], ['ask_nationality', 'Ask for nationality'], ['ask_email', 'Ask for email'], ['require_emergency', 'Emergency contact required']].map(([k, v]) => (
                    <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(form[k])} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} /> {v}</label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit">{saved ? <><Check size={15} /> Saved</> : 'Save settings'}</Button>
        </form>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------------------------------- field

const EMPTY_PERSON = { bib: '', family_name: '', first_name: '', gender: 'X', birth_year: '', nationality: '', club: '', emergency_contact: '' }

function FieldTab({ race, reloadRace }) {
  const raceId = race.race_id
  const [people, error, reload] = useAsync(() => listSuiteParticipants(raceId), [raceId])
  const [form, setForm] = useState(EMPTY_PERSON)
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importText, setImportText] = useState('')
  const [replace, setReplace] = useState(false)
  const [imported, setImported] = useState(null)
  const [preview, setPreview] = useState(null)
  const [notes, clean, resetNotes] = useCleaned(setForm)
  const [bibs, setBibs] = useState({ start: 1, prefix: '', only_missing: true })
  const [filter, setFilter] = useState('')

  function refresh() {
    reload()
    reloadRace()
  }

  async function submit(event) {
    event.preventDefault()
    setFormError(null)
    setBusy(true)
    const payload = {
      ...form,
      bib: form.bib.trim() || null,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      nationality: form.nationality.trim() || null,
      club: form.club.trim() || null,
      emergency_contact: form.emergency_contact.trim() || null,
    }
    try {
      if (editing) await updateSuiteParticipant(editing, { ...payload, clear_bib: !payload.bib, clear_birth_year: !payload.birth_year })
      else await addSuiteParticipant(raceId, payload)
      setForm(EMPTY_PERSON)
      setEditing(null)
      refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Two presses: first the sheet is read and shown as it would be stored, then it is added.
  async function doPreview(event) {
    event.preventDefault()
    setBusy(true)
    setImported(null)
    setPreview(null)
    try {
      setPreview(await importSuiteParticipants(raceId, importText, { replace, dryRun: true }))
    } catch (err) {
      setImported({ error: err.message })
    } finally {
      setBusy(false)
    }
  }
  async function doImport() {
    setBusy(true)
    try {
      if (replace && !window.confirm('Replace the whole entry list? Passings recorded for the current runners are deleted with them.')) return
      const result = await importSuiteParticipants(raceId, importText, { replace })
      setImported(result)
      setPreview(null)
      if (result.added) setImportText('')
      refresh()
    } catch (err) {
      setImported({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function doAssign(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (!bibs.only_missing && !window.confirm('Renumber everyone? Bibs already printed will no longer match.')) return
      await assignSuiteBibs(raceId, { start: Number(bibs.start) || 1, prefix: bibs.prefix, only_missing: bibs.only_missing })
      refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(person, status) {
    try {
      await updateSuiteParticipant(person.participant_id, { status })
      refresh()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function remove(person) {
    if (!window.confirm(`Remove ${person.first_name} ${person.family_name} from the list? Their passings go too.`)) return
    await deleteSuiteParticipant(person.participant_id)
    refresh()
  }

  function edit(person) {
    setEditing(person.participant_id)
    setForm({ bib: person.bib ?? '', family_name: person.family_name, first_name: person.first_name, gender: person.gender, birth_year: person.birth_year ?? '', nationality: person.nationality ?? '', club: person.club ?? '', emergency_contact: person.emergency_contact ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q || !people) return people ?? []
    return people.filter((p) => `${p.bib ?? ''} ${p.first_name} ${p.family_name} ${p.club ?? ''}`.toLowerCase().includes(q))
  }, [people, filter])

  return (
    <div className="grid gap-8">
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <Eyebrow as="h2">PASTE THE ENTRY LIST</Eyebrow>
          <form onSubmit={doPreview} className="mt-3 grid gap-3">
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setPreview(null)
              }}
              rows={6}
              className={`${inputClass} font-mono text-xs`}
              placeholder={'Bib,Last name,First name,Gender,Year of birth,Club\n12,Doe,Jane,F,1990,Trail Club\n7,Smith,John,M,1985,'}
              aria-label="Entry list as CSV"
            />
            <p className="text-xs leading-5 text-slate-500">Copy the cells from your spreadsheet (registration export, Google Form answers). The first row names the columns; Last name or Name is the only one needed. Columns OTRI does not know are left alone and listed.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant={preview ? 'secondary' : 'primary'} busy={busy} disabled={!importText.trim()}>{preview ? 'Read it again' : 'Read the list'}</Button>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={replace} onChange={(e) => { setReplace(e.target.checked); setPreview(null) }} /> Replace the current list</label>
            </div>
            {imported?.error && <Notice kind="error">{imported.error}</Notice>}
            {preview && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-[#0b1220]">
                  {preview.total_rows} runner{preview.total_rows === 1 ? '' : 's'} read{preview.skipped.length ? `, ${preview.skipped.length} row${preview.skipped.length === 1 ? '' : 's'} skipped` : ''}{preview.corrections.length ? `, ${preview.corrections.length} correction${preview.corrections.length === 1 ? '' : 's'}` : ''}
                </p>
                {Object.keys(preview.columns).length > 0 && <p className="mt-1 text-xs text-slate-500">Read: {Object.entries(preview.columns).map(([f, h]) => `${h} → ${f.replace('_', ' ')}`).join(', ')}.{preview.ignored_columns.length > 0 && ` Left alone: ${preview.ignored_columns.join(', ')}.`}</p>}
                {preview.total_rows > 0 && (
                  <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="text-left font-mono text-[9px] tracking-[.06em] text-slate-500"><tr><th className="px-2 py-1.5">ROW</th><th className="px-2 py-1.5">BIB</th><th className="px-2 py-1.5">NAME</th><th className="px-2 py-1.5">G</th><th className="px-2 py-1.5">BORN</th><th className="px-2 py-1.5">NAT</th><th className="px-2 py-1.5">CLUB</th><th className="px-2 py-1.5" /></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.rows.map((r) => (
                          <tr key={r.row} className={r._problems?.length ? 'bg-red-50' : ''}>
                            <td className="px-2 py-1 font-mono text-slate-400">{r.row}</td>
                            <td className="px-2 py-1 font-mono font-bold">{r.bib ?? <span className="font-normal text-amber-600">—</span>}</td>
                            <td className="px-2 py-1">{r.first_name} <strong>{r.family_name}</strong></td>
                            <td className="px-2 py-1 font-mono">{r.gender}</td>
                            <td className="px-2 py-1 font-mono">{r.birth_year ?? ''}</td>
                            <td className="px-2 py-1 font-mono">{r.nationality ?? ''}</td>
                            <td className="px-2 py-1 text-slate-600">{r.club ?? ''}</td>
                            <td className="px-2 py-1 text-red-700">{r._problems?.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview.corrections.length > 0 && (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold text-amber-700">What was corrected ({preview.corrections.length})</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{preview.corrections.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </details>
                )}
                {preview.skipped.length > 0 && (
                  <details className="mt-2 text-xs text-slate-600" open>
                    <summary className="cursor-pointer font-semibold text-red-700">Skipped ({preview.skipped.length})</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{preview.skipped.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </details>
                )}
                {preview.rows.some((r) => r._problems?.length > 0) && <p className="mt-2 text-xs text-red-700">Rows in red clash with the current list and will be skipped.</p>}
                <div className="mt-3">
                  <Button type="button" busy={busy} disabled={preview.total_rows === 0} onClick={doImport}>
                    {replace ? `Replace the list with these ${preview.total_rows}` : `Add ${preview.rows.filter((r) => !r._problems?.length).length} runner${preview.rows.filter((r) => !r._problems?.length).length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
            )}
            {imported && !imported.error && (
              <Notice kind={imported.added ? 'success' : 'warning'} title={`${imported.added} runner${imported.added === 1 ? '' : 's'} added`}>
                {Object.keys(imported.columns).length > 0 && <span className="block">Read: {Object.entries(imported.columns).map(([f, h]) => `${h} → ${f.replace('_', ' ')}`).join(', ')}.</span>}
                {imported.ignored_columns.length > 0 && <span className="block">Left alone: {imported.ignored_columns.join(', ')}.</span>}
                {imported.skipped.length > 0 && <span className="block">Skipped: {imported.skipped.slice(0, 5).join('; ')}{imported.skipped.length > 5 ? ` and ${imported.skipped.length - 5} more` : ''}.</span>}
              </Notice>
            )}
          </form>
        </Card>
        <div className="grid gap-6">
          <Card>
            <Eyebrow as="h2">{editing ? 'EDIT RUNNER' : 'ADD ONE RUNNER'}</Eyebrow>
            <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2" noValidate>
              <Field label="Bib" hint={<Corrected note={notes.bib} />} htmlFor="p-bib"><input id="p-bib" value={form.bib} onChange={(e) => setForm((f) => ({ ...f, bib: e.target.value }))} onBlur={clean('bib', cleanBib)} className={inputClass} /></Field>
              <Field label="Gender" htmlFor="p-gender">
                <select id="p-gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className={inputClass}>
                  <option value="F">F</option><option value="M">M</option><option value="X">X / not given</option>
                </select>
              </Field>
              <Field label="First name" hint={<Corrected note={notes.first_name} />} htmlFor="p-first"><input id="p-first" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} onBlur={clean('first_name', cleanName)} className={inputClass} /></Field>
              <Field label="Last name" hint={<Corrected note={notes.family_name} />} htmlFor="p-last"><input id="p-last" required value={form.family_name} onChange={(e) => setForm((f) => ({ ...f, family_name: e.target.value }))} onBlur={clean('family_name', cleanName)} className={inputClass} /></Field>
              <Field label="Year of birth" hint={<Corrected note={notes.birth_year} /> ?? 'A year or a full date.'} htmlFor="p-yob"><input id="p-yob" inputMode="numeric" value={form.birth_year} onChange={(e) => setForm((f) => ({ ...f, birth_year: e.target.value }))} onBlur={clean('birth_year', cleanBirthYear)} className={inputClass} placeholder="1990" /></Field>
              <Field label="Nationality" hint={<Corrected note={notes.nationality} /> ?? 'A code or a country name.'} htmlFor="p-nat"><input id="p-nat" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} onBlur={clean('nationality', cleanNationality)} className={inputClass} placeholder="THA or Thailand" /></Field>
              <Field label="Club" htmlFor="p-club"><input id="p-club" value={form.club} onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))} className={inputClass} /></Field>
              <Field label="Emergency contact" hint="Stays private; never exported." htmlFor="p-ice"><input id="p-ice" value={form.emergency_contact} onChange={(e) => setForm((f) => ({ ...f, emergency_contact: e.target.value }))} className={inputClass} /></Field>
              {formError && <div className="sm:col-span-2"><Notice kind="error">{formError}</Notice></div>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" busy={busy} disabled={!form.family_name.trim()}>{editing ? 'Save runner' : 'Add runner'}</Button>
                {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm(EMPTY_PERSON); resetNotes() }}>Cancel</Button>}
              </div>
            </form>
          </Card>
          <Card>
            <Eyebrow as="h2">BIB NUMBERS</Eyebrow>
            <form onSubmit={doAssign} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="From" htmlFor="b-start"><input id="b-start" inputMode="numeric" value={bibs.start} onChange={(e) => setBibs((b) => ({ ...b, start: e.target.value }))} className={`${inputClass} w-24`} /></Field>
              <Field label="Prefix" htmlFor="b-prefix"><input id="b-prefix" value={bibs.prefix} onChange={(e) => setBibs((b) => ({ ...b, prefix: e.target.value }))} className={`${inputClass} w-20`} maxLength={4} placeholder="—" /></Field>
              <label className="flex items-center gap-2 pb-3 text-xs text-slate-600"><input type="checkbox" checked={bibs.only_missing} onChange={(e) => setBibs((b) => ({ ...b, only_missing: e.target.checked }))} /> Only runners without one</label>
              <Button type="submit" variant="secondary" busy={busy} disabled={!people?.length}>Assign numbers</Button>
              <Link to={`/suite/${encodeURIComponent(raceId)}/bibs`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white no-underline shadow-[0_10px_28px_rgba(37,99,235,.2)]"><Printer size={15} /> Print bibs</Link>
            </form>
            <p className="mt-2 text-xs leading-5 text-slate-500">In last-name order, skipping numbers already given. Two bibs on an A4 sheet, each with the runner's QR code; print on paper or Tyvek, or take the PDF to a copy shop.</p>
          </Card>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow as="h2">THE LIST</Eyebrow>
            <p className="mt-1 text-sm text-slate-500">{people ? `${people.length} runner${people.length === 1 ? '' : 's'}` : 'Loading…'}</p>
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a bib, name or club" aria-label="Find a runner" className={`${inputClass} w-64`} />
        </div>
        {people?.length === 0 && <div className="mt-4"><EmptyState title="No runners yet">Paste your entry list above, or add runners one by one.</EmptyState></div>}
        {shown.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] tracking-[.06em] text-slate-500">
                <tr><th className="px-4 py-3">BIB</th><th className="px-3 py-3">NAME</th><th className="px-3 py-3">G</th><th className="px-3 py-3">BORN</th><th className="px-3 py-3">CLUB</th><th className="px-3 py-3">STATUS</th><th className="px-3 py-3">FEE</th><th className="px-3 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => (
                  <tr key={p.participant_id}>
                    <td className="px-4 py-2 font-mono font-bold">{p.bib ?? <span className="font-normal text-amber-600">—</span>}</td>
                    <td className="px-3 py-2">
                      {p.first_name} <strong>{p.family_name}</strong>
                      {p.registered_via === 'public' && <span className="ml-1 rounded bg-blue-50 px-1 font-mono text-[9px] tracking-[.06em] text-blue-700" title="Registered on the public form">WEB</span>}
                      {(p.emergency_contact || p.email) && <span className="block font-mono text-[10px] text-slate-400">{[p.email, p.emergency_contact && `ICE ${p.emergency_contact}`].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.gender}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.birth_year ?? ''}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{p.club ?? ''}</td>
                    <td className="px-3 py-2">
                      <select value={p.status} onChange={(e) => setStatus(p, e.target.value)} aria-label={`Status of ${p.first_name} ${p.family_name}`} className={`rounded-full border-0 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${P_STATUS_CLASS[p.status]}`}>
                        {Object.entries(P_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={p.payment_status} onChange={(e) => updateSuiteParticipant(p.participant_id, { payment_status: e.target.value }).then(refresh).catch((err) => setFormError(err.message))} aria-label={`Fee of ${p.first_name} ${p.family_name}`} className={`rounded-full border-0 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${p.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : p.payment_status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        <option value="not_required">no fee</option><option value="pending">pending</option><option value="paid">paid</option><option value="waived">waived</option><option value="refunded">refunded</option>
                      </select>
                      {p.payment_reference && <span className="ml-1 font-mono text-[10px] text-slate-400">{p.payment_reference}</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => edit(p)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => remove(p)} className="ml-3 text-xs font-semibold text-red-600 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------ plan

const EMPTY_CP = { name: '', kind: 'aid', distance_km: '', cutoff_minutes: '', water: true, food: false, medical: false, drop_bag: false, crew_access: false, supplies: '', notes: '' }

function CheckpointForm({ initial, onSubmit, onCancel, busy, submitLabel }) {
  const [form, setForm] = useState(initial)
  const [notes, clean] = useCleaned(setForm)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const isStart = form.kind === 'start'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...form,
          distance_km: form.distance_km === '' ? null : Number(form.distance_km),
          cutoff_minutes: form.cutoff_minutes === '' ? null : Number(form.cutoff_minutes),
          supplies: form.supplies.trim() || null,
          notes: form.notes.trim() || null,
        })
      }}
      className="grid gap-3 sm:grid-cols-2"
      noValidate
    >
      <Field label="Name" hint={<Corrected note={notes.name} />} htmlFor="cp-name"><input id="cp-name" required value={form.name} onChange={set('name')} onBlur={clean('name', (v) => { const r = cleanName(v); return { value: v.trim() ? v.trim().charAt(0).toUpperCase() + v.trim().slice(1) : '', note: null } })} className={inputClass} placeholder="Aid 1 · Col de la Croix" /></Field>
      <Field label="Kind" htmlFor="cp-kind">
        <select id="cp-kind" value={form.kind} onChange={set('kind')} className={inputClass}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Distance from the start (km)" hint={<Corrected note={notes.distance_km} /> ?? (isStart ? 'A start is at km 0.' : '“18,5”, “18.5 km” or “18500 m” all work.')} htmlFor="cp-km"><input id="cp-km" inputMode="decimal" value={isStart ? '0' : form.distance_km} disabled={isStart} onChange={set('distance_km')} onBlur={clean('distance_km', cleanKm)} className={inputClass} placeholder="18.5" /></Field>
      <Field label="Cut-off after the gun" hint={<Corrected note={notes.cutoff_minutes} /> ?? (isStart ? 'No cut-off at the start.' : form.cutoff_minutes ? `${minutesLabel(Number(form.cutoff_minutes))} after the start` : 'Minutes, or “4h30”. Leave empty for none.')} htmlFor="cp-cut"><input id="cp-cut" inputMode="numeric" value={isStart ? '' : form.cutoff_minutes} disabled={isStart} onChange={set('cutoff_minutes')} onBlur={clean('cutoff_minutes', cleanMinutes)} className={inputClass} placeholder="240 or 4h" /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold text-[#0b1220]">Served here</legend>
        <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
          {[['water', 'Water'], ['food', 'Food'], ['medical', 'Medical'], ['drop_bag', 'Drop bags'], ['crew_access', 'Crew access']].map(([k, v]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={form[k]} onChange={set(k)} /> {v}</label>
          ))}
        </div>
      </fieldset>
      <Field label="Supplies" hint="For the volunteers' shopping list." htmlFor="cp-sup"><input id="cp-sup" value={form.supplies} onChange={set('supplies')} className={inputClass} placeholder="60 l water, cola, bananas, salt, blankets" /></Field>
      <Field label="Notes" hint="Access, parking, radio channel, who is in charge." htmlFor="cp-notes"><input id="cp-notes" value={form.notes} onChange={set('notes')} className={inputClass} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" busy={busy} disabled={!form.name.trim()}>{submitLabel}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

function SuggestCard({ race, hasPlan, onApplied }) {
  const [spacing, setSpacing] = useState('')
  const [pace, setPace] = useState(12)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const payload = () => ({ spacing_km: spacing ? Number(spacing) : null, min_per_km: Number(pace) || 12 })

  async function run(apply, replace = false) {
    setBusy(true)
    setError(null)
    try {
      const result = await suggestSuiteCheckpoints(race.race_id, { ...payload(), apply, replace })
      if (apply) {
        setPreview(null)
        onApplied()
      } else setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-dashed border-blue-200 bg-blue-50/30">
      <Eyebrow as="h2" className="flex items-center gap-1.5"><Sparkles size={11} /> SUGGEST A PLAN FROM THE COURSE</Eyebrow>
      <p className="mt-1 max-w-[64ch] text-sm leading-6 text-slate-600">
        {race.has_gpx
          ? 'From the race’s measured GPX: aid stations where the ground makes access likely (a valley, a pass), spaced as races of this length usually are, with cut-offs from a slow pace. A starting point to move and rename.'
          : 'Attach the race’s GPX under Race page setup first; the plan is drawn from the measured course.'}
      </p>
      {race.has_gpx && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Aid every (km)" hint="Empty: 6, 9 or 12 by distance." htmlFor="sg-spacing"><input id="sg-spacing" inputMode="decimal" value={spacing} onChange={(e) => setSpacing(e.target.value)} className={`${inputClass} w-28`} placeholder="auto" /></Field>
          <Field label="Cut-off pace (min/km, flat)" hint="Plus 10 min per 100 m of climb." htmlFor="sg-pace"><input id="sg-pace" inputMode="numeric" value={pace} onChange={(e) => setPace(e.target.value)} className={`${inputClass} w-28`} /></Field>
          <Button variant="secondary" busy={busy} onClick={() => run(false)}>Preview</Button>
          {preview && !hasPlan && <Button busy={busy} onClick={() => run(true)}>Use this plan</Button>}
          {preview && hasPlan && <Button variant="danger" busy={busy} onClick={() => { if (window.confirm('Replace the current plan with the suggestion? Passings recorded so far go with the old checkpoints.')) run(true, true) }}>Replace the current plan</Button>}
        </div>
      )}
      {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
      {preview && (
        <ol className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-sm">
          {preview.suggestions.map((sg, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <Chip className={sg.kind === 'start' ? 'bg-emerald-50 text-emerald-700' : sg.kind === 'finish' ? 'bg-[#0b1220] text-white' : 'bg-blue-50 text-blue-700'}>{KIND_LABEL[sg.kind]}</Chip>
              <span className="font-semibold">{sg.name}</span>
              <span className="font-mono text-xs text-slate-500">km {sg.distance_km} · {sg.elevation_m} m{sg.cutoff_minutes != null ? ` · cut-off ${minutesLabel(sg.cutoff_minutes)}` : ''}</span>
              <span className="min-w-0 flex-1 text-xs text-slate-500">{sg.reason}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function PlanTab({ race, reloadRace }) {
  const raceId = race.race_id
  const [checkpoints, error, reload] = useAsync(() => listSuiteCheckpoints(raceId), [raceId])
  const [profile] = useAsync(() => (race.has_gpx ? getSuiteProfile(raceId).catch(() => null) : Promise.resolve(null)), [raceId, race.has_gpx])
  const [editing, setEditing] = useState(null)
  const [showQr, setShowQr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  function refresh() {
    reload()
    reloadRace()
  }

  async function run(action) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function move(index, delta) {
    const ids = checkpoints.map((c) => c.checkpoint_id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    run(() => reorderSuiteCheckpoints(raceId, ids))
  }

  return (
    <div className="grid gap-8">
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      <div>
        <Eyebrow as="h2">THE COURSE, STATION BY STATION</Eyebrow>
        <p className="mt-1 max-w-[64ch] text-sm leading-6 text-slate-500">
          Start, checkpoints, aid stations, finish, in course order. Each gets a station link: open it on the volunteer's phone and that phone records passings there, with or without signal. Cut-offs make the board flag who is overdue.
        </p>
        {profile && checkpoints && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
            <ProfileChart profile={profile} checkpoints={checkpoints} height={150} accent={race.settings.bib_accent === '#0b1220' ? '#2563eb' : race.settings.bib_accent} className="h-40 w-full" />
          </div>
        )}
        {checkpoints?.length === 0 && <div className="mt-4"><EmptyState title="No checkpoints yet">Add the start, the aid stations and the finish below, or let the course suggest them. Distances are from the start; cut-offs are minutes after the gun.</EmptyState></div>}
        {checkpoints?.length > 0 && (
          <ol className="mt-4 grid gap-3">
            {checkpoints.map((c, index) => {
              const stationLink = appUrl(`/station/${c.station_key}`)
              return (
                <li key={c.checkpoint_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
                  {editing === c.checkpoint_id ? (
                    <CheckpointForm
                      initial={{ ...c, distance_km: c.distance_km ?? '', cutoff_minutes: c.cutoff_minutes ?? '', supplies: c.supplies ?? '', notes: c.notes ?? '' }}
                      busy={busy}
                      submitLabel="Save checkpoint"
                      onCancel={() => setEditing(null)}
                      onSubmit={(values) => run(async () => { await updateSuiteCheckpoint(c.checkpoint_id, { ...values, clear_distance: values.distance_km == null, clear_cutoff: values.cutoff_minutes == null }); setEditing(null) })}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || busy} aria-label="Move up" className="rounded border border-slate-200 p-1 text-slate-500 disabled:opacity-30"><ArrowUp size={12} /></button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === checkpoints.length - 1 || busy} aria-label="Move down" className="rounded border border-slate-200 p-1 text-slate-500 disabled:opacity-30"><ArrowDown size={12} /></button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400">{c.position}</span>
                          <Chip className={c.kind === 'start' ? 'bg-emerald-50 text-emerald-700' : c.kind === 'finish' ? 'bg-[#0b1220] text-white' : c.kind === 'aid' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}>{KIND_LABEL[c.kind]}</Chip>
                          <span className="text-base font-bold tracking-[-.02em] text-[#0b1220]">{c.name}</span>
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">
                          {c.distance_km != null ? `km ${c.distance_km}` : 'distance —'} · cut-off {c.cutoff_minutes != null ? `${minutesLabel(c.cutoff_minutes)}${cutoffClock(race.settings.planned_start, c.cutoff_minutes) ? ` (${cutoffClock(race.settings.planned_start, c.cutoff_minutes)})` : ''}` : '—'}
                          {[c.water && 'water', c.food && 'food', c.medical && 'medical', c.drop_bag && 'drop bags', c.crew_access && 'crew'].filter(Boolean).length > 0 && ` · ${[c.water && 'water', c.food && 'food', c.medical && 'medical', c.drop_bag && 'drop bags', c.crew_access && 'crew'].filter(Boolean).join(', ')}`}
                        </p>
                        {c.supplies && <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Supplies:</span> {c.supplies}</p>}
                        {c.notes && <p className="mt-0.5 text-xs text-slate-600">{c.notes}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[.06em] text-slate-500"><KeyRound size={11} /> STATION LINK</span>
                          <CopyButton text={stationLink} />
                          <button type="button" onClick={() => setShowQr(showQr === c.checkpoint_id ? null : c.checkpoint_id)} className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"><QrCode size={12} /> {showQr === c.checkpoint_id ? 'Hide QR' : 'Show QR'}</button>
                          <a href={stationLink} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">Open station ↗</a>
                          <button type="button" onClick={() => { if (window.confirm('New link for this station? The old one stops working at once.')) run(() => rotateStationKey(c.checkpoint_id)) }} className="font-semibold text-slate-500 hover:underline">New link</button>
                        </div>
                        {showQr === c.checkpoint_id && (
                          <div className="mt-3 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <QrImage text={stationLink} size={140} />
                            <p className="text-xs leading-5 text-slate-600">The volunteer scans this with their phone's camera and the station page opens. The link is the key: share it only with the people running this checkpoint.</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs">
                        <button type="button" onClick={() => setEditing(c.checkpoint_id)} className="font-semibold text-blue-600 hover:underline">Edit</button>
                        <button type="button" onClick={() => { if (window.confirm(`Delete “${c.name}”? Passings recorded there go with it.`)) run(() => deleteSuiteCheckpoint(c.checkpoint_id)) }} className="inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"><Trash2 size={12} /> Delete</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <SuggestCard race={race} hasPlan={Boolean(checkpoints?.length)} onApplied={refresh} />
      <Card>
        <Eyebrow as="h2">ADD A CHECKPOINT</Eyebrow>
        <div className="mt-3">
          <CheckpointForm key={checkpoints?.length ?? 0} initial={EMPTY_CP} busy={busy} submitLabel="Add checkpoint" onSubmit={(values) => run(() => addSuiteCheckpoint(raceId, values))} />
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------------------------------- day

function Tile({ label, value, tone = 'plain' }) {
  const tones = { plain: 'text-[#0b1220]', ok: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', muted: 'text-slate-500' }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="font-mono text-[10px] tracking-[.06em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-[-.03em] ${tones[tone]}`}>{value}</p>
    </div>
  )
}

function DayTab({ race, reloadRace }) {
  const raceId = race.race_id
  const [board, error, reload] = useAsync(() => getSuiteBoard(raceId), [raceId])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [manual, setManual] = useState({ participant_id: '', checkpoint_id: '', time: '' })
  const [people] = useAsync(() => listSuiteParticipants(raceId), [raceId])
  const [gate, setGate] = useState(null) // the readiness answer, shown before the gun
  const live = board?.status === 'live'

  async function askToStart() {
    setBusy(true)
    setActionError(null)
    try {
      const readiness = await getSuiteReadiness(raceId)
      setGate(readiness)
      if (readiness.ready && readiness.warnings === 0) await fireGun(false)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function fireGun(force) {
    await startSuiteRace(raceId, { force })
    setGate(null)
    reload()
    reloadRace()
  }

  useEffect(() => {
    if (!live) return undefined
    const timer = setInterval(reload, 10_000)
    return () => clearInterval(timer)
  }, [live, reload])

  async function run(action, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
      reloadRace()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(() => {
    if (!board) return []
    if (filter === 'course') return board.participants.filter((p) => p.status === 'started')
    if (filter === 'overdue') return board.participants.filter((p) => p.overdue)
    if (filter === 'finished') return board.participants.filter((p) => p.status === 'finished')
    return board.participants
  }, [board, filter])

  function recordedAtFromInput(value) {
    if (!value) return null
    const [h, m, s = '0'] = value.split(':')
    const at = new Date()
    at.setHours(Number(h), Number(m), Number(s), 0)
    return at.toISOString()
  }

  return (
    <div className="grid gap-8">
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        {board?.status === 'planning' && (
          <Button onClick={askToStart} busy={busy}>
            <Play size={15} /> Start the race
          </Button>
        )}
        {board?.status === 'live' && (
          <Button variant="secondary" onClick={() => run(() => finishSuiteRace(raceId), 'Close the race? Runners still out are marked DNF. You can reopen if that was early.')} busy={busy}>
            <Square size={15} /> Finish the race
          </Button>
        )}
        {board?.status === 'finished' && (
          <Button variant="secondary" onClick={() => run(() => reopenSuiteRace(raceId))} busy={busy}>
            <RotateCcw size={15} /> Reopen
          </Button>
        )}
        {board && board.status !== 'planning' && (
          <Button variant="danger" onClick={() => run(() => resetSuiteRace(raceId), 'Back to planning? Every passing is deleted and the clock is cleared. For a rehearsal, not for race day.')} busy={busy}>
            Reset for a rehearsal
          </Button>
        )}
        {board && (
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <RaceStatusChip status={board.status} />
            {board.started_at && `Gun ${clock(board.started_at)}`}
            {live && <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> refreshing every 10 s</span>}
          </span>
        )}
      </div>

      {gate && board?.status === 'planning' && (
        <div role="dialog" aria-label="Before the gun" className={`rounded-2xl border p-5 ${gate.ready ? 'border-amber-200 bg-amber-50/60' : 'border-red-200 bg-red-50/60'}`}>
          <p className="text-base font-bold tracking-[-.02em] text-[#0b1220]">{gate.ready ? 'Before the gun, a look at these' : 'Not ready to start'}</p>
          <ul className="mt-2 grid gap-1.5">
            {gate.checks.filter((c) => !c.ok && c.level !== 'info').map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                {c.level === 'blocker' ? <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />}
                <span className="min-w-0"><strong className="font-semibold">{c.label}.</strong> {c.detail}</span>
                {c.tab && <Link to={`/suite/${encodeURIComponent(raceId)}?tab=${c.tab}`} className="ml-auto shrink-0 text-xs font-semibold text-blue-600">Fix →</Link>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {gate.ready && (
              <Button busy={busy} onClick={() => run(() => fireGun(true))}>
                <Play size={15} /> Start anyway
              </Button>
            )}
            <Button variant="secondary" onClick={() => setGate(null)}>Not yet</Button>
          </div>
          {gate.ready && <p className="mt-2 text-xs text-slate-500">Starting over these is written to the race's integrity log with your name. Every registered runner is put on course; mark no-shows DNS first or later.</p>}
        </div>
      )}
      {board && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="RUNNERS" value={board.counts.total} />
          <Tile label="ON COURSE" value={board.counts.on_course} tone="ok" />
          <Tile label="FINISHED" value={board.counts.finished} />
          <Tile label="OVERDUE" value={board.counts.overdue} tone={board.counts.overdue ? 'bad' : 'muted'} />
          <Tile label="DNF" value={board.counts.dnf} tone="warn" />
          <Tile label="DNS" value={board.counts.dns} tone="muted" />
        </div>
      )}

      {board?.checkpoints.length > 0 && (
        <div>
          <Eyebrow as="h2">THROUGH EACH STATION</Eyebrow>
          <ol className="mt-3 grid gap-2">
            {board.checkpoints.map((c) => {
              const denominator = Math.max(1, board.counts.total - board.counts.dns)
              const share = Math.min(100, Math.round((c.through / denominator) * 100))
              return (
                <li key={c.checkpoint_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-[10px] text-slate-400">{c.position}</span>
                      <span className="font-semibold text-[#0b1220]">{c.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{c.distance_km != null ? `km ${c.distance_km}` : ''}{c.cutoff_minutes != null ? ` · cut-off ${minutesLabel(c.cutoff_minutes)}` : ''}</span>
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${share}%` }} /></div>
                  </div>
                  <p className="font-mono text-sm font-bold text-[#0b1220]">{c.through} <span className="font-normal text-slate-400">/ {denominator}</span></p>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {board?.panels?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {board.panels.map((panel) => (
            <Card key={panel.plugin}>
              <Eyebrow as="h2" className="flex items-center gap-1.5"><Plug size={11} /> {panel.title.toUpperCase()}</Eyebrow>
              {panel.error && <Notice kind="error">{panel.error}</Notice>}
              {panel.lines?.length ? (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">{panel.lines.map((line, i) => <li key={i} className="py-1.5">{line}</li>)}</ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">{panel.empty ?? 'Nothing yet.'}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Eyebrow as="h2">WHO IS WHERE</Eyebrow>
          <div className="flex gap-1 text-xs">
            {[['all', 'All'], ['course', 'On course'], ['overdue', 'Overdue'], ['finished', 'Finished']].map(([k, v]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 font-semibold ${filter === k ? 'bg-[#0b1220] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{v}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{board?.participants.length ? 'Nobody in this view.' : 'No runners on the list yet.'}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] tracking-[.06em] text-slate-500">
                <tr><th className="px-4 py-3">#</th><th className="px-3 py-3">BIB</th><th className="px-3 py-3">RUNNER</th><th className="px-3 py-3">STATUS</th>{board.laps > 1 && <th className="px-3 py-3">LAP</th>}<th className="px-3 py-3">LAST SEEN</th><th className="px-3 py-3">ELAPSED</th><th className="px-3 py-3">HEADING TO</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.participant_id} className={p.overdue ? 'bg-red-50/60' : ''}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.rank ?? ''}</td>
                    <td className="px-3 py-2 font-mono font-bold">{p.bib ?? '—'}</td>
                    <td className="px-3 py-2">{p.first_name} <strong>{p.family_name}</strong>{p.club && <span className="ml-1 text-xs text-slate-500">{p.club}</span>}</td>
                    <td className="px-3 py-2"><Chip className={P_STATUS_CLASS[p.status]}>{P_STATUS[p.status]}</Chip>{p.overdue && <Chip className="ml-1 bg-red-600 text-white"><AlertTriangle size={9} className="mr-0.5 inline" />overdue</Chip>}</td>
                    {board.laps > 1 && <td className="px-3 py-2 font-mono text-xs">{p.lap}/{board.laps}</td>}
                    <td className="px-3 py-2 text-xs">{p.last ? <>{p.last.name} <span className="font-mono text-slate-500">{clock(p.last.recorded_at)}</span></> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.status === 'finished' ? <strong>{hms(p.finish_seconds)}</strong> : p.last ? hms(p.last.elapsed_seconds) : ''}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{p.next_checkpoint ? `${p.next_checkpoint.name}${board.laps > 1 ? ` · lap ${p.next_checkpoint.lap}` : ''}${p.next_checkpoint.cutoff_minutes != null ? ` (cut-off ${minutesLabel(p.next_checkpoint.cutoff_minutes)})` : ''}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {board && board.checkpoints.length > 0 && people?.length > 0 && (
        <Card>
          <Eyebrow as="h2">RECORD A PASSING BY HAND</Eyebrow>
          <p className="mt-1 text-xs text-slate-500">A radio call, a scanner that failed. Time is optional: now if empty.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                await addSuitePassing(raceId, { checkpoint_id: manual.checkpoint_id, participant_id: manual.participant_id, recorded_at: recordedAtFromInput(manual.time) })
                setManual((m) => ({ ...m, participant_id: '', time: '' }))
              })
            }}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <Field label="Runner" htmlFor="m-runner">
              <select id="m-runner" required value={manual.participant_id} onChange={(e) => setManual((m) => ({ ...m, participant_id: e.target.value }))} className={`${inputClass} w-64`}>
                <option value="">Choose…</option>
                {people.map((p) => <option key={p.participant_id} value={p.participant_id}>#{p.bib ?? '—'} {p.first_name} {p.family_name}</option>)}
              </select>
            </Field>
            <Field label="Checkpoint" htmlFor="m-cp">
              <select id="m-cp" required value={manual.checkpoint_id} onChange={(e) => setManual((m) => ({ ...m, checkpoint_id: e.target.value }))} className={`${inputClass} w-56`}>
                <option value="">Choose…</option>
                {board.checkpoints.map((c) => <option key={c.checkpoint_id} value={c.checkpoint_id}>{c.position}. {c.name}</option>)}
              </select>
            </Field>
            <Field label="Time of day" htmlFor="m-time"><input id="m-time" type="time" step="1" value={manual.time} onChange={(e) => setManual((m) => ({ ...m, time: e.target.value }))} className={inputClass} /></Field>
            <Button type="submit" variant="secondary" busy={busy} disabled={!manual.participant_id || !manual.checkpoint_id}>Record</Button>
          </form>
        </Card>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------------------- plugins

function PluginCard({ race, plugin, setting, onSaved }) {
  const [enabled, setEnabled] = useState(setting.enabled)
  const [config, setConfig] = useState(() => Object.fromEntries(plugin.fields.map((f) => [f.key, setting.config[f.key] ?? f.default ?? (f.type === 'bool' ? false : '')])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [log, setLog] = useState(null)

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setRacePlugin(race.race_id, plugin.key, { enabled, config })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-[-.02em] text-[#0b1220]"><Plug size={15} className="text-blue-600" /> {plugin.name} {setting.enabled && <Chip className="bg-emerald-50 text-emerald-700">on</Chip>}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{plugin.description}</p>
          {plugin.data_note && <p className="mt-1 text-xs text-slate-500">{plugin.data_note}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
        {plugin.fields.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            {f.type === 'bool' ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(config[f.key])} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.checked }))} /> {f.label}</label>
            ) : (
              <Field label={f.label} hint={f.help || undefined} htmlFor={`${plugin.key}-${f.key}`}>
                {f.type === 'select' ? (
                  <select id={`${plugin.key}-${f.key}`} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className={inputClass}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea id={`${plugin.key}-${f.key}`} rows={3} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className={inputClass} />
                ) : (
                  <input id={`${plugin.key}-${f.key}`} type={f.secret ? 'password' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className={inputClass} autoComplete="off" required={f.required} />
                )}
              </Field>
            )}
          </div>
        ))}
        {error && <div className="sm:col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" busy={busy}>{saved ? <><Check size={15} /> Saved</> : 'Save'}</Button>
          <button type="button" onClick={() => (log ? setLog(null) : getRacePluginLog(race.race_id, plugin.key).then(setLog).catch((err) => setError(err.message)))} className="text-xs font-semibold text-blue-600 hover:underline">{log ? 'Hide log' : 'Show log'}</button>
        </div>
      </form>
      {log && (
        <ul className="mt-3 max-h-60 overflow-auto divide-y divide-slate-100 rounded-xl border border-slate-200 font-mono text-[11px]">
          {log.length === 0 && <li className="px-3 py-2 text-slate-500">Nothing logged yet.</li>}
          {log.map((row) => (
            <li key={row.id} className={`px-3 py-1.5 ${row.status === 'error' ? 'text-red-700' : 'text-slate-700'}`}>{clock(row.created_at)} · {row.status} · {row.detail}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function PluginsTab({ race }) {
  const [catalogue, error] = useAsync(listSuitePlugins, [])
  const [settings, settingsError, reload] = useAsync(() => listRacePlugins(race.race_id), [race.race_id])
  return (
    <div className="grid gap-6">
      <div>
        <Eyebrow as="h2">PLUGINS</Eyebrow>
        <p className="mt-1 max-w-[64ch] text-sm leading-6 text-slate-500">
          Small extras, switched on per race. A plugin listens to what happens (the gun, each passing, each finish) and does something with it; it can never change a time. Anyone can write one: a Python file in <code className="font-mono text-xs">api/suite_plugins/</code> is the whole installation. The webhook covers most needs without any code: send events to a spreadsheet, a chat channel or an automation service and build the rest there.
        </p>
      </div>
      {(error || settingsError) && <Notice kind="error">{error || settingsError}</Notice>}
      {catalogue && settings && (
        <div className="grid gap-4">
          {catalogue.map((plugin) => (
            <PluginCard key={plugin.key} race={race} plugin={plugin} setting={settings.find((s) => s.plugin_key === plugin.key) ?? { enabled: false, config: {} }} onSaved={reload} />
          ))}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------------------- results

function IntegrityLog({ raceId }) {
  const [rows, error] = useAsync(() => getSuiteAudit(raceId), [raceId])
  const [busy, setBusy] = useState(false)
  async function downloadPassings() {
    setBusy(true)
    try {
      const text = await fetchSuitePassingsCsv(raceId)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
      link.download = 'passings.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow as="h2" className="flex items-center gap-1.5"><ShieldCheck size={11} /> INTEGRITY LOG</Eyebrow>
        <Button variant="secondary" className="min-h-9" busy={busy} onClick={downloadPassings}><Download size={13} /> Every passing (CSV)</Button>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">Every change made by hand, with who made it: passings typed or removed, statuses set, the gun fired over a warning, the race reset or closed, results sent. Scans by the stations are the record itself and are in the CSV.</p>
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-slate-500">Nothing changed by hand yet.</p>}
      {rows?.length > 0 && (
        <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 font-mono text-[11px]">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-x-3 px-3 py-1.5 sm:grid-cols-[auto_auto_auto_1fr]">
              <span className="text-slate-500">{new Date(row.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</span>
              <span className="text-slate-500">{row.actor}</span>
              <span className="font-bold text-[#0b1220]">{row.action}</span>
              <span className="text-slate-700">{row.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ResultsTab({ race }) {
  const raceId = race.race_id
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)

  useEffect(() => {
    fetchSuiteResultsCsv(raceId).then(setPreview).catch((err) => setError(err.message))
  }, [raceId, sent])

  function download() {
    const blob = new Blob([preview ?? ''], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${race.event_name}-${race.course_name}-results.csv`.replace(/[^\w.-]+/g, '-')
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  async function send() {
    if (!window.confirm('Send the finish list to OTRI scoring? It replaces any results uploaded for this race.')) return
    setBusy(true)
    setError(null)
    try {
      setSent(await submitSuiteResults(raceId))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const lines = preview ? preview.trim().split('\n') : []
  const finishers = lines.slice(1).filter((l) => /^\d+,/.test(l)).length
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
      <div>
        <Eyebrow as="h2">THE FINISH LIST</Eyebrow>
        <p className="mt-1 text-sm text-slate-500">{lines.length > 1 ? `${lines.length - 1} row${lines.length === 2 ? '' : 's'}, ${finishers} finisher${finishers === 1 ? '' : 's'}` : 'No results yet: finishers appear as they cross the line.'}</p>
        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        {lines.length > 1 && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-5 text-slate-700">{preview}</pre>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={download} disabled={lines.length < 2}><Download size={15} /> Download CSV</Button>
          <Button onClick={send} busy={busy} disabled={race.status !== 'finished' || finishers === 0}><Flag size={15} /> Send to OTRI scoring</Button>
        </div>
        {race.status !== 'finished' && <p className="mt-2 text-xs text-slate-500">Finish the race on the race-day page first, so the list is final.</p>}
        {sent && (
          <div className="mt-4">
            <Notice kind="success" title={`${sent.finishers} finisher${sent.finishers === 1 ? '' : 's'} scored`}>
              The race's results are these now. <Link to={`/races/${encodeURIComponent(raceId)}/review`} className="font-semibold text-emerald-900 underline">Review and publish the race page</Link>.
              {sent.warnings?.length > 0 && <span className="block mt-1">{sent.warnings.length} warning{sent.warnings.length === 1 ? '' : 's'} from the results check; see the results step for details.</span>}
            </Notice>
          </div>
        )}
      </div>
      <Card>
        <Eyebrow as="h2">WHAT HAPPENS</Eyebrow>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <li>The list is the standard OTRI results file (rank, time, names, gender, bib, year of birth, nationality, status): the same file a timing company would give you.</li>
          <li>Times are {race.settings.timing === 'net' ? 'net, from each runner’s start-line scan' : 'gun times, from the start signal'}. Change that under Overview → Settings before sending.</li>
          <li>Sending validates and scores the list exactly like an upload, and replaces the race's stored results. Nothing is public until you publish the race page.</li>
          <li>Emergency contacts and notes never leave the suite.</li>
        </ul>
      </Card>
      <div className="lg:col-span-2">
        <IntegrityLog raceId={raceId} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------- bib sheet

/** One bib: what the industry prints, on a home printer.
 *
 *  Top band in the race's colour with the event and the distance; the number as large as the
 *  paper allows, in a monospace so 1 and 7 cannot be confused at a station; the runner's first
 *  name large enough to cheer by; the course profile with every station marked and the cut-offs
 *  as clock times, so the runner carries the plan; the QR code that opens their own splits; whom
 *  to call if they are found alone. Four reinforced corners for the pins. 190 × 135 mm: two per
 *  A4 sheet, the size a chest carries. */
function Bib({ race, participant, profile, checkpoints }) {
  const accent = race.settings.bib_accent || '#0b1220'
  const stations = checkpoints.filter((c) => c.distance_km != null && c.kind !== 'start')
  const compact = stations.length > 6
  return (
    <div className="bib" style={{ '--accent': accent }}>
      <span className="bib-hole tl" /><span className="bib-hole tr" /><span className="bib-hole bl" /><span className="bib-hole br" />
      <div className="bib-band">
        <span className="bib-event">{race.event_name}</span>
        <span className="bib-course">{race.course_name} · {race.distance_km.toFixed(race.distance_km % 1 ? 1 : 0)} km{race.settings.laps > 1 ? ` × ${race.settings.laps}` : ''} · +{Math.round(race.elevation_gain_m)} m</span>
      </div>
      <div className="bib-main">
        <div className="bib-number-wrap">
          <div className="bib-number" style={{ fontSize: `${String(participant.bib).length > 3 ? 46 : 58}mm` }}>{participant.bib}</div>
          {race.settings.bib_show_name && <div className="bib-name">{participant.first_name}{participant.club ? <span className="bib-club"> · {participant.club}</span> : null}</div>}
        </div>
        <div className="bib-qr">
          <QrImage text={appUrl(`/bib/${participant.qr_token}`)} size={200} className="bib-qr-img" />
          <span className="bib-qr-label">your splits</span>
        </div>
      </div>
      {profile && (
        <div className="bib-profile">
          <ProfileChart profile={profile} checkpoints={checkpoints} height={70} accent={accent} labels={false} className="bib-profile-svg" />
          <table className={`bib-stations ${compact ? 'compact' : ''}`}>
            <tbody>
              <tr>
                {stations.map((c) => (
                  <td key={c.checkpoint_id}>
                    <span className="bib-st-name">{c.kind === 'finish' ? 'Finish' : c.name.replace(/\s*·.*$/, '')}</span>
                    <span className="bib-st-km">{c.distance_km} km</span>
                    {c.cutoff_minutes != null && <span className="bib-st-cut">{cutoffClock(race.settings.planned_start, c.cutoff_minutes) ?? minutesLabel(c.cutoff_minutes)}</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="bib-foot">
        {race.settings.bib_note && <span className="bib-foot-note">{race.settings.bib_note}</span>}
        <span className="bib-foot-row">
          <span>{race.settings.organizer_phone ? `Found alone? Call ${race.settings.organizer_phone}` : 'Follow the markers · leave no trace'}</span>
          <span>{formatDate(race.event_date)}{race.settings.planned_start ? ` · start ${race.settings.planned_start}` : ''} · otri.run</span>
        </span>
      </div>
    </div>
  )
}

const BIB_CSS = `
  @media print {
    body > #root > div > header, body > #root > div > footer, .bib-controls, .skip-link, [data-build-banner] { display: none !important; }
    .bib-sheet { padding: 0 !important; background: #fff !important; }
    .bib { page-break-inside: avoid; break-inside: avoid; margin: 0 auto 6mm !important; box-shadow: none !important; }
    .bib:nth-child(2n) { page-break-after: always; break-after: page; }
    @page { size: A4 portrait; margin: 8mm; }
  }
  .bib { position: relative; width: 190mm; height: 135mm; box-sizing: border-box; margin: 0 auto 8mm; background: #fff; color: #0b1220; border: 0.5mm solid #0b1220; border-radius: 5mm; overflow: hidden; display: grid; grid-template-rows: 12mm 1fr auto auto; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; box-shadow: 0 10px 28px rgba(15,23,42,.08); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bib-hole { position: absolute; width: 5mm; height: 5mm; border-radius: 50%; border: 0.4mm solid #94a3b8; background: #fff; z-index: 2; }
  .bib-hole.tl { top: 3mm; left: 3mm } .bib-hole.tr { top: 3mm; right: 3mm } .bib-hole.bl { bottom: 3mm; left: 3mm } .bib-hole.br { bottom: 3mm; right: 3mm }
  .bib-band { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6mm; padding: 0 12mm; background: var(--accent); color: #fff; }
  .bib-event { font-size: 5.2mm; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bib-course { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 2.9mm; opacity: .92; white-space: nowrap; }
  .bib-main { display: grid; grid-template-columns: 1fr 40mm; align-items: center; gap: 4mm; padding: 2mm 10mm 0 10mm; min-height: 0; }
  .bib-number-wrap { min-width: 0; }
  .bib-number { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 900; line-height: .9; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
  .bib-name { margin-top: 1.5mm; font-size: 9mm; font-weight: 800; letter-spacing: -.02em; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bib-club { font-size: 4mm; font-weight: 600; color: #475569; }
  .bib-qr { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
  .bib-qr-img { width: 36mm !important; height: 36mm !important; }
  .bib-qr-label { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 2.4mm; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
  .bib-profile { padding: 0 10mm; }
  .bib-profile-svg { display: block; width: 100%; height: 20mm; }
  .bib-stations { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 0.5mm; }
  .bib-stations td { padding: 0 1mm; text-align: center; vertical-align: top; border-left: 0.2mm solid #cbd5e1; }
  .bib-stations td:first-child { border-left: 0; }
  .bib-st-name { display: block; font-size: 2.8mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bib-st-km { display: block; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 2.5mm; color: #475569; }
  .bib-st-cut { display: block; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 2.7mm; font-weight: 700; color: #0b1220; }
  .bib-stations.compact .bib-st-name { font-size: 2.3mm } .bib-stations.compact .bib-st-km, .bib-stations.compact .bib-st-cut { font-size: 2.2mm }
  .bib-foot { padding: 1.2mm 10mm 1.6mm; border-top: 0.25mm solid #cbd5e1; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 2.5mm; line-height: 1.5; color: #475569; }
  .bib-foot-note { display: block; font-weight: 700; color: #0b1220; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bib-foot-row { display: flex; justify-content: space-between; gap: 4mm; white-space: nowrap; }
  .bib-foot-row span { overflow: hidden; text-overflow: ellipsis; }
`

/** Two bibs per A4 page. Print from the browser (Ctrl/Cmd+P) or save as PDF for the copy shop. */
export function BibSheet({ raceId }) {
  const [race] = useAsync(() => getSuiteRace(raceId), [raceId])
  const [people, error] = useAsync(() => listSuiteParticipants(raceId), [raceId])
  const [checkpoints] = useAsync(() => listSuiteCheckpoints(raceId), [raceId])
  const [profile] = useAsync(() => getSuiteProfile(raceId).catch(() => null), [raceId])
  const numbered = (people ?? []).filter((p) => p.bib)

  return (
    <div className="bib-sheet">
      <style>{BIB_CSS}</style>
      <div className="bib-controls mx-auto w-[min(1120px,calc(100%-28px))] py-8">
        <Link to={`/suite/${encodeURIComponent(raceId)}?tab=field`} className="text-xs font-semibold text-blue-600">← Back to the runners</Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-.03em]">Bibs · {race?.course_name ?? '…'}</h1>
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-slate-500">
              {numbered.length} bib{numbered.length === 1 ? '' : 's'}, two per A4 page, 190 × 135 mm each. Print on paper or on Tyvek sheets (they take rain), or save as PDF for the copy shop; cut along the border and pin at the four corners.
              {profile ? ' Each bib carries the course profile with the stations and their cut-offs.' : ' Attach the race’s GPX to print the course profile on the bibs.'}
              {numbered.length < (people?.length ?? 0) && ` ${(people?.length ?? 0) - numbered.length} runner${(people?.length ?? 0) - numbered.length === 1 ? ' has' : 's have'} no number yet and are left out.`}
            </p>
          </div>
          <Button onClick={() => window.print()} disabled={numbered.length === 0}><Printer size={15} /> Print</Button>
        </div>
        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
      </div>
      <div className="px-2 pb-8">
        {race && checkpoints && numbered.map((p) => <Bib key={p.participant_id} race={race} participant={p} profile={profile} checkpoints={checkpoints} />)}
      </div>
    </div>
  )
}
