import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowUpRight, Mail } from 'lucide-react'
import Logo from '../src/components/Logo'
import UnitsMenu from '../src/components/UnitsMenu'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Home from './Home'
import NextSteps from './NextSteps'
import RaceCard, { DemoBadge } from './RaceCard'
import ScoreCalculator from './ScoreCalculator'
import CourseMap from '../src/components/CourseMap'
import { fetchRaceGpxFile, getApiStatus, getRace, getRaceMeasurement, getRaceResults, listRaces } from './apiClient'
import '../src/styles.css'

// Injected at build time by vite.config.js from `git rev-parse`/`git log` — see there for the
// fallback when no .git is available (e.g. a tarball deploy).
const COMMIT = typeof __OTRI_COMMIT__ !== 'undefined' ? __OTRI_COMMIT__ : 'unknown'
const COMMIT_FULL = typeof __OTRI_COMMIT_FULL__ !== 'undefined' ? __OTRI_COMMIT_FULL__ : ''
const COMMIT_DATE = typeof __OTRI_COMMIT_DATE__ !== 'undefined' ? __OTRI_COMMIT_DATE__ : ''
const COMMIT_URL = COMMIT_FULL ? `https://github.com/OTRI-run/otri/commit/${COMMIT_FULL}` : null
const GITHUB_URL = 'https://github.com/OTRI-run/otri'

function formatTimeAgo(isoDate) {
  if (!isoDate) return null
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [label, secondsInUnit] of units) {
    const value = Math.floor(seconds / secondsInUnit)
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

function BuildBanner() {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(COMMIT_DATE))
  const [apiStartedAt, setApiStartedAt] = useState(null)
  const [apiTimeAgo, setApiTimeAgo] = useState(null)
  const [apiUnreachable, setApiUnreachable] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setTimeAgo(formatTimeAgo(COMMIT_DATE)), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    getApiStatus()
      .then((status) => {
        if (!cancelled) setApiStartedAt(status.started_at)
      })
      .catch(() => {
        if (!cancelled) setApiUnreachable(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!apiStartedAt) return undefined
    setApiTimeAgo(formatTimeAgo(apiStartedAt))
    const id = setInterval(() => setApiTimeAgo(formatTimeAgo(apiStartedAt)), 60_000)
    return () => clearInterval(id)
  }, [apiStartedAt])

  return (
    <div className="h-7 bg-[#0b1220] text-center font-mono text-[10px] leading-7 text-slate-300">
      Built from commit{' '}
      {COMMIT_URL ? (
        <a href={COMMIT_URL} target="_blank" rel="noreferrer" className="font-semibold text-white underline underline-offset-2">
          {COMMIT}
        </a>
      ) : (
        <span className="font-semibold text-white">{COMMIT}</span>
      )}
      {timeAgo ? ` · ${timeAgo}` : ''}
      {apiStartedAt && ` · API last restarted ${apiTimeAgo}`}
      {apiUnreachable && ' · API unreachable'}
    </div>
  )
}

// ------------------------------------------------------------------------------------ routing
// Hash routes so every screen has a URL: #home (default), #races, #races/<race_id>, #calculator.

function parseHash(hash) {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('calculator')) return { tab: 'calculator', raceId: null }
  const raceMatch = path.match(/^races\/(.+)$/)
  if (raceMatch) return { tab: 'races', raceId: decodeURIComponent(raceMatch[1]) }
  if (path.startsWith('races')) return { tab: 'races', raceId: null }
  return { tab: 'home', raceId: null }
}

function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return useMemo(() => parseHash(hash), [hash])
}

function navigate(hash) {
  window.location.hash = hash
  window.scrollTo({ top: 0 })
}

// ------------------------------------------------------------------------------------- shell

const NAV = [
  { id: 'calculator', label: 'Calculate score', href: '#calculator' },
  { id: 'races', label: 'Races', href: '#races' },
]

function NavLink({ item, active, className = '' }) {
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`text-[13px] font-medium no-underline ${active ? 'text-[#0b1220]' : 'text-slate-500 hover:text-slate-950'} ${className}`}
    >
      {item.label}
    </a>
  )
}

function Header({ tab }) {
  return (
    <>
      <header className="sticky top-0 z-50 h-[68px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-full min-w-0 w-[min(1120px,calc(100%-28px))] items-center">
          <Logo href="#home" />
          <div className="ml-auto mr-6 hidden shrink-0 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[9px] font-medium tracking-[.08em] text-blue-600 sm:flex">
            <i className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_0_3px_#dbeafe]" />
            PROTOTYPE <span className="text-slate-400">v0.x</span>
          </div>
          <nav className="hidden shrink-0 items-center gap-7 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.id} item={item} active={tab === item.id} />
            ))}
            <a href="organizer/" className="text-[13px] font-medium text-slate-500 no-underline hover:text-slate-950">
              For organizers
            </a>
            <a className="flex items-center gap-1 text-[13px] font-semibold text-[#0b1220] no-underline" href={GITHUB_URL}>
              GitHub <ArrowUpRight size={14} />
            </a>
            <UnitsMenu />
          </nav>
          <a
            className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white no-underline md:hidden"
            href="organizer/"
          >
            Organizers <ArrowUpRight size={13} />
          </a>
        </div>
      </header>
      {/* Small screens: the section links live in their own row under the header. */}
      <div className="border-b border-slate-200 bg-white md:hidden">
        <div className="mx-auto flex w-[min(1120px,calc(100%-28px))] items-center gap-5">
          {NAV.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={tab === item.id}
              className={`border-b-2 py-3 ${tab === item.id ? 'border-blue-600' : 'border-transparent'}`}
            />
          ))}
          <div className="ml-auto py-1.5">
            <UnitsMenu />
          </div>
        </div>
      </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6">
      <div className="mx-auto flex w-[min(1120px,calc(100%-28px))] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <Logo href="../" />
        <a href="mailto:hello@otri.run" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 no-underline hover:text-blue-600">
          <Mail size={14} />
          hello@otri.run
        </a>
        <span className="font-mono text-[8px] tracking-[.08em] text-slate-500">OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT</span>
      </div>
    </footer>
  )
}

// ------------------------------------------------------------------------------------- races
// Published races come straight from the API: what an organizer publishes is what the public sees.

function formatHms(totalSeconds) {
  if (totalSeconds == null) return '—'
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Leaderboard({ raceId, onBack }) {
  const units = useUnits()
  const [race, setRace] = useState(null)
  const [results, setResults] = useState(null)
  const [course, setCourse] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRace(null)
    setResults(null)
    setCourse(null)
    setError(null)
    Promise.all([getRace(raceId), getRaceResults(raceId)])
      .then(([loaded, rows]) => {
        if (cancelled) return
        setRace(loaded)
        setResults(rows)
        if (loaded.has_gpx) {
          Promise.all([fetchRaceGpxFile(raceId), getRaceMeasurement(raceId)])
            .then(async ([file, measurement]) => {
              const gpxText = await file.text()
              if (!cancelled) setCourse({ gpxText, measurement })
            })
            .catch(() => {})
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [raceId])

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
        <ArrowLeft size={13} /> All races
      </button>
      {error && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
      {!race && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      {race && (
        <>
          <p className="mt-6 flex items-center gap-3 font-mono text-[9px] tracking-[.08em] text-blue-600">
            {race.event_date}
            {race.is_demo && <DemoBadge />}
          </p>
          <h2 className="mt-2 text-[clamp(32px,4.5vw,52px)] font-bold leading-[.98] tracking-[-.05em] text-[#0b1220]">{race.event_name}</h2>
          <p className="mt-3 text-sm text-slate-500">
            {race.course_name} · {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
            {race.has_gpx ? ' · Verified course' : ' · Official figures, no course file'}
          </p>
          {race.is_demo && (
            <p className="mt-2 text-xs text-slate-500">Demo data: synthetic runners and results, here to show what a scored race looks like.</p>
          )}
          {course && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
              <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="p-3" />
            </div>
          )}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Runner</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">OTRI score</th>
                  <th className="px-4 py-3">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(results ?? []).map((row) => (
                  <tr key={`${row.rank}-${row.bib_number ?? row.family_name}-${row.first_name}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.rank}</td>
                    <td className="px-4 py-3 font-medium text-[#0b1220]">
                      {row.first_name} {row.family_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatHms(row.finish_time_seconds)}</td>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-blue-600">{row.otri_score}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.confidence}</td>
                  </tr>
                ))}
                {results?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No results published yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[9px] tracking-[.05em] text-slate-400">
            scoring_version {race.scoring_version} · Course Standard model — depends only on the course and each runner's own
            finish time, never the field
          </p>
          <NextSteps
            items={[
              ['Where would you land?', race.has_gpx ? 'Try a target time on this exact course.' : 'Pick a course and a target time. The score updates live.', race.has_gpx ? 'Calculate your score here' : 'Calculate your score', race.has_gpx ? `#calculator?race=${encodeURIComponent(race.race_id)}` : '#calculator'],
              ['Organize a race like this?', 'Upload official results and the course file; every finisher gets a score.', 'For organizers', 'organizer/'],
              ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/HOW-OTRI-SCORES.md'],
            ]}
          />
        </>
      )}
    </div>
  )
}

function RacesPage({ raceId }) {
  const [races, setRaces] = useState(null)
  const [error, setError] = useState(null)

  // Refetch whenever the list is shown (also on the way back from a leaderboard), so a race
  // published or taken down meanwhile is reflected.
  useEffect(() => {
    if (raceId) return undefined
    let cancelled = false
    listRaces()
      .then((rows) => !cancelled && setRaces(rows))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [raceId])

  const hasDemo = races?.some((race) => race.is_demo)

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className="mx-auto w-[min(1120px,calc(100%-28px))]">
        {raceId ? (
          <Leaderboard raceId={raceId} onBack={() => navigate('#races')} />
        ) : (
          <>
            <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
              <div className="font-mono text-xs text-blue-600">01</div>
              <div className="min-w-0">
                <p className="mb-3 font-mono text-[10px] tracking-[.08em] text-slate-500">RACES</p>
                <h1 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
                  Scored races.
                  <br />
                  <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">Every number explained.</span>
                </h1>
              </div>
              <p className="min-w-0 text-sm leading-7 text-slate-500">
                Races their organizers have published, scored under the Course Standard model. Each score depends only on the
                course and the runner's own finish time — never on who else raced.
                {hasDemo ? ' Races marked DEMO DATA are synthetic examples.' : ''}
              </p>
            </div>
            {error && <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
            {races === null && !error && <p className="mt-8 text-sm text-slate-500">Loading races…</p>}
            {races?.length === 0 && <p className="mt-8 text-sm text-slate-500">No races have been published yet.</p>}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(races ?? []).map((race) => (
                <RaceCard key={race.race_id} race={race} />
              ))}
            </div>
            <NextSteps
              items={[
                ['Your race is not here?', 'Score any course yourself: pick a verified one or upload a GPX.', 'Calculate your score', '#calculator'],
                ['Organize a race?', 'Upload official results and the course file; every finisher gets a score.', 'For organizers', 'organizer/'],
                ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/HOW-OTRI-SCORES.md'],
              ]}
            />
          </>
        )}
      </div>
    </section>
  )
}

// The API's verification and password-reset emails link to this page with a query parameter
// (see api/email.py). Hand those straight to the organizer app's routes.
function redirectAuthLinks() {
  const params = new URLSearchParams(window.location.search)
  const verify = params.get('verify_email')
  const reset = params.get('reset_token')
  if (verify) window.location.replace(`organizer/#/verify?token=${encodeURIComponent(verify)}`)
  else if (reset) window.location.replace(`organizer/#/reset?token=${encodeURIComponent(reset)}`)
}
redirectAuthLinks()

function App() {
  const route = useRoute()

  return (
    <div id="top" className="min-h-screen max-w-full overflow-x-clip bg-[#f7f9fc] text-[#0b1220]">
      <BuildBanner />
      <Header tab={route.tab} />
      <main>
        {route.tab === 'home' && <Home />}
        {route.tab === 'races' && <RacesPage raceId={route.raceId} />}
        {route.tab === 'calculator' && <ScoreCalculator />}
      </main>
      <Footer />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
