import { ArrowRight, Calculator, Database, Play, Timer, Upload, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import RaceCard from './RaceCard'
import { getRaceResults, listRaces } from './apiClient'
import { modelLabel } from '../src/lib/model'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const DOCS = {
  how: `${GITHUB_URL}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`,
  methodology: `${GITHUB_URL}/blob/main/METHODOLOGY.md`,
  dataPolicy: `${GITHUB_URL}/blob/main/DATA_POLICY.md`,
  organizer: `${GITHUB_URL}/blob/main/docs/organizer-upload.md`,
}

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

function Eyebrow({ children, className = '' }) {
  return <p className={`font-mono text-[10px] tracking-[.08em] text-slate-500 ${className}`}>{children}</p>
}

function Heading({ children, className = '' }) {
  return <h2 className={`text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220] ${className}`}>{children}</h2>
}

function Gradient({ children }) {
  return <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">{children}</span>
}

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white no-underline shadow-[0_10px_28px_rgba(37,99,235,.2)] hover:from-blue-800 hover:to-blue-600'
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300'
const textLink = 'inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline'

// The landing page's dark "index engine" card, with every row a link into the prototype.
// A handful of real (demo) scores scrolling by, each a link to the runner: the quickest way to
// show what the index produces. Pauses for people who prefer reduced motion (see styles.css).
function ScoreTicker({ entries }) {
  if (!entries.length) return null
  const rows = [...entries, ...entries]
  return (
    <div className="relative mt-1 h-[88px] overflow-hidden border-b border-slate-700/70" aria-label="Recent scores">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-[#0b1730] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-[#0f2a5f] to-transparent" />
      <ul className="otri-ticker">
        {rows.map((entry, index) => (
          <li key={`${entry.runner_id ?? entry.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1 font-mono text-[10px]">
            <a href={entry.runner_id ? `#runners/${encodeURIComponent(entry.runner_id)}` : `#races/${encodeURIComponent(entry.race_id)}`} className="min-w-0 truncate text-slate-300 no-underline hover:text-white">
              {entry.name} <span className="text-slate-500">· {entry.race}</span>
            </a>
            <span className="font-bold text-blue-300">{entry.score}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EngineCard({ raceCount, resultCount, scoringVersion, ticker }) {
  const rows = [
    [Calculator, 'What is my time worth?', 'RUNNERS · CALCULATOR', '#calculator'],
    [Upload, 'Score my whole race', 'ORGANIZERS · NO ACCOUNT', '#score'],
    [Database, 'Browse scored races', `${raceCount} RACES · ${resultCount} RESULTS`, '#races'],
    [Users, 'Find a runner', 'SEARCH · PROFILES', '#runners'],
  ]
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#08111f_0%,#0b1730_58%,#123b85_100%)] p-4 text-white shadow-[0_24px_70px_rgba(11,18,32,.2)] sm:p-5">
      <div className="flex items-center justify-between font-mono text-[8px] tracking-[.08em] text-slate-400">
        <span>OTRI / OPEN SCORING</span>
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.9)]" />
          LIVE API
        </span>
      </div>
      <div className="border-b border-slate-700/70 py-7">
        <small className="font-mono text-[8px] tracking-[.08em] text-blue-300">WHAT IS AN OTRI SCORE?</small>
        <strong className="mt-2 block bg-gradient-to-r from-white to-blue-200 bg-clip-text pb-1 text-4xl font-bold leading-[1.25] tracking-[-.05em] text-transparent">
          Course + time = score.
        </strong>
        <span className="mt-1 block text-xs leading-5 text-slate-400">
          A hilly 25 km and a flat 50 km, side by side. 1000 is world-record level, and your score never depends on
          who else raced.
        </span>
      </div>
      <ScoreTicker entries={ticker} />
      <div>
        {rows.map(([Icon, title, desc, href]) => (
          <a
            key={title}
            href={href}
            className="group grid min-w-0 grid-cols-[22px_minmax(0,1fr)_auto_14px] items-center gap-2 border-b border-slate-700/70 py-4 text-white no-underline transition hover:bg-white/5"
          >
            <Icon size={16} className="text-blue-400" />
            <span className="truncate text-xs font-semibold">{title}</span>
            <small className="font-mono text-[8px] text-slate-500">{desc}</small>
            <ArrowRight size={13} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-300" />
          </a>
        ))}
      </div>
      <div className="flex justify-between gap-3 pt-4 font-mono text-[8px] tracking-[.08em]">
        <b>OTRI INDEX</b>
        <span className="text-right text-blue-300">{scoringVersion ? modelLabel(scoringVersion).toUpperCase() : 'VERSIONED · REPRODUCIBLE'}</span>
      </div>
    </div>
  )
}

export default function Home() {

  const [races, setRaces] = useState([])
  const [ticker, setTicker] = useState([])
  useEffect(() => {
    let cancelled = false
    listRaces()
      .then(async (all) => {
        if (cancelled) return
        // The home page counts and previews scored races; listings without results live on the races page.
        const rows = all.filter((race) => race.is_published)
        setRaces(rows)
        // A few scored finishers from the newest published races, for the card's ticker.
        const sample = rows.filter((race) => (race.finisher_count ?? 0) > 0).slice(0, 4)
        const lists = await Promise.all(sample.map((race) => getRaceResults(race.race_id).catch(() => [])))
        // Top three of each race, interleaved round-robin so the list reads like a feed across races.
        const perRace = sample.map((race, i) =>
          lists[i]
            .filter((row) => row.status === 'finisher' && row.otri_score != null)
            .slice(0, 3)
            .map((row) => ({ name: `${row.first_name} ${row.family_name}`, race: race.event_name, score: row.otri_score, runner_id: row.runner_id, race_id: race.race_id })),
        )
        const entries = []
        for (let round = 0; round < 3; round += 1) perRace.forEach((rows) => rows[round] && entries.push(rows[round]))
        if (!cancelled) setTicker(entries.slice(0, 12))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const resultCount = races.reduce((sum, race) => sum + (race.finisher_count ?? 0), 0)
  const scoringVersion = races[0]?.scoring_version ?? ''

  return (
    <>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_78%_28%,rgba(37,99,235,.12),transparent_30%),linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} grid min-w-0 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-24`}>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
              OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> PROTOTYPE
            </div>
            <h1 className="mt-5 max-w-[760px] text-[clamp(44px,7vw,84px)] font-bold leading-[1.08] tracking-[-.065em] text-[#0b1220]">
              The open score
              <br />
              <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">for any trail race.</em>
            </h1>
            {/* The words that carry the promise are set in ink and semibold; the rest stays grey, so the
                paragraph can be read at a glance by its dark words alone. */}
            <p className="mt-6 max-w-[560px] text-[15px] leading-7 text-slate-500 sm:text-[17px] [&_b]:whitespace-nowrap [&_b]:font-semibold [&_b]:text-[#0b1220]">
              OTRI turns a <b>finish time</b> on <b>any trail course</b> into{' '}
              <b className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text !text-transparent">one comparable score</b>. Free, no account, and
              every number explains itself.
            </p>
            <div className="mt-7 grid max-w-[680px] gap-3 sm:grid-cols-2">
              {[
                {
                  who: 'I run',
                  Icon: Timer,
                  title: 'What is my time worth?',
                  text: 'A race or your own GPX, and a finish time.',
                  href: '#calculator',
                  action: 'Open the calculator',
                  more: ['Find my results', '#runners'],
                },
                {
                  who: 'I organise a race',
                  Icon: Upload,
                  title: 'Score my whole race',
                  text: 'The course and the results file. Every finisher scored.',
                  href: '#score',
                  action: 'Score my race',
                  more: ['See an example', '#score?example=1'],
                },
              ].map(({ who, Icon, title, text, href, action, more }) => (
                <div key={who} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <Icon size={18} />
                    </span>
                    <span className="text-[19px] font-bold uppercase leading-6 tracking-[-.01em] text-blue-700">{who}</span>
                  </span>
                  <b className="mt-3 block text-[16px] leading-6 tracking-[-.02em] text-[#0b1220]">{title}</b>
                  <p className="mt-1 flex-1 text-[13px] leading-5 text-slate-500">{text}</p>
                  <a className={`${primaryButton} mt-4`} href={href}>
                    {action} <ArrowRight size={15} />
                  </a>
                  <a className={`${textLink} mt-3 justify-center`} href={more[1]}>
                    {more[0]}
                  </a>
                </div>
              ))}
            </div>
            {/* The fastest way to understand OTRI is to see it: one press scores the example race. */}
            <a
              href="#score?example=1"
              className="group mt-3 flex max-w-[680px] items-center gap-3 rounded-xl bg-[#0b1220] px-4 py-2.5 text-white no-underline transition hover:bg-[#13203a]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400">
                <Play size={13} className="ml-0.5 fill-white text-white" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-5">
                <b className="font-semibold">See a race scored, live.</b> <span className="text-slate-300">The course on the map and 100 finishers, in one click.</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-cyan-300 transition group-hover:translate-x-1" />
            </a>
          </div>
          <EngineCard raceCount={races.length} resultCount={resultCount} scoringVersion={scoringVersion} ticker={ticker} />
        </div>
      </section>

      {/* The closing invitation, straight after the hero. */}
      <section className="bg-[linear-gradient(115deg,#1d4ed8_0%,#2563eb_48%,#0891b2_100%)] py-14 text-white sm:py-16">
        <div className={`${CONTAINER} flex flex-col items-start`}>
          <p className="font-mono text-[10px] tracking-[.08em] text-blue-100">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="mt-2 text-[clamp(40px,5.8vw,70px)] font-bold leading-[.94] tracking-[-.065em]">
            Compare trail performances.
            <br />
            <span>Not just finish times.</span>
          </h2>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-blue-600 no-underline shadow-[0_10px_30px_rgba(0,0,0,.12)]"
              href="#score"
            >
              Score my race <ArrowRight size={15} />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:bg-white/10"
              href="#calculator"
            >
              Calculate a target time <Calculator size={15} />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
