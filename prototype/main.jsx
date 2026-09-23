import RankBadge, { podiumRowClass } from '../src/components/RankBadge'
import { fitFontSize } from '../src/lib/fitText'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowUpRight, Mail, Download, Upload, Play, ArrowRight, Share2, Calculator as CalculatorIcon } from 'lucide-react'
import { countryName } from '../src/components/CountrySelect'
import Logo from '../src/components/Logo'
import GitHubMark from '../src/components/GitHubMark'
import UnitsMenu from '../src/components/UnitsMenu'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Home from './Home'
import NextSteps from './NextSteps'
import RaceCard, { DemoBadge, VerticalBadge } from './RaceCard'
import RaceListing, { ListingBadge } from './RaceListing'
import ScoreCalculator from './ScoreCalculator'
import ScoreRace from './ScoreRace'
import ApiDocs from './ApiDocs'
import Media from './Media'
import FaqPage from './Faq'
import { RunnerProfilePage, RunnersPage } from './Runners'
import CourseMap from '../src/components/CourseMap'
import ReportForm from './ReportForm'
import { ShareResults } from './SharePanel'
import Flag from '../src/components/Flag'
import SearchSuggest from '../src/components/SearchSuggest'
import { RACE_NAMES } from '../src/lib/raceNames'
import { knownButNotHere } from '../src/lib/suggest'
import { initMonitoring } from '../src/lib/monitoring'
import { countPages } from '../src/lib/analytics'
import { forgetExpiredHandoff } from './publishHandoff'
import { useDocumentTitle } from '../src/lib/title'

initMonitoring()
countPages()

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
import Gate from '../src/components/Gate'
import NotFound from '../src/components/NotFound'
import { modelLabel, notScoredReason } from '../src/lib/model'
import BackToTop from '../src/components/BackToTop'
import { FinishArt, TITLE_ART } from '../src/components/PageArt'
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
  const raceMatch = path.match(/^races\/([^?]+)(?:\?(.*))?$/)
  if (raceMatch) return { tab: 'races', raceId: decodeURIComponent(raceMatch[1]), raceQuery: new URLSearchParams(raceMatch[2] || '') }
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
// "How it works" is a place on the home page, not a page: the router only knows whole pages, so
// the link goes to #home and leaves the section's id for Home.jsx to scroll to (HOME_SECTION_KEY).
// Runners moved to the footer. The example race is the one highlighted item.
const NAV = [
  // `mobile: false` keeps an item off the phone row: the logo already goes home, and the FAQ is in the
  // footer and on the home page, so the row holds the four places and the example.
  { id: 'how', label: 'How it works', short: 'How', href: '#home', section: 'how-it-works', mobile: false },
  { id: 'calculator', label: 'Calculator', href: '#calculator' },
  { id: 'score', label: 'Score a race', short: 'Score', href: '#score' },
  { id: 'races', label: 'Races', href: '#races' },
  { id: 'runners', label: 'Runners', href: '#runners' },
  { id: 'faq', label: 'FAQ', href: '#faq', mobile: false },
  { id: 'example', label: 'Try an example', short: 'Example', href: '#score?example=1', highlight: true },
]

function NavLink({ item, active, className = '', short = false }) {
  const scrollToSection = item.section
    ? (event) => {
        const target = document.getElementById(item.section)
        if (target) {
          // Already on the home page: scroll, and leave the hash alone so nothing scrolls back up.
          event.preventDefault()
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        try {
          sessionStorage.setItem('otri_home_section', item.section) // Home.jsx reads this once mounted
        } catch {
          // storage unavailable: the home page opens at its top
        }
      }
    : undefined
  const tone = item.highlight
    ? 'font-semibold text-blue-700 hover:text-blue-900'
    : active
      ? 'text-[#0b1220]'
      : 'text-slate-500 hover:text-slate-950'
  return (
    <a
      href={item.href}
      onClick={scrollToSection}
      aria-current={active ? 'page' : undefined}
      className={`text-[13px] font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${tone} ${className}`}
    >
      {short ? item.short ?? item.label : item.label}
    </a>
  )
}

/** Whether an organizer is signed in, as far as this side of the site can tell.
 *
 *  The organizer app writes one flag into localStorage and keeps the session itself in an HttpOnly
 *  cookie no page script can read, so this is a hint and nothing more -- which is all a label
 *  needs. It is read again when the tab regains focus, because signing in usually happens in
 *  another one. */
function useOrganizerSignedIn() {
  const read = () => {
    try {
      return localStorage.getItem('otri_organizer_signed_in') === '1'
    } catch {
      return false
    }
  }
  const [signedIn, setSignedIn] = useState(read)
  useEffect(() => {
    const refresh = () => setSignedIn(read())
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return signedIn
}

function Header({ tab }) {
  // The button said "For organizers", which names an audience rather than what pressing it does.
  // It now says what happens next, which depends on whether there is an account waiting.
  const signedIn = useOrganizerSignedIn()
  const organizerHref = signedIn ? 'organizer/#/events' : 'organizer/'
  const organizerLabel = signedIn ? 'My races' : 'Sign up'
  return (
    <>
      <header className="sticky top-0 z-50 h-[68px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-full min-w-0 w-[min(1120px,calc(100%-28px))] items-center">
          <Logo href="#home" />
          <nav className="ml-auto hidden shrink-0 items-center gap-5 md:flex lg:gap-7">
            {NAV.map((item) => (
              <NavLink key={item.id} item={item} active={tab === item.id} />
            ))}
            <UnitsMenu compact />
            {!signedIn && (
              <a href="organizer/#/login" className="text-[13px] font-medium text-slate-500 no-underline hover:text-slate-950">
                Sign in
              </a>
            )}
            <a href={organizerHref} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300">
              {organizerLabel} <ArrowUpRight size={13} />
            </a>
          </nav>
          <a
            className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white no-underline md:hidden"
            href={organizerHref}
          >
            {organizerLabel} <ArrowUpRight size={13} />
          </a>
        </div>
      </header>
      {/* Small screens: the section links live in their own row under the header. */}
      <div className="border-b border-slate-200 bg-white md:hidden">
        <div className="mx-auto flex w-[min(1120px,calc(100%-28px))] items-center gap-4 overflow-x-auto">
          {NAV.filter((item) => item.mobile !== false).map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={tab === item.id}
              short
              className={`whitespace-nowrap border-b-2 py-3 ${tab === item.id ? 'border-blue-600' : 'border-transparent'}`}
            />
          ))}
          <div className="ml-auto py-1.5">
            <UnitsMenu compact />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * The footer is the site's map. Everything the page can reach is listed here in four columns, so
 * a reader who has scrolled to the bottom does not have to scroll back up to find anything.
 */
const FOOTER_COLUMNS = [
  {
    heading: 'Score',
    links: [
      ['Calculator', '#calculator'],
      ['Score a race', '#score'],
      ['See an example race', '#score?example=1'],
      ['For organizers', 'organizer/'],
    ],
  },
  {
    heading: 'Explore',
    links: [
      ['Races', '#races'],
      ['Runners', '#runners'],
      ['FAQ', '#faq'],
      ['API and embed', '#api'],
    ],
  },
  {
    heading: 'The model',
    links: [
      ['How a score is made', `${GITHUB_URL}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`],
      ['Methodology', `${GITHUB_URL}/blob/main/METHODOLOGY.md`],
      ['Data policy', '/data-policy/'],
      ['GitHub', GITHUB_URL],
    ],
  },
  {
    heading: 'Project',
    links: [
      ['Contribute', '#contribute'],
      ['Media and logo', '#media'],
      ['Privacy', '/privacy/'],
      ['Terms', '/terms/'],
      ['hello@otri.run', 'mailto:hello@otri.run'],
    ],
  },
]

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-[min(1120px,calc(100%-28px))] py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] lg:gap-8">
          <div className="min-w-0">
            <Logo href="./" showName={false} />
            <p className="mt-4 max-w-[36ch] text-[15px] font-semibold leading-6 text-[#0b1220]">
              Made by trail runners, for trail runners and the people behind the start line.
            </p>
            <p className="mt-2 max-w-[36ch] text-[13px] leading-6 text-slate-600">
              Open source and community-driven on GitHub: every formula, every line, every decision in the open. Bring your race, your course, or a pull request.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                href={GITHUB_URL}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300"
              >
                <GitHubMark size={16} />
                GitHub
              </a>
              <a href="mailto:hello@otri.run" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 no-underline hover:text-blue-700">
                <Mail size={14} />
                hello@otri.run
              </a>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">Open source. Every line of the model and the site is public.</p>
          </div>
          {FOOTER_COLUMNS.map(({ heading, links }) => (
            <nav key={heading} className="min-w-0">
              <h2 className="font-mono text-[10px] uppercase tracking-[.14em] text-slate-600">{heading}</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-[13px] text-slate-600 no-underline hover:text-blue-700">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
          <span className="font-mono text-[10px] tracking-[.12em] text-slate-600">
            OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT
          </span>
          <span className="font-mono text-[10px] tracking-[.12em] text-slate-600">OTRI · {new Date().getFullYear()}</span>
        </div>
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

// A leaderboard is read, not just displayed. A big race is thousands of rows, and the question a
// visitor arrives with is usually narrow: where did I come, who won the women's race, who did not
// finish. So the table can be searched, filtered, sorted and paged -- and the whole view travels in
// the address, so a filtered leaderboard is a link an organizer can send.
//
// Rank order is the default and stays the default: it is the result the organizer published, and
// nothing here reorders it until somebody asks.
const PAGE_SIZES = [25, 50, 100, 250]
const DEFAULT_PAGE_SIZE = 25

const SORT_LABELS = { rank: 'rank', name: 'name', time: 'time', score: 'OTRI score' }

export function defaultLeaderboardView(params) {
  const asked = (key, fallback) => params?.get(key) ?? fallback
  const perPage = Number(asked('per', DEFAULT_PAGE_SIZE))
  return {
    q: asked('q', ''),
    gender: ['F', 'M'].includes(asked('g', '')) ? asked('g', '') : '',
    status: ['all', 'finishers', 'dnf'].includes(asked('show', 'all')) ? asked('show', 'all') : 'all',
    sort: Object.keys(SORT_LABELS).includes(asked('sort', 'rank')) ? asked('sort', 'rank') : 'rank',
    // Each column has a way it is usually read, and a link that names a column without naming a
    // direction means that way: highest score first, quickest time first, first place first.
    direction: ['asc', 'desc'].includes(asked('dir', '')) ? asked('dir', '') : asked('sort', 'rank') === 'score' ? 'desc' : 'asc',
    perPage: PAGE_SIZES.includes(perPage) || perPage === 0 ? perPage : DEFAULT_PAGE_SIZE,
    page: Math.max(1, Number(asked('page', 1)) || 1),
  }
}

/** Only what differs from the default goes in the address, so an ordinary link stays clean. */
export function leaderboardQuery(view) {
  const params = new URLSearchParams()
  if (view.q.trim()) params.set('q', view.q.trim())
  if (view.gender) params.set('g', view.gender)
  if (view.status !== 'all') params.set('show', view.status)
  if (view.sort !== 'rank') params.set('sort', view.sort)
  if (view.direction !== (view.sort === 'score' ? 'desc' : 'asc')) params.set('dir', view.direction)
  if (view.perPage !== DEFAULT_PAGE_SIZE) params.set('per', String(view.perPage))
  if (view.page > 1) params.set('page', String(view.page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

function sortRows(rows, key, direction) {
  const sign = direction === 'asc' ? 1 : -1
  // A row with no rank, time or score is not first or last by accident: the rows that have a value
  // are ordered among themselves, and the ones that do not stay together at the end either way. A
  // DNF has no finishing position, so it sorts with them whichever column is chosen.
  const missing = (row) =>
    key === 'time'
      ? row.finish_time_seconds == null
      : key === 'score'
        ? row.otri_score == null
        : key === 'rank'
          ? typeof row.rank !== 'number'
          : false
  const value = (row) =>
    key === 'time'
      ? row.finish_time_seconds
      : key === 'score'
        ? row.otri_score
        : key === 'rank'
          ? row.rank
          : `${row.family_name} ${row.first_name}`.toLowerCase()
  return [...rows].sort((a, b) => {
    if (missing(a) !== missing(b)) return missing(a) ? 1 : -1
    if (missing(a)) return 0
    const left = value(a)
    const right = value(b)
    if (left === right) return 0
    return (left > right ? 1 : -1) * sign
  })
}

function SortHeader({ id, label, view, onSort, className = '' }) {
  const active = view.sort === id
  return (
    <th scope="col" className={className} aria-sort={active ? (view.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(id)}
        className={`flex w-full items-center gap-1 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[.06em] ${active ? 'text-blue-700' : 'text-slate-600 hover:text-[#0b1220]'}`}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-blue-700' : 'text-slate-400'}>
          {active ? (view.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

/** The count, the page size and the page controls. Rendered above the table and below it, because
 *  a long leaderboard is scrolled through in both directions and the reader should never have to
 *  travel the length of the page to change which page they are on. `place` keeps the two copies'
 *  ids apart; everything else about them is the same on purpose. */
function LeaderboardPager({ place, view, onView, set, perPage, page, pages, from, shown, rows, filtering }) {
  if (shown.length === 0) return null
  const id = `lb-per-page-${place}`
  const counting =
    perPage === 0 || shown.length <= perPage
      ? `${shown.length} ${shown.length === 1 ? 'runner' : 'runners'}`
      : `${from + 1}–${Math.min(from + perPage, shown.length)} of ${shown.length}`
  const filteredNote = filtering && rows.length !== shown.length ? ` · filtered from ${rows.length}` : ''
  if (pages <= 1 && rows.length <= PAGE_SIZES[0]) {
    return (
      <p role={place === 'below' ? 'status' : undefined} className="mt-3 font-mono text-[10px] tracking-[.05em] text-slate-600">
        {counting}
        {filteredNote}
      </p>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {/* One live region, not two: the same sentence announced twice on every change is noise. */}
      <p role={place === 'below' ? 'status' : undefined} className="font-mono text-[10px] tracking-[.05em] text-slate-600">
        {counting}
        {filteredNote}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-[.06em] text-slate-600">
          Per page
        </label>
        <select
          id={id}
          value={perPage}
          onChange={(event) => set({ perPage: Number(event.target.value) })}
          className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value={0}>All</option>
        </select>
        {pages > 1 && (
          <nav aria-label="Leaderboard pages" className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onView({ ...view, page: page - 1 })}
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:enabled:border-blue-300 disabled:opacity-40"
            >
              Previous
            </button>
            {/* Previous and Next alone are a poor way to reach page 60 of 98, so the number is a
                field you can type into once there are enough pages for that to matter. */}
            {pages > 5 ? (
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[.05em] text-slate-600">
                Page
                <input
                  type="number"
                  min={1}
                  max={pages}
                  value={page}
                  aria-label={`Page number, 1 to ${pages}`}
                  onChange={(event) => {
                    const wanted = Number(event.target.value)
                    if (wanted >= 1 && wanted <= pages) onView({ ...view, page: wanted })
                  }}
                  className="min-h-9 w-16 rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                of {pages}
              </span>
            ) : (
              <span className="font-mono text-[10px] tracking-[.05em] text-slate-600">
                Page {page} of {pages}
              </span>
            )}
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => onView({ ...view, page: page + 1 })}
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:enabled:border-blue-300 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}

function ResultsTable({ results, resultsError, view, onView }) {
  const rows = results ?? []
  const genders = useMemo(() => [...new Set(rows.map((row) => row.gender).filter(Boolean))].sort(), [rows])
  const hasNonFinishers = useMemo(() => rows.some((row) => row.status !== 'finisher'), [rows])

  const shown = useMemo(() => {
    const needle = view.q.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (view.gender && row.gender !== view.gender) return false
      if (view.status === 'finishers' && row.status !== 'finisher') return false
      if (view.status === 'dnf' && row.status === 'finisher') return false
      if (needle && !`${row.first_name} ${row.family_name} ${row.bib_number ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
    return sortRows(filtered, view.sort, view.direction)
  }, [rows, view.q, view.gender, view.status, view.sort, view.direction])

  const perPage = view.perPage
  const pages = perPage === 0 ? 1 : Math.max(1, Math.ceil(shown.length / perPage))
  const page = Math.min(view.page, pages)
  const from = perPage === 0 ? 0 : (page - 1) * perPage
  const visible = perPage === 0 ? shown : shown.slice(from, from + perPage)

  // Any change to what is being looked at starts again at the first page; paging keeps the rest.
  const set = (changes) => onView({ ...view, page: 1, ...changes })
  const onSort = (id) => {
    // A first press sorts the way that column is usually read: quickest time first, highest score
    // first, A to Z. Pressing the same column again turns it round.
    if (view.sort === id) return set({ direction: view.direction === 'asc' ? 'desc' : 'asc' })
    return set({ sort: id, direction: id === 'score' ? 'desc' : 'asc' })
  }

  const filtering = Boolean(view.q.trim() || view.gender || view.status !== 'all')
  const worthControls = rows.length > 10 || filtering
  const clear = () => set({ q: '', gender: '', status: 'all' })

  return (
    <>
      {worthControls && (
        <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0 grow sm:max-w-xs">
            <label htmlFor="lb-find" className="block font-mono text-[10px] uppercase tracking-[.06em] text-slate-600">
              Find a runner
            </label>
            <input
              id="lb-find"
              type="search"
              value={view.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Name or bib number"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {genders.length > 1 && (
            <div>
              <span id="lb-gender" className="block font-mono text-[10px] uppercase tracking-[.06em] text-slate-600">
                Category
              </span>
              <div role="group" aria-labelledby="lb-gender" className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
                {[['', 'All'], ...genders.map((code) => [code, code === 'F' ? 'Women' : code === 'M' ? 'Men' : code])].map(([code, label]) => (
                  <button
                    key={code || 'all'}
                    type="button"
                    aria-pressed={view.gender === code}
                    onClick={() => set({ gender: code })}
                    className={`min-h-9 px-3 text-xs font-semibold ${view.gender === code ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasNonFinishers && (
            <div>
              <span id="lb-status" className="block font-mono text-[10px] uppercase tracking-[.06em] text-slate-600">
                Show
              </span>
              <div role="group" aria-labelledby="lb-status" className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
                {[['all', 'Everyone'], ['finishers', 'Finishers'], ['dnf', 'Did not finish']].map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={view.status === code}
                    onClick={() => set({ status: code })}
                    className={`min-h-9 px-3 text-xs font-semibold ${view.status === code ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {filtering && (
            <button type="button" onClick={clear} className="min-h-9 text-xs font-semibold text-blue-600 hover:underline">
              Clear
            </button>
          )}
        </div>
      )}

      <LeaderboardPager place="above" view={view} onView={onView} set={set} perPage={perPage} page={page} pages={pages} from={from} shown={shown} rows={rows} filtering={filtering} />

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Results, sorted by {SORT_LABELS[view.sort]}
            {view.gender ? `, ${view.gender === 'F' ? 'women only' : view.gender === 'M' ? 'men only' : view.gender}` : ''}
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <SortHeader id="rank" label="Rank" view={view} onSort={onSort} />
              <SortHeader id="name" label="Runner" view={view} onSort={onSort} />
              <th scope="col" className="hidden px-4 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-slate-600 sm:table-cell">Country</th>
              <th scope="col" className="hidden px-4 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-slate-600 sm:table-cell">Gender</th>
              <SortHeader id="time" label="Time" view={view} onSort={onSort} />
              <SortHeader id="score" label="OTRI score" view={view} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.rank}-${row.bib_number ?? row.family_name}-${row.first_name}`} className={`border-b border-slate-100 last:border-b-0 ${row.status !== 'finisher' ? 'bg-slate-50/60 text-slate-500 hover:bg-blue-50/50' : podiumRowClass(row.rank) || 'even:bg-slate-50/70 hover:bg-blue-50/50'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500"><RankBadge rank={row.rank} /></td>
                <td className="px-4 py-3 font-medium text-[#0b1220]">
                  {row.runner_id ? (
                    <a href={`#runners/${encodeURIComponent(row.runner_id)}`} className="no-underline hover:underline">
                      {row.first_name} {row.family_name}
                    </a>
                  ) : (
                    <>
                      {row.first_name} {row.family_name}
                    </>
                  )}
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] font-normal text-slate-500 sm:hidden">
                    {row.nationality && <Flag code={row.nationality} />}
                    {row.gender && <span>{row.gender}</span>}
                  </span>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">{row.nationality ? <Flag code={row.nationality} /> : <span className="text-slate-300">—</span>}</td>
                <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 sm:table-cell">{row.gender ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatHms(row.finish_time_seconds)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-blue-600">{row.otri_score ?? <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
            {results?.length === 0 && !resultsError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No results published yet.
                </td>
              </tr>
            )}
            {results?.length > 0 && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  Nobody here matches that.{' '}
                  <button type="button" onClick={clear} className="font-semibold text-blue-600 hover:underline">
                    Clear the filters
                  </button>
                </td>
              </tr>
            )}
            {/* The leaderboard alone failed; the race, its course and its map are above. */}
            {resultsError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-amber-800" role="alert">
                  The leaderboard could not be loaded. {resultsError.message}
                </td>
              </tr>
            )}
            {results === null && !resultsError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500" role="status">
                  Loading the leaderboard…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeaderboardPager place="below" view={view} onView={onView} set={set} perPage={perPage} page={page} pages={pages} from={from} shown={shown} rows={rows} filtering={filtering} />
    </>
  )
}

function Leaderboard({ raceId, onBack, query }) {
  const units = useUnits()
  const [race, setRace] = useState(null)
  const [results, setResults] = useState(null)
  const [course, setCourse] = useState(null)
  const [error, setError] = useState(null)
  const [resultsError, setResultsError] = useState(null)
  // `#races/<id>?share=1` (the organizer's review page links it) lands with the sharing panel open.
  // Open by default: the podium image and post text are the reason to come back, and a closed panel is never found.
  const [sharing, setSharing] = useState(true)
  const sharePanel = useRef(null)
  useEffect(() => {
    if (sharing) sharePanel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sharing])
  const [view, setView] = useState(() => defaultLeaderboardView(query))
  useDocumentTitle(race ? `${race.event_name} · ${race.course_name} · OTRI` : 'Race · OTRI')

  useEffect(() => {
    const base = `#races/${encodeURIComponent(raceId)}`
    const next = `${base}${leaderboardQuery(view)}`
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [raceId, view])

  useEffect(() => {
    let cancelled = false
    setRace(null)
    setResults(null)
    setCourse(null)
    setError(null)
    setResultsError(null)
    // The race and its results are fetched separately on purpose. They used to be one chain, so a
    // results request that failed rejected the whole thing -- and a 404 from it rendered "no race
    // with that id" over a race that had loaded perfectly well, hiding its course and its map.
    getRace(raceId)
      .then((loaded) => {
        if (cancelled) return
        setRace(loaded)
        if (loaded.is_published) {
          getRaceResults(raceId)
            .then((rows) => !cancelled && setResults(rows))
            .catch((err) => !cancelled && setResultsError(err))
        } else {
          setResults([])
        }
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
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
        <ArrowLeft size={13} /> All races
      </button>
      {error && error.status === 404 && (
        <NotFound eyebrow="RACE NOT FOUND" title="No race with that id." where={raceId} home="#races" homeLabel="All races" note="It may have been unpublished by its organizer or removed after a report." />
      )}
      {error && error.status !== 404 && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.message}</p>}
      {!race && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      {race && (
        <>
          <p className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[9px] tracking-[.08em] text-blue-600">
            <span>{race.event_date}</span>
            {(race.event_location || race.event_country) && (
              <span className="flex items-center gap-2 text-[#0b1220]">
                {race.event_country && <Flag code={race.event_country} showCode={false} />}
                {[race.event_location, race.event_country].filter(Boolean).join(' · ').toUpperCase()}
              </span>
            )}
            <ListingBadge status={race.listing_status} />
            {race.is_vertical && <VerticalBadge />}
            {race.is_demo && <DemoBadge />}
          </p>
          <h1 className="otri-fit mt-2 font-bold leading-[1.04] tracking-[-.045em] text-[#0b1220]" style={{ fontSize: fitFontSize(race.event_name, { min: 28, vw: 4.5, max: 52 }) }}>{race.event_name}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {race.course_name} · {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
            {race.has_gpx ? ' · Measured from the course file' : ' · Official figures, no course file'}
          </p>
          {race.organizer_display && (
            <p className="mt-2 text-xs text-slate-500">
              Organized by{' '}
              {race.organizer_website ? (
                <a href={race.organizer_website} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 no-underline hover:underline">
                  {race.organizer_display} ↗
                </a>
              ) : (
                <span className="font-semibold text-[#0b1220]">{race.organizer_display}</span>
              )}
            </p>
          )}
          {race.is_demo && (
            <p className="mt-2 text-xs text-slate-500">Demo data: synthetic runners and results, here to show what a scored race looks like.</p>
          )}
          {course && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
              <CourseMap gpxText={course.gpxText} measurement={course.measurement} className="p-3" />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 px-4 py-3">
                <p className="min-w-0 text-xs leading-5 text-slate-500">The course as a GPX file for your watch or app: the track and its elevations, nothing else from the original file.</p>
                <a href={raceGpxDownloadUrl(race.race_id)} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0b1220] no-underline hover:border-blue-300">
                  <Download size={14} /> Download the GPX
                </a>
              </div>
            </div>
          )}
          {!race.is_published && <RaceListing race={race} />}
          {race.is_published && (
            <>
            {notScoredReason(results) && (
              <p className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-slate-700">
                <strong className="text-[#0b1220]">Finish times only.</strong> {notScoredReason(results)}
              </p>
            )}
            {results?.some((row) => row.status === 'finisher') && (
              <div className="mt-6">
                <button type="button" onClick={() => setSharing((open) => !open)} aria-expanded={sharing} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold ${sharing ? 'border border-slate-300 bg-white text-[#0b1220] hover:border-blue-300' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>
                  <Share2 size={14} /> {sharing ? 'Close sharing' : 'Share these results: image and post text'}
                </button>
                {sharing && (
                  <div ref={sharePanel} className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
                    <ShareResults raceName={`${race.event_name} ${race.course_name}`} distanceKm={race.distance_km} elevationGainM={race.elevation_gain_m} scores={results} url={window.location.href} />
                  </div>
                )}
              </div>
            )}
            <ResultsTable results={results} resultsError={resultsError} view={view} onView={setView} />
            <p className="mt-3 font-mono text-[10px] tracking-[.05em] text-slate-600">
              {modelLabel(race.scoring_version)} · depends only on the course and each runner's own finish time, never the field
            </p>
            {race.is_published && (
              // The same badge organizers can put on their own results page (see the organizer's review
              // step). It says "scored with OTRI", nothing more; the link goes through /go/badge so the
              // site can count how many people arrive by it.
              <a href="https://otri.run/go/badge" className="mt-3 inline-block" title="Scored with OTRI">
                <img src="../brand/otri-badge-scored.svg?v=2" alt="Scored with OTRI" height="28" className="h-7 w-auto" />
              </a>
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
      'Scoring the results takes about a minute and needs no account (https://otri.run/#score). Publishing them as a race page is free; it runs automatic checks and some races may need review: https://otri.run/organizer/',
      'Thank you!',
    ].join('\n\n'),
  )}`
  const ways = [
    [Mail, 'Ask your organizer', 'Races appear here when their organizers publish results. A prepared email explains what OTRI is and that it is free.', mail, 'Write to them'],
    [Upload, 'Have the results yourself?', 'A course file and a results file are enough: every finisher scored, no account to try; review your race page and publish when ready.', '#score', 'Score a race'],
    [Play, 'See what a scored race looks like', 'The example race: its course on the map, the elevation profile and 100 finishers with their scores.', '#score?example=1', 'Open the example'],
    [CalculatorIcon, 'Just curious about a time?', 'Pick a course or upload a GPX and see what a finish time is worth, before or after race day.', '#calculator', 'Open the calculator'],
  ]
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
      <div className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] px-5 py-6 sm:px-7">
        <p className="font-mono text-[10px] tracking-[.08em] text-blue-600">NO RACES PUBLISHED YET</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">The first race here could be yours.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          OTRI keeps no list of every race: a race appears when its organizer publishes the results, free and without anyone's approval. Until then, here is
          what you can do.
        </p>
      </div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
        {ways.map(([Icon, title, text, href, action]) => (
          <a key={title} href={href} className="group flex min-w-0 gap-3 bg-white p-5 text-inherit no-underline transition hover:bg-blue-50/40 sm:p-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Icon size={17} />
            </span>
            <span className="min-w-0">
              <b className="block text-[15px] text-[#0b1220]">{title}</b>
              <span className="mt-1 block text-sm leading-6 text-slate-500">{text}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
                {action} <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
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

function RacesPage({ raceId, raceQuery }) {
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
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className="mx-auto w-[min(1120px,calc(100%-28px))]">
        {raceId ? (
          <Leaderboard raceId={raceId} query={raceQuery} onBack={() => navigate(address)} />
        ) : (
          <>
            <div className="grid min-w-0 items-end gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]">
              <div className="min-w-0">
                <p className="mb-3 font-mono text-[10px] tracking-[.08em] text-slate-500">RACES</p>
                <div className="flex items-center gap-4 sm:gap-6">
                  <FinishArt className={TITLE_ART} />
                  <h1 className="min-w-0 text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
                    Scored races.
                    <br />
                    <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">Every number explained.</span>
                  </h1>
                </div>
              </div>
              <p className="min-w-0 text-sm leading-7 text-slate-500">
                Races their organizers have published, all scored with the same open model. Each score depends only on the
                course and the runner's own finish time — never on who else raced.
                {hasListings ? ' Races marked UPCOMING or AWAITING RESULTS are listed by their organizer ahead of the results: open one to try a target time on its course.' : ''}
                {hasDemo ? ' Races marked DEMO DATA are synthetic examples.' : ''}
              </p>
            </div>
            {/* Announced: these arrive after the first paint (see Runners.jsx). */}
            {error && <p role="alert" className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
            {races === null && !error && <p role="status" className="mt-8 text-sm text-slate-500">Loading races…</p>}
            {races?.length === 0 && <NoRacesYet />}
            {races?.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <SearchSuggest
                  className="min-w-0 flex-1"
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-300 bg-white" role="group" aria-label="Distance">
                    {DISTANCE_BUCKETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBucket(b.id)}
                        aria-pressed={bucket === b.id}
                        className={`whitespace-nowrap px-3 py-2 text-xs font-semibold ${bucket === b.id ? 'bg-[#0b1220] text-white' : 'text-slate-500 hover:text-[#0b1220]'}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {countryOptions.length > 1 && (
                    <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Country" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0b1220]">
                      <option value="all">All countries</option>
                      {countryOptions.map((option) => (
                        <option key={option.code} value={option.code}>{option.name}</option>
                      ))}
                    </select>
                  )}
                  {hasListings && (
                    <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0b1220]">
                      {RACE_STATUSES.map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  )}
                  <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort races" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0b1220]">
                    {Object.entries(RACE_SORTS).map(([id, option]) => (
                      <option key={id} value={id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {races?.length > 0 && (
              <p className="mt-3 font-mono text-[11px] text-slate-500" aria-live="polite">
                {shown.length === races.length ? `${races.length} races` : `${shown.length} of ${races.length} races match`}
              </p>
            )}
            {races?.length > 0 && shown.length === 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
                <p className="font-semibold text-[#0b1220]">{query.trim() ? `“${query.trim()}” is not on OTRI yet.` : 'No race matches.'}</p>
                <p className="mt-1">
                  OTRI shows the races their organizers have published here; it keeps no list of every race. Try fewer words, another distance, or{' '}
                  <button type="button" onClick={() => { setQuery(''); setBucket('all'); setCountry('all'); setStatus('all') }} className="font-semibold text-blue-600 hover:underline">clear the filters</button>.
                </p>
                <p className="mt-3">
                  Have its course as a GPX? <a href="#calculator" className="font-semibold text-blue-600 no-underline hover:underline">Work out what a time there is worth</a>.
                  Have the results too? <a href="#score" className="font-semibold text-blue-600 no-underline hover:underline">Score the whole race</a>, free and without an account.
                </p>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.slice(0, visible).map((race) => (
                <RaceCard key={race.race_id} race={race} />
              ))}
            </div>
            {shown.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] text-slate-500">Showing {Math.min(visible, shown.length)} of {shown.length}</p>
                {shown.length > visible && (
                  <button
                    type="button"
                    onClick={() => setVisible((n) => n + RACE_PAGE_SIZE)}
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#0b1220] hover:border-blue-300"
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
    <div id="top" className="min-h-screen max-w-full overflow-x-clip bg-[#f7f9fc] text-[#0b1220]">
      <Header tab={route.tab} />
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main">
        {route.tab === 'home' && <Home />}
        {route.tab === 'races' && <RacesPage raceId={route.raceId} raceQuery={route.raceQuery} />}
        {route.tab === 'runners' && (route.runnerId ? <RunnerProfilePage runnerId={route.runnerId} onBack={() => navigate('#runners')} /> : <RunnersPage />)}
        {route.tab === 'calculator' && <ScoreCalculator />}
        {route.tab === 'score' && <ScoreRace />}
        {route.tab === 'api' && <ApiDocs />}
        {route.tab === 'media' && <Media />}
        {route.tab === 'faq' && <FaqPage initialQuery={route.faqQuery} />}
        {/* In its own container, like every other page. Rendered bare, it had vertical padding
            and no side gutter, so its text ran to both edges of the viewport. */}
        {route.tab === 'notfound' && (
          <section className="py-4">
            <div className="mx-auto w-[min(1120px,calc(100%-28px))]">
              <NotFound where={window.location.hash} home="#home" />
            </div>
          </section>
        )}
      </main>
      <Footer />
      <BackToTop />
      <BuildBanner />
    </div>
  )
}

// A race scored here and handed to the organizer app is kept in this browser for a day. Deleting
// it used to happen only when the organizer app read it, so a visitor who never went on kept the
// results file. Any OTRI page now clears an expired one.
forgetExpiredHandoff()

createRoot(document.getElementById('root')).render(
  <ErrorBoundary home="./">
    <Gate>
      <App />
    </Gate>
  </ErrorBoundary>,
)
