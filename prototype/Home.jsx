import { scrollBehavior } from '../src/lib/comfort'
import { ArrowRight, ArrowUpRight, Calculator, Database, FileText, GitBranch, Mountain, ShieldCheck, Timer, Upload, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import RaceCard from './RaceCard'
import TopographicHero from './TopographicHero'
import { listRaces } from './apiClient'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const DOCS = {
  how: `${GITHUB_URL}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`,
  methodology: `${GITHUB_URL}/blob/main/METHODOLOGY.md`,
  dataPolicy: `${GITHUB_URL}/blob/main/DATA_POLICY.md`,
  organizer: `${GITHUB_URL}/blob/main/docs/organizer-upload.md`,
}

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

function Eyebrow({ children, className = '' }) {
  return <p className={`text-sm font-semibold tracking-[.04em] text-slate-500 ${className}`}>{children}</p>
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

export default function Home() {
  // #contribute (the footer's link or an address someone shared) is the block below.
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
  useEffect(() => {
    let cancelled = false
    listRaces()
      .then((all) => {
        if (cancelled) return
        // The home page previews scored races; listings without results live on the races page.
        const rows = all.filter((race) => race.is_published)
        setRaces(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {/* Hero */}
      <section className="otri-index-hero relative isolate overflow-hidden border-b border-slate-800">
        <TopographicHero />
        <div className={`${CONTAINER} relative z-10 py-9 sm:py-14 lg:py-16`}>
          <div className="mx-auto max-w-[800px] text-center">
            <h1 className="text-[clamp(38px,6vw,68px)] font-bold leading-[1.08] tracking-[-.05em] text-white">
              Open Trail<br /> <span className="bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 bg-clip-text text-transparent">Running Index</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[620px] text-[19px] leading-7 text-slate-300 sm:text-[22px] sm:leading-8">
              Compare trail running performances with a score based on the course and finish time.
            </p>
            <div className="mx-auto mt-6 grid max-w-[720px] gap-3 sm:mt-8 sm:grid-cols-2">
              {[
                {
                  Icon: Calculator,
                  audience: 'For runners',
                  title: 'Calculate my score',
                  text: 'Pick a course. Add your time. See your score.',
                  href: '#calculator',
                },
                {
                  Icon: Upload,
                  audience: 'For race organizers',
                  title: 'Score all finishers',
                  text: 'Add your course and results. Get everyone’s scores.',
                  href: '#score',
                },
              ].map(({ Icon, audience, title, text, href }) => (
                <a
                  key={href}
                  href={href}
                  className="otri-index-action group relative flex min-w-0 items-center gap-4 rounded-2xl border border-blue-200 bg-white p-5 text-inherit no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:flex-col sm:p-6"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-left sm:text-center">
                    <span className="mb-2 block text-[17px] font-semibold text-slate-600">{audience}</span>
                    <span className="block text-[24px] font-bold leading-7 tracking-[-.02em] text-blue-700">{title}</span>
                    <span className="mt-3 block text-[16px] leading-6 text-slate-600">{text}</span>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-blue-600 transition group-hover:translate-x-1 sm:absolute sm:right-5 sm:top-5" />
                </a>
              ))}
            </div>
            <p className="mt-5 text-[15px] text-slate-300">Free to use · No account needed · Open scoring</p>
          </div>
        </div>
      </section>

      {/* 01 / Score a race */}
      <section className="bg-white py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="hidden font-mono text-xs text-blue-600 md:block">01</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">FOR RACES</Eyebrow>
              <Heading>
                Score your race.
                <br />
                <Gradient>Then show it off.</Gradient>
              </Heading>
            </div>
            <div className="min-w-0">
              <p className="text-base leading-7 text-slate-500">
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
          <div className="mt-10 grid grid-cols-1 border-y border-slate-200 sm:grid-cols-3">
            {[
              [Upload, 'BRING TWO FILES', 'The course as a GPX and the results as CSV or Excel. There is an example race to try first.', '#score'],
              [ShieldCheck, 'GET EVERY SCORE', 'The file is checked row by row, the course is measured, and the model says how far each number can be trusted.', '#score'],
              [Users, 'PUBLISH AND SHARE', 'A leaderboard page for your runners, podium images and a post for your channels, the calculator on your site.', '#score'],
            ].map(([Icon, title, desc, href], index) => (
              <a key={title} href={href} className={`group block min-w-0 px-0 py-5 text-inherit no-underline sm:px-5 ${index < 2 ? 'border-b border-slate-200 sm:border-b-0 sm:border-r' : ''}`}>
                <small className="flex items-center gap-2 font-mono text-[9px] tracking-[.06em] text-blue-600">
                  <Icon size={14} /> {title}
                </small>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#0b1220]">{desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 02 / Calculate */}
      <section className="border-t border-slate-200 bg-white py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="hidden font-mono text-xs text-blue-600 md:block">02</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">FOR RUNNERS</Eyebrow>
              <Heading>
                Know your score.
                <br />
                <Gradient>Before you race.</Gradient>
              </Heading>
            </div>
            <div className="min-w-0">
              <p className="text-base leading-7 text-slate-500">
                Pick a race or upload a GPX, set a target finish time, and watch the score update live —
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
                <b className="mt-2 block text-base leading-7 text-[#0b1220]">{desc}</b>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition group-hover:text-blue-600">
                  {href.startsWith('#') ? 'Try it' : 'Read how'} <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 03 / Races: only when there is a scored race to show */}
      {races.length > 0 && (
      <section id="races-preview" className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>03 / RACES</Eyebrow>
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
              <p className="mt-5 max-w-[440px] text-base leading-7 text-slate-500">
                {races.every((race) => race.is_demo) ? 'Demonstration races' : 'Races'} their organizers published, all scored with the same open model. A score depends only on the course and the
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
      )}

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
              [GitBranch, 'VERSIONED MODEL', 'Every score names its model version. A change to the scoring is a new version, never a silent edit.', DOCS.methodology],
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
                <p className="mt-3 text-[15px] leading-6 text-slate-400">{desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                  Read <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>

          {/* Contribute: the model and the course measurement get better with more eyes and more courses. */}
          <div id="contribute" className="mt-12 scroll-mt-24 rounded-2xl border border-slate-700/80 bg-white/[.03] p-6 sm:p-8">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-[.08em] text-blue-400">CONTRIBUTE</p>
                <h3 className="mt-3 text-[clamp(26px,3.2vw,38px)] font-bold leading-[1.02] tracking-[-.045em]">Help improve the model and the course measurement.</h3>
                <p className="mt-3 text-base leading-7 text-slate-400">
                  OTRI belongs to nobody's federation. The model has known limits, written down where everyone can read them, and it gets better the way open software does: someone shows where it is wrong, with a course or a paper, and the fix becomes a new version.
                </p>
                <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:bg-blue-50">
                  <GitBranch size={15} /> How to contribute <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="grid min-w-0 gap-px overflow-hidden rounded-xl border border-slate-700/80 bg-slate-700/80 sm:grid-cols-2">
                {[
                  ['Challenge the scoring model', 'Every formula and constant is in one specification, with what it does not know yet. Propose a change as an OEP: tested on real results, versioned, never a silent edit.', 'The model and its open questions', DOCS.how],
                  ['Improve course measurement', 'How a GPX becomes distance, climb and demand: denoising, terrain data, steep ground, altitude. A course that measures wrong is the most useful bug report there is.', 'The measurement specification', `${GITHUB_URL}/blob/main/docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`],
                  ['Report what looks wrong', 'A score that cannot be right, a results file that should have passed, a confusing page. An issue with the file or the link is enough.', 'Open an issue', `${GITHUB_URL}/issues`],
                  ['Write code', 'Python for scoring, measurement and the API; React for the site. Tests run in a minute and a half, and the good first issues are labelled.', 'Browse the code', GITHUB_URL],
                ].map(([title, text, cta, href]) => (
                  <a key={title} href={href} className="group block bg-[#0b1220] p-5 text-white no-underline transition hover:bg-[#101a33]">
                    <p className="text-sm font-bold tracking-[-.01em]">{title}</p>
                    <p className="mt-2 text-[15px] leading-6 text-slate-400">{text}</p>
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
