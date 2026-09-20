import './Home.css'
import { useEffect, useState } from 'preact/compat'
import { ArrowRight, ArrowUpRight, Calculator, Database, FileText, GitBranch, Mountain, Play, ShieldCheck, Summit, Timer, Upload, Users } from '../src/ui/icons'
import { scrollBehavior } from '../src/lib/comfort'
import { LEVELS } from '../src/lib/scoreLevels'
import { modelLabel } from '../src/lib/model'
import RaceCard from './RaceCard'
import { getRaceResults, listRaces } from './apiClient'

const REPO = 'https://github.com/OTRI-run/otri'
const DOCS = {
  how: `${REPO}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`,
  methodology: `${REPO}/blob/main/METHODOLOGY.md`,
  dataPolicy: `${REPO}/blob/main/DATA_POLICY.md`,
  measurement: `${REPO}/blob/main/docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
}

// The ground the hero draws. Invented terrain, plotted by hand: sixteen stations across a 40 km
// axis, read against an altitude axis that tops out at 2000 m. There is no race in it.
const PROFILE = 'M64 300 100 288 132 256 164 270 196 220 228 240 256 186 288 204 316 140 344 172 372 96 400 150 436 206 468 182 500 244 528 290'
const GRID_X = [64, 180, 296, 412, 528]   // every 10 km
const GRID_Y = [48, 116, 184, 252, 320]   // every 500 m, 0 m on the baseline

// The hero's artwork: a course profile drawn the way the rest of the site draws data. A night
// readout panel, a fine measurement grid, the terrain section filled in cyan, mono axes, corner
// brackets, and a crosshair parked on the summit with its readout. Decorative, so it is hidden
// from assistive technology, and every colour in it is a token.
function ProfileReadout() {
  return (
    <svg className="home-readout" viewBox="0 0 560 360" width="100%" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="home-readout-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cyan)" stopOpacity=".42" />
          <stop offset="1" stopColor="var(--cyan)" stopOpacity=".02" />
        </linearGradient>
        <pattern id="home-readout-grid" width="29" height="34" patternUnits="userSpaceOnUse">
          <path d="M29 0H0v34" stroke="var(--fill-dark)" strokeWidth="1" />
        </pattern>
        <clipPath id="home-readout-clip"><rect x="1" y="1" width="558" height="358" rx="8" /></clipPath>
      </defs>

      <g clipPath="url(#home-readout-clip)">
        <rect width="560" height="360" fill="var(--night)" />

        {/* the plot: fine grid, then the lines that carry a label */}
        <rect x="64" y="48" width="464" height="272" fill="url(#home-readout-grid)" />
        <g stroke="var(--line-dark)" strokeWidth="1">
          {GRID_Y.map((y) => <path key={`y${y}`} d={`M64 ${y}H528`} />)}
          {GRID_X.map((x) => <path key={`x${x}`} d={`M${x} 48V320`} />)}
        </g>

        {/* the terrain section */}
        <path d={`${PROFILE} 528 320 64 320Z`} fill="url(#home-readout-fill)" />
        <path className="home-readout__line" d={PROFILE} stroke="var(--cyan)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="64" cy="300" r="3.5" fill="var(--night)" stroke="var(--cyan)" strokeWidth="1.6" />
        <circle cx="528" cy="290" r="3.5" fill="var(--night)" stroke="var(--cyan)" strokeWidth="1.6" />

        {/* the crosshair, on the summit, and what it reads */}
        <g stroke="var(--cyan)" strokeWidth="1" strokeDasharray="3 5" strokeOpacity=".5">
          <path d="M372 48V320" />
          <path d="M64 96H528" />
        </g>
        <circle cx="372" cy="96" r="11" stroke="var(--volt)" strokeWidth="1.2" strokeOpacity=".55" />
        <circle cx="372" cy="96" r="4.5" fill="var(--volt)" />
        <g className="home-readout__chip">
          <rect x="216" y="56" width="142" height="30" rx="4" fill="var(--slate)" stroke="var(--line-dark-strong)" strokeWidth="1" />
          <text x="229" y="76" fill="var(--chalk)">26.6 KM</text>
          <text x="345" y="76" textAnchor="end" fill="var(--cyan)">1 650 M</text>
        </g>

        {/* the axes */}
        <g stroke="var(--line-dark-strong)" strokeWidth="1.2">
          <path d="M64 48V320H528" />
          {GRID_X.map((x) => <path key={`t${x}`} d={`M${x} 320v6`} />)}
        </g>
        <g className="home-readout__label" fill="var(--chalk-muted)">
          <text x="64" y="341" textAnchor="middle">0</text>
          <text x="180" y="341" textAnchor="middle">10</text>
          <text x="296" y="341" textAnchor="middle">20</text>
          <text x="412" y="341" textAnchor="middle">30</text>
          <text x="528" y="341" textAnchor="end">40 KM</text>
          <text x="52" y="34" textAnchor="end">M</text>
          {[['2000', 48], ['1500', 116], ['1000', 184], ['500', 252], ['0', 320]].map(([label, y]) => (
            <text key={label} x="52" y={y + 4} textAnchor="end">{label}</text>
          ))}
          <text x="36" y="26">COURSE PROFILE</text>
          <text x="524" y="26" textAnchor="end">SAMPLE</text>
        </g>

        {/* corner brackets */}
        <g stroke="var(--volt)" strokeWidth="1.5" strokeOpacity=".55">
          <path d="M12 28V12h16" />
          <path d="M532 12h16v16" />
          <path d="M548 332v16h-16" />
          <path d="M28 348H12v-16" />
        </g>
      </g>
      <rect x=".75" y=".75" width="558.5" height="358.5" rx="8" stroke="var(--line-dark-strong)" />
    </svg>
  )
}

// A few real scores scrolling by, each a link to the runner: the quickest way to show what the
// index produces. Pauses on hover and for people who prefer reduced motion.
function ScoreTicker({ entries }) {
  if (!entries.length) return null
  const rows = [...entries, ...entries]
  return (
    <div className="ticker" aria-label="Recent scores">
      <ul className="ticker__list">
        {rows.map((entry, index) => (
          <li key={`${entry.runner_id ?? entry.name}-${index}`} className="ticker__row">
            <a href={entry.runner_id ? `#runners/${encodeURIComponent(entry.runner_id)}` : `#races/${encodeURIComponent(entry.race_id)}`}>
              {entry.name} <span className="home-ticker__race">· {entry.race}</span>
            </a>
            <b>{entry.score}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The bands a score falls in, read as a scale: each band a row on a readout, its track filled to
// the share of 1000 it starts at. What the number means, before anyone reads the method.
function LevelScale() {
  const bands = [...LEVELS].reverse().filter((band) => band.from >= 300 && band.from < 1000)
  return (
    <div className="home-scale" role="img" aria-label="Score bands from 300, recreational, to 1000, world class.">
      {bands.map((band) => (
        <div key={band.id} className="home-scale__row" style={{ '--home-fill': `${band.from / 10}%` }} title={band.name}>
          <b>{band.from}</b>
          <span className="home-scale__track" />
          <span className="home-scale__name">{band.short}</span>
        </div>
      ))}
      <div className="home-scale__row home-scale__row--top" style={{ '--home-fill': '100%' }}>
        <b>1000</b>
        <span className="home-scale__track" />
        <span className="home-scale__name">Record</span>
      </div>
    </div>
  )
}

export default function Home() {
  // #contribute (the footer's link, or an address someone shared) is the block near the end.
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
        const rows = all.filter((race) => race.is_published)
        setRaces(rows)
        // A few scored finishers from the newest published races, for the ticker.
        const sample = rows.filter((race) => (race.finisher_count ?? 0) > 0).slice(0, 4)
        const lists = await Promise.all(sample.map((race) => getRaceResults(race.race_id).catch(() => [])))
        const perRace = sample.map((race, i) =>
          lists[i]
            .filter((row) => row.status === 'finisher' && row.otri_score != null)
            .slice(0, 3)
            .map((row) => ({ name: `${row.first_name} ${row.family_name}`, race: race.event_name, score: row.otri_score, runner_id: row.runner_id, race_id: race.race_id })),
        )
        const entries = []
        for (let round = 0; round < 3; round += 1) perRace.forEach((list) => list[round] && entries.push(list[round]))
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
      {/* Hero — the dark chrome: the claim, the two choices, and the readout */}
      <section className="hero on-dark">
        <div className="wrap hero__inner">
          <div className="min0">
            <p className="eyebrow">Open Trail Running Index</p>
            <h1 className="hero__title mt-4">
              One honest score for <span className="accent">any trail race.</span>
            </h1>
            <p className="hero__lead">
              OTRI turns a <b>finish time</b> on <b>any course</b> into <b>one comparable number</b>. The course is measured from its GPX, the method is public and versioned, and the score never depends on who else raced. A calculator, not a governing body: <b>free</b>, <b>no account</b>, <b>nobody's approval</b>.
            </p>
            <div className="signpost mt-8">
              <a href="#calculator" className="signpost__arm" data-audience="runner">
                <span className="signpost__no">01 · I run</span>
                <span className="signpost__label">
                  What is my time worth?
                  <span className="signpost__note">Pick a race or a GPX, set a time, see the score and why.</span>
                </span>
                <ArrowRight size={22} />
              </a>
              <a href="#score" className="signpost__arm signpost__arm--primary" data-audience="organizer">
                <span className="signpost__no">02 · I organize a race</span>
                <span className="signpost__label">
                  Score my whole race
                  <span className="signpost__note">Course and results in, every finisher scored in a minute.</span>
                </span>
                <ArrowRight size={22} />
              </a>
            </div>
            <div className="facts mt-6">
              <span>Free</span>
              <span>No account</span>
              <span>Open method</span>
              <span>Versioned</span>
            </div>
          </div>
          <div className="hero__art">
            <ProfileReadout />
            <a href="#score?example=1" className="home-example">
              <span className="icon-box icon-box--volt icon-box--sm"><Play size={14} /></span>
              <span className="min0"><b>See a race scored, live.</b> <span className="muted">The course on the map and 100 finishers, in one click.</span></span>
              <ArrowRight size={18} className="icon--volt" />
            </a>
          </div>
        </div>
      </section>

      {/* 1 · How a score is made — a light reading surface */}
      <section className="section section--card section--line-bottom">
        <div className="wrap">
          <div className="section-head">
            <span className="waypoint section-head__no">1</span>
            <div className="stack">
              <p className="eyebrow">How a score is made</p>
              <h2 className="display-2">Course + time <span className="accent">= score.</span></h2>
            </div>
            <p className="lead">A hilly 25 km and a flat 50 km cannot be compared by the clock. OTRI measures the ground first, then reads the time against it. 1000 is world-record level, and a runner's score is theirs alone.</p>
          </div>
          <div className="grid grid--3 mt-10">
            {[
              [Mountain, 'The course', 'Measured from the GPX: distance, climb, how steep the climbing is, and altitude. The same file gives the same course every time.', 'What is measured', DOCS.measurement],
              [Timer, 'The time', 'A finish time from the results, or a target you are thinking about. Nothing else about you enters the number.', 'Try a target', '#calculator'],
              [Summit, 'The score', 'Your share of the fastest a human has ever covered that much ground, on a scale to 1000, with every constant on the record.', 'Follow the calculation', DOCS.how],
            ].map(([IconC, title, text, cta, href]) => (
              <a key={title} href={href} className="card card--link home-step">
                <span className="icon-box icon-box--lg"><IconC size={26} /></span>
                <h3 className="h-2 mt-4">{title}</h3>
                <p className="muted mt-2">{text}</p>
                <span className={`link link--arrow ${href.startsWith('#') ? '' : 'link--up'} mt-4`}>{cta} {href.startsWith('#') ? <ArrowRight size={15} /> : <ArrowUpRight size={15} />}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 2 · For runners — the quiet surface, over the measurement grid */}
      <section className="section section--quiet section--grid">
        <div className="wrap grid grid--split">
          <div className="stack">
            <span className="waypoint">2</span>
            <p className="eyebrow">For runners</p>
            <h2 className="display-2">Know your score <span className="accent">before you race.</span></h2>
            <p className="lead">Pick a race or upload a GPX, set a target finish time, and watch the score update live, with the reasoning underneath: how demanding the course is, where the climbing sits, what the next band would take.</p>
            <div className="cluster mt-2">
              <a href="#calculator" className="btn btn--primary btn--lg">Open the calculator <ArrowRight size={18} /></a>
              <a href="#runners" className="btn btn--ghost">Find my results</a>
            </div>
          </div>
          <div className="card card--pad-lg">
            <div className="rule"><span>What the number means</span></div>
            <LevelScale />
            <p className="small muted mt-5">The names are a reading aid; the numbers are exact. A score is a share of the fastest pace a human has held on a course this demanding, so 700 is the pace of a three-hour road marathon and 900 is the best in the world.</p>
          </div>
        </div>
      </section>

      {/* 3 · For organizers — a dark instrument band */}
      <section className="section section--dark home-band">
        <div className="wrap grid grid--split">
          <div className="card card--night home-flow">
            <p className="panel__label">Two files in</p>
            <ol className="home-flow__list mt-4">
              <li><span className="waypoint waypoint--volt">1</span><span><b>The course</b><small>A GPX of the route: the ground your runners covered.</small></span></li>
              <li><span className="waypoint waypoint--volt">2</span><span><b>The results</b><small>CSV or Excel, as your timing system exports it. Column names in several languages are understood.</small></span></li>
            </ol>
            <div className="home-flow__out mt-5">
              <Users size={22} className="icon--volt" />
              <span><b>Every finisher scored.</b> A leaderboard, podium images and a post to share, a race page if you want one.</span>
            </div>
            <a href="#score?example=1" className="link link--arrow mt-5">See the example race <ArrowRight size={15} /></a>
          </div>
          <div className="stack">
            <span className="waypoint waypoint--volt">3</span>
            <p className="eyebrow">For organizers</p>
            <h2 className="display-2">Score your race. <span className="accent">Then show it off.</span></h2>
            <p className="lead">No sign-up to see your scores. Keep them as a file, share the podium, or turn the race into a public page with one click: free, and nobody has to approve you. Made for the local race as much as the famous one.</p>
            <div className="cluster mt-2">
              <a href="#score" className="btn btn--primary btn--lg">Score my race <Upload size={18} /></a>
              <a href="organizer/" className="btn btn--secondary">For organizers <ArrowUpRight size={16} /></a>
            </div>
            <div className="facts mt-4">
              <span>Checked row by row</span>
              <span>Nothing kept unless you publish</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Races: only when there is a scored race to show */}
      {races.length > 0 && (
        <section id="races-preview" className="section section--card">
          <div className="wrap">
            <div className="section-head">
              <span className="waypoint section-head__no">4</span>
              <div className="stack">
                <p className="eyebrow">Scored races</p>
                <h2 className="display-2">Out on the trails.</h2>
              </div>
              <p className="lead">
                {races.every((race) => race.is_demo) ? 'Demonstration races' : 'Races'} their organizers published, all scored with the same open model. Open one to see its course and leaderboard.
              </p>
            </div>
            <div className="grid grid--aside mt-10">
              <div className="grid grid--2">
                {races.slice(0, 4).map((race) => (
                  <RaceCard key={race.race_id} race={race} />
                ))}
              </div>
              <div className="panel panel--bracket stack">
                <div className="cluster cluster--between">
                  <span className="panel__label">Latest scores</span>
                  <span className="badge badge--live">Live</span>
                </div>
                <div className="home-counts">
                  <div className="home-counts__main">
                    <span className="panel__label">Results</span>
                    <span className="panel__number">{resultCount.toLocaleString()}</span>
                  </div>
                  <div className="stat"><span className="stat__value">{races.length}</span><span className="stat__label">Races</span></div>
                </div>
                <ScoreTicker entries={ticker} />
                <div className="cluster cluster--between panel__rule home-panel__foot">
                  <a href="#races" className="link link--arrow small">All races <ArrowRight size={14} /></a>
                  <span className="tiny mono muted">{scoringVersion ? modelLabel(scoringVersion) : 'Versioned · reproducible'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 5 · Built in the open — the deepest band */}
      <section className="section section--night topo--dark">
        <div className="wrap">
          <div className="section-head">
            <span className="waypoint section-head__no">{races.length > 0 ? 5 : 4}</span>
            <div className="stack">
              <p className="eyebrow">No black box</p>
              <h2 className="display-2">Built in the open.</h2>
            </div>
            <p className="lead">Every score names its model version. A change to the scoring is a new version, never a silent edit, and the code that measures a course is the code you can read.</p>
          </div>
          <div className="grid grid--4 mt-10">
            {[
              [FileText, 'How a score is made', 'Plain-language explainer, then every constant and where it comes from.', DOCS.how],
              [GitBranch, 'Versioned model', 'Each score carries its version. The history of the model is the history of the repository.', DOCS.methodology],
              [ShieldCheck, 'Data policy', 'Which results OTRI will and will not use, and why.', DOCS.dataPolicy],
              [Database, 'Source code', 'Scoring, course measurement, the API and this site, all public.', REPO],
            ].map(([IconC, title, text, href]) => (
              <a key={title} href={href} className="card card--dark card--link stack stack--tight">
                <IconC size={22} className="home-doc__icon" />
                <b className="h-4 mt-2">{title}</b>
                <span className="small muted">{text}</span>
                <span className="link link--arrow link--up small mt-2">Read <ArrowUpRight size={14} /></span>
              </a>
            ))}
          </div>

          <div id="contribute" className="card card--dark card--pad-lg mt-8">
            <div className="grid grid--aside">
              <div className="stack">
                <p className="eyebrow">Contribute</p>
                <h3 className="h-1">Help improve the model and the course measurement.</h3>
                <p className="muted">OTRI belongs to nobody's federation. The model has known limits, written down where everyone can read them, and it gets better the way open software does: someone shows where it is wrong, with a course or a paper, and the fix becomes a new version.</p>
                <a href={DOCS.contributing} className="btn btn--chalk mt-2"><GitBranch size={16} /> How to contribute <ArrowUpRight size={15} /></a>
              </div>
              <div className="grid grid--2 grid--tight">
                {[
                  ['Challenge the scoring model', 'Every formula and constant is in one specification, with what it does not know yet. Propose a change as an OEP.', DOCS.how],
                  ['Improve course measurement', 'How a GPX becomes distance, climb and demand. A course that measures wrong is the most useful bug report there is.', DOCS.measurement],
                  ['Report what looks wrong', 'A score that cannot be right, a results file that should have passed, a confusing page.', `${REPO}/issues`],
                  ['Write code', 'Python for scoring, measurement and the API; Preact for the site. Good first issues are labelled.', REPO],
                ].map(([title, text, href]) => (
                  <a key={title} href={href} className="home-contribute__item">
                    <b>{title}</b>
                    <span className="small muted">{text}</span>
                    <span className="link link--arrow link--up tiny mt-2">Open <ArrowUpRight size={13} /></span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing — the signal strip */}
      <section className="section section--tight home-close">
        <div className="wrap cluster cluster--between cluster--loose">
          <div className="stack stack--tight">
            <p className="eyebrow eyebrow--plain">Open Trail Running Index</p>
            <h2 className="display-2">Compare trail performances. <span className="accent">Not just finish times.</span></h2>
          </div>
          <div className="cluster">
            <a className="btn btn--primary btn--lg" href="#score">Score my race <ArrowRight size={18} /></a>
            <a className="btn btn--dark btn--lg" href="#calculator">Calculate a target time <Calculator size={18} /></a>
          </div>
        </div>
      </section>
    </>
  )
}
