import { ArrowRight, ArrowUpRight, Calculator, Database, FileText, GitBranch, Mountain, ShieldCheck, Timer, Upload, Users } from 'lucide-react'
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
    [Calculator, 'CALCULATE', 'any course · any time', '#calculator'],
    [Database, 'RACES', `${raceCount} scored · ${resultCount} results`, '#races'],
    [Users, 'RUNNERS', 'search · profiles · index', '#runners'],
    [Upload, 'ORGANIZERS', 'upload official results', 'organizer/'],
  ]
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#08111f_0%,#0b1730_58%,#123b85_100%)] p-4 text-white shadow-[0_24px_70px_rgba(11,18,32,.2)] sm:p-5">
      <div className="flex items-center justify-between font-mono text-[8px] tracking-[.08em] text-slate-400">
        <span>OTRI / PROTOTYPE</span>
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.9)]" />
          LIVE API
        </span>
      </div>
      <a href="#calculator" className="group block border-b border-slate-700/70 py-7 text-white no-underline">
        <small className="font-mono text-[8px] tracking-[.08em] text-blue-300">WHAT CAN I DO HERE?</small>
        <strong className="mt-2 block bg-gradient-to-r from-white to-blue-200 bg-clip-text pb-1 text-4xl font-bold leading-[1.25] tracking-[-.05em] text-transparent">
          Try the index.
        </strong>
        <span className="mt-1 block text-xs text-slate-400">Real scoring code. Real course measurement. Demo data.</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition group-hover:gap-2 group-hover:text-white">
          Calculate your score <ArrowRight size={13} />
        </span>
      </a>
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
      .then(async (rows) => {
        if (cancelled) return
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
              A trail index
              <br />
              <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">you can try today.</em>
            </h1>
            <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-slate-500 sm:text-[17px]">
              Score any course before you race it. Browse races scored under the same model. Bring official results if
              you organize one. Everything here runs on the real scoring code, and every number explains itself.
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <a className={primaryButton} href="#calculator">
                Calculate your score <Calculator size={15} />
              </a>
              <a className={secondaryButton} href="#races">
                Browse scored races <ArrowRight size={15} />
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[8px] tracking-[.08em] text-slate-500 sm:text-[9px]">
              <span className="text-blue-600">OPEN</span>
              <span>TRANSPARENT</span>
              <span>REPRODUCIBLE</span>
              <span>INDEPENDENT</span>
            </div>
          </div>
          <EngineCard raceCount={races.length} resultCount={resultCount} scoringVersion={scoringVersion} ticker={ticker} />
        </div>
      </section>

      {/* 01 / Calculate */}
      <section className="bg-white py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="font-mono text-xs text-blue-600">01</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">CALCULATE</Eyebrow>
              <Heading>
                Know your score.
                <br />
                <Gradient>Before you race.</Gradient>
              </Heading>
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-7 text-slate-500">
                Pick a verified course or upload a GPX, drag to a target finish time, and watch the score update live —
                with the full reasoning underneath.
              </p>
              <a href="#calculator" className={`${textLink} mt-3`}>
                Open the calculator <ArrowRight size={14} />
              </a>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-1 border-y border-slate-200 sm:grid-cols-3">
            {[
              [Mountain, 'COURSE', 'Distance, climb and steepness, measured on the server.', '#calculator'],
              [Timer, 'TIME', 'A target, not a result. Drag it and see what it is worth.', '#calculator'],
              [GitBranch, 'SCORE', 'Your share of the best a human has run over that much ground.', DOCS.how],
            ].map(([Icon, title, desc, href], index) => (
              <a
                key={title}
                href={href}
                className={`group block min-w-0 px-2 py-5 no-underline sm:px-5 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}
              >
                <small className="flex items-center gap-2 font-mono text-[9px] tracking-[.08em] text-blue-600">
                  <Icon size={14} /> {title}
                </small>
                <b className="mt-2 block text-sm leading-6 text-[#0b1220]">{desc}</b>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition group-hover:text-blue-600">
                  {href.startsWith('#') ? 'Try it' : 'Read how'} <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 02 / Races */}
      <section id="races-preview" className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>02 / RACES</Eyebrow>
            <a href="#races" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 no-underline">
              All races <ArrowRight size={14} />
            </a>
          </div>
          <div className="mt-6 grid min-w-0 gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
            <div className="min-w-0">
              <Heading>
                Scored races.
                <br />
                <Gradient>Every number explained.</Gradient>
              </Heading>
              <p className="mt-5 max-w-[440px] text-sm leading-7 text-slate-500">
                Demonstration races scored under the Course Standard model. A score depends only on the course and the
                runner's own finish time — never on who else raced. Open one to see its leaderboard.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[8px] text-slate-500">
                <GitBranch size={16} className="text-blue-600" />
                same course + same time + same version <b className="text-blue-600">=</b> same score
              </div>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {races.slice(0, 4).map((race) => (
                <RaceCard key={race.race_id} race={race} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 03 / Organizers */}
      <section className="bg-white py-14 sm:py-20">
        <div className={`${CONTAINER} grid gap-8 lg:grid-cols-[1fr_.8fr] lg:gap-20`}>
          <div>
            <Eyebrow>03 / ORGANIZERS</Eyebrow>
            <Heading className="mt-3">
              Start with
              <br />
              <Gradient>official results.</Gradient>
            </Heading>
          </div>
          <div>
            <p className="text-sm leading-7 text-slate-500">
              Race organizers provide official results and the course file. OTRI measures the course, validates the
              inputs and scores every finisher — free, and with the whole method on the record.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <a className={primaryButton} href="organizer/#/register">
                Create an organizer account <ArrowRight size={15} />
              </a>
              <a className={secondaryButton} href="organizer/#/login">
                Sign in
              </a>
            </div>
            <a className={`${textLink} mt-4`} href={DOCS.organizer}>
              Organizer documentation <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* 04 / Method */}
      <section className="bg-[#0b1220] py-14 text-white sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">04 / METHOD</p>
            <span className="font-mono text-[9px] tracking-[.08em] text-blue-400">NO BLACK BOX</span>
          </div>
          <h2 className="mt-5 text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em]">Built in the open.</h2>
          <div className="mt-9 grid border-t border-slate-700/80 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [FileText, 'HOW A SCORE IS MADE', 'Plain-language explainer, then every constant and where it comes from.', DOCS.how],
              [GitBranch, 'VERSIONED MODEL', 'Every curve change is a new version. Old versions stay selectable.', DOCS.methodology],
              [ShieldCheck, 'DATA POLICY', 'Which results OTRI will and will not use, and why.', DOCS.dataPolicy],
              [Database, 'SOURCE CODE', 'Scoring, course measurement and this site, all public.', GITHUB_URL],
            ].map(([Icon, title, desc, href]) => (
              <a
                key={title}
                href={href}
                className="group block border-b border-slate-700/80 px-0 py-5 text-white no-underline transition hover:bg-white/5 sm:border-r sm:px-4 lg:border-b-0"
              >
                <small className="flex items-center gap-2 font-mono text-[9px] text-white">
                  <Icon size={14} className="text-blue-400" /> {title}
                </small>
                <p className="mt-3 text-[11px] leading-5 text-slate-400">{desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                  Read <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
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
              href="#calculator"
            >
              Calculate your score <Calculator size={15} />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:bg-white/10"
              href="../"
            >
              About the project <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
