import './main.css'
import shell from './Shell.module.css'
import RankBadge from '../src/components/RankBadge'
import { fitFontSize } from '../src/lib/fitText'
import React, { useEffect, useMemo, useState, lazy, Suspense } from 'preact/compat'
import { createRoot } from 'preact/compat/client'
import { ArrowLeft, ArrowUpRight, Mail, Download, Upload, Play, ArrowRight, Calculator as CalculatorIcon } from 'lucide-react'
import { countryName } from '../src/components/CountrySelect'
import Logo from '../src/components/Logo'
import UnitsMenu from '../src/components/UnitsMenu'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Home from './Home'
import NextSteps from './NextSteps'
import RaceCard, { DemoBadge, VerticalBadge } from './RaceCard'
import RaceListing, { ListingBadge } from './RaceListing'
const ScoreCalculator = lazy(() => import('./ScoreCalculator'))
const ScoreRace = lazy(() => import('./ScoreRace'))
const ApiDocs = lazy(() => import('./ApiDocs'))
const Media = lazy(() => import('./Media'))
const FaqPage = lazy(() => import('./Faq'))
const RunnersPage = lazy(() => import('./Runners').then(m => ({ default: m.RunnersPage })))
const RunnerProfilePage = lazy(() => import('./Runners').then(m => ({ default: m.RunnerProfilePage })))
import CourseMap from '../src/components/LazyCourseMap'
import ReportForm from './ReportForm'
import { ShareResults } from './SharePanel'
import Flag from '../src/components/Flag'
import SearchSuggest from '../src/components/SearchSuggest'
import { RACE_NAMES } from '../src/lib/raceNames'
import { knownButNotHere } from '../src/lib/suggest'
import { initMonitoring } from '../src/lib/monitoring'
import { useDocumentTitle } from '../src/lib/title'

initMonitoring()

const PAGE_TITLES = {
  home: 'OTRI — Open Trail Running Index',
  races: 'Scored races · OTRI',
  runners: 'Runners · OTRI',
  calculator: 'Score calculator · OTRI',
  score: 'Score my race · OTRI',
  api: 'API and embed · OTRI',
  faq: 'FAQ · OTRI',
  media: 'Media and brand · OTRI',
  notfound: 'Page not found · OTRI',
}
import { fetchRaceGpxFile, getRace, getRaceMeasurement, getRaceResults, listRaces, raceGpxDownloadUrl } from './apiClient'
import BuildBanner from '../src/components/BuildBanner'
import ErrorBoundary from '../src/components/ErrorBoundary'
import NotFound from '../src/components/NotFound'
import { modelLabel, notScoredReason } from '../src/lib/model'
import BackToTop from '../src/components/BackToTop'
import { installDropGuard, installScrollMemory, installSearchShortcut, willNavigate } from '../src/lib/comfort'
import '../src/styles.css'

installScrollMemory()
installDropGuard()
installSearchShortcut()

const GITHUB_URL = 'https://github.com/OTRI-run/otri'

// ------------------------------------------------------------------------------------ routing
// Hash routes so every screen has a URL: #home (default), #races, #races/<race_id>, #runners,
// #runners/<runner_id>, #calculator, #score (score my race), #api. The races page keeps its view and filters in the query
// (#races?country=THA&distance=ultra), so a filtered list is a link that can be shared.

function parseHash(hash) {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('faq')) return { tab: 'faq', raceId: null, faqQuery: new URLSearchParams(path.split('?')[1] || '').get('q') || '' }
  if (path.startsWith('calculator')) return { tab: 'calculator', raceId: null }
  if (path === 'score' || path.startsWith('score?')) return { tab: 'score', raceId: null }
  if (path === 'api' || path.startsWith('api?')) return { tab: 'api', raceId: null }
  if (path === 'media' || path === 'brand' || path === 'press') return { tab: 'media', raceId: null }
  const raceMatch = path.match(/^races\/(.+)$/)
  if (raceMatch) return { tab: 'races', raceId: decodeURIComponent(raceMatch[1]) }
  if (path.startsWith('races')) return { tab: 'races', raceId: null }
  const runnerMatch = path.match(/^runners\/(.+)$/)
  if (runnerMatch) return { tab: 'runners', raceId: null, runnerId: decodeURIComponent(runnerMatch[1]) }
  if (path.startsWith('runners')) return { tab: 'runners', raceId: null, runnerId: null }
  // #contribute is a place on the home page (Home.jsx scrolls to it), not a page of its own.
  if (path === '' || path === 'home' || path === 'top' || path === 'contribute') return { tab: 'home', raceId: null }
  return { tab: 'notfound', raceId: null }
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
  willNavigate() // the next page opens at its top (src/lib/comfort.js)
  window.location.hash = hash
}

// ------------------------------------------------------------------------------------- shell

// The header carries what a visitor came to do; the API page and GitHub are in the footer (GitHub
// also sits in the home page's opening, next to what OTRI is).
const NAV = [
  { id: 'calculator', label: 'Calculator', href: '#calculator' },
  { id: 'score', label: 'Score a race', short: 'Score', href: '#score' },
  { id: 'races', label: 'Races', href: '#races' },
  { id: 'runners', label: 'Runners', href: '#runners' },
  { id: 'faq', label: 'FAQ', href: '#faq' },
]

function NavLink({ item, active, short = false }) {
  return <a href={item.href} aria-current={active ? 'page' : undefined} className={shell.navLink}>{short ? item.short ?? item.label : item.label}</a>
}

function Header({ tab }) {
  return <>
    <header className={shell.header} data-home={tab === 'home' || undefined}>
      <div className={shell.headerInner}>
        <Logo href="#home" />
        <nav className={shell.desktopNav} aria-label="Main navigation">
          {NAV.map(item=><NavLink key={item.id} item={item} active={tab===item.id}/>)}
          <UnitsMenu compact />
          <a href="organizer/" className={shell.organizer}>For organizers <ArrowUpRight size={14}/></a>
        </nav>
        <a className={`${shell.organizer} ${shell.mobileOrganizer}`} href="organizer/">Organizers <ArrowUpRight size={14}/></a>
      </div>
    </header>
    <nav className={shell.mobileNav} aria-label="Mobile navigation"><div className={shell.mobileInner}>
      {NAV.map(item=><NavLink key={item.id} item={item} active={tab===item.id} short/>)}
      <div className={shell.units}><UnitsMenu compact/></div>
    </div></nav>
  </>
}

function Footer() {
  return <footer className={shell.footer}><div className={shell.footerInner}>
    <Logo href="../"/>
    <nav aria-label="Footer navigation">
      {[["#api","API and embed"],[GITHUB_URL,"GitHub"],["#contribute","Contribute"],["#faq","FAQ"],["#media","Media and logo"],[`${GITHUB_URL}/blob/main/PRIVACY.md`,"Privacy"]].map(([href,label])=><a key={label} href={href}>{label}</a>)}
      <a href="mailto:hello@otri.run"><Mail size={14}/>hello@otri.run</a>
    </nav>
    <p>OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT</p>
  </div></footer>
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
  const [sharing, setSharing] = useState(false)
  useDocumentTitle(race ? `${race.event_name} · ${race.course_name} · OTRI` : 'Race · OTRI')

  useEffect(() => {
    let cancelled = false
    setRace(null)
    setResults(null)
    setCourse(null)
    setError(null)
    getRace(raceId)
      .then(async (loaded) => [loaded, loaded.is_published ? await getRaceResults(raceId) : []])
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
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [raceId])

  return (
    <div>
      <button onClick={onBack} className="prototype-main-leaderboard-button-1">
        <ArrowLeft size={13} /> All races
      </button>
      {error && error.status === 404 && (
        <NotFound eyebrow="RACE NOT FOUND" title="No race with that id." where={raceId} home="#races" homeLabel="All races" note="It may have been unpublished by its organizer or removed after a report." />
      )}
      {error && error.status !== 404 && <p className="prototype-main-leaderboard-p-2">{error.message}</p>}
      {!race && !error && <p className="prototype-main-leaderboard-p-3">Loading…</p>}
      {race && (
        <>
          <p className="prototype-main-leaderboard-p-4">
            <span>{race.event_date}</span>
            {(race.event_location || race.event_country) && (
              <span className="prototype-main-leaderboard-span-5">
                {race.event_country && <Flag code={race.event_country} showCode={false} />}
                {[race.event_location, race.event_country].filter(Boolean).join(' · ').toUpperCase()}
              </span>
            )}
            <ListingBadge status={race.listing_status} />
            {race.is_vertical && <VerticalBadge />}
            {race.is_demo && <DemoBadge />}
          </p>
          <h2 className="prototype-main-leaderboard-h2-6 otri-fit" style={{ fontSize: fitFontSize(race.event_name, { min: 28, vw: 4.5, max: 52 }) }}>{race.event_name}</h2>
          <p className="prototype-main-leaderboard-p-7">
            {race.course_name} · {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
            {race.has_gpx ? ' · Measured from the course file' : ' · Official figures, no course file'}
          </p>
          {race.organizer_display && (
            <p className="prototype-main-leaderboard-p-8">
              Organized by{' '}
              {race.organizer_website ? (
                <a href={race.organizer_website} target="_blank" rel="noreferrer" className="prototype-main-leaderboard-a-9">
                  {race.organizer_display} ↗
                </a>
              ) : (
                <span className="prototype-main-leaderboard-span-10">{race.organizer_display}</span>
              )}
            </p>
          )}
          {race.is_demo && (
            <p className="prototype-main-leaderboard-p-8">Demo data: synthetic runners and results, here to show what a scored race looks like.</p>
          )}
          {course && (
            <div className="prototype-main-leaderboard-div-11">
              <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="prototype-main-leaderboard-course-map-12" />
              <div className="prototype-main-leaderboard-div-13">
                <p className="prototype-main-leaderboard-p-14">The course as a GPX file for your watch or app: the track and its elevations, nothing else from the original file.</p>
                <a href={raceGpxDownloadUrl(race.race_id)} className="prototype-main-leaderboard-a-15">
                  <Download size={14} /> Download the GPX
                </a>
              </div>
            </div>
          )}
          {!race.is_published && <RaceListing race={race} />}
          {race.is_published && (
            <>
            {notScoredReason(results) && (
              <p className="prototype-main-leaderboard-p-16">
                <strong className="prototype-main-leaderboard-strong-17">Finish times only.</strong> {notScoredReason(results)}
              </p>
            )}
            <div className="prototype-main-leaderboard-div-18">
              <table className="prototype-main-leaderboard-table-19">
                <thead>
                  <tr className="prototype-main-leaderboard-tr-20">
                    <th className="prototype-main-leaderboard-th-21">Rank</th>
                    <th className="prototype-main-leaderboard-th-21">Runner</th>
                    <th className="prototype-main-leaderboard-th-22">Country</th>
                    <th className="prototype-main-leaderboard-th-22">Gender</th>
                    <th className="prototype-main-leaderboard-th-21">Time</th>
                    <th className="prototype-main-leaderboard-th-21">OTRI score</th>
                  </tr>
                </thead>
                <tbody>
                  {(results ?? []).map((row) => (
                    <tr key={`${row.rank}-${row.bib_number ?? row.family_name}-${row.first_name}`} className={`prototype-main-leaderboard-tr-23 ${row.status !== 'finisher' ? "prototype-main-leaderboard-tr-24" : "prototype-main-leaderboard-tr-25"}`}>
                      <td className="prototype-main-leaderboard-td-26"><RankBadge rank={row.rank} /></td>
                      <td className="prototype-main-leaderboard-td-27">
                        {row.runner_id ? (
                          <a href={`#runners/${encodeURIComponent(row.runner_id)}`} className="prototype-main-leaderboard-a-28">
                            {row.first_name} {row.family_name}
                          </a>
                        ) : (
                          <>
                            {row.first_name} {row.family_name}
                          </>
                        )}
                        <span className="prototype-main-leaderboard-span-29">
                          {row.nationality && <Flag code={row.nationality} />}
                          {row.gender && <span>{row.gender}</span>}
                        </span>
                      </td>
                      <td className="prototype-main-leaderboard-th-22">{row.nationality ? <Flag code={row.nationality} /> : <span className="prototype-main-leaderboard-span-30">—</span>}</td>
                      <td className="prototype-main-leaderboard-td-31">{row.gender ?? '—'}</td>
                      <td className="prototype-main-leaderboard-td-26">{formatHms(row.finish_time_seconds)}</td>
                      <td className="prototype-main-leaderboard-td-32">{row.otri_score ?? <span className="prototype-main-leaderboard-span-30">—</span>}</td>
                    </tr>
                  ))}
                  {results?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="prototype-main-leaderboard-td-33">
                        No results published yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="prototype-main-leaderboard-p-34">
              {modelLabel(race.scoring_version)} · depends only on the course and each runner's own finish time, never the field
            </p>
            {results?.some((row) => row.status === 'finisher') && (
              <div className="prototype-main-leaderboard-div-35">
                <button type="button" onClick={() => setSharing((open) => !open)} aria-expanded={sharing} className="prototype-main-leaderboard-button-36">
                  {sharing ? 'Close sharing' : 'Share these results: image and post text'}
                </button>
                {sharing && (
                  <div className="prototype-main-leaderboard-div-37">
                    <ShareResults raceName={`${race.event_name} ${race.course_name}`} distanceKm={race.distance_km} elevationGainM={race.elevation_gain_m} scores={results} url={window.location.href} />
                  </div>
                )}
              </div>
            )}
            </>
          )}
          <ReportForm kind="race" subjectId={race.race_id} subjectLabel={`${race.event_name} · ${race.course_name}`} prompt={race.is_published ? 'Wrong result, wrong course, or your name should not be here?' : 'Wrong details, or should this race not be listed?'} />
          <NextSteps
            items={[
              ['Where would you land?', race.has_gpx ? 'Try a target time on this exact course.' : 'Pick a course and a target time. The score updates live.', race.has_gpx ? 'Calculate your score here' : 'Calculate your score', race.has_gpx ? `#calculator?race=${encodeURIComponent(race.race_id)}` : '#calculator'],
              ['Organize a race like this?', 'Upload official results and the course file; every finisher gets a score.', 'For organizers', 'organizer/'],
              ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md'],
            ]}
          />
        </>
      )}
    </div>
  )
}

const RACE_PAGE_SIZE = 12
const DISTANCE_BUCKETS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'short', label: 'Up to 21 km', test: (race) => (race.distance_km ?? 0) <= 21.2 },
  { id: 'mid', label: '21–50 km', test: (race) => race.distance_km > 21.2 && race.distance_km <= 50 },
  { id: 'long', label: '50–100 km', test: (race) => race.distance_km > 50 && race.distance_km <= 100 },
  { id: 'ultra', label: '100 km+', test: (race) => race.distance_km > 100 },
  // Uphill-only courses, whatever their length: a category of its own.
  { id: 'vertical', label: 'Vertical', test: (race) => Boolean(race.is_vertical) },
]
// Scored races first (newest), then upcoming ones (soonest), then races still waiting for results
// (most asked for): a catalogue of listings must not bury the races that have something to show.
const STATUS_ORDER = { scored: 0, upcoming: 1, awaiting_results: 2 }
function featuredOrder(a, b) {
  const byStatus = (STATUS_ORDER[a.listing_status] ?? 3) - (STATUS_ORDER[b.listing_status] ?? 3)
  if (byStatus) return byStatus
  if (a.listing_status === 'upcoming') return (a.event_date ?? '').localeCompare(b.event_date ?? '')
  return (b.event_date ?? '').localeCompare(a.event_date ?? '')
}
const RACE_STATUSES = [
  ['all', 'Scored and listed'],
  ['scored', 'Scored'],
  ['upcoming', 'Upcoming'],
  ['awaiting_results', 'Awaiting results'],
]
const RACE_SORTS = {
  featured: { label: 'Scored first', by: featuredOrder },
  newest: { label: 'Newest first', by: (a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? '') },
  oldest: { label: 'Oldest first', by: (a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? '') },
  finishers: { label: 'Most finishers', by: (a, b) => (b.finisher_count ?? 0) - (a.finisher_count ?? 0) },
  longest: { label: 'Longest', by: (a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0) },
  shortest: { label: 'Shortest', by: (a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0) },
  climb: { label: 'Most climb', by: (a, b) => (b.elevation_gain_m ?? 0) - (a.elevation_gain_m ?? 0) },
  name: { label: 'Name A–Z', by: (a, b) => `${a.event_name} ${a.course_name}`.localeCompare(`${b.event_name} ${b.course_name}`) },
}
// The races page before anyone has published: not an empty room, but what fills it and what a
// visitor can do meanwhile. Races come from their organizers, so the first thing offered is a way
// to ask one.
function NoRacesYet() {
  const mail = `mailto:?subject=${encodeURIComponent('Our race on OTRI?')}&body=${encodeURIComponent(
    [
      'Hello,',
      'I would like to see our race on OTRI (https://otri.run), an open and free score for trail races: every finisher gets a score that depends only on the course and their own time, so it compares across races.',
      'Scoring the results takes about a minute and needs no account (https://otri.run/prototype/#score). Publishing them as a race page is free and needs no approval: https://otri.run/organizer/',
      'Thank you!',
    ].join('\n\n'),
  )}`
  const ways = [
    [Mail, 'Ask your organizer', 'Races appear here when their organizers publish results. A prepared email explains what OTRI is and that it is free.', mail, 'Write to them'],
    [Upload, 'Have the results yourself?', 'A course file and a results file are enough: every finisher scored in a minute, no account, and one click to publish.', '#score', 'Score a race'],
    [Play, 'See what a scored race looks like', 'The example race: its course on the map, the elevation profile and 100 finishers with their scores.', '#score?example=1', 'Open the example'],
    [CalculatorIcon, 'Just curious about a time?', 'Pick a course or upload a GPX and see what a finish time is worth, before or after race day.', '#calculator', 'Open the calculator'],
  ]
  return (
    <div className="prototype-main-no-races-yet-div-38">
      <div className="prototype-main-no-races-yet-div-39">
        <p className="prototype-main-no-races-yet-p-40">NO RACES PUBLISHED YET</p>
        <h2 className="prototype-main-no-races-yet-h2-41">The first race here could be yours.</h2>
        <p className="prototype-main-no-races-yet-p-42">
          OTRI keeps no list of every race: a race appears when its organizer publishes the results, free and without anyone's approval. Until then, here is
          what you can do.
        </p>
      </div>
      <div className="prototype-main-no-races-yet-div-43">
        {ways.map(([Icon, title, text, href, action]) => (
          <a key={title} href={href} className="prototype-main-no-races-yet-a-44 otri-group">
            <span className="prototype-main-no-races-yet-span-45">
              <Icon size={17} />
            </span>
            <span className="prototype-main-no-races-yet-span-46">
              <b className="prototype-main-no-races-yet-b-47">{title}</b>
              <span className="prototype-main-no-races-yet-span-48">{text}</span>
              <span className="prototype-main-no-races-yet-span-49">
                {action} <ArrowRight size={14} className="prototype-main-no-races-yet-arrow-right-50" />
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

const normalise = (text) => String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// The races page's state as it appears in the address, defaults left out.
const RACES_DEFAULTS = { q: '', distance: 'all', country: 'all', status: 'all', sort: 'featured' }
function readRacesQuery() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return Object.fromEntries(Object.entries(RACES_DEFAULTS).map(([key, fallback]) => [key, params.get(key) || fallback]))
}
function racesHash(state) {
  const params = new URLSearchParams(Object.entries(state).filter(([key, value]) => value && value !== RACES_DEFAULTS[key]))
  const text = params.toString()
  return `#races${text ? `?${text}` : ''}`
}

function RacesPage({ raceId }) {
  const [races, setRaces] = useState(null)
  const [error, setError] = useState(null)
  const initial = useMemo(readRacesQuery, [])
  const [query, setQuery] = useState(initial.q)
  const [bucket, setBucket] = useState(initial.distance)
  const [country, setCountry] = useState(initial.country)
  const [status, setStatus] = useState(initial.status)
  const [sort, setSort] = useState(initial.sort)
  const address = racesHash({ q: query, distance: bucket, country, status, sort })
  // Keep the address in step without adding a history entry per keystroke; a link opened from
  // elsewhere (another #races?… address) is read back into the state.
  useEffect(() => {
    if (!raceId && window.location.hash !== address) window.history.replaceState(null, '', address)
  }, [raceId, address])
  useEffect(() => {
    const onHash = () => {
      if (!/^#\/?races(\?|$)/.test(window.location.hash)) return
      const next = readRacesQuery()
      setQuery(next.q)
      setBucket(next.distance)
      setCountry(next.country)
      setStatus(next.status)
      setSort(next.sort)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [visible, setVisible] = useState(RACE_PAGE_SIZE)
  useEffect(() => setVisible(RACE_PAGE_SIZE), [query, bucket, country, status, sort])
  const hasListings = races?.some((race) => race.listing_status !== 'scored')

  const countryOptions = useMemo(() => {
    const codes = [...new Set((races ?? []).map((race) => race.event_country).filter(Boolean))]
    return codes.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [races])
  const shown = useMemo(() => {
    const words = normalise(query).split(/\s+/).filter(Boolean)
    const test = DISTANCE_BUCKETS.find((b) => b.id === bucket)?.test ?? (() => true)
    return (races ?? [])
      .filter(test)
      .filter((race) => country === 'all' || race.event_country === country)
      .filter((race) => status === 'all' || race.listing_status === status)
      .filter((race) => {
        if (!words.length) return true
        const hay = normalise(`${race.event_name} ${race.course_name} ${race.event_location ?? ''} ${countryName(race.event_country)} ${race.event_date ?? ''}`)
        return words.every((word) => hay.includes(word))
      })
      .sort(RACE_SORTS[sort]?.by ?? RACE_SORTS.featured.by)
  }, [races, query, bucket, country, status, sort])

  // Refetch whenever the list is shown (also on the way back from a leaderboard), so a race
  // published or taken down meanwhile is reflected.
  useEffect(() => {
    if (raceId) return undefined
    let cancelled = false
    listRaces()
      .then((rows) => !cancelled && setRaces(rows.filter((race) => !race.calculator_only)))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [raceId])

  const hasDemo = races?.some((race) => race.is_demo)

  return (
    <section className="prototype-main-races-page-section-51">
      <div className="prototype-main-races-page-div-52">
        {raceId ? (
          <Leaderboard raceId={raceId} onBack={() => navigate(address)} />
        ) : (
          <>
            <div className="prototype-main-races-page-div-53">
              <div className="prototype-main-no-races-yet-span-46">
                <p className="prototype-main-races-page-p-54">RACES</p>
                <h1 className="prototype-main-races-page-h1-55">
                  Scored races.
                  <br />
                  <span className="prototype-main-races-page-span-56">Every number explained.</span>
                </h1>
              </div>
              <p className="prototype-main-races-page-p-57">
                Races their organizers have published, all scored with the same open model. Each score depends only on the
                course and the runner's own finish time — never on who else raced.
                {hasListings ? ' Races marked UPCOMING or AWAITING RESULTS are listed by their organizer ahead of the results: open one to try a target time on its course.' : ''}
                {hasDemo ? ' Races marked DEMO DATA are synthetic examples.' : ''}
              </p>
            </div>
            {error && <p className="prototype-main-races-page-p-58">{error}</p>}
            {races === null && !error && <p className="prototype-main-races-page-p-59">Loading races…</p>}
            {races?.length === 0 && <NoRacesYet />}
            {races?.length > 0 && (
              <div className="prototype-main-races-page-div-60">
                <SearchSuggest
                  className="prototype-main-races-page-search-suggest-61"
                  value={query}
                  onChange={setQuery}
                  placeholder="Search by race, place or year…"
                  ariaLabel="Search races"
                  suggestions={[
                    ...shown.slice(0, 6).map((race) => ({
                      key: race.race_id,
                      label: `${race.event_name} · ${race.course_name}`,
                      detail: `${String(race.event_date ?? '').slice(0, 4)}${race.event_country ? ` · ${race.event_country}` : ''}`,
                      href: `#races/${encodeURIComponent(race.race_id)}`,
                    })),
                    // Well-known races nobody has published here: said in the list, not by an empty page.
                    ...knownButNotHere(RACE_NAMES, query, races.map((race) => race.event_name), 3).map((name) => ({ key: `known-${name}`, label: name, detail: 'not on OTRI yet' })),
                  ]}
                />
                <div className="prototype-main-races-page-div-62">
                  <div className="prototype-main-races-page-div-63" role="group" aria-label="Distance">
                    {DISTANCE_BUCKETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBucket(b.id)}
                        aria-pressed={bucket === b.id}
                        className={`prototype-main-races-page-button-64 ${bucket === b.id ? "prototype-main-races-page-button-65" : "prototype-main-races-page-button-66"}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {countryOptions.length > 1 && (
                    <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Country" className="prototype-main-races-page-select-67">
                      <option value="all">All countries</option>
                      {countryOptions.map((option) => (
                        <option key={option.code} value={option.code}>{option.name}</option>
                      ))}
                    </select>
                  )}
                  {hasListings && (
                    <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status" className="prototype-main-races-page-select-67">
                      {RACE_STATUSES.map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  )}
                  <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort races" className="prototype-main-races-page-select-67">
                    {Object.entries(RACE_SORTS).map(([id, option]) => (
                      <option key={id} value={id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {races?.length > 0 && (
              <p className="prototype-main-races-page-p-68" aria-live="polite">
                {shown.length === races.length ? `${races.length} races` : `${shown.length} of ${races.length} races match`}
              </p>
            )}
            {races?.length > 0 && shown.length === 0 && (
              <div className="prototype-main-races-page-div-69">
                <p className="prototype-main-leaderboard-span-10">{query.trim() ? `“${query.trim()}” is not on OTRI yet.` : 'No race matches.'}</p>
                <p className="prototype-main-races-page-p-70">
                  OTRI shows the races their organizers have published here; it keeps no list of every race. Try fewer words, another distance, or{' '}
                  <button type="button" onClick={() => { setQuery(''); setBucket('all'); setCountry('all'); setStatus('all') }} className="prototype-main-races-page-button-71">clear the filters</button>.
                </p>
                <p className="prototype-main-races-page-p-72">
                  Have its course as a GPX? <a href="#calculator" className="prototype-main-leaderboard-a-9">Work out what a time there is worth</a>.
                  Have the results too? <a href="#score" className="prototype-main-leaderboard-a-9">Score the whole race</a>, free and without an account.
                </p>
              </div>
            )}
            <div className="prototype-main-races-page-div-73">
              {shown.slice(0, visible).map((race) => (
                <RaceCard key={race.race_id} race={race} />
              ))}
            </div>
            {shown.length > 0 && (
              <div className="prototype-main-races-page-div-74">
                <p className="prototype-main-races-page-p-75">Showing {Math.min(visible, shown.length)} of {shown.length}</p>
                {shown.length > visible && (
                  <button
                    type="button"
                    onClick={() => setVisible((n) => n + RACE_PAGE_SIZE)}
                    className="prototype-main-races-page-button-76"
                  >
                    Show {Math.min(RACE_PAGE_SIZE, shown.length - visible)} more
                  </button>
                )}
              </div>
            )}
            <NextSteps
              items={[
                ['Your race is not here?', 'Organizers score a race in a minute, with no account. Runners can try a target time on any course.', 'Score a race', '#score'],
                ['Just a target time?', 'Pick a course or upload a GPX and see what a finish time would be worth.', 'Open the calculator', '#calculator'],
                ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md'],
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
  // Race and runner pages set a more specific title once their data has loaded.
  useDocumentTitle(route.raceId || route.runnerId ? null : PAGE_TITLES[route.tab] ?? PAGE_TITLES.home)

  return (
    <div id="top" className="prototype-main-app-div-77">
      <Header tab={route.tab} />
      <main><Suspense fallback={<div role="status" className={shell.routeLoading}>Loading…</div>}>
        {route.tab === 'home' && <Home />}
        {route.tab === 'races' && <RacesPage raceId={route.raceId} />}
        {route.tab === 'runners' && (route.runnerId ? <RunnerProfilePage runnerId={route.runnerId} onBack={() => navigate('#runners')} /> : <RunnersPage />)}
        {route.tab === 'calculator' && <ScoreCalculator />}
        {route.tab === 'score' && <ScoreRace />}
        {route.tab === 'api' && <ApiDocs />}
        {route.tab === 'media' && <Media />}
        {route.tab === 'faq' && <FaqPage initialQuery={route.faqQuery} />}
        {route.tab === 'notfound' && <NotFound where={window.location.hash} home="#home" />}
      </Suspense></main>
      <Footer />
      <BackToTop />
      <BuildBanner />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary home="./">
    <App />
  </ErrorBoundary>,
)
