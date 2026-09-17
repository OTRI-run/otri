import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowUpRight, Mail, Mountain, TrendingUp } from 'lucide-react'
import Logo from '../src/components/Logo'
import ScoreCalculator from './ScoreCalculator'
import { getApiStatus } from './apiClient'
import racesData from './data/races.json'
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
// Hash routes so every screen has a URL: #races, #races/<race_id>, #calculator.

function parseHash(hash) {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('calculator')) return { tab: 'calculator', raceId: null }
  const raceMatch = path.match(/^races\/(.+)$/)
  return { tab: 'races', raceId: raceMatch ? decodeURIComponent(raceMatch[1]) : null }
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
  { id: 'races', label: 'Races', href: '#races' },
  { id: 'calculator', label: 'Calculate score', href: '#calculator' },
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
          <Logo href="../" />
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
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[8px] tracking-[.08em] text-blue-600">
            <i className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            PROTOTYPE
          </span>
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

function RaceCard({ race, onSelect }) {
  return (
    <button
      onClick={() => onSelect(race.race_id)}
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300 hover:shadow-[0_14px_34px_rgba(37,99,235,.12)]"
    >
      <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">{race.race_id}</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#0b1220]">{race.race_name}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {race.course_name} · {race.event_date}
      </p>
      <div className="mt-4 flex gap-4 font-mono text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <TrendingUp size={12} className="text-blue-600" />
          {race.distance_km} km
        </span>
        <span className="flex items-center gap-1">
          <Mountain size={12} className="text-blue-600" />+{race.elevation_gain_m} m
        </span>
      </div>
      <div className="mt-4 text-xs font-semibold text-blue-600">
        {race.leaderboard.length} scored{race.non_finishers > 0 ? ` · ${race.non_finishers} DNF` : ''}
      </div>
    </button>
  )
}

function Leaderboard({ race, onBack }) {
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
        <ArrowLeft size={13} /> All races
      </button>
      <p className="mt-6 font-mono text-[9px] tracking-[.08em] text-blue-600">{race.race_id}</p>
      <h2 className="mt-2 text-[clamp(32px,4.5vw,52px)] font-bold leading-[.98] tracking-[-.05em] text-[#0b1220]">{race.race_name}</h2>
      <p className="mt-3 text-sm text-slate-500">
        {race.course_name} · {race.distance_km} km · +{race.elevation_gain_m} m · {race.event_date}
      </p>
      {race.non_finishers > 0 && (
        <p className="mt-2 text-xs text-slate-500">{race.non_finishers} runner(s) did not finish (excluded from scoring).</p>
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
            {race.leaderboard.map((row) => (
              <tr key={row.bib_number ?? `${row.family_name}-${row.first_name}`} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.rank}</td>
                <td className="px-4 py-3 font-medium text-[#0b1220]">
                  {row.first_name} {row.family_name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.finish_time ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-blue-600">{row.otri_score}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{row.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[9px] tracking-[.05em] text-slate-400">
        scoring_version {race.leaderboard[0]?.scoring_version ?? 'n/a'} · Course Standard model — depends only on the course and
        each runner's own finish time, never the field
      </p>
    </div>
  )
}

function RacesPage({ raceId }) {
  const selectedRace = useMemo(() => racesData.races.find((race) => race.race_id === raceId) ?? null, [raceId])

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className="mx-auto w-[min(1120px,calc(100%-28px))]">
        {selectedRace ? (
          <Leaderboard race={selectedRace} onBack={() => navigate('#races')} />
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
                Demonstration races scored under the Course Standard model. Each score depends only on the course and the
                runner's own finish time — never on who else raced. Open a race to see its leaderboard.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {racesData.races.map((race) => (
                <RaceCard key={race.race_id} race={race} onSelect={(id) => navigate(`#races/${encodeURIComponent(id)}`)} />
              ))}
            </div>
            <p className="mt-8 text-sm text-slate-500">
              Want a number for your own race?{' '}
              <a href="#calculator" className="font-semibold text-blue-600 no-underline">
                Calculate a score →
              </a>
            </p>
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
        {route.tab === 'races' && <RacesPage raceId={route.raceId} />}
        {route.tab === 'calculator' && <ScoreCalculator />}
      </main>
      <Footer />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
