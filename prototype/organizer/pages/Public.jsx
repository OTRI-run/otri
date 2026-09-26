// The race suite's two public pages, on when the organizer switches them on and needing no account.
//
// LivePage (#/live/{race_id}): the spectator's board. Who is on course, where each runner was last
// seen, the finishers in order, a search for a bib or a name, the course profile with its stations.
// Refreshes itself while the race is live.
//
// RegisterPage (#/register/{race_id}): the entry form. A runner enters the race, gets the private
// link that the QR on their bib will open, and how to pay: the organizer's own payment link with a
// reference the organizer can match. OTRI moves no money.
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, Clock, Flag, MapPin, Search, Users } from 'lucide-react'
import { getPublicLive, getPublicRace, registerForRace } from '../../apiClient'
import Logo from '../../../src/components/Logo'
import { Button, Field, Notice, inputClass } from '../ui'
import { cleanBirthYear, cleanEmail, cleanName, cleanNationality } from '../../../src/lib/suiteFields'
import { clock, hms } from './Station'

const KIND_LABEL = { start: 'Start', checkpoint: 'Checkpoint', aid: 'Aid', finish: 'Finish' }

function Shell({ eyebrow, width = 960, children }) {
  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1220]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 items-center justify-between" style={{ width: `min(${width}px, calc(100% - 28px))` }}>
          <Logo href="../#home" />
          <span className="font-mono text-[9px] tracking-[.08em] text-slate-500">{eyebrow}</span>
        </div>
      </header>
      <main className="mx-auto py-8" style={{ width: `min(${width}px, calc(100% - 28px))` }}>{children}</main>
      <footer className="mx-auto pb-8 text-[11px] text-slate-400" style={{ width: `min(${width}px, calc(100% - 28px))` }}>
        Timed with the OTRI race suite. Times are provisional until the organizer publishes the results.
      </footer>
    </div>
  )
}

/** The course profile as an SVG, with the checkpoints marked. Shared with the bib sheet. */
export function ProfileChart({ profile, checkpoints = [], height = 120, accent = '#2563eb', labels = true, className = '' }) {
  if (!profile || profile.points.length < 2) return null
  const width = 1000
  const padTop = labels ? 22 : 6
  const padBottom = labels ? 18 : 4
  const min = profile.min_m
  const span = Math.max(1, profile.max_m - min)
  const x = (km) => (km / profile.distance_km) * width
  const y = (m) => padTop + (1 - (m - min) / span) * (height - padTop - padBottom)
  const line = profile.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.m).toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height - padBottom} L0,${height - padBottom} Z`
  const marks = checkpoints.filter((c) => c.distance_km != null)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} role="img" aria-label={`Elevation profile, ${profile.distance_km} km, ${profile.gain_m} m of climb`}>
      <defs>
        <linearGradient id="otri-profile-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity=".28" />
          <stop offset="1" stopColor={accent} stopOpacity=".04" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#otri-profile-fill)" />
      <path d={line} fill="none" stroke={accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {marks.map((c) => {
        const px = x(c.distance_km)
        // Labels at the ends are pulled in a little, so the last glyph is not cut by the edge.
        const lx = px < 60 ? px + 4 : px > width - 60 ? px - 4 : px
        const nearest = profile.points.reduce((best, p) => (Math.abs(p.km - c.distance_km) < Math.abs(best.km - c.distance_km) ? p : best), profile.points[0])
        const py = y(nearest.m)
        return (
          <g key={c.checkpoint_id ?? `${c.name}-${c.distance_km}`}>
            <line x1={px} x2={px} y1={py} y2={height - padBottom} stroke="#0b1220" strokeOpacity=".35" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
            <circle cx={px} cy={py} r="4" fill={c.kind === 'finish' ? '#0b1220' : c.kind === 'start' ? '#059669' : '#fff'} stroke="#0b1220" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {labels && (
              <text x={lx} y={padTop - 8} textAnchor={px < 60 ? 'start' : px > width - 60 ? 'end' : 'middle'} fontSize="12" fontFamily="ui-monospace, Menlo, Consolas, monospace" fill="#0b1220" style={{ fontWeight: 600 }}>
                {c.kind === 'start' || c.kind === 'finish' ? KIND_LABEL[c.kind] : c.name.replace(/\s*·.*$/, '')}
              </text>
            )}
            {labels && (
              <text x={lx} y={height - 4} textAnchor={px < 60 ? 'start' : px > width - 60 ? 'end' : 'middle'} fontSize="11" fontFamily="ui-monospace, Menlo, Consolas, monospace" fill="#64748b">
                {c.distance_km} km
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function cutoffClock(plannedStart, minutes) {
  if (!plannedStart || minutes == null) return null
  const [h, m] = plannedStart.split(':').map(Number)
  const total = h * 60 + m + minutes
  const day = Math.floor(total / 1440)
  const hh = Math.floor((total % 1440) / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${day ? ` +${day}d` : ''}`
}

export function LivePage({ raceId }) {
  const [info, setInfo] = useState(null)
  const [board, setBoard] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getPublicRace(raceId).then(setInfo).catch((err) => setError(err.message))
  }, [raceId])
  useEffect(() => {
    let timer
    const load = () =>
      getPublicLive(raceId)
        .then((data) => {
          setBoard(data)
          setError(null)
          if (data.status === 'live') timer = setTimeout(load, 15_000)
        })
        .catch((err) => setError(err.message))
    load()
    return () => clearTimeout(timer)
  }, [raceId])

  const rows = useMemo(() => {
    if (!board) return []
    const q = query.trim().toLowerCase()
    if (!q) return board.participants
    return board.participants.filter((p) => `${p.bib ?? ''} ${p.first_name} ${p.family_name} ${p.club ?? ''}`.toLowerCase().includes(q))
  }, [board, query])

  const race = board?.race ?? info?.race
  return (
    <Shell eyebrow="LIVE">
      {error && !board && <Notice kind="error">{error}</Notice>}
      {race && (
        <>
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{race.event_name?.toUpperCase()}{race.event_date ? ` · ${race.event_date}` : ''}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-[-.04em]">
            {race.course_name}
            {board && (
              <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[.06em] ${board.status === 'live' ? 'bg-emerald-50 text-emerald-700' : board.status === 'finished' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                {board.status === 'live' ? `LIVE · GUN ${clock(board.started_at)}` : board.status === 'finished' ? 'FINISHED' : 'BEFORE THE START'}
              </span>
            )}
          </h1>
          {info?.profile && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
              <ProfileChart profile={info.profile} checkpoints={info.checkpoints} height={140} className="h-36 w-full" />
              <p className="mt-1 flex flex-wrap gap-4 font-mono text-[10px] text-slate-500">
                <span>{info.profile.distance_km} km{info.laps > 1 ? ` × ${info.laps} laps` : ''}</span>
                <span>+{info.profile.gain_m} m</span>
                <span>{info.profile.min_m}–{info.profile.max_m} m</span>
              </p>
            </div>
          )}
        </>
      )}
      {board && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['On course', board.counts.on_course, Users], ['Finished', board.counts.finished, Flag], ['Runners', board.counts.total, Users], ['Overdue', board.counts.overdue, Clock]].map(([label, value, Icon]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="flex items-center gap-1 font-mono text-[10px] tracking-[.06em] text-slate-500"><Icon size={11} /> {label.toUpperCase()}</p>
                <p className="mt-1 text-2xl font-bold tracking-[-.03em]">{value}</p>
              </div>
            ))}
          </div>
          {board.checkpoints.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-2">
              {board.checkpoints.map((c) => (
                <li key={c.checkpoint_id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">
                  <MapPin size={11} className="text-slate-400" /> <span className="font-semibold">{c.name}</span>
                  {c.distance_km != null && <span className="font-mono text-[10px] text-slate-500">{c.distance_km} km</span>}
                  <span className="font-mono text-[10px] text-blue-700">{c.through} through</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-6 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bib, name or club" aria-label="Find a runner" className={`${inputClass} max-w-xs`} />
          </div>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{board.participants.length ? 'No runner matches.' : 'The entry list is not public yet.'}</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="text-left font-mono text-[10px] tracking-[.06em] text-slate-500">
                  <tr><th className="px-4 py-3">#</th><th className="px-3 py-3">BIB</th><th className="px-3 py-3">RUNNER</th>{board.laps > 1 && <th className="px-3 py-3">LAP</th>}<th className="px-3 py-3">LAST SEEN</th><th className="px-3 py-3">TIME</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.participant_id}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.rank ?? ''}</td>
                      <td className="px-3 py-2 font-mono font-bold">{p.bib ?? '—'}</td>
                      <td className="px-3 py-2">{p.first_name} <strong>{p.family_name}</strong>{p.club && <span className="ml-1 text-xs text-slate-500">{p.club}</span>}</td>
                      {board.laps > 1 && <td className="px-3 py-2 font-mono text-xs">{p.lap}/{board.laps}</td>}
                      <td className="px-3 py-2 text-xs">
                        {p.status === 'finished' ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Finished</span> : p.status === 'dnf' ? 'DNF' : p.status === 'dns' ? 'DNS' : p.status === 'dsq' ? 'DSQ' : p.last ? <>{p.last.name} <span className="font-mono text-slate-500">{clock(p.last.recorded_at)}</span></> : p.status === 'started' ? 'On course' : 'Registered'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.status === 'finished' ? <strong>{hms(p.finish_seconds)}</strong> : p.last ? hms(p.last.elapsed_seconds) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {info?.registration?.open && (
        <p className="mt-6 text-sm">
          Registration is open. <a href={`#/register/${encodeURIComponent(raceId)}`} className="font-semibold text-blue-600">Enter the race →</a>
        </p>
      )}
    </Shell>
  )
}

export function RegisterPage({ raceId }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ first_name: '', family_name: '', gender: 'F', birth_year: '', nationality: '', club: '', email: '', emergency_contact: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [qr, setQr] = useState(null)
  const [notes, setNotes] = useState({})
  const clean = (key, cleaner) => (event) => {
    const { value, note } = cleaner(event.target.value)
    setForm((f) => ({ ...f, [key]: value }))
    setNotes((n) => ({ ...n, [key]: note }))
  }
  const noteOr = (key, fallback) => (notes[key] ? <span className="text-amber-700">{notes[key]}</span> : fallback)

  useEffect(() => {
    getPublicRace(raceId).then(setInfo).catch((err) => setError(err.message))
  }, [raceId])

  const myLink = done ? `${window.location.origin}${window.location.pathname}#/bib/${done.qr_token}` : null
  useEffect(() => {
    if (myLink) QRCode.toDataURL(myLink, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(null))
  }, [myLink])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await registerForRace(raceId, {
        ...form,
        birth_year: form.birth_year ? Number(form.birth_year) : null,
        nationality: form.nationality.trim() || null,
        club: form.club.trim() || null,
        email: form.email.trim() || null,
        emergency_contact: form.emergency_contact.trim() || null,
      })
      setDone(result)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fields = info?.registration?.fields ?? {}
  const race = info?.race
  return (
    <Shell eyebrow="REGISTRATION" width={720}>
      {error && !info && <Notice kind="error">{error}</Notice>}
      {race && !done && (
        <>
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{race.event_name?.toUpperCase()}{race.event_date ? ` · ${race.event_date}` : ''}{race.event_location ? ` · ${race.event_location.toUpperCase()}` : ''}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.04em]">{race.course_name}</h1>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {race.distance_km} km{info.laps > 1 ? ` × ${info.laps} laps` : ''} · +{Math.round(race.elevation_gain_m)} m{info.planned_start ? ` · start ${info.planned_start}` : ''}{info.registration.fee_text ? ` · ${info.registration.fee_text}` : ' · free'}
            {info.registration.spots_left != null && ` · ${info.registration.spots_left} place${info.registration.spots_left === 1 ? '' : 's'} left`}
          </p>
          {info.profile && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
              <ProfileChart profile={info.profile} checkpoints={info.checkpoints} height={120} className="h-28 w-full" />
            </div>
          )}
          {info.checkpoints.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
              {info.checkpoints.map((c) => (
                <li key={c.checkpoint_id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="w-16 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">{KIND_LABEL[c.kind]}</span>
                  <span className="min-w-0 flex-1 font-semibold">{c.name}</span>
                  {c.distance_km != null && <span className="font-mono text-xs text-slate-500">{c.distance_km} km</span>}
                  {c.cutoff_minutes != null && <span className="font-mono text-xs text-slate-500">cut-off {cutoffClock(info.planned_start, c.cutoff_minutes) ?? `${Math.floor(c.cutoff_minutes / 60)}h${String(c.cutoff_minutes % 60).padStart(2, '0')}`}</span>}
                  <span className="text-xs text-slate-500">{[c.water && 'water', c.food && 'food', c.medical && 'medical', c.drop_bag && 'drop bags', c.crew_access && 'crew'].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
          {info.registration.note && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{info.registration.note}</p>}
          {info.registration.full && <div className="mt-6"><Notice kind="warning" title="The race is full">Registration has reached its limit. Ask the organizer about a waiting list.</Notice></div>}
          {!info.registration.open && !info.registration.full && <div className="mt-6"><Notice kind="info">Registration is closed for this race.</Notice></div>}
          {info.registration.open && (
            <form onSubmit={submit} className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2" noValidate>
              <h2 className="text-lg font-bold tracking-[-.02em] sm:col-span-2">Enter the race</h2>
              <Field label="First name" hint={noteOr('first_name', undefined)} htmlFor="r-first"><input id="r-first" required value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} onBlur={clean('first_name', cleanName)} className={inputClass} autoComplete="given-name" /></Field>
              <Field label="Last name" hint={noteOr('family_name', undefined)} htmlFor="r-last"><input id="r-last" required value={form.family_name} onChange={(e) => setForm((f) => ({ ...f, family_name: e.target.value }))} onBlur={clean('family_name', cleanName)} className={inputClass} autoComplete="family-name" /></Field>
              <Field label="Gender" hint="For the women's and men's rankings." htmlFor="r-gender">
                <select id="r-gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className={inputClass}>
                  <option value="F">Female</option><option value="M">Male</option><option value="X">Prefer not to say</option>
                </select>
              </Field>
              {fields.birth_year && <Field label="Year of birth" hint={noteOr('birth_year', 'Only the year; for age categories.')} htmlFor="r-yob"><input id="r-yob" inputMode="numeric" value={form.birth_year} onChange={(e) => setForm((f) => ({ ...f, birth_year: e.target.value }))} onBlur={clean('birth_year', cleanBirthYear)} className={inputClass} placeholder="1990" /></Field>}
              {fields.nationality && <Field label="Nationality" hint={noteOr('nationality', 'A code or a country name.')} htmlFor="r-nat"><input id="r-nat" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} onBlur={clean('nationality', cleanNationality)} className={inputClass} placeholder="THA or Thailand" /></Field>}
              {fields.club && <Field label="Club or team" hint="Optional." htmlFor="r-club"><input id="r-club" value={form.club} onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))} className={inputClass} /></Field>}
              {fields.email && <Field label="Email" hint={noteOr('email', 'So the organizer can reach you. Not shown anywhere.')} htmlFor="r-email"><input id="r-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} onBlur={clean('email', cleanEmail)} className={inputClass} autoComplete="email" /></Field>}
              <Field label={`Emergency contact${fields.emergency_required ? '' : ' (optional)'}`} hint="Name and phone. Seen only by the organizer." htmlFor="r-ice"><input id="r-ice" required={fields.emergency_required} value={form.emergency_contact} onChange={(e) => setForm((f) => ({ ...f, emergency_contact: e.target.value }))} className={inputClass} placeholder="Name, +66 …" /></Field>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} className="mt-1" />
                <span>I enter at my own risk, accept the organizer's rules, and agree that my name, bib and times are shown on the race's live page and results.</span>
              </label>
              {error && <div className="sm:col-span-2"><Notice kind="error">{error}</Notice></div>}
              <div className="sm:col-span-2">
                <Button type="submit" busy={busy} disabled={!form.consent || !form.first_name.trim() || !form.family_name.trim()}>Register{info.registration.fee_text ? ` · ${info.registration.fee_text}` : ''}</Button>
              </div>
            </form>
          )}
        </>
      )}
      {done && (
        <>
          <Notice kind="success" title={`You are in, ${done.first_name}!`}>
            {done.race.event_name} · {done.race.course_name}. Your bib number comes with the bibs; the organizer has your entry.
          </Notice>
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold tracking-[-.02em]">Save your link</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">This page is yours: on race day it shows your splits as you pass each station, and the QR code on your bib opens the same page. Bookmark it or screenshot the code.</p>
              <a href={myLink} className="mt-3 block break-all font-mono text-xs text-blue-600">{myLink}</a>
            </div>
            {qr && <img src={qr} alt="QR code of your private link" width={180} height={180} className="rounded-xl border border-slate-200 bg-white p-2" />}
          </div>
          {done.payment.status === 'pending' && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
              <h2 className="text-lg font-bold tracking-[-.02em]">Now the fee{done.payment.fee_text ? `: ${done.payment.fee_text}` : ''}</h2>
              <p className="mt-1 text-sm leading-6">Your reference is <strong className="font-mono">{done.payment.reference}</strong>. Put it on the payment so the organizer can match it; your entry is confirmed once they mark it paid.</p>
              {done.payment.url && (
                <a href={done.payment.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-[#0b1220] px-4 text-[13px] font-semibold text-white no-underline">Pay now ↗</a>
              )}
              {done.payment.instructions && <p className="mt-3 whitespace-pre-line text-sm leading-6">{done.payment.instructions}</p>}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
