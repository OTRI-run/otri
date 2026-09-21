import { scrollBehavior } from '../src/lib/comfort'
import { ArrowRight, ArrowUpRight, Calculator, Database, FileText, GitBranch, Mountain, Play, ShieldCheck, Timer, Upload, Users } from 'lucide-react'
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

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-64px))]'

function Eyebrow({ children, className = '' }) {
  return <p className={`font-mono text-[10px] uppercase tracking-[.12em] text-muted ${className}`}>{children}</p>
}

/** A section opens the way a ruled page does: a number, a rule, then what the section is. */
function SectionLabel({ n, children }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted">
      <span className="text-accent">{n}</span>
      <span className="h-3 w-px bg-rule" />
      <span>{children}</span>
    </p>
  )
}

function Heading({ children, className = '' }) {
  return <h2 className={`text-[clamp(28px,3.6vw,42px)] font-normal leading-[1.1] tracking-[-.03em] text-ink ${className}`}>{children}</h2>
}

function Gradient({ children }) {
  return <span className="text-accent">{children}</span>
}

const primaryButton =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[3px] bg-accent px-4 text-[12px] font-semibold text-white no-underline hover:bg-accent-deep'
const secondaryButton =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[3px] border border-rule bg-sheet px-4 text-[12px] font-semibold text-ink no-underline hover:border-accent'
// Secondary actions are a link with a rule under it, the way a footnote is marked, not a button.
const textLink =
  'inline-flex items-center gap-1 border-b border-rule pb-1 text-[12px] font-semibold text-accent no-underline hover:border-accent'

// The landing page's dark "index engine" card, with every row a link into the prototype.
// A handful of real (demo) scores scrolling by, each a link to the runner: the quickest way to
// show what the index produces. Pauses for people who prefer reduced motion (see styles.css).
function ScoreTicker({ entries }) {
  if (!entries.length) return null
  const rows = [...entries, ...entries]
  return (
    <div className="relative h-[92px] overflow-hidden border-b border-rule" aria-label="Recent scores">
      <ul className="otri-ticker">
        {rows.map((entry, index) => (
          <li key={`${entry.runner_id ?? entry.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule/60 py-1.5 font-mono text-[10px]">
            <a href={entry.runner_id ? `#runners/${encodeURIComponent(entry.runner_id)}` : `#races/${encodeURIComponent(entry.race_id)}`} className="min-w-0 truncate text-ink-2 no-underline hover:text-accent">
              {entry.name} <span className="text-muted">· {entry.race}</span>
            </a>
            <span className="font-semibold text-accent">{entry.score}</span>
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
    <div className="min-w-0 overflow-hidden border border-rule bg-sheet">
      <div className="flex items-center justify-between border-b border-rule bg-wash px-4 py-2 font-mono text-[9px] tracking-[.12em] text-muted">
        <span>OTRI / OPEN SCORING</span>
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-accent" />
          LIVE API
        </span>
      </div>
      <div className="border-b border-rule px-4 py-6">
        <small className="font-mono text-[9px] tracking-[.12em] text-muted">WHAT IS AN OTRI SCORE?</small>
        <strong className="mt-2 block pb-1 text-[30px] font-normal leading-[1.15] tracking-[-.03em] text-ink">
          Course + time = <span className="text-accent">score.</span>
        </strong>
        <span className="mt-1 block text-xs leading-5 text-muted">
          One number for a finish time on any trail course, so a hilly 25 km and a flat 50 km can be compared. 1000 is
          world-record level, and your score never depends on who else raced.
        </span>
      </div>
      <div className="px-4"><ScoreTicker entries={ticker} /></div>
      <div className="px-4">
        {rows.map(([Icon, title, desc, href]) => (
          <a
            key={title}
            href={href}
            className="group grid min-w-0 grid-cols-[22px_minmax(0,1fr)_auto_14px] items-center gap-2 border-b border-rule py-3.5 text-ink no-underline transition hover:bg-wash"
          >
            <Icon size={16} className="text-accent" />
            <span className="truncate text-xs font-semibold">{title}</span>
            <small className="font-mono text-[9px] tracking-[.1em] text-muted">{desc}</small>
            <ArrowRight size={13} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
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
  // #contribute (the hero's link, the footer's, or an address someone shared) is the block below.
  useEffect(() => {
    const go = () => {
      if (window.location.hash === '#contribute') document.getElementById('contribute')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    }
    const timer = setTimeout(go, 80) // after the page has laid out
    window.addEventListener('hashchange', go)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('hashchange', go)
    }
  }, [])

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
      <section className="border-b border-rule bg-sheet">
        <div className={`${CONTAINER} grid min-w-0 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-24`}>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">
              Open Trail Running Index <span className="text-rule">/</span> <span className="text-accent">Prototype</span>
            </div>
            <h1 className="mt-5 max-w-[760px] text-[clamp(34px,5vw,58px)] font-normal leading-[1.1] tracking-[-.035em] text-ink">
              The open score
              <br />
              <em className="not-italic text-accent">for any trail race.</em>
            </h1>
            {/* The words that carry the promise are set in ink and semibold; the rest stays grey, so the
                paragraph can be read at a glance by its dark words alone. */}
            <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-muted sm:text-[17px] [&_b]:whitespace-nowrap [&_b]:font-semibold [&_b]:text-ink">
              OTRI turns a <b>finish time</b> on <b>any trail course</b> into{' '}
              <b className="text-accent">one comparable score</b>. A <b>calculator</b>, not a
              governing body, and <b>no black box</b>: every number <b>explains itself</b>. Made for the <b>local race</b> as much as the famous one:{' '}
              <b>free</b>, <b>no account</b>, <b>no approval</b>.
            </p>
            <div className="mt-7 grid max-w-[680px] gap-3 sm:grid-cols-2">
              {[
                {
                  who: 'I run',
                  Icon: Timer,
                  title: 'What is my time worth?',
                  text: 'Pick a race or upload a GPX, set a finish time and see the score, before or after race day.',
                  href: '#calculator',
                  action: 'Open the calculator',
                  more: ['Find my results', '#runners'],
                },
                {
                  who: 'I organise a race',
                  Icon: Upload,
                  title: 'Score my whole race',
                  text: 'Upload the course and the results file: every finisher scored in a minute. Optional: publish it here as a race page.',
                  href: '#score',
                  action: 'Score my race',
                  more: ['See an example', '#score?example=1'],
                },
              ].map(({ who, Icon, title, text, href, action, more }) => (
                <div key={who} className="flex min-w-0 flex-col border border-rule bg-wash p-4">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-white">
                      <Icon size={18} />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">{who}</span>
                  </span>
                  <b className="mt-3 block text-[16px] font-semibold leading-6 tracking-[-.02em] text-ink">{title}</b>
                  <p className="mt-1 flex-1 text-[13px] leading-5 text-muted">{text}</p>
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
              className="group mt-3 flex max-w-[680px] items-center gap-3 border border-rule bg-wash px-4 py-3 text-ink no-underline transition hover:border-accent"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-accent">
                <Play size={13} className="ml-0.5 fill-white text-white" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-5">
                <b className="font-semibold">See a race scored, live.</b> <span className="text-muted">The course on the map and 100 finishers, in one click.</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-accent transition group-hover:translate-x-1" />
            </a>
            <p className="mt-4 text-sm text-muted">
              Building something?{' '}
              <a href="#api" className="font-semibold text-accent no-underline hover:underline">
                API and embeddable calculator →
              </a>
            </p>
            <p className="mt-6 max-w-[620px] text-sm leading-6 text-muted">
              One open, versioned model.{' '}
              <a href={GITHUB_URL} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-ink no-underline hover:text-accent">
                <GitBranch size={14} /> The code and the method are on GitHub <ArrowUpRight size={13} />
              </a>{' '}
              and <a href="#contribute" className="font-semibold text-accent no-underline hover:underline">you can help improve both</a>.
            </p>
          </div>
          <EngineCard raceCount={races.length} resultCount={resultCount} scoringVersion={scoringVersion} ticker={ticker} />
        </div>
      </section>

      {/* The measured strip. Every cell is a number the index actually holds, read straight off the
          API, in the same ruled register a results sheet uses. */}
      <section className="border-b border-rule bg-wash">
        <div className={`${CONTAINER} grid grid-cols-2 border-x border-rule sm:grid-cols-4`}>
          {[
            ['Races scored', races.length || '—'],
            ['Results indexed', resultCount || '—'],
            ['Model', scoringVersion ? modelLabel(scoringVersion) : '—'],
            ['Scale', '0 – 1000'],
          ].map(([label, value], i) => (
            <div key={label} className={`px-5 py-4 ${i ? 'border-l border-rule' : ''} ${i === 2 ? 'border-l-0 sm:border-l' : ''}`}>
              <p className="font-mono text-[9px] uppercase tracking-[.12em] text-muted">{label}</p>
              <p className="mt-1 font-mono text-[20px] text-ink">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 01 / Score a race */}
      <section className="border-b border-rule bg-sheet py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="hidden font-mono text-xs text-accent md:block">01</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">FOR RACES</Eyebrow>
              <Heading>
                Score your race.
                <br />
                <Gradient>Then show it off.</Gradient>
              </Heading>
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-7 text-muted">
                No sign-up to see your scores. Keep them as a file, share the podium, or turn the race into a public page with one
                click: free, and nobody has to approve you.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <a className={primaryButton} href="#score">
                  Score my race <ArrowRight size={15} />
                </a>
                <a className={secondaryButton} href="#score?example=1">
                  See an example result
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-1 border-y border-rule sm:grid-cols-3">
            {[
              [Upload, 'BRING TWO FILES', 'The course as a GPX and the results as CSV or Excel. There is an example race to try first.', '#score'],
              [ShieldCheck, 'GET EVERY SCORE', 'The file is checked row by row, the course is measured, and the model says how far each number can be trusted.', '#score'],
              [Users, 'PUBLISH AND SHARE', 'A leaderboard page for your runners, podium images and a post for your channels, the calculator on your site.', '#score'],
            ].map(([Icon, title, desc, href], index) => (
              <a key={title} href={href} className={`group block min-w-0 px-0 py-5 text-inherit no-underline sm:px-5 ${index < 2 ? 'border-b border-rule sm:border-b-0 sm:border-r' : ''}`}>
                <small className="flex items-center gap-2 font-mono text-[9px] tracking-[.06em] text-accent">
                  <Icon size={14} /> {title}
                </small>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink">{desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 02 / Calculate */}
      <section className="border-b border-rule bg-sheet py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="hidden font-mono text-xs text-accent md:block">02</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">FOR RUNNERS</Eyebrow>
              <Heading>
                Know your score.
                <br />
                <Gradient>Before you race.</Gradient>
              </Heading>
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-7 text-muted">
                Pick a race or upload a GPX, set a target finish time, and watch the score update live —
                with the full reasoning underneath.
              </p>
              <a href="#calculator" className={`${textLink} mt-3`}>
                Open the calculator <ArrowRight size={14} />
              </a>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-1 border-y border-rule sm:grid-cols-3">
            {[
              [Mountain, 'COURSE', 'Distance, climb and steepness, measured on the server.', '#calculator'],
              [Timer, 'TIME', 'A target, not a result. Drag it and see what it is worth.', '#calculator'],
              [GitBranch, 'SCORE', 'Your share of the best a human has run over that much ground.', DOCS.how],
            ].map(([Icon, title, desc, href], index) => (
              <a
                key={title}
                href={href}
                className={`group block min-w-0 px-2 py-5 no-underline sm:px-5 ${index > 0 ? 'border-t border-rule sm:border-l sm:border-t-0' : ''}`}
              >
                <small className="flex items-center gap-2 font-mono text-[9px] tracking-[.08em] text-accent">
                  <Icon size={14} /> {title}
                </small>
                <b className="mt-2 block text-sm leading-6 text-ink">{desc}</b>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted transition group-hover:text-accent">
                  {href.startsWith('#') ? 'Try it' : 'Read how'} <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 03 / Races: only when there is a scored race to show */}
      {races.length > 0 && (
      <section id="races-preview" className="border-b border-rule bg-wash py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>03 / RACES</Eyebrow>
            <a href="#races" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent no-underline">
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
              <p className="mt-5 max-w-[440px] text-sm leading-7 text-muted">
                {races.every((race) => race.is_demo) ? 'Demonstration races' : 'Races'} their organizers published, all scored with the same open model. A score depends only on the course and the
                runner's own finish time — never on who else raced. Open one to see its leaderboard.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[8px] text-muted">
                <GitBranch size={16} className="text-accent" />
                same course + same time + same version <b className="text-accent">=</b> same score
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
      )}

      {/* 04 / Method */}
      <section className="border-b border-rule bg-sheet py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[.08em] text-muted">04 / METHOD</p>
            <span className="font-mono text-[9px] tracking-[.08em] text-blue-400">NO BLACK BOX</span>
          </div>
          <h2 className="mt-5 text-[clamp(28px,3.6vw,42px)] font-normal leading-[1.1] tracking-[-.03em] text-ink">Built in the open.</h2>
          <div className="mt-9 grid border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
            {[
              [FileText, 'HOW A SCORE IS MADE', 'Plain-language explainer, then every constant and where it comes from.', DOCS.how],
              [GitBranch, 'VERSIONED MODEL', 'Every score names its model version. A change to the scoring is a new version, never a silent edit.', DOCS.methodology],
              [ShieldCheck, 'DATA POLICY', 'Which results OTRI will and will not use, and why.', DOCS.dataPolicy],
              [Database, 'SOURCE CODE', 'Scoring, course measurement and this site, all public.', GITHUB_URL],
            ].map(([Icon, title, desc, href]) => (
              <a
                key={title}
                href={href}
                className="group block border-b border-rule px-0 py-5 text-ink no-underline transition hover:bg-wash sm:border-r sm:px-4 lg:border-b-0"
              >
                <small className="flex items-center gap-2 font-mono text-[9px] text-white">
                  <Icon size={14} className="text-blue-400" /> {title}
                </small>
                <p className="mt-3 text-[11px] leading-5 text-muted">{desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                  Read <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>

          {/* Contribute: the model and the course measurement get better with more eyes and more courses. */}
          <div id="contribute" className="mt-12 scroll-mt-24 rounded-[3px] border border-rule bg-wash p-6 sm:p-8">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-[.08em] text-blue-400">CONTRIBUTE</p>
                <h3 className="mt-3 text-[clamp(24px,3vw,34px)] font-normal leading-[1.1] tracking-[-.03em] text-ink">Help improve the model and the course measurement.</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  OTRI belongs to nobody's federation. The model has known limits, written down where everyone can read them, and it gets better the way open software does: someone shows where it is wrong, with a course or a paper, and the fix becomes a new version.
                </p>
                <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[3px] bg-white px-4 text-[13px] font-semibold text-ink no-underline hover:bg-wash">
                  <GitBranch size={15} /> How to contribute <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="grid min-w-0 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule sm:grid-cols-2">
                {[
                  ['Challenge the scoring model', 'Every formula and constant is in one specification, with what it does not know yet. Propose a change as an OEP: tested on real results, versioned, never a silent edit.', 'The model and its open questions', DOCS.how],
                  ['Improve course measurement', 'How a GPX becomes distance, climb and demand: denoising, terrain data, steep ground, altitude. A course that measures wrong is the most useful bug report there is.', 'The measurement specification', `${GITHUB_URL}/blob/main/docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`],
                  ['Report what looks wrong', 'A score that cannot be right, a results file that should have passed, a confusing page. An issue with the file or the link is enough.', 'Open an issue', `${GITHUB_URL}/issues`],
                  ['Write code', 'Python for scoring, measurement and the API; React for the site. Tests run in a minute and a half, and the good first issues are labelled.', 'Browse the code', GITHUB_URL],
                ].map(([title, text, cta, href]) => (
                  <a key={title} href={href} className="group block border border-rule bg-wash p-5 text-ink no-underline transition hover:border-accent">
                    <p className="text-sm font-semibold tracking-[-.01em] text-ink">{title}</p>
                    <p className="mt-2 text-[12px] leading-5 text-muted">{text}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                      {cta} <ArrowUpRight size={12} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-accent py-14 text-white sm:py-16">
        <div className={`${CONTAINER} flex flex-col items-start`}>
          <p className="font-mono text-[10px] tracking-[.08em] text-blue-100">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="mt-2 text-[clamp(28px,4vw,46px)] font-normal leading-[1.08] tracking-[-.03em]">
            Compare trail performances.
            <br />
            <span>Not just finish times.</span>
          </h2>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-[3px] bg-white px-4 text-[13px] font-semibold text-accent no-underline "
              href="#score"
            >
              Score my race <ArrowRight size={15} />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:bg-white/10"
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
