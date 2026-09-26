// The two pages of the race suite that need no account.
//
// StationPage: the checkpoint's phone. The organizer opens the station link (or its QR) on a
// volunteer's phone; the page loads the roster once and from then on works with or without signal,
// scanning bibs with the camera or taking a bib number by hand, queueing every passing on the phone
// and sending the queue whenever the network is there. Times are the phone's clock corrected by the
// offset it measured against OTRI's clock when it loaded.
//
// BibPage: what a runner sees when they scan their own bib: their splits, nobody else's.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CameraOff, CheckCircle2, CloudOff, CloudUpload, Hash, MapPin, RefreshCw, Users, WifiOff, XCircle } from 'lucide-react'
import { getBib, getStation, postStationPassings } from '../../apiClient'
import { beep, cameraSupported, startScanner, tokenIn } from '../../../src/lib/qrScanner'
import Logo from '../../../src/components/Logo'
import { Button, Notice, inputClass } from '../ui'

export function hms(seconds) {
  if (seconds == null) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function clock(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

const KIND_LABEL = { start: 'Start', checkpoint: 'Checkpoint', aid: 'Aid station', finish: 'Finish' }
const KIND_CLASS = { start: 'bg-emerald-600', checkpoint: 'bg-slate-700', aid: 'bg-blue-600', finish: 'bg-[#0b1220]' }

function storage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // full or blocked: the queue lives in memory for this page's life
  }
}

const DOUBLE_SCAN_MS = 120_000
const MAX_LOG = 400

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function StationPage({ stationKey }) {
  const cacheKey = `otri_station_${stationKey}`
  const [station, setStation] = useState(() => storage(cacheKey, null))
  const [error, setError] = useState(null)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  // Every passing this phone recorded, newest first: queued until the server has it.
  const [log, setLog] = useState(() => storage(`${cacheKey}_log`, []))
  const [syncing, setSyncing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [bibInput, setBibInput] = useState('')
  const [flash, setFlash] = useState(null) // {ok, title, detail}
  const [pendingDouble, setPendingDouble] = useState(null) // a scan seen twice within two minutes
  const offsetRef = useRef(0) // server clock minus this phone's clock, ms
  const videoRef = useRef(null)
  const stopRef = useRef(null)
  const logRef = useRef(log)
  logRef.current = log

  useEffect(() => store(`${cacheKey}_log`, log.slice(0, MAX_LOG)), [cacheKey, log])

  const load = useCallback(() => {
    const asked = Date.now()
    return getStation(stationKey)
      .then((data) => {
        const server = new Date(data.server_time).getTime()
        offsetRef.current = server - (asked + Date.now()) / 2
        setStation(data)
        store(cacheKey, data)
        setError(null)
        setOffline(false)
      })
      .catch((err) => {
        if (err.status === 404) {
          setError(err.message)
          setStation(null)
        } else {
          setOffline(true)
          if (!station) setError(err.message)
        }
      })
  }, [stationKey, cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    const on = () => {
      setOffline(false)
      load()
    }
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [load])

  const roster = useMemo(() => {
    const byToken = new Map()
    const byBib = new Map()
    const byId = new Map()
    for (const p of station?.roster ?? []) {
      byToken.set(p.qr_token, p)
      byId.set(p.participant_id, p)
      if (p.bib) byBib.set(String(p.bib).toLowerCase(), p)
    }
    return { byToken, byBib, byId }
  }, [station])

  // Send what is queued. One batch at a time; whatever the server did not answer stays queued.
  const sync = useCallback(async () => {
    if (syncing) return
    const queued = logRef.current.filter((entry) => entry.state === 'queued')
    if (queued.length === 0) return
    setSyncing(true)
    try {
      const answer = await postStationPassings(
        stationKey,
        queued.slice(0, 200).map(({ client_id, participant_id, recorded_at, source, device }) => ({ client_id, participant_id, recorded_at, source, device })),
      )
      const outcomes = new Map(answer.results.map((r) => [r.client_id, r.outcome]))
      setLog((current) => current.map((entry) => (outcomes.has(entry.client_id) ? { ...entry, state: 'sent', outcome: outcomes.get(entry.client_id) } : entry)))
      setOffline(false)
    } catch (err) {
      if (err.status === 404) setError(err.message)
      else setOffline(true)
    } finally {
      setSyncing(false)
    }
  }, [stationKey, syncing])

  useEffect(() => {
    const timer = setInterval(sync, 4000)
    return () => clearInterval(timer)
  }, [sync])

  const record = useCallback(
    (participant, source, { force = false } = {}) => {
      const now = new Date(Date.now() + offsetRef.current)
      const recent = logRef.current.find((entry) => entry.participant_id === participant.participant_id && now - new Date(entry.recorded_at) < DOUBLE_SCAN_MS)
      if (recent && !force) {
        beep(false)
        setPendingDouble({ participant, source, secondsAgo: Math.round((now - new Date(recent.recorded_at)) / 1000) })
        return
      }
      setPendingDouble(null)
      const entry = {
        client_id: newId(),
        participant_id: participant.participant_id,
        bib: participant.bib,
        name: `${participant.first_name} ${participant.family_name}`.trim(),
        recorded_at: now.toISOString(),
        source,
        device: navigator.userAgent.slice(0, 60),
        state: 'queued',
      }
      setLog((current) => [entry, ...current].slice(0, MAX_LOG))
      beep(true)
      setFlash({ ok: true, title: `#${participant.bib ?? '?'} ${entry.name}`, detail: `Recorded ${clock(entry.recorded_at)}` })
      setBibInput('')
      setTimeout(sync, 50)
    },
    [sync],
  )

  const onCode = useCallback(
    (text) => {
      const token = tokenIn(text)
      const participant = token ? roster.byToken.get(token) : null
      if (!participant) {
        beep(false)
        setFlash({ ok: false, title: 'Not a bib of this race', detail: token ? 'The code is not on the entry list. Take the bib number by hand.' : 'That QR code is something else.' })
        return
      }
      record(participant, 'scan')
    },
    [roster, record],
  )

  async function toggleCamera() {
    if (scanning) {
      stopRef.current?.()
      stopRef.current = null
      setScanning(false)
      return
    }
    try {
      setScanning(true)
      stopRef.current = await startScanner(videoRef.current, onCode)
    } catch (err) {
      setScanning(false)
      setFlash({ ok: false, title: 'The camera did not open', detail: `${err.message}. Allow the camera for this site, or take bib numbers by hand.` })
    }
  }
  useEffect(() => () => stopRef.current?.(), [])
  // The camera keeps the onCode of the moment it started: re-bind when the roster changes.
  useEffect(() => {
    if (!scanning) return undefined
    let cancelled = false
    stopRef.current?.()
    startScanner(videoRef.current, onCode)
      .then((stop) => {
        if (cancelled) stop()
        else stopRef.current = stop
      })
      .catch(() => setScanning(false))
    return () => {
      cancelled = true
    }
  }, [onCode]) // eslint-disable-line react-hooks/exhaustive-deps

  function submitBib(event) {
    event.preventDefault()
    const participant = roster.byBib.get(bibInput.trim().toLowerCase())
    if (!participant) {
      beep(false)
      setFlash({ ok: false, title: `No bib ${bibInput.trim()} in this race`, detail: 'Check the number, or ask the organizer to add the runner.' })
      return
    }
    record(participant, 'manual')
  }

  const matches = useMemo(() => {
    const q = bibInput.trim().toLowerCase()
    if (!q) return []
    return (station?.roster ?? []).filter((p) => (p.bib && String(p.bib).toLowerCase().startsWith(q)) || `${p.first_name} ${p.family_name}`.toLowerCase().includes(q)).slice(0, 6)
  }, [bibInput, station])

  const queued = log.filter((e) => e.state === 'queued').length
  const through = useMemo(() => {
    const ids = new Set(station?.through ?? [])
    for (const entry of log) if (entry.outcome !== 'unknown' && entry.outcome !== 'duplicate') ids.add(entry.participant_id)
    return ids.size
  }, [station, log])

  if (error && !station) {
    return (
      <StationShell>
        <Notice kind="error" title="This station link does not work">
          {error}
        </Notice>
      </StationShell>
    )
  }
  if (!station) return <StationShell><p className="text-sm text-slate-500">Loading the station…</p></StationShell>

  const { checkpoint, race } = station
  const live = race.status === 'live'
  return (
    <StationShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">
            {race.event_name?.toUpperCase()} · {race.course_name?.toUpperCase()}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">
            <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-white ${KIND_CLASS[checkpoint.kind] ?? 'bg-slate-700'}`}>{KIND_LABEL[checkpoint.kind] ?? checkpoint.kind}</span>
            {checkpoint.name}
            {checkpoint.distance_km != null && <span className="font-mono text-sm font-normal text-slate-500">km {checkpoint.distance_km}</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[.06em] ${live ? 'bg-emerald-50 text-emerald-700' : race.status === 'finished' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
            <i className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : race.status === 'finished' ? 'bg-slate-400' : 'bg-amber-500'}`} />
            {live ? `LIVE · GUN ${clock(race.started_at)}` : race.status === 'finished' ? 'RACE OVER' : 'NOT STARTED YET'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat icon={Users} value={through} label={`of ${station.roster.length} through`} />
        <Stat icon={queued ? CloudUpload : CheckCircle2} value={queued} label={queued ? 'waiting to send' : 'all sent'} tone={queued ? 'amber' : 'ok'} />
        <Stat icon={offline ? WifiOff : RefreshCw} value={offline ? 'Offline' : 'Online'} label={offline ? 'scans are kept here' : syncing ? 'sending…' : 'synced'} tone={offline ? 'bad' : 'ok'} small />
      </div>

      {!live && race.status === 'planning' && (
        <div className="mt-4">
          <Notice kind="warning">The race has not been started in the suite yet. You can record passings already; times will count from the gun once the organizer presses Start.</Notice>
        </div>
      )}

      {flash && (
        <div role="status" className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
          {flash.ok ? <CheckCircle2 size={22} className="mt-0.5 shrink-0" /> : <XCircle size={22} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{flash.title}</p>
            <p className="text-sm">{flash.detail}</p>
          </div>
        </div>
      )}
      {pendingDouble && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="font-bold">
            #{pendingDouble.participant.bib ?? '?'} {pendingDouble.participant.first_name} {pendingDouble.participant.family_name} was recorded here {pendingDouble.secondsAgo}s ago.
          </p>
          <p className="mt-1 text-sm">A second scan of the same bib is usually the same passing. Record it anyway only if the runner really passed again (a loop course).</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" className="min-h-9" onClick={() => setPendingDouble(null)}>
              It was the same passing
            </Button>
            <Button variant="danger" className="min-h-9" onClick={() => record(pendingDouble.participant, pendingDouble.source, { force: true })}>
              Record anyway
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0b1220]">
            <Camera size={15} /> Scan the bib
          </h2>
          <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-xl bg-[#0b1220]">
            <video ref={videoRef} className={`h-full w-full object-cover ${scanning ? '' : 'hidden'}`} />
            {!scanning && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-slate-300">
                <CameraOff size={26} />
                <p className="text-xs">{cameraSupported() ? 'The camera is off. Start it and hold the bib’s QR code in view.' : 'This browser has no camera access; take bib numbers by hand.'}</p>
              </div>
            )}
            {scanning && <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/70" />}
          </div>
          <Button className="mt-3 w-full" variant={scanning ? 'secondary' : 'primary'} onClick={toggleCamera} disabled={!cameraSupported()}>
            {scanning ? <><CameraOff size={15} /> Stop the camera</> : <><Camera size={15} /> Start the camera</>}
          </Button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0b1220]">
            <Hash size={15} /> Or type the bib number
          </h2>
          <form onSubmit={submitBib} className="mt-3 flex gap-2">
            <input
              value={bibInput}
              onChange={(e) => setBibInput(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Bib"
              aria-label="Bib number"
              className={`${inputClass} text-2xl font-bold`}
            />
            <Button type="submit" className="shrink-0 px-5">
              Record
            </Button>
          </form>
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {matches.map((p) => (
                <li key={p.participant_id}>
                  <button type="button" onClick={() => record(p, 'manual')} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-blue-50">
                    <span className="font-mono text-base font-bold text-[#0b1220]">#{p.bib ?? '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{p.first_name} {p.family_name}</span>
                    <span className="text-xs font-semibold text-blue-600">Record</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            A passing is kept on this phone until OTRI has confirmed it. Keep the page open; closing the browser is fine, clearing its data is not.
          </p>
        </section>
      </div>

      <section className="mt-5">
        <h2 className="text-sm font-bold text-[#0b1220]">Recorded here</h2>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nobody yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {log.slice(0, 40).map((entry) => (
              <li key={entry.client_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 font-mono text-base font-bold text-[#0b1220]">#{entry.bib ?? '—'}</span>
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="font-mono text-xs text-slate-500">{clock(entry.recorded_at)}</span>
                <span className="w-20 shrink-0 text-right font-mono text-[10px] tracking-[.06em]">
                  {entry.state === 'queued' ? (
                    <span className="text-amber-600">QUEUED</span>
                  ) : entry.outcome === 'duplicate' ? (
                    <span className="text-slate-400">DOUBLE</span>
                  ) : entry.outcome === 'unknown' ? (
                    <span className="text-red-600">UNKNOWN</span>
                  ) : (
                    <span className="text-emerald-600">SENT</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </StationShell>
  )
}

function Stat({ icon: Icon, value, label, tone = 'plain', small = false }) {
  const tones = { plain: 'text-[#0b1220]', ok: 'text-emerald-700', amber: 'text-amber-700', bad: 'text-red-700' }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-3">
      <Icon size={14} className={`mx-auto ${tones[tone]}`} />
      <p className={`mt-1 font-bold tracking-[-.02em] ${small ? 'text-sm' : 'text-2xl'} ${tones[tone]}`}>{value}</p>
      <p className="text-[10px] leading-4 text-slate-500">{label}</p>
    </div>
  )
}

function StationShell({ children }) {
  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1220]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-[min(860px,calc(100%-28px))] items-center justify-between">
          <Logo href="../#home" />
          <span className="font-mono text-[9px] tracking-[.08em] text-slate-500">RACE SUITE · STATION</span>
        </div>
      </header>
      <main className="mx-auto w-[min(860px,calc(100%-28px))] py-6">{children}</main>
      <footer className="mx-auto w-[min(860px,calc(100%-28px))] pb-8 text-[11px] text-slate-400">
        <p className="inline-flex items-center gap-1.5">
          <CloudOff size={11} /> Works without signal once loaded. Times come from this phone’s clock, corrected against OTRI’s when the page loaded.
        </p>
      </footer>
    </div>
  )
}

/** A runner scans their own bib: their race, their bib, their splits, and nothing about anyone else. */
export function BibPage({ token }) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let timer
    const load = () =>
      getBib(token)
        .then((data) => {
          setMe(data)
          setError(null)
          if (data.race.status === 'live') timer = setTimeout(load, 30_000)
        })
        .catch((err) => setError(err.message))
    load()
    return () => clearTimeout(timer)
  }, [token])

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1220]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-[min(640px,calc(100%-28px))] items-center justify-between">
          <Logo href="../#home" />
          <span className="font-mono text-[9px] tracking-[.08em] text-slate-500">YOUR RACE</span>
        </div>
      </header>
      <main className="mx-auto w-[min(640px,calc(100%-28px))] py-8">
        {error && <Notice kind="error">{error}</Notice>}
        {!me && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {me && (
          <>
            <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">
              {me.race.event_name?.toUpperCase()} · {me.race.course_name?.toUpperCase()}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-.04em]">
              {me.first_name ? `${me.first_name}, ` : ''}bib <span className="font-mono">#{me.bib ?? '—'}</span>
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {me.status === 'finished' && me.finish_seconds != null ? (
                <>Finished in <strong className="font-mono text-[#0b1220]">{hms(me.finish_seconds)}</strong>.</>
              ) : me.race.status === 'live' ? (
                'The race is on. This page refreshes as you pass each checkpoint.'
              ) : me.race.status === 'finished' ? (
                `Race over. Your status: ${me.status.toUpperCase()}.`
              ) : (
                'The race has not started yet. Keep this page: your splits will appear here.'
              )}
            </p>
            <ol className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {me.checkpoints.map((c, index) => {
                const split = me.splits.find((s) => s.name === c.name && s.kind === c.kind)
                return (
                  <li key={`${c.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                    <MapPin size={14} className={split ? 'text-emerald-600' : 'text-slate-300'} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{c.name}</span>
                      {c.distance_km != null && <span className="font-mono text-[10px] text-slate-500">km {c.distance_km}</span>}
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm font-bold">{split ? hms(split.elapsed_seconds) : '—'}</span>
                      {split && <span className="font-mono text-[10px] text-slate-500">{clock(split.recorded_at)}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="mt-6 text-xs leading-5 text-slate-500">
              Times are provisional until the organizer publishes the results. Only you see this page: it is tied to the code on your bib.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
